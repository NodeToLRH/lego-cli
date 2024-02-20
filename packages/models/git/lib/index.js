'use strict'

const process = require('node:process')
const fs = require('node:fs')
const path = require('node:path')
const { homedir } = require('node:os')

const fse = require('fs-extra')
const SimpleGit = require('simple-git')
const inquirer = require('inquirer')
const terminalLink = require('terminal-link')
const semver = require('semver')
const Listr = require('listr')
const { Observable } = require('rxjs')

const CloudBuild = require('@lego-cli/models-cloudbuild')
const { readFile, writeFile, spinnerStart } = require('@lego-cli/utils-tools')
const log = require('@lego-cli/utils-log')

const Github = require('./Github')
const Gitee = require('./Gitee')
const request = require('./request')

const DEFAULT_CLI_HOME = '.lego-cli'
const GIT_ROOT_DIR = '.git'
const GIT_SERVER_FILE = '.git_server'
const GIT_TOKEN_FILE = '.git_token'
const GIT_OWN_FILE = '.git_own'
const GIT_LOGIN_FILE = '.git_login'
const GIT_IGNORE_FILE = '.gitignore'
const GIT_PUBLISH_FILE = '.git_publish'

const COMPONENT_FILE = '.componentrc'

const VERSION_RELEASE = 'release'
const VERSION_DEVELOP = 'dev'

const TEMPLATE_TEMP_DIR = 'oss'

const GITHUB = 'github'
const GITEE = 'gitee'
const GIT_SERVER_TYPE = [
  { name: 'Github', value: GITHUB },
  { name: 'Gitee', value: GITEE },
]

const REPO_OWNER_USER = 'user'
const REPO_OWNER_ORG = 'org'
const GIT_OWNER_TYPE = [
  { name: '个人', value: REPO_OWNER_USER },
  { name: '组织', value: REPO_OWNER_ORG },
]
const GIT_OWNER_TYPE_ONLY = [
  { name: '个人', value: REPO_OWNER_USER },
]

const GIT_PUBLISH_TYPE = [
  { name: 'OSS', value: 'oss' },
]

class Git {
  constructor({ name, version, dir }, {
    refreshServer = false,
    refreshToken = false,
    refreshOwner = false,
    buildCmd = '',
    prod = false,
    sshUser = '',
    sshIp = '',
    sshPath = '',
  }) {
    if (name.startsWith('@') && name.indexOf('/') > 0) {
      // @lego-cli/component-test -> lego-cli_component-test
      const nameArray = name.split('/')
      this.name = nameArray.join('_').replace('@', '')
    }
    else {
      this.name = name // 项目名称
    }
    this.dir = dir // 项目目录
    this.version = version // 项目版本
    this.homePath = null // 本地缓存目录

    this.git = SimpleGit(dir) // SimpleGit 对象：在 node.js 应用程序中运行 git 命令的轻量接口
    this.gitServer = null // GitServer 实例： GitHub / Gitee 服务

    this.owner = null // 远程仓库类型： 个人（user） / 组织（org）
    this.user = null // 用户信息
    this.orgs = null // 组织信息
    this.login = null // 远程仓库登录名
    this.repo = null // 远程仓库信息
    this.branch = null // 本地开发分支
    this.buildCmd = buildCmd // 构建命令
    this.gitPublish = null // 静态资源服务器类型
    this.prod = prod // 是否正式发布

    this.refreshServer = refreshServer // 是否刷新远程仓库
    this.refreshToken = refreshToken // 是否刷新远程仓库 Token
    this.refreshOwner = refreshOwner // 是否刷新远程仓库类型

    this.sshUser = sshUser // ssh 用户名
    this.sshIp = sshIp // ssh IP
    this.sshPath = sshPath // ssh 路径
    log.verbose('Git ssh config', this.sshUser, this.sshIp, this.sshPath)
  }

