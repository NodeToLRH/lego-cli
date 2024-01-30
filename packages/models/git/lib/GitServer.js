function error(methodName) {
  throw new Error(`${methodName} must be implemented!`)
}

class GitServer {
  constructor(type, token) {
    this.type = type
    this.token = token
  }

  setToken(token) {
    this.token = token
  }

  // eslint-disable-next-line unused-imports/no-unused-vars
  createRepo(name) {
    error('createRepo')
  }

  // eslint-disable-next-line unused-imports/no-unused-vars
  createOrgRepo(name, login) {
    error('createOrgRepo')
  }

  getRemote() {
    error('getRemote')
  }

  getUser() {
    error('getUser')
  }

  getOrg() {
    error('getOrg')
  }

  // eslint-disable-next-line unused-imports/no-unused-vars
  getRepo(login, name) {
    error('getRepo')
  }

  getTokenUrl() {
    error('getTokenUrl')
  }

  getTokenHelpUrl() {
    error('getTokenHelpUrl')
  }

  isHttpResponse = (response) => {
    return response && response.status
  }

  handleResponse = (response) => {
    if (this.isHttpResponse(response) && response !== 200)
      return null
    else
      return response
  }
}

module.exports = GitServer
