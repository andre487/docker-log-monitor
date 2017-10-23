'use strict';
const ArgumentParser = require('argparse').ArgumentParser;
const childProcess = require('child_process');

const appData = require('../package.json');

const DEFAULT_RETRY_TIMEOUT = 1000;
const MAX_RETRY_TIMEOUT = 60000;
const RESTORE_RETRY_TIMEOUT = 600000;

const HEARTBEAT_DEFAULT_INTERVAL = 60000;

const argParser = new ArgumentParser({
    version: appData.version,
    appHelp: true,
    description: appData.description,
});

argParser.addArgument('--monitor', {
    choices: ['data-dog'],
    defaultValue: 'data-dog',
});

argParser.addArgument('--pass-pseudo', {
    action: 'storeTrue',
    help: 'Pass pseudo increment for passing signal names to system',
});

argParser.addArgument('--all', {
    action: 'storeTrue',
    help: 'Listen for all containers',
});

argParser.addArgument('containerName', { nargs: '*' });

const args = argParser.parseArgs();

let monitor;
switch (args.monitor) {
    case 'data-dog':
        monitor = require('./data-dog');
        break;
    default:
        throw new Error(`Unknown monitor: ${args.monitor}`);
}

if (args.all) {
    childProcess.exec('docker ps', (err, stdout) => {
        if (err) {
            console.error(err);
            process.exit(1);
        }

        stdout.split('\n')
            .map(line => line.split(/\s{2,}/g).slice(-1)[0])
            .filter(name => name && name !== 'NAMES')
            .forEach(startListenContainerLogs.bind(null, args));
    });
} else {
    for (let containerName of args.containerName) {
        startListenContainerLogs(args, containerName);
    }
}

function startListenContainerLogs(args, containerName) {
    const dataHandler = handleLogData.bind(null, containerName);

    const heartBeatInterval = HEARTBEAT_DEFAULT_INTERVAL * (1 + Math.random());
    let retryTimeout = DEFAULT_RETRY_TIMEOUT;
    let restoreDefaultTimeoutId = null;
    let logger;

    startLogging();

    setInterval(() => {
        const statuses = new Statuses();
        statuses.heartBeat = 1;
        monitor.incStatuses(containerName, statuses);
    }, heartBeatInterval);

    function startLogging() {
        if (logger) {
            logger.stdout.removeAllListeners();
            logger.stderr.removeAllListeners();
            logger.removeAllListeners();
        }

        logger = getLoggerStream(containerName);

        logger.stdout.on('data', dataHandler);
        logger.stderr.on('data', dataHandler);
        logger.on('close', onClose);
    }

    function onClose(code) {
        console.info(`Logger for ${containerName} exited with code ${code}`);

        if (code !== 0) {
            const errorStatus = new Statuses();
            errorStatus.critical = 1;
            monitor.incStatuses(containerName, errorStatus);
        }

        const reconnectStatus = new Statuses();
        reconnectStatus.reconnect = 1;
        monitor.incStatuses(containerName, reconnectStatus);

        setTimeout(() => {
            startLogging();

            if (retryTimeout < MAX_RETRY_TIMEOUT) {
                retryTimeout += 500;
            }

            if (restoreDefaultTimeoutId !== null) {
                clearTimeout(restoreDefaultTimeoutId);
            }

            restoreDefaultTimeoutId = setTimeout(() => {
                retryTimeout = DEFAULT_RETRY_TIMEOUT;
                restoreDefaultTimeoutId = null;
            }, RESTORE_RETRY_TIMEOUT);

            console.info(`Restart logging for ${containerName}`);
        }, retryTimeout);
    }

    // Pseudo increment for passing signal names to system
    if (args.pass_pseudo) {
        monitor.incStatuses(containerName, new Statuses(1));
    }

    console.info(`Start logging for ${containerName}`);
}

function getLoggerStream(containerName) {
    return childProcess.spawn('docker', ['logs', '-f', containerName])
}

function handleLogData(containerName, data) {
    const logLines = String(data).trim().split('\n');
    const statuses = new Statuses();

    for (let line of logLines) {
        const matches = /\b(trace|debug|info|warn|warning|error|crit|critical)\b/i.exec(line);

        if (matches && matches[1]) {
            let status = matches[1].toLowerCase();
            switch (status) {
                case 'warn':
                    status = 'warning';
                    break;
                case 'crit':
                    status = 'critical';
                    break;
            }
            statuses[status]++;
        }
    }

    monitor.incStatuses(containerName, statuses);
}

function Statuses(defaultVal = 0) {
    this.heartBeat = defaultVal;
    this.reconnect = defaultVal;

    this.trace = defaultVal;
    this.debug = defaultVal;
    this.info = defaultVal;
    this.warning = defaultVal;
    this.error = defaultVal;
    this.critical = defaultVal;
}
