'use strict'

const assert = require('node:assert').strict
const cloudbuild = require('../lib')

assert.strictEqual(cloudbuild(), 'Hello from cloudbuild')
console.info('cloudbuild tests passed')
