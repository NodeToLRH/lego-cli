'use strict'

const assert = require('node:assert').strict
const command = require('..')

assert.strictEqual(command(), 'Hello from command')
console.info('command tests passed')
