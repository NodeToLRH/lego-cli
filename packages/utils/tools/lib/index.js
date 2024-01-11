'use strict'

const path = require('node:path')

function formatPath(p) {
  if (p && typeof p === 'string') {
    // path.sep : 提供特定于平台的路径片段分隔符
    const sep = path.sep

    if (sep === '/')
      return p
    else
      return p.replace(/\\/g, '/')
  }
  return p
}

function isObject(o) {
  return Object.prototype.toString.call(o) === '[object Object]'
}

module.exports = {
  formatPath,
  isObject,
}
