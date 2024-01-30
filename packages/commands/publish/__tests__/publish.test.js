'use strict'

const assert = require('node:assert').strict
const publish = require('../lib')

assert.strictEqual(publish(), 'Hello from publish')
console.info('publish tests passed')
