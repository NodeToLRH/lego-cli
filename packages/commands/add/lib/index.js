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
const pkgUp = require('pkg-up')

const Command = require('@lego-cli/models-command')
const log = require('@lego-cli/utils-log')
const { execAsync, formatPath } = require('@lego-cli/utils-tools')

const { SECTION_TEMPLATE_LIST, PAGE_TEMPLATE_LIST } = require('./constants')

const ADD_MODE_SECTION = 'section'
const ADD_MODE_PAGE = 'page'
// const PAGE_TEMPLATE_TYPE_NORMAL = 'normal'
const PAGE_TEMPLATE_TYPE_CUSTOM = 'custom'

class AddCommand extends Command {
  init() {
    // 获取 add 命令的初始化参数
  }

  async exec() {
    this.addMode = (await this.getAddMode()).addMode
    if (this.addMode === ADD_MODE_SECTION)
      await this.installSectionTemplate()
    else
      await this.installPageTemplateTemplate()
  }

  getAddMode() {
    return inquirer.prompt({
      type: 'list',
      name: 'addMode',
      message: '请选择代码复用模式？',
      choices: [{
        name: '代码片段',
        value: ADD_MODE_SECTION,
      }, {
        name: '页面模版',
        value: ADD_MODE_PAGE,
      }],
    })
  }

  async installSectionTemplate() {
    // 1. 获取页面代码片段安装文件夹
    this.dir = process.cwd()
    // 2. 代码片段模版
    this.sectionTemplate = await this.getTemplate(ADD_MODE_SECTION)
    // 3. 安装代码片段模拟
    // 3.1 前置检查 - 目录重名检查
    await this.prepare(ADD_MODE_SECTION)
    // 3.2 代码片段安装
    await this.installSection()
  }

  async installPageTemplateTemplate() {
    // 1. 获取页面代码片段安装文件夹
    this.dir = process.cwd()
    // 2. 页面模版
    this.pageTemplate = await this.getTemplate(ADD_MODE_PAGE)
    // 3. 安装页面模拟
    // 3.1 前置检查 - 目录重名检查
    await this.prepare(ADD_MODE_PAGE)
    // 3.2 页面模版安装
    await this.installPageTemplate()
  }

  async getTemplate(addMode = ADD_MODE_PAGE) {
    const name = addMode === ADD_MODE_PAGE ? '页面' : '代码片段'

    if (addMode === ADD_MODE_PAGE)
      this.pageTemplateData = PAGE_TEMPLATE_LIST
    else
      this.sectionTemplateData = SECTION_TEMPLATE_LIST

    const TEMPLATE = addMode === ADD_MODE_PAGE ? this.pageTemplateData : this.sectionTemplateData

    const pageTemplateName = (await inquirer.prompt({
      type: 'list',
      name: 'pageTemplate',
      message: `请选择${name}模版？`,
      choices: this.createChoices(addMode),
    })).pageTemplate

    const pageTemplate = TEMPLATE.find(item => item.npmName === pageTemplateName)
    if (!pageTemplate)
      throw new Error(`${name} 模版不存在！`)

    const { pageName } = await inquirer.prompt({
      type: 'input',
      name: 'pageName',
      message: `请输入${name}名称？`,
      default: '',
      validate(value) {
        const done = this.async()
        if (!value || !value.trim())
          done(`${name}名称不能为空！`)
        else
          done(null, true)
      },
    })
    if (addMode === ADD_MODE_PAGE)
      pageTemplate.pageName = pageName.trim()
    else
      pageTemplate.sectionName = pageName.trim()

    return pageTemplate
  }

  createChoices(addMode) {
    return addMode === ADD_MODE_PAGE
      ? this.pageTemplateData.map(item => ({
        name: item.name,
        value: item.npmName,
      }))
      : this.sectionTemplateData.map(item => ({
        name: item.name,
        value: item.npmName,
      }))
  }

  async prepare(addMode = ADD_MODE_PAGE) {
    if (addMode === ADD_MODE_PAGE)
      this.targetPath = path.resolve(this.dir, this.pageTemplate.pageName)
    else
      this.targetPath = path.resolve(this.dir, 'components', this.sectionTemplate.sectionName)

    if (fs.existsSync(this.targetPath))
      throw new Error('页面文件夹已存在！')
  }