  async prepare() {
    this.checkHomePath() // 检查缓存主目录
    await this.checkGitServer() // 检查用户远程仓库类型
    await this.checkGitToken() // 检查远程仓库 Token
    await this.getUserAndOrgs() // 获取远程仓库信息和组织信息
    await this.checkGitOwner() // 检查远程仓库类型
    await this.checkRepo() // 检查并创建远程仓库
    this.checkGitIgnore() // 检查并创建 .gitignore 文件
    await this.checkComponent() // 组件合法性检查
    await this.init() // 完成本地仓库初始化
  }

  async init() {
    if (await this.getRemote())
      return

    await this.initAndAddRemote()
    await this.initCommit()
  }

  async commit() {
    // 1. 生成开发分支
    await this.getCorrectVersion()
    // 2. 检查 stash 区
    await this.checkStash()
    // 3. 检查代码冲突
    await this.checkConflicted()
    // 4. 检查未提交代码
    await this.checkNotCommitted()
    // 5. 切换开发分支
    await this.checkoutBranch(this.branch)
    // 6. 合并远程 master 分支和开发分支代码
    await this.pullRemoteMasterAndBranch()
    // 7. 将开发分支推送到远程仓库
    await this.pushRemoteRepo(this.branch)
  }

  async publish() {
    let ret = false

    if (this.isComponent()) {
      log.info('开始发布组件...')
      ret = await this.saveComponentToDB()
    }
    else {
      await this.preparePublish()

      const cloudBuild = new CloudBuild(this, {
        buildCmd: this.buildCmd,
        type: this.gitPublish,
        prod: this.prod,
      })
      await cloudBuild.prepare()
      await cloudBuild.init()
      ret = await cloudBuild.build()
      if (ret)
        await this.uploadTemplate()
    }

    if (this.prod && ret) {
      await this.uploadComponentToNpm()
      this.runCreateTagTask()
    }
  }

  // 检查缓存主目录
  checkHomePath() {
    if (!this.homePath) {
      if (process.env.CLI_HOME)
        this.homePath = process.env.CLI_HOME_PATH
      else
        this.homePath = path.resolve(homedir(), DEFAULT_CLI_HOME)
    }

    log.verbose('Git checkHomePath homePath', this.homePath)

    fse.ensureDirSync(this.homePath)
    if (!fs.existsSync(this.homePath))
      throw new Error('Git checkHomePath 用户主目录获取失败！')
  }

  // 检查用户远程仓库类型
  async checkGitServer() {
    const gitServerPath = this.createPath(GIT_SERVER_FILE)
    let gitServer = readFile(gitServerPath)
    if (!gitServer || this.refreshServer) {
      gitServer = (await inquirer.prompt({
        type: 'list',
        name: 'gitServer',
        message: '请选择您想要托管的 Git 平台？',
        default: GITHUB,
        choices: GIT_SERVER_TYPE,
      })).gitServer
      writeFile(gitServerPath, gitServer)
      log.success('Git server 写入成功！', `${gitServer} -> ${gitServerPath}`)
    }
    else {
      log.success('Git server 读取成功！', gitServer)
    }

    this.gitServer = this.createGitServer(gitServer)
    if (!this.gitServer)
      throw new Error('Git server 初始化失败！')
  }

  // 检查远程仓库 Token
  async checkGitToken() {
    const tokenPath = this.createPath(GIT_TOKEN_FILE)
    let token = readFile(tokenPath)
    if (!token || this.refreshToken) {
      log.warn(`${this.gitServer.type} token 未生成！`, `请先生成 ${this.gitServer.type} token， ${terminalLink('链接', this.gitServer.getTokenUrl())}`)

      token = (await inquirer.prompt({
        type: 'password',
        name: 'token',
        message: `请输入 ${this.gitServer.type} token`,
        default: '',
      })).token
      writeFile(tokenPath, token)

      log.success(`${this.gitServer.type} token 写入成功！`, `${token} -> ${tokenPath}`)
    }
    else {
      log.success(`${this.gitServer.type} token 读取成功！`, tokenPath)
    }

    this.token = token
    this.gitServer.setToken(token)
  }

