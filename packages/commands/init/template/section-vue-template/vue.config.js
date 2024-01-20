const ImoocCliSectionPlugin = require('imooc-cli-dev-section-plugin');

module.exports = {
  configureWebpack: {
    plugins: [
      new ImoocCliSectionPlugin(),
    ],
  },
};