  async installSection() {
    // 1. 选择需要插入的源码文件
    const files = fs.readdirSync(this.dir, { withFileTypes: true })
      .map(file => file.isFile() ? file.name : null)
      .filter(_ => _)
      .map(file => ({ name: file, value: file }))

    if (files.length === 0)
      throw new Error('当前文件夹下没有文件！')

    const codeFile = (await inquirer.prompt({
      type: 'list',
      message: '请选择需要插入代码片段的源码文件？',
      name: 'codeFile',
      choices: files,
    })).codeFile

    // 2. 输入插入行数
    const lineNumber = (await inquirer.prompt({
      type: 'input',
      message: '请输入要插入的行数？',
      name: 'lineNumber',
      validate(value) {
        const done = this.async()
        if (!value || !value.trim())
          done('插入的行数不能为空！')
        else if (value >= 0 && Math.floor(value) === Number(value))
          done(null, true)
        else
          done('插入的行数必须为整数！')
      },

    })).lineNumber

    log.verbose('add installSection codeFile', codeFile)
    log.verbose('add installSection lineNumber', lineNumber)

    // 3. 将源码文件进行分割成数组
    const codeFilePath = path.resolve(this.dir, codeFile)
    const codeContent = fs.readFileSync(codeFilePath, 'utf-8')
    const codeContentArr = codeContent.split('\n')

    // 4. 以组件形式插入代码片段
    const componentName = this.sectionTemplate.sectionName.toLocaleLowerCase()
    const componentNameOriginal = this.sectionTemplate.sectionName
    codeContentArr.splice(lineNumber, 0, `<${componentName}></${componentName}>`)

    // 5. 插入代码片段的 import 语句
    const scriptIndex = codeContentArr.findIndex(code => code.replace(/\s/g, '') === '<script>')
    codeContentArr.splice(scriptIndex + 1, 0, `import ${componentNameOriginal} from './components/${componentNameOriginal}/index.vue'`)
    log.verbose('codeContentArr', codeContentArr)

    // 6. 将代码还原为 string
    const newCodeContent = codeContentArr.join('\n')
    fs.writeFileSync(codeFilePath, newCodeContent, 'utf-8')
    log.verbose('代码片段写入成功！')

    // 7. 创建代码片段组件目录
    const templatePath = path.resolve(__filename, '../..', `template`, this.sectionTemplate.npmName, this.sectionTemplate.targetPath ? this.sectionTemplate.targetPath : '')
    fse.ensureDirSync(this.targetPath)
    fse.copySync(templatePath, this.targetPath)
  }

  async installPageTemplate() {
    log.info('页面模版正在安装...')
    log.verbose('pageTemplate', this.pageTemplate)

    const templatePath = path.resolve(__filename, '../..', `template`, this.pageTemplate.npmName, this.pageTemplate.targetPath)
    const targetPath = this.targetPath

    log.verbose('add installPageTemplate templatePath', templatePath)
    log.verbose('add installPageTemplate targetPath', targetPath)

    if (!fs.existsSync(templatePath))
      throw new Error('页面模版不存在！')

    fse.ensureDirSync(templatePath)
    fse.ensureDirSync(targetPath)

    if (this.pageTemplate.type === PAGE_TEMPLATE_TYPE_CUSTOM)
      await this.installCustomPageTemplate({ templatePath, targetPath })
    else
      await this.installNormalPageTemplate({ templatePath, targetPath })
  }

  async installCustomPageTemplate({ templatePath, targetPath }) {
    const rootFile = path.resolve(__filename, '../..', `template`, this.pageTemplate.npmName, 'index.js')
    if (fs.existsSync(rootFile)) {
      log.notice('开始执行自定义页面模版...')
      const options = {
        templatePath,
        targetPath,
        pageTemplate: this.pageTemplate,
      }

      const code = `require('${formatPath(rootFile)}')(${JSON.stringify(options)})`
      await execAsync('node', ['-e', code], { stdio: 'inherit', cwd: process.cwd() })
      log.success('自定义页面模版执行成功！')
    }
    else {
      throw new Error('自定义页面模版不存在！')
    }
  }

