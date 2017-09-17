'use strict';
const ArgumentParser = require('argparse').ArgumentParser;
const childProcess = require('child_process');

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
argParser.addArgument('containerName', {nargs: '+'});

const args = argParser.parseArgs();

let monitor;
switch (args.monitor) {
    case 'data-dog':
        monitor = require('./data-dog');
        break;
    default:
        throw new Error(`Unknown monitor: ${args.monitor}`);
}

for (let containerName of args.containerName) {
    const logger = childProcess.spawn('docker', ['logs', '-f', containerName]);
    const dataHandler = handleLogData.bind(null, containerName);

    logger.stdout.on('data', dataHandler);
    logger.stderr.on('data', dataHandler);

    logger.on('close', code => {
        console.info(`Logger for ${containerName} exited with code ${code}`);
    });

    // Pseudo increment for passing signal names to system
    monitor.incStatuses(containerName, new Statuses(1));
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
