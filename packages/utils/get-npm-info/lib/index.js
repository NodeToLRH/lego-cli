const path = require('node:path/posix')
const axios = require('axios')
const semver = require('semver')

// 获取 registry URL
function getDefaultRegistry(isOriginal = false) {
  return isOriginal ? 'https://registry.npmjs.org' : 'https://registry.npmmirror.com'
}

// 从 registry 获取 npm 包相关信息
function getNpmInfo(npmName, registry) {
  if (!npmName)
    return null

  const registryUrl = registry || getDefaultRegistry()
  const npmInfoUrl = path.join(registryUrl, npmName)

  return axios.get(npmInfoUrl).then((response) => {
    if (response.status === 200)
      return response.data

    return null
  }).catch((err) => {
    return Promise.reject(err)
  })
}

// 获取 npm 包名版本信息
async function getNpmVersions(npmName, registry) {
  const data = await getNpmInfo(npmName, registry)
  if (data)
    return Object.keys(data.versions)
  else
    return []
}

// 获取大于 baseVersion 版本的 npm 包版本
function getSemverVersions(baseVersion, versions) {
  // semver.satisfies(version, range): 如果版本满足范围要求，则返回 true。
  // > eg: semver.satisfies('1.2.3', '1.x || >=2.5.0 || 5.0.0 - 7.2.3') // true
  // semver.gt(v1, v2): v1 > v2

  return versions
    .filter(version => semver.satisfies(version, `>${baseVersion}`))
    .sort((a, b) => semver.gt(b, a) ? 1 : -1)
}

// 获取大于 baseVersion 的最新版本
async function getNpmSemverVersion(baseVersion, npmName, registry) {
  const versions = await getNpmVersions(npmName, registry)
  const newVersions = getSemverVersions(baseVersion, versions)

  if (newVersions && newVersions.length > 0)
    return newVersions[0]

  return null
}

// 根据 npm 包名，获取最新版本
async function getNpmLatestVersion(npmName, registry) {
  const versions = await getNpmVersions(npmName, registry)
  if (versions)
    return versions.sort((a, b) => semver.gt(b, a))[versions.length - 1]

  return null
}

module.exports = {
  getNpmInfo,
  getNpmVersions,
  getNpmSemverVersion,
  getDefaultRegistry,
  getNpmLatestVersion,
}
