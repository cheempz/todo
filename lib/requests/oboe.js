'use strict'

const ServerRequest = require('../server-request')

//
// the config manipulation class
//
class Oboe extends ServerRequest {
  constructor () {
    super()
  }

  describe () {
    return 'get oboe internal information'
  }

  get (what) {
    if (what === 'settings') {
      return this.getSettings()
    } else if (what === 'stats') {
      return this.getStats()
    } else {
      throw new Error(`invalid get value ${what}`)
    }
  }

  getSettings () {
    return this.ao.addon.Config.getSettings()
  }

  getStats () {
    return this.ao.addon.Config.getStats()

  }
}

module.exports = Oboe


