# docker-log-monitor
Util for streaming logs from docker and pass as metrics to monitoring systems

[![Build Status](https://travis-ci.org/andre487/docker-log-monitor.svg?branch=master)](https://travis-ci.org/andre487/docker-log-monitor)
[![Maintainability](https://api.codeclimate.com/v1/badges/f3284c31feccd239b381/maintainability)](https://codeclimate.com/github/andre487/docker-log-monitor/maintainability)
[![Test Coverage](https://api.codeclimate.com/v1/badges/f3284c31feccd239b381/test_coverage)](https://codeclimate.com/github/andre487/docker-log-monitor/test_coverage)


Features:

  * Count statuses in logs: each debug, info, error, etc. becomes `docker-log-monitor.status.${name}` with tag `container:${containerName}`
  * Send timings: each line with `Measure::duration::<label>: <time>` becomes `docker-log-monitor.timing.${label}` with timing and tag `container:${containerName}`

Install:

```
  $ npm install -g forever docker-log-monitor
  $ docker-log-monitor container1 container2 containerN
  $ docker-log-monitor-daemon container1 container2 containerN
```

Usage:

```
usage: docker-log-monitor [-h] [-v] [--monitor {data-dog}] [--pass-pseudo] [--all]
           [containerName [containerName ...]]

Util for streaming logs from docker and pass as metrics to minitoring systemd

Positional arguments:
  containerName

Optional arguments:
  -h, --help            Show this help message and exit.
  -v, --version         Show program's version number and exit.
  --monitor {data-dog}
  --pass-pseudo         Pass pseudo increment for passing signal names to
                        system
  --all                 Listen for all containers
```
