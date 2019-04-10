'use strict'

const optimist = require('optimist')

const argv = optimist
  .usage('node server')
  .options({
    'f': {
      alias: 'framework',
      describe: 'framework to use',
      default: 'express',
    },
    'w': {
      alias: 'ws-ip',
      describe: 'host:port to serve pages from',
      default: 'localhost:8088',
    },
    'd': {
      alias: 'db-ip',
      describe: 'host:port to use for mongodb',
      default: 'localhost:27017',
    },
    't': {
      alias: 'trace-mode',
      describe: 'trace-mode value 0 or 1',
      default: 'undefined'
    },
    'c': {
      alias: 'custom',
      describe: 'use a custom name function',
      default: false,
      boolean: true,
    },
    'l': {
      alias: 'logger',
      describe: 'which logger to use (morgan, pino, winston, bunyan) - not all supported for all frameworks',
      default: 'morgan',
    },
    'L': {
      alias: 'log-level',
      describe: 'what to log (all, errors)',
      default: 'errors',
    },
    'i': {
      alias: 'insert',
      describe: 'auto-insert trace ids in logs',
      default: true,
    },
    'r': {
      describe: 'percent of traces to be sampled',
    },
    'rate': {
      describe: 'rate as numerator over 1000000',
    },
    'm': {
      alias: 'metrics',
      describe: 'appoptics token (not service key)',
      default: undefined,
    },
    'h': {
      alias: 'help',
      showHelp: undefined,
    }
  })
  .argv

module.exports = {argv, showHelp: optimist.showHelp}

//
// simple tester
//
if (!module.parent) {
  if (argv.help) {
    optimist.showHelp()
  } else {
    console.log(argv)
  }
}
