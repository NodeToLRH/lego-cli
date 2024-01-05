const process = require('node:process')
const log = require('npmlog')

log.level = process.env?.LOG_LEVEL ?? 'info'

log.heading = 'lego-cli'
log.addLevel('success', 2000, { fg: 'green', bold: true })
log.addLevel('notice', 2000, { fg: 'blue', bg: 'black' })

module.exports = log
