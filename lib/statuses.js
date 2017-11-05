'use strict';
module.exports = function Statuses(defaultVal = 0) {
    this.heartBeat = defaultVal;
    this.reconnect = defaultVal;

    this.trace = defaultVal;
    this.debug = defaultVal;
    this.info = defaultVal;
    this.warning = defaultVal;
    this.error = defaultVal;
    this.critical = defaultVal;
    this.fatal = defaultVal;
};
