const fse = require('fs-extra')
const inquirer = require('inquirer')
const {glob} = require('glob')
const ejs = require('ejs')

async function ejsRender(options) {
  const dir = options.targetPath
  const projectInfo = options.data

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
    Promise.all(files.map((file) => {
      const filePath = path.join(dir, file)
      return new Promise((resolve1, reject1) => {
        ejs.renderFile(filePath, projectInfo, {}, (err, result) => {
          if (err) {
            reject1(err)
          }
          else {
            fse.writeFileSync(filePath, result)
            resolve1(result)
          }
        })
      })
    })).then(() => {
      resolve()
    }).catch((err) => {
      reject(err)
    })
  })
}

async function install(options) {
  const projectPrompt = []
  const descriptionPrompt = {
    type: 'input',
    name: 'description',
    message: '请输入项目描述信息',
    default: '',
    validate(v) {
      const done = this.async()
      setTimeout(() => {
        if (!v) {
          done('请输入项目描述信息')
          return
        }
        done(null, true)
      }, 0)
    },
  }

  projectPrompt.push(descriptionPrompt)

  const projectInfo = await inquirer.prompt(projectPrompt)
  options.projectInfo.description = projectInfo.description
  const { sourcePath, targetPath } = options

  try {
    fse.ensureDirSync(sourcePath)
    fse.ensureDirSync(targetPath)
    fse.copySync(sourcePath, targetPath)

    const templateIgnore = options.templateInfo.ignore || []
    const ignore = ['**/node_modules/**', ...templateIgnore]
    await ejsRender({ ignore, targetPath, data: options.projectInfo })
  }
  catch (e) {
    throw e
  }
}

module.exports = install
