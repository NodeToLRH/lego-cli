const path = require('node:path')
const process = require('node:process')

const fse = require('fs-extra')
const { glob } = require('glob')
const ejs = require('ejs')
const pkgUp = require('pkg-up')
const semver = require('semver')

async function ejsRender(options) {
  const { targetPath, pageTemplate } = options
  const { ignore } = pageTemplate

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
        // 获取文件的真实路径
        const filePath = path.resolve(targetPath, file)
        return new Promise((resolve1, reject1) => {
          // ejs文件渲染，重新拼接 render 的参数
          ejs.renderFile(filePath, {
            name: pageTemplate.pageName.toLocaleLowerCase(),
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
      .then(resolve)
      .catch(e => reject(e))
  })
}

async function dependenciesMerge(options) {
  function exec(command, args, options) {
    const win32 = process.platform === 'win32'

    const cmd = win32 ? 'cmd' : command
    const cmdArgs = win32 ? ['/c'].concat(command, args) : args

    return require('node:child_process').spawn(cmd, cmdArgs, options || {})
  }

  async function execAsync(command, args, options) {
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

  async function execCommand(command, cwd) {
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
      throw new Error(`${command} 命令执行失败`)

    return ret
  }

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
      const duplicatedDep = targetDepArr.find(targetDep => templateDep.key === targetDep.key)
      if (duplicatedDep) {
        console.log('查询到重复依赖 : ', duplicatedDep)

        const templateRange = semver.validRange(templateDep.value).split('<')[1]
        const targetRange = semver.validRange(duplicatedDep.value).split('<')[1]

        if (templateRange !== targetRange)
          console.log(`${templateDep.key}冲突，${templateDep.value} => ${duplicatedDep.value}`)
      }
      else {
        console.log('查询到新依赖 : ', templateDep)
        finalDep.push(templateDep)
      }
    })

    return finalDep
  }

  // 处理依赖合并问题
  // 1. 获取package.json
  const { templatePath, targetPath } = options
  const templatePkgPath = pkgUp.sync({ cwd: templatePath })
  const targetPkgPath = pkgUp.sync({ cwd: targetPath })
  const templatePkg = fse.readJsonSync(templatePkgPath)
  const targetPkg = fse.readJsonSync(targetPkgPath)

  // 2. 获取dependencies
  const templateDep = templatePkg.dependencies || {}
  const targetDep = targetPkg.dependencies || {}

  // 3. 将对象转化为数组
  const templateDepArr = objToArray(templateDep)
  const targetDepArr = objToArray(targetDep)

  // 4. 实现dep之间的diff
  const newDep = depDiff(templateDepArr, targetDepArr)
  targetPkg.dependencies = arrayToObj(newDep)
  fse.writeJsonSync(targetPkgPath, targetPkg, { spaces: 2 })

  // 5. 自动安装依赖
  await execCommand('npm install', path.dirname(targetPkgPath))
}

async function install(options) {
  console.log('custom install : ', options)

  const { templatePath, targetPath, pageTemplate } = options
  fse.copySync(templatePath, targetPath)

  await ejsRender({ targetPath, pageTemplate })
  await dependenciesMerge({ templatePath, targetPath })
}

module.exports = install
