'use strict';
const fs = require('fs');
const LogMonitor = require('../lib/log-monitor');

describe('LogMonitor', function() {
    let sandbox, timer;
    let FakeRecordsHandlerClass, fakeHandlerInstances;

    beforeEach(() => {
        sandbox = sinon.sandbox.create();
        timer = sandbox.useFakeTimers();

        fakeHandlerInstances = [];
    });

    afterEach(() => {
        sandbox.restore();

        FakeRecordsHandlerClass = null;
        fakeHandlerInstances = null;
    });

    function stubRawContainersList(defaultList = null) {
        const rawList = defaultList === null ?
            fs.readFileSync(__dirname + '/data/container-list.txt') :
            defaultList;

        sandbox.stub(LogMonitor.prototype, 'getRawContainerList').returns(rawList.toString());
    }

    function createFakeRecordsHandler() {
        FakeRecordsHandlerClass = sandbox.spy(function() {
            const inst = new Proxy({}, {
                get(target, name) {
                    if (!(name in target)) {
                        target[name] = sandbox.spy();
                    }
                    return target[name];
                }
            });

            fakeHandlerInstances.push(inst);

            return inst;
        });
    }

    function getFakeRecordHandlerArgs() {
        return FakeRecordsHandlerClass.args.reduce((res, args) => {
            const opts = args[0];

            (res.monitors = res.monitors || []).push(opts.monitor);
            (res.containers = res.containers || []).push(opts.containerName);
            (res.passPseudo = res.passPseudo || []).push(opts.passPseudo);
            (res.stopHandlers = res.stopHandlers || []).push(opts.stopHandler);

            return res;
        }, {});
    }

    describe('#run()', () => {
        let monitorObj;

        beforeEach(() => {
            createFakeRecordsHandler();

            monitorObj = {};

            sandbox.stub(LogMonitor.prototype, 'getMonitor').returns(monitorObj);
            sandbox.stub(LogMonitor.prototype, 'startPrintingStatus');
            sandbox.stub(LogMonitor.prototype, 'startListenToContainers');
            sandbox.stub(LogMonitor.prototype, 'listenToAllNewContainers');
        });

        it('should set monitor', () => {
            const inst = new LogMonitor();
            inst.run();

            assert.equal(inst.monitor, monitorObj);
        });

        it('should start printing status', () => {
            const inst = new LogMonitor();
            inst.run();

            assert.calledOnce(LogMonitor.prototype.startPrintingStatus);
        });

        it('should start listening to containers by list', () => {
            const inst = new LogMonitor({ containerName: ['foo', 'bar'] });
            inst.run();

            assert.calledOnce(LogMonitor.prototype.startListenToContainers);
            assert.calledWith(LogMonitor.prototype.startListenToContainers, ['foo', 'bar']);
        });

        it('should start listening to all containers with checking new names', () => {
            const inst = new LogMonitor({ all: true });
            inst.run();

            assert.calledOnce(LogMonitor.prototype.listenToAllNewContainers);

            timer.tick(inst.CHECK_NEW_CONTAINERS_INTERVAL * 2);

            assert.callCount(LogMonitor.prototype.listenToAllNewContainers, 3);
        });
    });

    describe('#startPrintingStatus()', () => {
        it('should print status with intervals', () => {
            sandbox.stub(LogMonitor.prototype, 'printStatus');

            const inst = new LogMonitor();
            inst.startPrintingStatus();

            timer.tick(inst.PRINT_STATUS_INTERVAL * 2);

            assert.callCount(LogMonitor.prototype.printStatus, 2);
        });

        it('should print containers list in status', () => {
            sandbox.stub(LogMonitor.prototype, 'printStatus');

            const inst = new LogMonitor({ containerName: ['foo', 'bar'] });
            inst.listenedContainers = ['foo', 'bar'];
            inst.startPrintingStatus();

            timer.tick(inst.PRINT_STATUS_INTERVAL);

            assert.calledOnce(LogMonitor.prototype.printStatus);
            assert.calledWith(LogMonitor.prototype.printStatus, ['foo', 'bar']);
        });
    });

    describe('#getMonitor()', () => {
        it('should require DataDog successfully', () => {
            const inst = new LogMonitor({ monitor: 'data-dog' });

            const res = inst.getMonitor();

            assert.isObject(res);
        });

        it('should throw an error when monitor is unknown', () => {
            const inst = new LogMonitor({ monitor: 'dog-data' });

            assert.throws(() => {
                inst.getMonitor();
            }, /Unknown monitor: dog-data/);
        });
    });

    describe('#startListenToContainers()', () => {
        beforeEach(() => {
            createFakeRecordsHandler();
        });

        it('should create record handlers with containers list', () => {
            const inst = new LogMonitor({ containerName: ['foo', 'bar'] }, FakeRecordsHandlerClass);
            const monitorObj = inst.monitor = {};
            inst.startListenToContainers(['foo', 'bar']);

            assert.deepEqual(inst.listenedContainers, ['foo', 'bar']);

            assert.callCount(FakeRecordsHandlerClass, 2);
            assert.lengthOf(fakeHandlerInstances, 2);

            const handlerArgs = getFakeRecordHandlerArgs();

            assert.include(handlerArgs.monitors, monitorObj);
            assert.deepEqual(handlerArgs.containers, ['foo', 'bar']);
            assert.deepEqual(handlerArgs.passPseudo, [undefined, undefined]);

            assert.ok(
                handlerArgs.stopHandlers.every(handler => typeof handler === 'function'),
                'Someone of stopHandlers is not a function'
            );

            assert.ok(
                fakeHandlerInstances.every(inst => inst.run.calledOnce),
                'Someone of run methods is not called once'
            );
        });

        it('should pass pseudo true to handlers', () => {
            const inst = new LogMonitor({ containerName: ['foo', 'bar'], pass_pseudo: true }, FakeRecordsHandlerClass);
            inst.startListenToContainers(['foo', 'bar']);

            const handlerArgs = getFakeRecordHandlerArgs();

            assert.deepEqual(handlerArgs.containers, ['foo', 'bar']);
            assert.deepEqual(handlerArgs.passPseudo, [true, true]);
        });

        it('should call #onStopHandling() when handler calls hook', () => {
            sandbox.stub(LogMonitor.prototype, 'onStopHandling');

            const inst = new LogMonitor({ containerName: ['foo', 'bar'] }, FakeRecordsHandlerClass);
            inst.startListenToContainers(['foo', 'bar']);

            const handlerArgs = getFakeRecordHandlerArgs();

            assert.lengthOf(handlerArgs.stopHandlers, 2);

            handlerArgs.stopHandlers[0]('foo');

            assert.calledOnce(LogMonitor.prototype.onStopHandling);
            assert.calledWith(LogMonitor.prototype.onStopHandling, 'foo');
        });
    });

    describe('#listenToAllNewContainers()', () => {
        beforeEach(() => {
            createFakeRecordsHandler();
            sandbox.stub(LogMonitor.prototype, 'getCurrentContainersList');
        });

        it('should start listen to all containers', () => {
            LogMonitor.prototype.getCurrentContainersList.returns(['foo', 'bar']);

            const inst = new LogMonitor({}, FakeRecordsHandlerClass);
            inst.listenToAllNewContainers();

            assert.callCount(FakeRecordsHandlerClass, 2);

            const handlerArgs = getFakeRecordHandlerArgs();

            assert.deepEqual(handlerArgs.containers, ['foo', 'bar']);
        });

        it('should pick up new containers', () => {
            const inst = new LogMonitor({}, FakeRecordsHandlerClass);

            LogMonitor.prototype.getCurrentContainersList.returns(['foo', 'bar']);
            inst.listenToAllNewContainers();

            LogMonitor.prototype.getCurrentContainersList.returns(['foo', 'bar', 'baz']);
            inst.listenToAllNewContainers();

            assert.callCount(FakeRecordsHandlerClass, 3);

            const handlerArgs = getFakeRecordHandlerArgs();

            assert.deepEqual(handlerArgs.containers, ['foo', 'bar', 'baz']);
        });
    });

    describe('#onStopHandling()', () => {
        it('should exclude container from listened', () => {
            const inst = new LogMonitor();
            inst.listenedContainers = ['foo', 'bar'];
            inst.onStopHandling('foo');

            assert.deepEqual(inst.listenedContainers, ['bar']);
        });
    });

    describe('#getCurrentContainersList()', () => {
        it('should parse containers list', () => {
            stubRawContainersList();
            const inst = new LogMonitor();

            const list = inst.getCurrentContainersList();

            assert.deepEqual(list, ['condescending_goldberg', 'dreamy_tesla', 'hopeful_joliot']);
        });

        it('should return empty array with empty list', () => {
            stubRawContainersList('');
            const inst = new LogMonitor();

            const list = inst.getCurrentContainersList();

            assert.deepEqual(list, []);
        });
    });
});