  async installNormalPageTemplate({ templatePath, targetPath }) {
    fse.copySync(templatePath, targetPath)
    await this.ejsRender({ targetPath })
    await this.dependenciesMerge({ templatePath, targetPath })

    log.verbose('页面模版安装成功！')
  }

  async ejsRender(options) {
    const { targetPath } = options
    const { pageName, ignore } = this.pageTemplate

    // 使用 shell 所使用的模式匹配文件。
    const files = await glob(
      '**',
      {
        cwd: targetPath, // 要搜索的当前工作目录。默认为 process.cwd()
        ignore: ignore || '', // 排除匹配的文件
        nodir: true, // 不匹配目录，只匹配文件
      },
    )

    return new Promise((resolve, reject) => {
      Promise
        .all(files.map((file) => {
          const filePath = path.resolve(targetPath, file)
          return new Promise((resolve1, reject1) => {
            ejs.renderFile(filePath, {
              name: pageName.toLocaleLowerCase(),
            }, {}, (err, result) => {
              if (err) {
                reject1(err)
              }
              else {
              // 重新写入文件信息
                fse.writeFileSync(filePath, result)
                resolve1(result)
              }
            })
          })
        }))
        .then(() => resolve())
        .catch(err => reject(err))
    })
  }

  async dependenciesMerge(options) {
    function objToArray(o) {
      const arr = []
      Object.keys(o).forEach((key) => {
        arr.push({ key, value: o[key] })
      })
      return arr
    }

    function arrayToObj(arr) {
      const o = {}
      arr.forEach(item => o[item.key] = item.value)
      return o
    }

    function depDiff(templateDepArr, targetDepArr) {
      const finalDep = [...targetDepArr]

      // 场景1 ： 模版中存在依赖，项目中不存在（拷贝依赖）
      // 场景2 ： 模版中存在依赖，项目中存在（不会拷贝依赖，但是会在脚手架中给予提示，让开发者手动进行处理）
      templateDepArr.forEach((templateDep) => {
        const duplicatedDep = targetDepArr.find(targetDep => targetDep.key === templateDep.key)
        if (duplicatedDep) {
          log.verbose('查询到重复依赖', duplicatedDep)

          const templateRange = semver.validRange(templateDep.value).split('<')[1]
          const targetRange = semver.validRange(duplicatedDep.value).split('<')[1]
          if (templateRange !== targetRange)
            log.warn(`${templateDep.key} 冲突，${templateDep.value} => ${duplicatedDep.value}`)
        }
        else {
          log.verbose('查询到新依赖', templateDep)
          finalDep.push(templateDep)
        }
      })

      return finalDep
    }

    // 1. 获取模版 package.json
    const { templatePath, targetPath } = options
    const templatePkgPath = pkgUp.sync({ cwd: templatePath })
    const targetPkgPath = pkgUp.sync({ cwd: targetPath })
    const templatePkg = fse.readJsonSync(templatePkgPath)
    const targetPkg = fse.readJsonSync(targetPkgPath)

    // 2. 获取 package.json - dependencies
    const templateDep = templatePkg.dependencies || {}
    const targetDep = targetPkg.dependencies || {}

    // 3. 将对象转化为数组
    const templateDepArr = objToArray(templateDep)
    const targetDepArr = objToArray(targetDep)

    // 4. 比对 package.json - dependencies 之间的区别
    const newDep = depDiff(templateDepArr, targetDepArr)
    targetPkg.dependencies = arrayToObj(newDep)
    fse.writeJSONSync(targetPkgPath, targetPkg, { spaces: 2 })

    // 5. 安装依赖
    log.info('正在安装页面模版依赖...')
    await this.execCommand('npm install', path.dirname(targetPkgPath))
    log.success('页面模版依赖安装成功！')
  }

  async execCommand(command, cwd) {
    let ret
    if (command) {
      // npm install => [npm, install] => npm, [install]
      const cmdArray = command.split(' ')
      const cmd = cmdArray[0]
      const args = cmdArray.slice(1)
      ret = await execAsync(cmd, args, {
        stdio: 'inherit',
        cwd,
      })
    }
    if (ret !== 0)
      throw new Error(`${command} 命令执行失败！`)

    return ret
  }
}

function add(argv) {
  log.verbose('add command argv', argv)
  return new AddCommand(argv)
}

module.exports = add
module.exports.AddCommand = AddCommand
