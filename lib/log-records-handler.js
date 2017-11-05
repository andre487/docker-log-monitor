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

    stopSendingHeartbeat() {
        if (this._heartBeatId !== null) {
            clearInterval(this._heartBeatId);
        }
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
            this.handleRetryTimeout();

            console.info(`Core: Restart listen to ${this._containerName}`);
        }, this._retryTimeout);
    }

    handleRetryTimeout() {
        if (this._retryTimeout < this._maxRetryTimeout) {
            this._retryTimeout += 500;
        } else {
            this._retriesAfterMax++;
        }

        this.scheduleRestoreRetryDefaults();
    }

    scheduleRestoreRetryDefaults() {
        this.unscheduleRestoreRetryDefaults();

        this._restoreDefaultTimeoutId = setTimeout(() => {
            this._retryTimeout = this._defaultRetryTimeout;
            this._restoreDefaultTimeoutId = null;
            this._retriesAfterMax = 0;

            console.log(`Core: Restore default timeouts for ${this._containerName}`);
        }, this._restoreRetryTimeout);
    }

    unscheduleRestoreRetryDefaults() {
        if (this._restoreDefaultTimeoutId !== null) {
            clearTimeout(this._restoreDefaultTimeoutId);
            this._restoreDefaultTimeoutId = null;
        }
    }

    getLoggerStream() {
        return childProcess.spawn('docker', ['logs', '-f', this._containerName]);
    }

    handleLogData(data) {
        const logLines = String(data).trim().split('\n');
        const statuses = new Statuses();

        for (let line of logLines) {
            this.extractStatuses(statuses, line);
            this.sendTimingIfExists(line);
        }

        this._monitor.incStatuses(this._containerName, statuses);
    }

    extractStatuses(statuses, line) {
        const statusMatches = /\b(trace|debug|dbg|info|warn|warning|error|err|crit|critical|fatal)\b/i.exec(line);

        if (statusMatches && statusMatches[1]) {
            let status = statusMatches[1].toLowerCase();
            switch (status) {
                case 'dbg':
                    status = 'debug';
                    break;
                case 'warn':
                    status = 'warning';
                    break;
                case 'err':
                    status = 'error';
                    break;
                case 'crit':
                    status = 'critical';
                    break;
            }
            statuses[status]++;
        }
    }

    sendTimingIfExists(line) {
        const measureMatches = /\bMeasure::duration::([\w.-]+):\s*([\d.]+)\b/i.exec(line);
        if (measureMatches && measureMatches[1] && measureMatches[2]) {
            const name = measureMatches[1];
            const time = parseFloat(measureMatches[2]);

            this._monitor.sendTiming(this._containerName, name, time);
        }
    }

    onReaderClose(code) {
        console.info(`Core: Listener for ${this._containerName} exited with code ${code}`);

        if (this._retriesAfterMax > this._maxRetriesAfter) {
            this.stopSendingHeartbeat();
            this.unscheduleRestoreRetryDefaults();

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
