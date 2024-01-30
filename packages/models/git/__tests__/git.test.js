'use strict'

const assert = require('node:assert').strict
const git = require('../lib')

assert.strictEqual(git(), 'Hello from git')
console.info('git tests passed')
