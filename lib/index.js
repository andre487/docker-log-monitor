'use strict';
const ArgumentParser = require('argparse').ArgumentParser;
const LogMonitor = require('./log-monitor');

new LogMonitor(parseArgs()).run();

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
