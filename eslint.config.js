const antfu = require('@antfu/eslint-config').default

module.exports = antfu(
  {
    ignores: [
      'packages/commands/init/template/**/**',
    ],
  },
  {
    rules: {
      'no-console': 'off',
    },
  },
)
