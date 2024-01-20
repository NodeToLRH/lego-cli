const HtmlWebpackPlugin = require('html-webpack-plugin');

class ImoocCliSectionPlugin {
  constructor(options) {
  }

  apply(compiler) {
    // 1.修改模板文件的路径为壳应用下public/index.htm，使用html-webpack-plugin
    const config = {
      title: '代码片段应用',
      template: require.resolve('./public/index.html'),
    };
    compiler.options.plugins.push(new HtmlWebpackPlugin(config));
    // 2.修改entry文件路径（默认指向src/main.js，修改为壳应用src/index.js）
    compiler.options.entry.app[2] = require.resolve('./src/index.js');
    // 3.让壳应用中index.js能够找到代码片段中的源码文件
  compiler.options.resolve.alias['@section'] = `${process.cwd()}/src/index.vue`;
  }
}

module.exports = ImoocCliSectionPlugin;
