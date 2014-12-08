Jobman
======

Pseudo Supervisor / Gearman combo

```sh
> node jobman.js
Server listening on port: 8124
Started process: php /var/gitrepos/jobman/v2/worker.php
Started process: php /var/gitrepos/jobman/v2/worker.php
Started process: php /var/gitrepos/jobman/v1/worker.php
Started process: php /var/gitrepos/jobman/v1/worker.php
```
```sh
> time php v1/client.php
Processed 100000 jobs, calculated sum of 5000050000.

real    0m17.709s
user    0m0.676s
sys     0m2.416s
```
```sh
> time php v2/client.php
Processed 100000 jobs, calculated sum of 5000050000.

real    0m18.083s
user    0m0.748s
sys     0m2.388s
```
