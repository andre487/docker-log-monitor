'use strict';
const LogRecordsHandler = require('../lib/log-records-handler');
const stream = require('stream');

class LoggerStream extends stream.Writable {
    _write(chunk, encoding, done) {
        this.emit('data', chunk.toString());

        done();
    }
}

describe('LogRecordsHandler', function() {
    let sandbox, timer;
    let monitor;

    beforeEach(() => {
        sandbox = sinon.sandbox.create();
        timer = sandbox.useFakeTimers();

        monitor = new Proxy({}, {
            get(target, name) {
                if (!(name in target)) {
                    target[name] = sandbox.spy();
                }
                return target[name];
            }
        });
    });

    afterEach(() => {
        sandbox.restore();

        monitor = null;
    });

    describe('#run()', () => {
        beforeEach(() => {
            sandbox.stub(LogRecordsHandler.prototype, 'startSendingHeartbeat');
            sandbox.stub(LogRecordsHandler.prototype, 'startReading');
        });

        it('should start sending heartbeat signal', () => {
            const inst = new LogRecordsHandler({monitor, containerName: 'foo'});
            inst.run();

            assert.calledOnce(LogRecordsHandler.prototype.startSendingHeartbeat);
        });

        it('should start reading logs', () => {
            const inst = new LogRecordsHandler({monitor, containerName: 'foo'});
            inst.run();

            assert.calledOnce(LogRecordsHandler.prototype.startReading);
        });

        it('should pass all statuses with passPseudo', () => {
            const inst = new LogRecordsHandler({monitor, passPseudo: true, containerName: 'foo'});
            inst.run();

            assert.calledOnce(monitor.incStatuses);

            const [containerName, statuses] = monitor.incStatuses.args[0];

            assert.equal(containerName, 'foo');

            for (let [name, val] of Object.entries(statuses)) {
                assert.ok(name);
                assert.equal(val, 1);
            }
        });
    });

    describe('#startSendingHeartbeat()', () => {
        it('should send signal heartBeat periodically', () => {
            const inst = new LogRecordsHandler({monitor, containerName: 'foo'});
            inst.startSendingHeartbeat();

            timer.tick(inst._heartbeatInterval * 2);

            assert.callCount(monitor.incStatuses, 2);

            for (let [containerName, statuses] of monitor.incStatuses.args) {
                assert.equal(containerName, 'foo');
                assert.propertyVal(statuses, 'heartBeat', 1);
            }
        });
    });

    describe('#stopSendingHeartbeat()', () => {
        it('should stop signal heartBeat sending', () => {
            const inst = new LogRecordsHandler({monitor, containerName: 'foo'});
            inst.startSendingHeartbeat();

            timer.tick(inst._heartbeatInterval * 2);

            assert.callCount(monitor.incStatuses, 2);

            inst.stopSendingHeartbeat();
            timer.tick(inst._heartbeatInterval * 2);

            assert.callCount(monitor.incStatuses, 2);
        });
    });

    describe('#startReading()', () => {
        let logger;

        beforeEach(() => {
            logger = {
                eventHandlers: {},

                stdout: new LoggerStream(),
                stderr: new LoggerStream(),

                removeAllListeners: sandbox.spy(),

                on(event, handler) {
                    this.eventHandlers[event] = handler;
                }
            };

            logger.stdout.removeAllListeners = sandbox.spy();
            logger.stderr.removeAllListeners = sandbox.spy();

            sandbox.stub(LogRecordsHandler.prototype, 'getLoggerStream').returns(logger);
            sandbox.stub(LogRecordsHandler.prototype, 'handleLogData');
            sandbox.stub(LogRecordsHandler.prototype, 'onReaderClose');
        });

        it('should handle stdout data', () => {
            const inst = new LogRecordsHandler({monitor, containerName: 'foo'});
            inst.startReading();

            logger.stdout.write('2017-08-06T22:13:16\tERROR\tSome error\n');

            assert.calledOnce(LogRecordsHandler.prototype.handleLogData);
            assert.calledWith(LogRecordsHandler.prototype.handleLogData, '2017-08-06T22:13:16\tERROR\tSome error\n');
        });

        it('should handle stderr data', () => {
            const inst = new LogRecordsHandler({monitor, containerName: 'foo'});
            inst.startReading();

            logger.stderr.write('2017-08-06T22:13:16\tERROR\tSome error\n');

            assert.calledOnce(LogRecordsHandler.prototype.handleLogData);
            assert.calledWith(LogRecordsHandler.prototype.handleLogData, '2017-08-06T22:13:16\tERROR\tSome error\n');
        });

        it('should handle close event', () => {
            const inst = new LogRecordsHandler({monitor, containerName: 'foo'});
            inst.startReading();

            assert.property(logger.eventHandlers, 'close');
            assert.isFunction(logger.eventHandlers.close);

            logger.eventHandlers.close(1);

            assert.calledOnce(LogRecordsHandler.prototype.onReaderClose);
            assert.calledWith(LogRecordsHandler.prototype.onReaderClose, 1);
        });

        it('should remove all listeners from obsolete logger', () => {
            const inst = new LogRecordsHandler({monitor, containerName: 'foo'});
            inst.startReading();
            inst.startReading();

            assert.calledOnce(logger.stdout.removeAllListeners);
            assert.calledOnce(logger.stderr.removeAllListeners);
            assert.calledOnce(logger.removeAllListeners);
        });
    });

    describe('#handleLogData()', () => {
        const logChunk = `
            2017-10-01	TRACE	message
            2017-10-01	DEBUG	message
            2017-10-01	DBG	message
            2017-10-01	INFO	message
            2017-10-01	WARNING	message
            2017-10-01	WARN	message
            2017-10-01	ERROR	message
            2017-10-01	ERR	message
            2017-10-01	CRITICAL	message
            2017-10-01	CRIT	message
            2017-10-01	FATAL	message
        `;

        it('should increase statuses by keywords', () => {
            const inst = new LogRecordsHandler({monitor, containerName: 'foo'});
            inst.handleLogData(logChunk);

            assert.calledOnce(monitor.incStatuses);

            const [containerName, statuses] = monitor.incStatuses.args[0];

            assert.equal(containerName, 'foo');

            assert.propertyVal(statuses, 'trace', 1);
            assert.propertyVal(statuses, 'debug', 2);
            assert.propertyVal(statuses, 'info', 1);
            assert.propertyVal(statuses, 'warning', 2);
            assert.propertyVal(statuses, 'error', 2);
            assert.propertyVal(statuses, 'critical', 2);
            assert.propertyVal(statuses, 'fatal', 1);
        });
    });

    describe('#restartReading()', () => {
        beforeEach(() => {
            sandbox.stub(LogRecordsHandler.prototype, 'startReading');
            sandbox.stub(LogRecordsHandler.prototype, 'handleRetryTimeout');
        });

        it('should call startReading and handleRetryTimeout only after retryTimeout', () => {
            const inst = new LogRecordsHandler({monitor, containerName: 'foo'});

            inst.restartReading();

            assert.notCalled(LogRecordsHandler.prototype.startReading);
            assert.notCalled(LogRecordsHandler.prototype.handleRetryTimeout);

            timer.tick(inst._retryTimeout);

            assert.calledOnce(LogRecordsHandler.prototype.startReading);
            assert.calledOnce(LogRecordsHandler.prototype.handleRetryTimeout);
        });
    });

    describe('#handleRetryTimeout()', () => {
        beforeEach(() => {
            sandbox.stub(LogRecordsHandler.prototype, 'scheduleRestoreRetryDefaults');
        });

        it('should increase retryTimeout', () => {
            const inst = new LogRecordsHandler({monitor, containerName: 'foo'});

            const startRetryTimeout = inst._retryTimeout;

            inst.handleRetryTimeout();

            assert.isAbove(inst._retryTimeout, startRetryTimeout);
        });

        it('should increase retriesAfterMax', () => {
            const inst = new LogRecordsHandler({monitor, containerName: 'foo', maxRetryTimeout: 1});

            const startRetriesAfterMax = inst._retriesAfterMax;

            inst.handleRetryTimeout();

            assert.isAbove(inst._retriesAfterMax, startRetriesAfterMax);
        });

        it('should call scheduleRestoreRetryDefaults', () => {
            const inst = new LogRecordsHandler({monitor, containerName: 'foo'});
            inst.handleRetryTimeout();

            assert.calledOnce(LogRecordsHandler.prototype.scheduleRestoreRetryDefaults);
        });
    });

    describe('#scheduleRestoreRetryDefaults()', () => {
        it('should restore retryTimeout after time', () => {
            const inst = new LogRecordsHandler({monitor, containerName: 'foo'});

            const startRetryTimeout = inst._retryTimeout;

            inst.handleRetryTimeout();

            assert.isAbove(inst._retryTimeout, startRetryTimeout);

            timer.tick(inst._restoreRetryTimeout);

            assert.equal(inst._retryTimeout, startRetryTimeout);
        });

        it('should restore retriesAfterMax after time', () => {
            const inst = new LogRecordsHandler({monitor, containerName: 'foo', maxRetryTimeout: 1});

            const startRetriesAfterMax = inst._retriesAfterMax;

            inst.handleRetryTimeout();

            assert.isAbove(inst._retriesAfterMax, startRetriesAfterMax);

            timer.tick(inst._restoreRetryTimeout);

            assert.equal(inst._retriesAfterMax, startRetriesAfterMax);
        });
    });

    describe('#onReaderClose()', () => {
        beforeEach(() => {
            sandbox.stub(LogRecordsHandler.prototype, 'stopSendingHeartbeat');
            sandbox.stub(LogRecordsHandler.prototype, 'restartReading');

            sandbox.spy(LogRecordsHandler.prototype, 'unscheduleRestoreRetryDefaults');
        });

        it('should call restart reading if limits are not reached', () => {
            const inst = new LogRecordsHandler({monitor, containerName: 'foo'});

            inst.handleRetryTimeout();
            inst.onReaderClose();

            assert.calledOnce(LogRecordsHandler.prototype.restartReading);
            assert.calledOnce(monitor.incStatuses);

            const [containerName, statuses] = monitor.incStatuses.args[0];

            assert.equal(containerName, 'foo');
            assert.propertyVal(statuses, 'reconnect', 1);
        });

        it('should stop retries if limits are reached', () => {
            const stopSpy = sandbox.spy();

            const inst = new LogRecordsHandler({
                monitor,
                containerName: 'foo',
                maxRetriesAfter: 0,
                maxRetryTimeout: 1,
                stopHandler: stopSpy
            });

            inst.handleRetryTimeout();
            inst._retriesAfterMax = Number.MAX_SAFE_INTEGER;
            inst.onReaderClose();

            assert.notCalled(LogRecordsHandler.prototype.restartReading);
            assert.notCalled(monitor.incStatuses);

            assert.calledOnce(LogRecordsHandler.prototype.stopSendingHeartbeat);
            assert.calledTwice(LogRecordsHandler.prototype.unscheduleRestoreRetryDefaults);
            assert.calledOnce(stopSpy);
        });
    });
});
