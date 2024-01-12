'use strict'

const assert = require('node:assert').strict
const exec = require('..')

assert.strictEqual(exec(), 'Hello from exec')
