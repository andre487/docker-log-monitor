'use strict';
const assert = global.assert = require('chai').assert;
const sinon = global.sinon = require('sinon');

sinon.assert.expose(assert, { prefix: '' });