  // 获取远程仓库信息和组织信息
  async getUserAndOrgs() {
    this.user = await this.gitServer.getUser()
    if (!this.user)
      throw new Error(`${this.gitServer.type} 用户信息获取失败！`)
    log.verbose(`${this.gitServer.type} User`, this.user)

    this.orgs = await this.gitServer.getOrgs(this.user.login)
    if (!this.orgs)
      throw new Error(`${this.gitServer.type} 组织信息获取失败！`)
    log.verbose(`${this.gitServer.type} Orgs`, this.orgs)

    log.success(`${this.gitServer.type} 用户和组织信息获取成功！`)
  }

  // 检查远程仓库类型
  async checkGitOwner() {
    const ownerPath = this.createPath(GIT_OWN_FILE)
    const loginPath = this.createPath(GIT_LOGIN_FILE)

    let owner = readFile(ownerPath)
    let login = readFile(loginPath)

    if (!owner || !login || this.refreshOwner) {
      owner = (await inquirer.prompt({
        type: 'list',
        name: 'owner',
        message: '请选择远程仓库类型',
        default: REPO_OWNER_USER,
        choices: this.orgs.length > 0 ? GIT_OWNER_TYPE : GIT_OWNER_TYPE_ONLY,
      })).owner

      if (owner === REPO_OWNER_USER) {
        login = this.user.login
      }
      else {
        login = (await inquirer.prompt({
          type: 'list',
          name: 'login',
          message: '请选择',
          choices: this.orgs.map(org => ({ name: org.login, value: org.login })),
        })).login
      }

      writeFile(ownerPath, owner)
      writeFile(loginPath, login)

      log.success(`${this.gitServer.type} owner 写入成功！`, `${owner} -> ${ownerPath}`)
      log.success(`${this.gitServer.type} login 写入成功！`, `${login} -> ${loginPath}`)
    }
    else {
      log.success(`${this.gitServer.type} owner 读取成功！`, owner)
      log.success(`${this.gitServer.type} login 读取成功！`, login)
    }

    this.owner = owner
    this.login = login
  }

  // 检查并创建远程仓库
  async checkRepo() {
    let repo = await this.gitServer.getRepo(this.login, this.name)
    if (!repo) {
      const spinner = spinnerStart('正在创建远程仓库...')
      try {
        if (this.owner === REPO_OWNER_USER)
          repo = await this.gitServer.createRepo(this.name)
        else
          this.gitServer.createOrgRepo(this.name, this.login)
      }
      finally {
        spinner.stop(true)
      }

      if (repo)
        log.success(`${this.gitServer.type} 远程仓库创建成功！`)
      else
        throw new Error(`${this.gitServer.type} 远程仓库创建失败！`)
    }
    else {
      log.success(`${this.gitServer.type} 远程仓库信息获取成功！`)
    }

    log.verbose(`${this.gitServer.type} repo`, repo)
    this.repo = repo
  }

  // 检查并创建 .gitignore 文件
  checkGitIgnore() {
    const gitIgnore = path.resolve(this.dir, GIT_IGNORE_FILE)

    if (!fs.existsSync(gitIgnore)) {
      writeFile(gitIgnore, `.DS_Store
node_modules
/dist

# local env files
.env.local
.env.*.local

# Log files
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*

# Editor directories and files
.idea
.vscode
*.suo
*.ntvs*
*.njsproj
*.sln
*.sw?`)

      log.success(`自动写入 ${GIT_IGNORE_FILE}  文件成功！`)
    }
  }

  // 组件合法性检查
  checkComponent() {
    const componentFile = this.isComponent()
    if (componentFile) {
      log.info('开始检查 build 结果...')

      if (!this.buildCmd)
        this.buildCmd = 'npm run build'

      require('node:child_process').execSync(this.buildCmd, { cwd: this.dir })

      const buildPath = path.resolve(this.dir, componentFile.buildPath)
      if (!fs.existsSync(buildPath))
        throw new Error(`构建结果： ${buildPath} 不存在！`)

      const pkg = this.getPackageJson()
      if (!pkg.files || !pkg.files.includes(componentFile.buildPath))
        throw new Error(`package.json 中 files 属性未添加构建结果目录：[ ${componentFile.buildPath} ]，请在 package.json 中手动添加！`)

      log.success('build 结果检查通过！')
    }
  }

