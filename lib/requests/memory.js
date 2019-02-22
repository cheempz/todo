'use strict'

const ServerRequest = require('../server-request')

//
// the config manipulation class
//
class Memory extends ServerRequest {
  constructor () {
    super()
  }

  describe () {
    return 'get memory data'
  }

  get (what) {
    if (what in this) {
      return this[what]()
    }
    return {status: 404}
  }

  rss () {
    return {
      rss: process.memoryUsage().rss,
      ts: new Date().getTime()
    }
  }
}

module.exports = Memory
