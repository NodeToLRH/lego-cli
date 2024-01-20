const TEMPLATE_LIST = [
  {
    name: 'vue2 标准模版',
    npmName: 'vue2',
    version: '1.0.0',
    type: 'normal',
    tag: ['project'],
    installCommand: 'cnpm install',
    startCommand: 'npm run serve',
    ignore: ['**/public/**'],
  },
  {
    name: '乐高组件模版',
    npmName: 'lego-components',
    version: '1.0.0',
    type: 'normal',
    tag: ['component'],
    installCommand: 'npm install',
    startCommand: 'npm run serve',
    ignore: [],
  },
  // {
  //   name: '乐高标准项目模版',
  //   npmName: '',
  //   version: '1.0.0',
  //   type: 'normal',
  //   tag: ['project'],
  //   installCommand: 'npm install',
  //   startCommand: 'npm run serve',
  //   buildPath: 'dist',
  //   ignore: ['**/public/**'],
  // },
]

module.exports = {
  TEMPLATE_LIST,
}
