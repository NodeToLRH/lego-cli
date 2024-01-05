'use strict'

const assert = require('node:assert').strict
const getNpmInfo = require('..')

assert.strictEqual(getNpmInfo(), 'Hello from getNpmInfo')
