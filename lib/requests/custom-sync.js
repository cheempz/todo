'use strict'

const ServerRequest = require('../server-request')

//
// the config manipulation class
//
class CustomSync extends ServerRequest {
  constructor () {
    super()
  }

  describe () {
    return 'custom instrument a sync function'
  }

  instrument (name, task, options = {}) {
    const stl = Error.stackTraceLimit
    Error.stackTraceLimit = 25
    const ret = this.ao.instrument(name, task, options)
    Error.stackTraceLimit = stl
    return Promise.resolve(ret)
  }
}

module.exports = CustomSync

