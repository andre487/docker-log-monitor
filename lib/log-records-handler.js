'use strict';
const childProcess = require('child_process');
const Statuses = require('./statuses');

module.exports = class LogRecordsHandler {
    constructor({
        monitor,
        containerName,
        passPseudo = false,
        retryTimeout = 1000,
        maxRetryTimeout = 60000,
        maxRetriesAfter = 5,
        restoreRetryTimeout = 600000,
        heartbeatDefaultInterval = 15000,
        stopHandler = null,
    }) {
        this._monitor = monitor;
        this._containerName = containerName;

        this._passPseudo = passPseudo;

        this._retryTimeout = retryTimeout;
        this._defaultRetryTimeout = retryTimeout;

        this._maxRetryTimeout = maxRetryTimeout;
        this._maxRetriesAfter = maxRetriesAfter;
        this._restoreRetryTimeout = restoreRetryTimeout;
        this._heartbeatInterval = heartbeatDefaultInterval * (1 + Math.random());

        this._reader = null;
        this._heartBeatId = null;
        this._restoreDefaultTimeoutId = null;
        this._retriesAfterMax = 0;

        this._stopHandler = stopHandler;
    }

    run() {
        this.startSendingHeartbeat();
        this.startReading();

        // Pseudo increment for passing signal names to system
        if (this._passPseudo) {
            this._monitor.incStatuses(this._containerName, new Statuses(1));
        }

        console.info(`Core: Start listen to ${this._containerName}`);
    }

    startSendingHeartbeat() {
        this._heartBeatId = setInterval(() => {
            const statuses = new Statuses();
            statuses.heartBeat = 1;
            this._monitor.incStatuses(this._containerName, statuses);
        }, this._heartbeatInterval);
    }

    startReading() {
        if (this._reader) {
            this._reader.stdout.removeAllListeners();
            this._reader.stderr.removeAllListeners();
            this._reader.removeAllListeners();
        }

        this._reader = this.getLoggerStream();

        this._reader.stdout.on('data', out => this.handleLogData(out));
        this._reader.stderr.on('data', out => this.handleLogData(out));
        this._reader.on('close', code => this.onReaderClose(code));
    }

    restartReading() {
        setTimeout(() => {
            this.startReading();

            if (this._retryTimeout < this._maxRetryTimeout) {
                this._retryTimeout += 500;
            } else {
                this._retriesAfterMax++;
            }

            if (this._restoreDefaultTimeoutId !== null) {
                clearTimeout(this._restoreDefaultTimeoutId);
            }

            this._restoreDefaultTimeoutId = setTimeout(() => {
                this._retryTimeout = this._defaultRetryTimeout;
                this._restoreDefaultTimeoutId = null;
                this._retriesAfterMax = 0;

                console.log(`Core: Restore default timeouts for ${this._containerName}`);
            }, this._restoreRetryTimeout);

            console.info(`Core: Restart listen to ${this._containerName}`);
        }, this._retryTimeout);
    }

    getLoggerStream() {
        return childProcess.spawn('docker', ['logs', '-f', this._containerName]);
    }

    handleLogData(data) {
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

        this._monitor.incStatuses(this._containerName, statuses);
    }

    onReaderClose(code) {
        console.info(`Core: Listener for ${this._containerName} exited with code ${code}`);

        if (this._retriesAfterMax > this._maxRetriesAfter) {
            clearInterval(this._heartBeatId);
            if (this._restoreDefaultTimeoutId !== null) {
                clearTimeout(this._restoreDefaultTimeoutId);
            }

            if (typeof this._stopHandler === 'function') {
                try {
                    this._stopHandler(this._containerName);
                } catch (e) {
                    console.error(e);
                }
            }

            return console.warn(`Core: Stop listen to ${this._containerName}`);
        }

        const reconnectStatus = new Statuses();
        reconnectStatus.reconnect = 1;
        this._monitor.incStatuses(this._containerName, reconnectStatus);

        this.restartReading();
    }
};
