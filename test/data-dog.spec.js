'use strict';
const dataDogMonitor = require('../lib/data-dog');
const dogStatsD = require('node-dogstatsd');
const Statuses = require('../lib/statuses');

describe('DataDog monitor', function() {
    let sandbox;

    beforeEach(() => {
        sandbox = sinon.sandbox.create();
    });

    afterEach(() => {
        sandbox.restore();
    });

    describe('#incStatuses()', () => {
        beforeEach(() => {
            sandbox.stub(dogStatsD.StatsD.prototype, 'increment');
        });

        it('should increase statuses one by one', () => {
            const statuses = new Statuses(2);

            dataDogMonitor.incStatuses('foo', statuses);

            const tags = [`container:foo`];
            let statusCount = 0;

            for (let name of Object.keys(statuses)) {
                const signal = `docker-log-monitor.status.${name}`;
                assert.calledWith(dogStatsD.StatsD.prototype.increment, signal, tags);
                statusCount++;
            }

            assert.callCount(dogStatsD.StatsD.prototype.increment, statusCount * 2);
        });
    });
});
