'use strict';
const dogStatsD = require('node-dogstatsd');

const ddHost = process.env['DD_HOST'] || '127.0.0.1';
const ddPort = process.env['DD_PORT'] || 8125;

const statsD = new dogStatsD.StatsD(ddHost, ddPort);


function incStatuses(containerName, statuses) {
    for (let [name, count] of Object.entries(statuses)) {
        if (!count) {
            continue;
        }

        const signal = `docker-log-monitor.status.${name}`;
        const tags = [`container:${containerName}`];

        for (let i = 0; i < count; i++) {
            statsD.increment(signal, tags);
        }

        console.log('DataDog:', `Increment signal ${signal} at ${count} with tags ${tags}`);
    }
}

function sendTiming(containerName, timingName, time) {
    const signal = `docker-log-monitor.timing.${timingName}`;
    const tags = [`container:${containerName}`];

    statsD.timing(signal, time, tags);

    console.log('DataDog:', `Send timing with signal ${signal}, value ${time} and tags ${tags}`);
}

module.exports = {
    incStatuses,
    sendTiming,
};
