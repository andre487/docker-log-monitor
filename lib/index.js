'use strict';
const ArgumentParser = require('argparse').ArgumentParser;
const childProcess = require('child_process');

const appData = require('../package.json');

const RETRY_COUNT = 10;

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

argParser.addArgument('containerName', {nargs: '*'});

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
    let retries = 0;

    const logger = childProcess.spawn('docker', ['logs', '-f', containerName]);
    const dataHandler = handleLogData.bind(null, containerName);

    logger.stdout.on('data', dataHandler);
    logger.stderr.on('data', dataHandler);

    logger.on('close', code => {
        console.info(`Logger for ${containerName} exited with code ${code}`);

        setTimeout(() => {
            if (++retries < RETRY_COUNT) {
                startListenContainerLogs(args, containerName);
            } else {
                const statuses = new Statuses();
                statuses.critical = 1;
                monitor.incStatuses(containerName, statuses);

                console.error(`Logger for ${containerName} exited forever after ${retries} retries`);
            }
        }, 1000);
    });

    // Pseudo increment for passing signal names to system
    if (args.pass_pseudo) {
        monitor.incStatuses(containerName, new Statuses(1));
    }

    console.info(`Start logging for ${containerName}`);
}

function handleLogData(containerName, data) {
    const logLines = String(data).trim().split('\n');
    const statuses = new Statuses();

    for (let line of logLines) {
        const matches = /\b(trace|debug|info|error|critical)\b/i.exec(line);

        if (matches && matches[1]) {
            const status = matches[1].toLowerCase();
            statuses[status]++;
        }
    }

    monitor.incStatuses(containerName, statuses);
}

function Statuses(defaultVal=0) {
    Object.assign(this, {
        trace: defaultVal,
        debug: defaultVal,
        info: defaultVal,
        error: defaultVal,
        critical: defaultVal,
    });
}
