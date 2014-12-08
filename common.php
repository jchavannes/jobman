<?

class ExampleWorkload {

    private $myNum;

    public function __construct($num) {
        $this->myNum = $num;
    }

    public function execute() {
        // Do some stuff
        return $this->myNum * 2;
    }

}

class ExampleWorker {

    public function __construct($sleep=0) {

        $handle = fopen('php://stdin', 'r');

        while (!feof($handle)) {

            $buffer = fgets($handle);

            if (empty($buffer)) {
                continue;
            }

            /** @var ExampleWorkload $workload */
            $workload = unserialize($buffer);

            if ($sleep) {
                sleep($sleep);
            }

            echo $workload->execute();

        }

        fclose($handle);

    }

}

class ExampleClient {

    /**
     * Since POC is actually 1 codebase, we just fake a version, normally
     * it would be dynamically grabbed somehow, possibly from directory name
     *
     * @param string $version
     * @param int $numJobs
     */
    public function __construct($version, $numJobs=1) {

        $jobmanClient = new JobmanClient($version);

        $jobsProcessed = 0;
        $sum = 0;
        $jobmanClient->setCompleteFunction(function($response) use (&$jobsProcessed, &$sum) {

            if (!($response > 0)) {
                throw new Exception("Did not receive expected output, got: " . $response);
            }

            $sum += $response;

            $jobsProcessed++;

        });

        for ($i = 1; $i <= $numJobs; $i++) {
            $jobmanClient->addTask(new ExampleWorkload($i));
        }

        $jobmanClient->runTasks();

        echo "Processed " . $jobsProcessed . " jobs, calculated sum of " . $sum . ".\n";

    }

}

class JobmanClient {

    private $version;

    /**
     * @var callable
     */
    private $completeFunction;

    private $jobsQueued = 0;

    public function __construct($version) {
        $this->version = $version;
    }

    /**
     * @param ExampleWorkload $workload
     */
    public function addTask($workload) {

        $data = trim(base64_encode(json_encode(array(
            "version"  => $this->version,
            "workload" => serialize($workload),
        )))) . chr(0x17);

        $handle = self::getHandle();

        socket_write($handle, $data, strlen($data));

        $this->jobsQueued++;

    }

    /**
     * @param callable $completeFunction
     */
    public function setCompleteFunction($completeFunction) {
        $this->completeFunction = $completeFunction;
    }

    /**
     * @return string
     */
    public function runTasks() {

        $handle           = self::getHandle();
        $completeFunction = $this->completeFunction;
        $separator        = chr(0x17);
        $buffer           = "";
        $jobsProcessed    = 0;

        while (true) {

            while ($data = socket_read($handle, 2048)) {

                $buffer .= trim($data);

                if (strpos($data, $separator) !== false) {
                    break;
                }

            }

            $responses = explode($separator, $buffer);

            $buffer = array_pop($responses);

            foreach ($responses as $response) {

                if (is_callable($completeFunction)) {
                    $completeFunction($response);
                }

                if (++$jobsProcessed == $this->jobsQueued) {
                    break(2);
                }

            }

        }

    }

    static private function getHandle() {

        static $socket;

        if (!is_null($socket)) {
            return $socket;
        }

        $host = "127.0.0.1";
        $port = 8124;

        $socket = socket_create(AF_INET, SOCK_STREAM, SOL_TCP);
        if ($socket === false) {
            throw new Exception("socket_create() failed:\nReason: " . socket_strerror(socket_last_error()));
        }

        $result = socket_connect($socket, $host, $port);
        if ($result === false) {
            throw new Exception("socket_connect() failed.\nReason: ($result) " . socket_strerror(socket_last_error($socket)));
        }

        echo "Connected to jobman server at: {$host}:{$port}\n";

        return $socket;

    }

}
