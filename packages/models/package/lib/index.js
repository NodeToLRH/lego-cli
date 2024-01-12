'use strict'

const fs = require('node:fs')
const path = require('node:path')
const fse = require('fs-extra')
const npminstall = require('npminstall')
const pkgDir = require('pkg-dir').sync

const { getDefaultRegistry, getNpmLatestVersion } = require('@lego-cli/utils-get-npm-info')
const { isObject, formatPath } = require('@lego-cli/utils-tools')

class Package {
  constructor(options) {
    if (!options)
      throw new Error('Package 类的 options 参数不能为空！')

    if (!isObject(options))
      throw new Error('Package 类的 options 参数必须为对象！')

    // package 的目标路径
    this.targetPath = options.targetPath
    // 缓存 package 的路径
    this.storeDir = options.storeDir
    // package 的包名 name
    this.packageName = options.packageName
    // package 的版本 version
    this.packageVersion = options.packageVersion
    // package 缓存目录的前缀
    this.cacheFilePathPrefix = this.packageName.replace('/', '_')
  }

  get cacheFilePath() {
    return path.resolve(this.storeDir, `_${this.cacheFilePathPrefix}@${this.packageVersion}@${this.packageName}`)
  }

  async prepare() {
    if (this.storeDir && !fs.existsSync(this.storeDir)) {
      // fse.mkdirpSync : 确保目录存在。如果目录结构不存在，则会创建。
      fse.mkdirpSync(this.storeDir)
    }

    if (this.packageVersion === 'latest')
      this.packageVersion = await getNpmLatestVersion(this.packageName)
  }

  // 判断当前 Package 是否存在
  async exists() {
    if (this.storeDir) {
      await this.prepare()
      return fs.existsSync(this.cacheFilePath)
    }
    else {
      return fs.existsSync(this.targetPath)
    }
  }

  // 安装 Package
  async install() {
    await this.prepare()
    return npminstall({
      // 安装根目录
      root: this.targetPath,
      // storeDir : root + 'node_modules'
      storeDir: this.storeDir,
      // registry, 默认为 https://registry.npmjs.org
      registry: getDefaultRegistry(),
      // 需要安装的可选软件包，默认为 package.json 的 dependencies 和 devDependencies
      pkgs: [{
        name: this.packageName,
        version: this.packageVersion,
      }],
    })
  }

  getSpecificCacheFilePath(packageVersion) {
    return path.resolve(this.storeDir, `_${this.cacheFilePathPrefix}@${packageVersion}@${this.packageName}`)
  }

  // 更新 Package
  async update() {
    await this.prepare()

    // 1. 获取最新的 npm 模块版本号
    const latestPackageVersion = await getNpmLatestVersion(this.packageName)
    // 2. 查询最新版本号对应的路径是否存在
    const latestFilePath = this.getSpecificCacheFilePath(latestPackageVersion)
    // 3. 如果不存咋，则安装最新版本
    if (!fs.existsSync(latestFilePath)) {
      await npminstall({
        root: this.targetPath,
        storeDir: this.storeDir,
        registry: getDefaultRegistry(),
        pkgs: [{
          name: this.packageName,
          version: latestPackageVersion,
        }],
      })
      this.packageVersion = latestPackageVersion
    }
    else {
      this.packageVersion = latestPackageVersion
    }
  }

  // 获取入口文件路径
  getRootFilePath() {
    function _getRootFile(targetPath) {
      // 1. 获取 package.json 所在的目录
      const dir = pkgDir(targetPath)
      if (dir) {
        // 2. 读取 package.json
        const pkgFile = require(path.resolve(dir, 'package.json'))
        // 3. 通过 package.json 的 main 属性，查找 npm 模块的入口文件
        if (pkgFile && pkgFile.main)
          // 4. 路径兼容 （Windows / macOS）
          return formatPath(path.resolve(dir, pkgFile.main))
      }
      return null
    }

    if (this.storeDir)
      return _getRootFile(this.cacheFilePath)
    else
      return _getRootFile(this.targetPath)
  }
}

module.exports = Package
