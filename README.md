# docker-log-monitor
Util for streaming logs from docker and pass as metrics to minitoring systemd

Install:

```
  $ npm install -g docker-log-monitor
  $ docker-log-monitor container1 container2 containerN
```

Usage:

```
usage: run [-h] [-v] [--monitor {data-dog}] containerName [containerName ...]

Util for streaming logs from docker and pass as metrics to minitoring systemd

Positional arguments:
  containerName

Optional arguments:
  -h, --help            Show this help message and exit.
  -v, --version         Show program's version number and exit.
  --monitor {data-dog}
```
