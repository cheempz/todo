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
      return {settings: this.getSettings()}
    } else if (what === 'stats') {
      return {stats: this.getStats()}
    } else {
      return {status: 404, message: 'not found'}
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


