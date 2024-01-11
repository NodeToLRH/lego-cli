'use strict'

const assert = require('node:assert').strict
const tools = require('..')

assert.strictEqual(tools(), 'Hello from tools')
console.info('tools tests passed')
