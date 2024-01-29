const SECTION_TEMPLATE_LIST = [
  {
    name: 'vue2 代码片段',
    npmName: 'section-vue',
    version: '1.0.0',
  },
]

const PAGE_TEMPLATE_LIST = [
  {
    type: 'normal',
    name: 'vue2 首页模版',
    npmName: 'page-vue2',
    version: '1.0.0',
    targetPath: 'src/views/Home',
  },
  {
    type: 'custom',
    name: '自定义页面模版',
    npmName: 'page-custom',
    version: '1.0.0',
    targetPath: 'template/src/views/Home',
  },
]

module.exports = {
  SECTION_TEMPLATE_LIST,
  PAGE_TEMPLATE_LIST,
}