  isComponent() {
    const componentFilePath = path.resolve(this.dir, COMPONENT_FILE)
    return fs.existsSync(componentFilePath) && fse.readJsonSync(componentFilePath)
  }

  getPackageJson() {
    const pkgPath = path.resolve(this.dir, 'package.json')
    if (!fs.existsSync(pkgPath))
      throw new Error(`package.json 不存在！源码目录：${this.dir}`)

    return fse.readJsonSync(pkgPath)
  }

  createGitServer(gitServer = '') {
    if (gitServer === GITHUB)
      return new Github()
    else if (gitServer === GITEE)
      return new Gitee()

    return null
  }

  createPath(file) {
    const rootDir = path.resolve(this.homePath, GIT_ROOT_DIR)
    fse.ensureDirSync(rootDir)

    return path.resolve(rootDir, file)
  }

  getRemote() {
    const gitPath = path.resolve(this.dir, GIT_ROOT_DIR)
    this.remote = this.gitServer.getRemote(this.login, this.name)
    if (fs.existsSync(gitPath)) {
      log.success('Git 已完成初始化！')
      return true
    }
  }

  async initAndAddRemote() {
    log.info('执行 Git 初始化！')
    await this.git.init(this.dir)

    log.info('添加 Git remote')
    const remotes = await this.git.getRemotes()
    log.verbose('Git remotes', remotes)
    if (!remotes.find(item => item.name === 'origin'))
      await this.git.addRemote('origin', this.remote)
  }

  async initCommit() {
    await this.checkConflicted()
    await this.checkNotCommitted()

    if (await this.checkRemoteMaster())
      await this.pullRemoteRepo('master', { '--allow-unrelated-histories': null })
    else
      await this.pushRemoteRepo('master')
  }

  async checkConflicted() {
    log.info('代码冲突检查...')
    const status = await this.git.status()
    if (status.conflicted.length > 0)
      throw new Error('当前代码存在冲突，请手动处理合并后再次尝试！')

    log.success('代码冲突检查通过！')
  }

  async checkNotCommitted() {
    const status = await this.git.status()
    if (status.not_added.length > 0
      || status.created.length > 0
      || status.deleted.length > 0
      || status.modified.length > 0
      || status.renamed.length > 0) {
      log.verbose('Git checkNotCommitted status', status)

      await this.git.add(status.not_added)
      await this.git.add(status.created)
      await this.git.add(status.deleted)
      await this.git.add(status.modified)
      await this.git.add(status.renamed)

      let message
      while (!message) {
        message = (await inquirer.prompt({
          type: 'text',
          name: 'message',
          message: '请输入 commit 信息',
        })).message
      }
      await this.git.commit(message)

      log.success('本次 commit 提交成功！')
    }
  }

  async checkRemoteMaster() {
    return (await this.git.listRemote(['--refs'])).includes('refs/heads/master')
  }

  async pullRemoteRepo(branchName, options) {
    log.info(`同步远程 ${branchName} 分支代码...`)
    await this.git.pull('origin', branchName, options)
      .then(() => { log.success('推送代码成功！') })
      .catch((err) => { log.error('推送代码失败！', err.message) })
  }

  async pushRemoteRepo(branchName) {
    log.info(`推送代码至 ${branchName} 分支...`)
    await this.git.push('origin', branchName)
    log.success('推送代码成功！')
  }

