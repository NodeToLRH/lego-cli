'use strict'

const fs = require('node:fs')
const path = require('node:path')
const process = require('node:process')

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

function spinnerStart(msg, spinnerString = '|/-\\') {
  const Spinner = require('cli-spinner').Spinner
  const spinner = new Spinner(`${msg} %s`)
  spinner.setSpinnerString(spinnerString)
  spinner.start()
  return spinner
}

function sleep(timeout = 1000) {
  return new Promise(resolve => setTimeout(resolve, timeout))
}

function exec(command, args, options) {
  const win32 = process.platform === 'win32'

  const cmd = win32 ? 'cmd' : command
  const cmdArgs = win32 ? ['/c'].concat(command, args) : args

  return require('node:child_process').spawn(cmd, cmdArgs, options || {})
}

function execAsync(command, args, options) {
  return new Promise((resolve, reject) => {
    const p = exec(command, args, options)
    p.on('error', (e) => {
      reject(e)
    })
    p.on('exit', (c) => {
      resolve(c)
    })
  })
}

function readFile(path, options = {}) {
  if (fs.existsSync(path)) {
    const buffer = fs.readFileSync(path)
    if (buffer) {
      if (options.toJson)
        return buffer.toJSON()
      else
        return buffer.toString()
    }
  }
  return null
}

function writeFile(path, data, { rewrite = true } = {}) {
  if (fs.existsSync(path)) {
    if (rewrite) {
      fs.writeFileSync(path, data)
      return true
    }
    return false
  }
  else {
    fs.writeFileSync(path, data)
    return true
  }
}

module.exports = {
  formatPath,
  isObject,
  spinnerStart,
  sleep,
  exec,
  execAsync,
  readFile,
  writeFile,
}
