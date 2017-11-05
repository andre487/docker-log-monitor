'use strict';
const childProcess = require('child_process');
const LogRecordsHandler = require('./log-records-handler');

module.exports = class LogMonitor {
    constructor(args = {}, RecordsHandlerClass = LogRecordsHandler) {
        this.PRINT_STATUS_INTERVAL = 30000;
        this.CHECK_NEW_CONTAINERS_INTERVAL = 15000;

        this.RecordsHandlerClass = RecordsHandlerClass;

        this._args = args;
        this._listenedContainers = [];
        this._monitor = null;
    }

    run() {
        this._monitor = this.getMonitor();

        this.startPrintingStatus();

        if (this._args.all) {
            this.listenToAllNewContainers();
            setInterval(() => this.listenToAllNewContainers(), this.CHECK_NEW_CONTAINERS_INTERVAL);
        } else {
            this.startListenToContainers(this._args.containerName);
        }
    }

    startPrintingStatus() {
        setInterval(() => this.printStatus(this._listenedContainers), this.PRINT_STATUS_INTERVAL);
    }

    printStatus(listenedContainers) {
        console.info(`Core: Currently listening to containers: ${listenedContainers}`);
    }

    getMonitor() {
        let monitor;

        switch (this._args.monitor) {
            case 'data-dog':
                monitor = require('./data-dog');
                break;
            default:
                throw new Error(`Unknown monitor: ${this._args.monitor}`);
        }

        return monitor;
    }

    listenToAllNewContainers() {
        const curContainers = this.getCurrentContainersList();
        const newContainers = curContainers.filter(name => !this._listenedContainers.includes(name));
        this.startListenToContainers(newContainers);
    }

    getCurrentContainersList() {
        const stdout = this.getRawContainerList();

        return stdout.split('\n')
            .map(line => line.split(/\s{2,}/g).slice(-1)[0])
            .filter(name => name && name !== 'NAMES');
    }

    getRawContainerList() {
        return childProcess.execSync('docker ps').toString();
    }

    startListenToContainers(containers) {
        for (let name of containers) {
            new this.RecordsHandlerClass({
                monitor: this._monitor,
                containerName: name,
                passPseudo: this._args.pass_pseudo,
                stopHandler: name => this.onStopHandling(name)
            }).run();
            this._listenedContainers.push(name);
        }
    }

    onStopHandling(name) {
        this._listenedContainers = this._listenedContainers.filter(n => n !== name);
    }

    get monitor() {
        return this._monitor;
    }

    set monitor(val) {
        this._assertTesting();
        this._monitor = val;
    }

    get listenedContainers() {
        return this._listenedContainers;
    }

    set listenedContainers(val) {
        this._assertTesting();
        this._listenedContainers = val;
    }

    _assertTesting() {
        if (typeof describe === 'undefined' || typeof it === 'undefined') {
            throw new Error('Setting of protected values available only in tests');
        }
    }
};