  async getCorrectVersion() {
    // 1. 获取远程发布分支
    // > 版本号规范： release/x.y.z , dev/x.y.z
    // > 版本号递增规范： major / minor / patch
    log.info('获取远程分支...')
    const remoteBranchList = await this.getRemoteBranchList(VERSION_RELEASE)
    let releaseVersion = null
    if (remoteBranchList && remoteBranchList.length)
      releaseVersion = remoteBranchList[0]
    log.verbose('线上最新版本号', releaseVersion)

    // 2. 生成本地开发分支
    const devVersion = this.version
    if (!releaseVersion) {
      this.branch = `${VERSION_DEVELOP}/${devVersion}`
    }
    else if (semver.gt(this.version, releaseVersion)) {
      log.info('当前版本大于线上最新版本', `${devVersion} >= ${releaseVersion}`)
      this.branch = `${VERSION_DEVELOP}/${devVersion}`
    }
    else {
      log.info('当前线上版本大于本地版本', `${releaseVersion} > ${devVersion}`)

      const incType = (await inquirer.prompt({
        type: 'list',
        name: 'incType',
        message: '自动升级版本，请选择升级版本类型',
        default: 'patch',
        choices: [{
          name: `小版本（${releaseVersion} -> ${semver.inc(releaseVersion, 'patch')}）`,
          value: 'patch',
        }, {
          name: `中版本（${releaseVersion} -> ${semver.inc(releaseVersion, 'minor')}）`,
          value: 'minor',
        }, {
          name: `大版本（${releaseVersion} -> ${semver.inc(releaseVersion, 'major')}）`,
          value: 'major',
        }],
      })).incType
      const incVersion = semver.inc(releaseVersion, incType)

      this.branch = `${VERSION_DEVELOP}/${incVersion}`
      this.version = incVersion
    }
    log.verbose('本地开发分支', this.branch)

    // 3. 将 version 同步到 package.json
    this.syncVersionToPackageJson()
  }

  async getRemoteBranchList(type) {
    const remoteList = await this.git.listRemote(['--refs'])
    let reg

    if (type === VERSION_RELEASE)
      reg = /.+?refs\/tags\/release\/(\d+\.\d+\.\d+)/g
    else
      reg = /.+?refs\/heads\/dev\/(\d+\.\d+\.\d+)/g

    return remoteList
      .split('\n')
      // eslint-disable-next-line array-callback-return
      .map((remote) => {
        const match = reg.exec(remote)
        reg.lastIndex = 0
        if (match && semver.valid(match[1]))
          return match[1]
      })
      .filter(_ => _)
      .sort((a, b) => {
        if (semver.lte(b, a)) {
          if (a === b)
            return 0
          return -1
        }
        return 1
      })
  }

  syncVersionToPackageJson() {
    const pkg = fse.readJsonSync(`${this.dir}/package.json`)
    if (pkg && pkg.version !== this.version) {
      pkg.version = this.version
      fse.writeJsonSync(`${this.dir}/package.json`, pkg, { spaces: 2 })
    }
  }

  async checkStash() {
    log.info('Git 检查 stash 记录...')
    const stashList = await this.git.stashList()
    if (stashList.all.length > 0) {
      await this.git.stash(['pop'])
      log.success('Git stash pop 成功！')
    }
  }

  async checkoutBranch(branch) {
    const localBranchList = await this.git.branchLocal()
    if (localBranchList.all.includes(branch))
      await this.git.checkout(branch)
    else
      await this.git.checkoutLocalBranch(branch)

    log.success(`分支切换到 ${branch}`)
  }

  async pullRemoteMasterAndBranch() {
    log.info(`合并 [master] -> [${this.branch}]`)
    await this.pullRemoteRepo('master')
    log.success('合并远程 [master] 分支代码成功')

    log.info('检查远程开发分支')
    await this.checkConflicted()

    const remoteBranchList = await this.getRemoteBranchList()
    if (remoteBranchList.includes(this.version)) {
      log.info(`合并 [${this.branch}] -> [${this.branch}]`)
      await this.pullRemoteRepo(this.branch)
      log.success(`合并远程 [${this.branch}] 分支代码成功`)
      await this.checkConflicted()
    }
    else {
      log.success(`不存在远程分支 [${this.branch}]`)
    }
  }

