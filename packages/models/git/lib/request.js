const process = require('node:process')

const axios = require('axios')
// const log = require('@lego-cli/utils-log')

const BASE_URL = process.env.LEGO_CLI_BASE_URL
  ? process.env.LEGO_CLI_BASE_URL
  : 'http://xxx.xxx.xxx'

const request = axios.create({
  baseURL: BASE_URL,
  timeout: 5000,
})

request.interceptors.response.use(
  (response) => {
    return response.data
  },
  (error) => {
    return Promise.reject(error)
  },
)

// async function createComponent(component) {
//   // TODO : createComponent 请求地址
//   const response = await axios.post('http://xxx.xxx.xyz/api/v1/components', component)
//   log.verbose('createComponent response', response)
//   const { data } = response

//   if (data.code === 0)
//     return data.data

//   return null
// }

module.exports = request
