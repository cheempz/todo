'use strict'

const ServerRequest = require('../server-request')

//
// the config manipulation class
//
class Delay extends ServerRequest {
  constructor () {
    super()
  }

  describe () {
    return 'delay a specified number of milliseconds'
  }

  milliseconds (ms) {
    const start = this.mstime()
    const delay = ms || 0

    return this.wait(ms).then(() => {
      return {
        requestedDelay: delay,
        actualDelay: this.mstime() - start
      }
    })
  }

  cbMilliseconds (ms, cb) {
    this.milliseconds(ms).then(r => cb(r))
  }
}

module.exports = Delay