  async saveComponentToDB() {
    log.info('上传组件信息至 OSS + 写入数据库')

    // 1. 将组件信息上传至数据库，RDS
    const componentFile = this.isComponent()
    let componentExamplePath = path.resolve(this.dir, componentFile.examplePath)
    let dirs = fs.readdirSync(componentExamplePath)

    if (dirs.includes('dist')) {
      componentExamplePath = path.resolve(componentExamplePath, 'dist')
      dirs = fs.readdirSync(componentExamplePath)
      componentFile.examplePath = `${componentFile.examplePath}/dist`
    }

    dirs = dirs.filter(dir => dir.match(/^index(\d)*.html$/))
    componentFile.exampleList = dirs
    componentFile.exampleRealPath = componentExamplePath

    // TODO : createComponent 请求地址
    const data = await request(
      {
        url: '/api/v1/components',
        method: 'POST',
        data: {
          component: componentFile,
          git: {
            type: this.gitServer.type,
            remote: this.remote,
            version: this.version,
            branch: this.branch,
            login: this.login,
            owner: this.owner,
          },
        },
      },
    )
    if (!data)
      throw new Error('上传组件失败')

    // 2. 将组件多预览页面上传至 OSS
    return true
  }

  async preparePublish() {
    log.info('云构建前，进行代码检查...')

    const pkg = this.getPackageJson()
    if (this.buildCmd) {
      const buildCmdArray = this.buildCmd.split(' ')
      if (buildCmdArray[0] !== 'npm' && buildCmdArray[0] !== 'cnpm')
        throw new Error('Build 命令非法，必须使用 npm 或 cnpm 命令！')
    }
    else {
      this.buildCmd = 'npm run build'
    }

    const buildCmdArray = this.buildCmd.split(' ')
    const lastCmd = buildCmdArray[buildCmdArray.length - 1]
    if (!pkg.scripts || !Object.keys(pkg.scripts).includes(lastCmd))
      throw new Error(`${this.buildCmd}命令不存在！`)

    log.success('代码预检查通过！')

    const gitPublishPath = this.createPath(GIT_PUBLISH_FILE)
    let gitPublish = readFile(gitPublishPath)
    if (!gitPublish) {
      gitPublish = (await inquirer.prompt({
        type: 'list',
        choices: GIT_PUBLISH_TYPE,
        message: '请选择您想要上传代码的平台',
        name: 'gitPublish',
      })).gitPublish

      writeFile(gitPublishPath, gitPublish)
      log.success('git publish 类型写入成功', `${gitPublish} -> ${gitPublishPath}`)
    }
    else {
      log.success('git publish 类型获取成功', gitPublish)
    }
    this.gitPublish = gitPublish
  }

  async uploadTemplate() {
    const TEMPLATE_FILE_NAME = 'index.html'
    if (this.sshUser && this.sshIp && this.sshPath) {
      log.info('开始下载模板文件...')
      // TODO : ossTemplateFile 请求地址
      let ossTemplateFile = await request({
        url: '/oss/get',
        params: {
          name: this.name,
          type: this.prod ? 'prod' : 'dev',
          file: TEMPLATE_FILE_NAME,
        },
      })
      if (ossTemplateFile.code === 0 && ossTemplateFile.data)
        ossTemplateFile = ossTemplateFile.data

      log.verbose('模板文件 url', ossTemplateFile.url)

      // TODO : ossTemplateFile.url 请求地址
      const response = await request({
        url: ossTemplateFile.url,
      })
      if (response) {
        const ossTempDir = path.resolve(this.homePath, TEMPLATE_TEMP_DIR, `${this.name}@${this.version}`)
        if (!fs.existsSync(ossTempDir))
          fse.mkdirpSync(ossTempDir)
        else
          fse.emptyDirSync(ossTempDir)

        const templateFilePath = path.resolve(ossTempDir, TEMPLATE_FILE_NAME)
        fse.createFileSync(templateFilePath)
        fs.writeFileSync(templateFilePath, response)
        log.success('模板文件下载成功', templateFilePath)

        log.info('开始上传模板文件至服务器')
        const uploadCmd = `scp -r ${templateFilePath} ${this.sshUser}@${this.sshIp}:${this.sshPath}`
        log.verbose('uploadCmd', uploadCmd)
        require('node:child_process').execSync(uploadCmd)
        log.success('模板文件上传成功')

        fse.emptyDirSync(ossTempDir)
      }
    }
  }

