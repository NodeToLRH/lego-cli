'use strict'

const assert = require('node:assert').strict
const init = require('..')

assert.strictEqual(init(), 'Hello from init')
console.info('init tests passed')
