var Spawn  = require("child_process").spawn;
var Net    = require("net");
var Buffer = require("buffer").Buffer;

var logging = false;

setTimeout(function() {
    new Server();
}, 0);

var Server = function () {

    var workerManager = new WorkerManager();

    /**
     * @param {Socket} connection
     */
    var fnNewConnection = function(connection) {

        var buffer = "";

        /**
         * @param {string} data
         */
        var fnReceiveData = function(data) {

            data = buffer + data;

            var separator = String.fromCharCode(0x17);

            if (data.indexOf(separator) === false) {
                buffer = data;
                return;
            }

            var rows = data.split(separator);
            buffer = rows.splice(-1,1);

            for (var i = 0; i < rows.length; i++) {

                data = new Buffer(rows[i].trim(), "base64").toString("ascii");

                logging && console.log("Client -> Data: " + data);

                /**
                 * @type {{
                 *  version: string,
                 *  workload: string
                 * }} job
                 */
                var job;
                try { job = JSON.parse(data); }
                catch(e) {}

                if (typeof job != "object" || !job.version || !job.workload) {
                    continue;
                }

                /**
                 * @param {string} data
                 */
                var fnFinishedJob = function(data) {
                    logging && console.log("Data -> Client: " + data);
                    connection.write(data + separator);
                    workerManager.processQueues();
                };

                workerManager.queueJob(new Job(job.version, job.workload, fnFinishedJob));

            }

        };

        /** @type {EventEmitter} connection */
        connection.on("data", fnReceiveData);

    };

    var server = Net.createServer(fnNewConnection);

    var port = 8124;

    var fnServerStarted = function() {
        console.log("Server listening on port: " + port);
    };

    server.listen(port, fnServerStarted);

};

/**
 * @param {string} version
 * @param {string} workload
 * @param {function(message:string)} fnFinishedJob
 * @constructor
 */
var Job = function(version, workload, fnFinishedJob) {
    this.version       = version;
    this.workload      = workload;
    this.fnFinishedJob = fnFinishedJob;
};

/**
 * @returns {string}
 */
Job.prototype.getVersion = function() {
    return this.version;
};

/**
 * @returns {string}
 */
Job.prototype.getWorkload = function() {
    return this.workload;
};

/**
 * @returns {function(message:string)}
 */
Job.prototype.getFnFinishedJob = function() {
    return this.fnFinishedJob;
};

var WorkerManager = function() {

    /**
     * @type {WorkerProcess[]}
     */
    this.workers = [];

    /**
     * @type {{
     *   queued: {Job[]},
     *   processing: {Job[]}
     * }}
     */
    this.jobs    = {
        queued: [],
        processing: []
    };

};

/**
 * @param {Job} job
 */
WorkerManager.prototype.queueJob = function(job) {

    var queueName = job.getVersion();

    if (typeof this.jobs.queued[queueName] == "undefined") {
        this.jobs.queued[queueName] = [];
    }

    this.jobs.queued[queueName].push(job);

    this.processQueues();

};

WorkerManager.prototype.processQueues = function() {

    var queueName, i, worker;

    var jobQueues = this.jobs.queued;

    for (queueName in jobQueues) {
        if (!jobQueues.hasOwnProperty(queueName)) {
            continue;
        }
        for (i = 0; i < jobQueues[queueName].length; i++) {

            worker = this.getWorker(queueName);
            if (!worker) {
                break;
            }

            var job = jobQueues[queueName].splice(i--, 1)[0];
            worker.processJob(job);

        }
    }

};

/**
 * @param {string} pool
 * @returns {WorkerProcess}
 */
WorkerManager.prototype.getWorker = function(pool) {

    var maxWorkersPerPool = 2;

    /**
     * @type {WorkerProcess[]} this.workers
     */
    if (!this.workers[pool]) {
        this.workers[pool] = [];
    }
    /**
     * @type WorkerProcess worker
     */
    var worker;
    for (var i = 0; i < this.workers[pool].length; i++) {
        worker = this.workers[pool][i];
        if (worker.ready) {
            return worker;
        }
    }

    if (this.workers[pool].length < maxWorkersPerPool) {

        worker = new WorkerProcess(pool);
        this.workers[pool].push(worker);

        return worker;

    }

    return null;

};

/**
 * @param {string=} command
 * @constructor
 */
var Process = function(command) {

    if (!command) {
        return;
    }

    this.command = command;

    var args = command.split(" ");
    var file = args.shift();

    var process = this.process = Spawn(file, args);
    console.log("Started process: " + command);

    var self = this;

    /**
     * @param {string} message
     */
    var fnReceiveDataStdOut = function (message) {
        logging && console.log("Worker -> Data: " + message);
        self.getFnGotResponse()(message);
    };

    /**
     * @param {string} message
     */
    var fnReceiveDataStdErr = function(message) {};

    /**
     * @param {number} code
     * @param {string} signal
     */
    var fnCloseProcess = function (code, signal) {

        self.code = code;
        self.signal = signal;

        if (code != 0) {
            console.log("Error in process, code: " + code + ", signal: " + signal + " (command: " + self.command + ").");
        }

    };

    process.stdout.setEncoding("utf8");
    process.stderr.setEncoding("utf8");

    process.stdout.on("data", fnReceiveDataStdOut);
    process.stderr.on("data", fnReceiveDataStdErr);

    process.on("close", fnCloseProcess);

};

/**
 * @param {string} data
 * @returns Process
 */
Process.prototype.send = function(data) {
    logging && console.log("Data -> Worker: " + data);
    this.process.stdin.write(data + "\n");
    return this;
};
/**
 * @param {function(message:string)} fnGotResponse
 * @returns Process
 */
Process.prototype.setFnGotResponse = function(fnGotResponse) {
    this.fnReceive = fnGotResponse;
    return this;
};

/**
 * @returns {Function}
 */
Process.prototype.getFnGotResponse = function() {
    return this.fnReceive;
};

/**
 * @param {string} pool
 * @constructor
 */
var WorkerProcess = function(pool) {
    var command = "php " + __dirname + "/" + pool + "/worker.php";
    this.constructor.apply(this, [command]);
};

WorkerProcess.prototype = new Process();
WorkerProcess.prototype.ready = true;

/**
 * @param {Job} job
 */
WorkerProcess.prototype.processJob = function(job) {

    var self = this;

    /**
     * @param {string} message
     */
    var fnFinishedJob = function(message) {
        self.ready = true;
        job.getFnFinishedJob()(message);
    };

    this.ready = false;

    this
        .setFnGotResponse(fnFinishedJob)
        .send(job.getWorkload());

};
