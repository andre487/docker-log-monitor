# docker-log-monitor
Util for streaming logs from docker and pass as metrics to minitoring systemd

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