  async uploadComponentToNpm() {
    if (this.isComponent()) {
      log.info('开始发布至 npm ...')
      require('node:child_process').execSync('pnpm publish', { cwd: this.dir })
      log.success('发布至 npm 成功！')
    }
  }

  runCreateTagTask() {
    const delay = fn => setTimeout(fn, 1000)
    const tasks = new Listr([
      {
        title: '自动生成远程仓库 Tag',
        task: () => new Listr([
          {
            title: '创建Tag',
            task: () => {
              return new Observable((o) => {
                o.next('正在创建 Tag')
                delay(() => {
                  this.checkTag().then(() => {
                    o.complete()
                  })
                })
              })
            },
          },
          {
            title: '切换分支到 master',
            task: () => {
              return new Observable((o) => {
                o.next('正在切换 master 分支')
                delay(() => {
                  this.checkoutBranch('master').then(() => {
                    o.complete()
                  })
                })
              })
            },
          },
          {
            title: '将开发分支代码合并到 master',
            task: () => {
              return new Observable((o) => {
                o.next('正在合并到master分支')
                delay(() => {
                  this.mergeBranchToMaster('master').then(() => {
                    o.complete()
                  })
                })
              })
            },
          },
          {
            title: '将代码推送到远程 master',
            task: () => {
              return new Observable((o) => {
                o.next('正在推送master分支')
                delay(() => {
                  this.pushRemoteRepo('master').then(() => {
                    o.complete()
                  })
                })
              })
            },
          },
          {
            title: '删除本地开发分支',
            task: () => {
              return new Observable((o) => {
                o.next('正在删除本地开发分支')
                delay(() => {
                  this.deleteLocalBranch().then(() => {
                    o.complete()
                  })
                })
              })
            },
          },
          {
            title: '删除远程开发分支',
            task: () => {
              return new Observable((o) => {
                o.next('正在删除远程开发分支')
                delay(() => {
                  this.deleteRemoteBranch().then(() => {
                    o.complete()
                  })
                })
              })
            },
          },
        ]),
      },
    ])

    tasks.run()
  }

  async checkTag() {
    log.info('获取远程 tag 列表')
    const tag = `${VERSION_RELEASE}/${this.version}`
    const tagList = await this.getRemoteBranchList(VERSION_RELEASE)
    if (tagList.includes(this.version)) {
      log.success('远程 tag 已存在', tag)
      await this.git.push(['origin', `:refs/tags/${tag}`])
      log.success('远程 tag 已删除', tag)
    }
    const localTagList = await this.git.tags()
    if (localTagList.all.includes(tag)) {
      log.success('本地 tag 已存在', tag)
      await this.git.tag(['-d', tag])
      log.success('本地 tag 已删除', tag)
    }
    await this.git.addTag(tag)
    log.success('本地 tag 创建成功', tag)
    await this.git.pushTags('origin')
    log.success('远程 tag 推送成功', tag)
  }

  async deleteLocalBranch() {
    log.info('开始删除本地开发分支', this.branch)
    await this.git.deleteLocalBranch(this.branch)
    log.success('删除本地分支成功', this.branch)
  }

  async deleteRemoteBranch() {
    log.info('开始删除远程分支', this.branch)
    await this.git.push(['origin', '--delete', this.branch])
    log.success('删除远程分支成功', this.branch)
  }

  async mergeBranchToMaster() {
    log.info('开始合并代码', `[${this.branch}] -> [master]`)
    await this.git.mergeFromTo(this.branch, 'master')
    log.success('代码合并成功', `[${this.branch}] -> [master]`)
  }
}

Git.Gitee = Gitee
Git.Github = Github

module.exports = Git
