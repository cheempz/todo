'use strict'

const ServerRequest = require('../server-request')

//
// the config manipulation class
//
class CustomAsync extends ServerRequest {
  constructor () {
    super()
  }

  describe () {
    return 'custom instrument an async function'
  }

  instrument (name, task, options = {}) {
    return new Promise((resolve, reject) => {
      const cb = (...args) => {
        if (args[0] instanceof Error) {
          reject(args[0])
        } else {
          resolve(args)
        }
      }

      this.ao.instrument(name, task, options, cb)
    })
  }
}

module.exports = CustomAsync
