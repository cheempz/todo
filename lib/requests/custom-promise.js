'use strict'

const ServerRequest = require('../server-request')

//
// the config manipulation class
//
class CustomPromise extends ServerRequest {
  constructor () {
    super()
  }

  describe () {
    return 'get memory data'
  }

  instrumentX (name, task, options = {}) {
    return task ()
  }

  instrument (name, task, options = {}) {
    const wrapped = cb => task().then(r => {
      cb()
      return r
    })

    return this.ao.instrument(name, wrapped, options)
  }


}

module.exports = CustomPromise
