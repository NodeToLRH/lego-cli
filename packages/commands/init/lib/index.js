'use strict'

const process = require('node:process')
const fs = require('node:fs')
const path = require('node:path')
// const { homedir } = require('node:os')

const inquirer = require('inquirer')
const fse = require('fs-extra')
const semver = require('semver')
const { glob } = require('glob')
const ejs = require('ejs')

const Command = require('@lego-cli/models-command')
// const Package = require('@lego-cli/models-package')
const log = require('@lego-cli/utils-log')
const { spinnerStart, sleep, execAsync } = require('@lego-cli/utils-tools')

const { TEMPLATE_LIST } = require('./constants')

const TYPE_PROJECT = 'project'
const TYPE_COMPONENT = 'component'
const TEMPLATE_TYPE_NORMAL = 'normal'
const TEMPLATE_TYPE_CUSTOM = 'custom'

const WHITE_COMMAND = ['npm', 'cnpm']
const COMPONENT_FILE = '.componentrc'

const templateList = TEMPLATE_LIST

class InitCommand extends Command {
  init() {
    this.projectName = this._argv[0] || ''
    this.force = !!this._cmd.force

    log.verbose('init projectName 项目名称', this.projectName)
    log.verbose('init force 是否强制初始化', this.force)
  }

  async exec() {
    try {
      // 1. 准备阶段
      const projectInfo = await this.prepare()
      if (projectInfo) {
        log.verbose('projectInfo', projectInfo)

        const { projectTemplate } = projectInfo

        this.projectInfo = projectInfo
        this.templateInfo = this.template.find(item => item.npmName === projectTemplate)

        // 2. 安装模版
        await this.installTemplate()
      }
    }
    catch (e) {
      log.error('init command exec error', e.message)
      if (process.env.LOG_LEVEL === 'verbose')
        console.log('init command exec error', e)
    }
  }

  async prepare() {
    // 1. 判断项目模板是否存在
    const template = templateList
    if (!template || template.length === 0)
      throw new Error('项目模板不存在！')
    this.template = template

    // 2. 判断当前目录是否为空目录
    const localPath = process.cwd()
    if (!this.isDirEmpty(localPath)) {
      let ifContinue = false
      if (!this.force) {
        ifContinue = (await inquirer.prompt({
          type: 'confirm',
          name: 'ifContinue',
          default: false,
          message: '当前文件夹不为空，是否继续创建项目？',
        })).ifContinue

        if (!ifContinue)
          return
      }

      if (ifContinue || this.force) {
        const { confirmDelete } = await inquirer.prompt({
          type: 'confirm',
          name: 'confirmDelete',
          default: false,
          message: '是否确认清空当前目录下的文件，继续创建项目？',
        })
        if (confirmDelete) {
          // fse.emptyDirSync(dir) : 确保目录为空。如果目录不为空，则删除目录内容。如果目录不存在，则创建目录。目录本身不会删除。
          fse.emptyDirSync(localPath)
        }
      }
    }
    return this.getProjectInfo()
  }

  async getProjectInfo() {
    function isValidName(v) {
      return /^(@[a-zA-Z0-9-_]+\/)?[a-zA-Z]+([-][a-zA-Z][a-zA-Z0-9]*|[_][a-zA-Z][a-zA-Z0-9]*|[a-zA-Z0-9])*$/.test(v)
    }

    let projectInfo = {}
    let isProjectNameValid = false
    if (isValidName(this.projectName)) {
      isProjectNameValid = true
      projectInfo.projectName = this.projectName
    }

    // 1. 选择创建项目或者组件
    const { type } = await inquirer.prompt({
      type: 'list',
      name: 'type',
      message: '请选择初始化类型？',
      default: TYPE_PROJECT,
      choices: [
        {
          name: '项目',
          value: TYPE_PROJECT,
        },
        {
          name: '组件',
          value: TYPE_COMPONENT,
        },
      ],
    })
    log.verbose('init type 初始化类型', type)

    this.template = this.template.filter(template => template.tag.includes(type))

    const title = type === TYPE_PROJECT ? '项目' : '组件'
    const projectNamePrompt = {
      type: 'input',
      name: 'projectName',
      message: `请输入${title}名称？`,
      default: '',
      validate(v) {
        const done = this.async()
        setTimeout(() => {
          if (!isValidName(v)) {
            done(`请输入合法的${title}名称！`)
            return
          }
          done(null, true)
        }, 0)
      },
      filter(v) {
        return v
      },
    }
    const projectPrompt = []

    if (!isProjectNameValid)
      projectPrompt.push(projectNamePrompt)

    projectPrompt.push(
      {
        type: 'input',
        name: 'projectVersion',
        message: `请输入${title}版本号？`,
        default: '1.0.0',
        validate(v) {
          const done = this.async()
          setTimeout(() => {
            if (!semver.valid(v)) {
              done('请输入合法的版本号！')
              return
            }
            done(null, true)
          }, 0)
        },
      },
      {
        type: 'list',
        name: 'projectTemplate',
        message: `请选择${title}模版？`,
        choices: this.template.map(item => ({
          value: item.npmName,
          name: item.name,
        })),
      },
    )

    if (type === TYPE_PROJECT) {
      const project = await inquirer.prompt(projectPrompt)
      projectInfo = { ...projectInfo, type, ...project }
    }
    else if (type === TYPE_COMPONENT) {
      const descriptionPrompt = {
        type: 'input',
        name: 'componentDescription',
        message: '请输入组件描述信息？',
        default: '',
        validate(v) {
          const done = this.async()
          setTimeout(() => {
            if (!v) {
              done('请输入组件描述信息！')
              return
            }
            done(null, true)
          })
        },
      }
      projectPrompt.push(descriptionPrompt)

      const component = await inquirer.prompt(projectPrompt)
      projectInfo = { ...projectInfo, type, ...component }
    }

    if (projectInfo.projectName) {
      projectInfo.name = projectInfo.projectName
      projectInfo.className = require('kebab-case')(projectInfo.projectName).replace(/^-/, '')
    }
    if (projectInfo.projectVersion)
      projectInfo.version = projectInfo.projectVersion

    if (projectInfo.componentDescription)
      projectInfo.description = projectInfo.componentDescription

    return projectInfo
  }

