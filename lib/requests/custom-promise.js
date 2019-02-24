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

  instrument (name, task, options = {}) {
    const wrapped = cb => task().then(r => {
      cb()
      return r
    }).catch(e => {
      cb(e)
      throw e
    })

    // this needs to appear async to ao.instrument, so wrapped
    // has a callback. but our code doesn't care about getting
    // our own callback, so no 4th argument.
    //
    // ao.instrument returns the promise that 'wrapped' returns
    // so this looks like a promise to the caller.
    return this.ao.instrument(name, wrapped, options)
  }
}

//
// wrap an async function so that it returns a promise.
//
// wrap(cb => childProcess.exec('ls -lR ./node_modules/appoptics-apm', cb))
//
// TODO BAM - pass array back in reject() call?
//
CustomPromise.wrapAsync = function (async) {
  return function () {
    return new Promise((resolve, reject) => {
      const cb = (...args) => {
        if (args[0] instanceof Error) {
          reject(args[0])
        } else {
          resolve(args)
        }
      }
      async(cb)
    })
  }
}

module.exports = CustomPromise
