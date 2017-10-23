'use strict';
const ArgumentParser = require('argparse').ArgumentParser;
const childProcess = require('child_process');

const PRINT_STATUS_INTERVAL = 30000;

const DEFAULT_RETRY_TIMEOUT = 1000;
const MAX_RETRY_TIMEOUT = 60000;
const MAX_RETRIES_AFTER = 5;
const RESTORE_RETRY_TIMEOUT = 600000;

const HEARTBEAT_DEFAULT_INTERVAL = 15000;
const CHECK_NEW_CONTAINERS_INTERVAL = 15000;

const args = parseArgs();
const monitor = getMonitor(args);
const listenedContainers = [];

setInterval(printStatus, PRINT_STATUS_INTERVAL);

if (args.all) {
    listenToAllNewContainers();
    setInterval(listenToAllNewContainers, CHECK_NEW_CONTAINERS_INTERVAL);
} else {
    startListenToContainers(args.containerName);
}

function printStatus() {
    console.info(`Core: Currently listening to containers: ${listenedContainers}`);
}

function parseArgs() {
    const appData = require('../package.json');

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
        help: 'Listen to all containers',
    });

    argParser.addArgument('containerName', { nargs: '*' });

    return argParser.parseArgs();
}

function getMonitor() {
    let monitor;

    switch (args.monitor) {
        case 'data-dog':
            monitor = require('./data-dog');
            break;
        default:
            throw new Error(`Unknown monitor: ${args.monitor}`);
    }

    return monitor;
}

function listenToAllNewContainers() {
    const curContainers = getCurrentContainersList();
    const newContainers = curContainers.filter(name => !listenedContainers.includes(name));
    startListenToContainers(newContainers);
}

function getCurrentContainersList() {
    const stdout = childProcess.execSync('docker ps').toString();

    return stdout.split('\n')
        .map(line => line.split(/\s{2,}/g).slice(-1)[0])
        .filter(name => name && name !== 'NAMES');
}

function startListenToContainers(containers) {
    for (let name of containers) {
        startListenContainerLogs(name);
        listenedContainers.push(name);
    }
}

function startListenContainerLogs(containerName) {
    const dataHandler = handleLogData.bind(null, containerName);

    const heartBeatInterval = HEARTBEAT_DEFAULT_INTERVAL * (1 + Math.random());

    const heartBeatId = setInterval(() => {
        const statuses = new Statuses();
        statuses.heartBeat = 1;
        monitor.incStatuses(containerName, statuses);
    }, heartBeatInterval);

    let retryTimeout = DEFAULT_RETRY_TIMEOUT;
    let restoreDefaultTimeoutId = null;
    let retriesAfterMax = 0;
    let logger;

    startLogging();

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
        console.info(`Core: Listener for ${containerName} exited with code ${code}`);

        if (retriesAfterMax > MAX_RETRIES_AFTER) {
            const containerPos = listenedContainers.indexOf(containerName);
            listenedContainers.splice(containerPos, 1);

            clearInterval(heartBeatId);
            if (restoreDefaultTimeoutId !== null) {
                clearTimeout(restoreDefaultTimeoutId);
            }

            return console.warn(`Core: Stop listen to ${containerName}`);
        }

        const reconnectStatus = new Statuses();
        reconnectStatus.reconnect = 1;
        monitor.incStatuses(containerName, reconnectStatus);

        setTimeout(() => {
            startLogging();

            if (retryTimeout < MAX_RETRY_TIMEOUT) {
                retryTimeout += 500;
            } else {
                retriesAfterMax++;
            }

            if (restoreDefaultTimeoutId !== null) {
                clearTimeout(restoreDefaultTimeoutId);
            }

            restoreDefaultTimeoutId = setTimeout(() => {
                retryTimeout = DEFAULT_RETRY_TIMEOUT;
                restoreDefaultTimeoutId = null;
                retriesAfterMax = 0;

                console.log(`Core: Restore default timeouts for ${containerName}`);
            }, RESTORE_RETRY_TIMEOUT);

            console.info(`Core: Restart listen to ${containerName}`);
        }, retryTimeout);
    }

    // Pseudo increment for passing signal names to system
    if (args.pass_pseudo) {
        monitor.incStatuses(containerName, new Statuses(1));
    }

    console.info(`Core: Start listen to ${containerName}`);
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
