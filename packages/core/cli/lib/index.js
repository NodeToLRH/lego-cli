module.exports = core

const process = require('node:process')
const fs = require('node:fs')
const path = require('node:path')
const { homedir } = require('node:os')
const semver = require('semver')
const colors = require('colors/safe')
const { Command } = require('commander')

const log = require('@lego-cli/utils-log')

const pkg = require('../package.json')
const constant = require('./const')

// 实例化 commander 实例
const program = new Command()

async function core() {
  try {
    await prepare()
    registerCommand()
  }
  catch (e) {
    log.error(e.message)
    if (program.debug)
      console.log(e)
  }
}

function registerCommand() {
  // program.name : 命令名称出现在帮助中，也用于定位独立的可执行子命令。
  // program.usage : 可以修改帮助信息的首行提示。 eg: lego-cli <command> [options] 。
  // program.version : 设置版本。其默认选项为 -V 和 --version ，设置了版本后，命令行会输出当前的版本号。
  // program.option : 定义选项，同时可以附加选项的简介。解析后的选项可以通过 Command 对象上的 .opts() 方法获取，同时会被传递给命令处理函数。
  program
    .name(Object.keys(pkg.bin)[0])
    .usage('<command> [options]')
    .version(pkg.version, '-v, --vers', '输出当前版本')
    .helpOption('-h, --help', '显示命令帮助')
    .option('-d --debug', '是否开启调试模式', false)
    .option('-tp --targetPath <targetPath>', '是否指定本地调试文件路径', '')

  // program.on : 监听命令和选项可以执行自定义函数。
  // 开启 debug 模式
  program.on('option:debug', () => {
    // 判断是否开启 debug 模式，调整日志打印级别
    if (program.debug)
      process.env.LOG_LEVEL = 'verbose'
    else
      process.env.LOG_LEVEL = 'info'

    log.level = process.env.LOG_LEVEL
  })

  // 指定 targetPath
  program.on('option:targetPath', () => {
    process.env.CLI_TARGET_PATH = program.targetPath
  })

  // 处理未知命令
  program.on('command:*', (obj) => {
    // 获取可用命令
    const availableCommands = program.commands.map(cmd => cmd.name())

    console.log(colors.red(`未知命令: ${obj[0]}`))

    if (availableCommands.length > 0)
      console.log(colors.red(`可用命令: ${availableCommands.join(',')}`))
  })

  // program.parse : 解析字符串数组，也可以省略参数而使用 process.argv。
  // > program.parse(process.argv); // 指明，按 node 约定，argv[0] 是应用， argv[1] 是要跑的脚本，后续为用户参数
  // > program.parse(); // 默认，自动识别 electron ， argv[1] 根据 electron 应用是否打包而变化
  // > program.parse(['-f', 'filename'], { from: 'user' });
  program.parse(process.argv)

  // program.args : 通过 program.parse(arguments) 方法处理参数，没有被使用的选项会存放在 program.args 数组中。
  if (program.args && program.args.length < 1)
    program.outputHelp() // 展示帮助信息，不退出程序。传入{ error: true }可以让帮助信息从 stderr 输出。
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
