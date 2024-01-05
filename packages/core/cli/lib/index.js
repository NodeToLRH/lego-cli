module.exports = core

const process = require('node:process')
const fs = require('node:fs')
const path = require('node:path')
const { homedir } = require('node:os')
const semver = require('semver')
const colors = require('colors/safe')

const log = require('@lego-cli/utils-log')

const pkg = require('../package.json')
const constant = require('./const')

async function core() {
  try {
    await prepare()
    registerCommand()
  }
  catch (e) {
    log.error(e.message)
  }
}

function registerCommand() {
}

async function prepare() {
  checkPkgVersion() // 检查当前版本
  checkRoot() // 检查是否为 root 启动
  checkUserHome() // 检查用户主目录
  checkEnv() // 检查环境变量
  // TODO: 未发布 npm，先暂停检查 cli 是否需要更新
  // await checkGlobalUpdate() // 检查 cli 是否需要更新
}

// 检查当前版本
function checkPkgVersion() {
  log.info('cli', pkg.version)
}

// 检查是否为 root 启动
// 尝试降低具有根权限的进程的权限，如果失败，则阻止访问
function checkRoot() {
  const rootCheck = require('root-check')
  rootCheck(colors.red('请避免使用 root 账户启动本应用！'))
}

// 检查用户主目录
function checkUserHome() {
  if (!homedir() || !fs.existsSync(homedir()))
    throw new Error(colors.red(`当前登录用户主目录不存在！`))
}

// 检查环境变量
function checkEnv() {
  const dotenv = require('dotenv')
  const dotenvPath = path.resolve(homedir(), '.env')

  if (fs.existsSync(dotenvPath)) {
    dotenv.config({
      path: dotenvPath,
    })
  }
  createDefaultConfig()
}

function createDefaultConfig() {
  const cliConfig = {
    home: homedir(),
  }
  if (process.env.CLI_HOME)
    cliConfig.cliHome = path.join(homedir(), process.env.CLI_HOME)

  else
    cliConfig.cliHome = path.join(homedir(), constant.DEFAULT_CLI_HOME)

  process.env.CLI_HOME_PATH = cliConfig.cliHome
}

// 检查 cli 工具是否需要更新
// eslint-disable-next-line no-unused-vars, unused-imports/no-unused-vars
async function checkGlobalUpdate() {
  const currentVersion = pkg.version
  const npmName = pkg.name
  const { getNpmSemverVersion } = require('@lego-cli/utils-get-npm-info')
  const lastVersion = await getNpmSemverVersion(currentVersion, npmName)

  // semver.gt(v1, v2): v1 > v2
  if (lastVersion && semver.gt(lastVersion, currentVersion)) {
    log.warn(colors.yellow(`请手动更新 ${npmName}，当前版本：${currentVersion}，最新版本：${lastVersion}。`))
    log.warn(colors.yellow(`更新命令： npm install -g ${npmName}`))
  }
}
