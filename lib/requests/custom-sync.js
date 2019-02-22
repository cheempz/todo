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
    return 'custom instrument an async function'
  }

  instrument (name, task, options = {}) {
    const ret = this.ao.instrument(name, task, options)
    return Promise.resolve(ret)
  }
}

module.exports = CustomSync

