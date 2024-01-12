'use strict'

const path = require('node:path')
const process = require('node:process')
const { spawn } = require('node:child_process')

const Package = require('@lego-cli/models-package')
const log = require('@lego-cli/utils-log')

const SETTINGS = {}

const CACHE_DIR = 'dependencies'

async function exec(...args) {
  const homePath = process.env.CLI_HOME_PATH
  let targetPath = process.env.CLI_TARGET_PATH
  let storeDir = ''
  let pkg = null

  log.verbose('exec targetPath', targetPath)
  log.verbose('exec homePath', homePath)

  const cmdObj = args[args.length - 1]
  const cmdName = cmdObj.name()
  const packageName = SETTINGS[cmdName]
  const packageVersion = 'latest'

  if (!targetPath) {
    targetPath = path.resolve(homePath, CACHE_DIR)
    storeDir = path.resolve(targetPath, 'node_modules')

    log.verbose('exec targetPath', targetPath)
    log.verbose('exec storeDir', storeDir)

    pkg = new Package({
      targetPath,
      storeDir,
      packageName,
      packageVersion,
    })

    const isPkgExists = await pkg.exists()
    if (isPkgExists)
      await pkg.update() // 更新 package
    else
      await pkg.install() // 安装 package
  }
  else {
    pkg = new Package({
      targetPath,
      packageName,
      packageVersion,
    })
  }

  const rootFile = pkg.getRootFilePath()
  if (!rootFile)
    return

  try {
    const cmd = args[args.length - 1]
    const obj = Object.create(null)

    Object.keys(cmd).forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(cmd, key) && !key.startsWith('_') && key !== 'parent')
        obj[key] = cmd[key]
    })
    args[args.length - 1] = obj

    const code = `require('${rootFile}').call(null, ${JSON.stringify(args)})`

    // child_process.spawn(command[, args][, options]) : 启动子进程执行命令
    // > command : 要运行的命令。
    // > args : 字符串参数列表。
    // > options : 对象，相关选项配置
    const child = spawn('node', ['-e', code], {
      cwd: process.cwd(), // 子进程的当前工作目录
      stdio: 'inherit', // 子进程的标准输入输出配置
    })

    child.on('error', (e) => {
      log.error('exec child_process spawn error : ', e.message)
      process.exit(1)
    })
    child.on('exit', (e) => {
      log.verbose(`exec child_process spawn exit 命令执行成功 : ${e}`)
      process.exit(1)
    })
  }
  catch (e) {
    console.log('exec catch error : ', e.message)
  }
}

module.exports = exec
