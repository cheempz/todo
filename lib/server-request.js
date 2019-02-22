'use strict'

//
// base class for requests
//
class ServerRequest {
  constructor (ao) {
    this.ao = ao
    this.pid = process.pid
  }

  // default is just the class name
  describe () {
    return this.constructor.name
  }

  // shorthand
  mstime () {
    return new Date().getTime()
  }

  // wait for promise instead of callback
  wait (ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms)
    })
  }
}

module.exports = ServerRequest
