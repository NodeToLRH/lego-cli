'use strict'

const assert = require('node:assert').strict
const add = require('../lib')

assert.strictEqual(add(), 'Hello from add')
console.info('add tests passed')