  isDirEmpty(localPath) {
    let fileList = fs.readdirSync(localPath)
    // 文件过滤
    fileList = fileList.filter(file => (!file.startsWith('.') && !['node_modules'].includes(file)))
    return !fileList || fileList.length <= 0
  }

  async installTemplate() {
    log.verbose('installTemplate templateInfo', this.templateInfo)

    if (this.templateInfo) {
      if (!this.templateInfo.type)
        this.templateInfo.type = TEMPLATE_TYPE_NORMAL

      if (this.templateInfo.type === TEMPLATE_TYPE_NORMAL) {
        // 标准安装
        await this.installNormalTemplate()
      }
      else if (this.templateInfo.type === TEMPLATE_TYPE_CUSTOM) {
        // 自定义安装
        await this.installCustomTemplate()
      }
      else {
        throw new Error('无法识别项目模板类型！')
      }
    }
    else {
      throw new Error('项目模板信息不存在！')
    }
  }

  async installNormalTemplate() {
    log.verbose('installNormalTemplate', this.templateInfo)

    // 拷贝模版代码至当前目录

    const spinner = spinnerStart('正在安装模版...')

    await sleep()

    const { npmName } = this.templateInfo
    const targetPath = process.cwd()

    try {
      const templateDir = path.resolve(__filename, '../..', `template`, `${npmName}`)

      fse.ensureDirSync(templateDir)
      fse.ensureDirSync(targetPath)
      fse.copySync(templateDir, targetPath)
    }
    finally {
      spinner.stop(true)
      log.success('模版安装成功！')
    }

    const templateIgnore = this.templateInfo.ignore || []
    const ignore = ['**/node_modules/**', ...templateIgnore]
    await this.ejsRender({ ignore })
    // 如果是组件，则生成组件配置文件
    await this.createComponentFile(targetPath)

    const { installCommand, startCommand } = this.templateInfo
    log.info('安装依赖命令：', installCommand)
    log.info('启动项目命令：', startCommand)

    // 执行依赖安装命令
    // await this.execCommand(installCommand, '依赖安装失败！')
    // 执行启动命令
    // await this.execCommand(startCommand, '启动执行命令失败！')
  }

  async ejsRender(options) {
    const dir = process.cwd()
    const projectInfo = this.projectInfo

    // 使用 shell 所使用的模式匹配文件。
    const files = await glob(
      '**',
      {
        cwd: dir, // 要搜索的当前工作目录。默认为 process.cwd()
        ignore: options.ignore || '', // 排除匹配的文件
        nodir: true, // 不匹配目录，只匹配文件
      },
    )

    return new Promise((resolve, reject) => {
      Promise
        .all(files.map((file) => {
          const filePath = path.join(dir, file)

          return new Promise((resolve1, rejcet1) => {
            ejs.renderFile(filePath, projectInfo, {}, (err, result) => {
              if (err)
                rejcet1(err)

              fse.writeFileSync(filePath, result)
              resolve1(result)
            })
          })
        }))
        .then(() => {
          resolve()
        })
        .catch((err) => {
          reject(err)
        })
    })
  }

  createComponentFile(targetPath) {
    const templateInfo = this.templateInfo
    const projectInfo = this.projectInfo
    if (templateInfo.tag.includes(TYPE_COMPONENT)) {
      const componentData = {
        ...projectInfo,
        buildPath: templateInfo.buildPath,
        examplePath: templateInfo.examplePath,
        npmName: templateInfo.npmName,
        npmVersion: templateInfo.version,
      }
      const componentFile = path.resolve(targetPath, COMPONENT_FILE)
      fs.writeFileSync(componentFile, JSON.stringify(componentData))
    }
  }

  pkgFromUserAgent(userAgent) {
    if (!userAgent)
      return undefined
    const pkgSpec = userAgent.split(' ')[0]
    const pkgSpecArr = pkgSpec.split('/')
    return {
      name: pkgSpecArr[0],
      version: pkgSpecArr[1],
    }
  }

  checkCommand(cmd) {
    if (WHITE_COMMAND.includes(cmd))
      return cmd

    return null
  }

  async execCommand(command, errMsg) {
    let ret
    if (command) {
      const cmdArray = command.split(' ')
      const cmd = this.checkCommand(cmdArray[0])
      if (!cmd)
        throw new Error(`命令不存在！命令：${command}`)

      const args = cmdArray.slice(1)
      ret = await execAsync(cmd, args, {
        stdio: 'inherit',
        cwd: process.cwd(),
      })
    }
    if (ret !== 0)
      throw new Error(errMsg)

    return ret
  }

  installCustomTemplate() {
    log.verbose('installCustomTemplate')
  }
}

function init(argv) {
  log.verbose('init command argv', argv)
  return new InitCommand(argv)
}

module.exports = init
module.exports.InitCommand = InitCommand
