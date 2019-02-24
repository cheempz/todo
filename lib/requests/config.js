'use strict'

const ServerRequest = require('../server-request')

//
// the config manipulation class
//
class Config extends ServerRequest {
  constructor () {
    super()
    const osInfo = require('linux-os-info')
    this.osInfo = osInfo().then(r => {
      this.os = `${r.id} ${r.version || r.version_id}`
      this.osInfo = r
    })
  }

  describe () {
    return 'get configuration and set sample-rate and sample-mode'
  }

  get () {
    return {
      configuration: this.config,
      appopticsVersion: this.ao.version,
      bindingsVersion: this.ao.addon.version,
      oboeVersion: this.ao.addon.Config.getVersionString(),
      contextProvider: this.ao.contextProvider,
      serviceKey: this.ao.serviceKey,
      sampleRate: this.ao.sampleRate,
      sampleMode: this.ao.traceMode !== undefined ? this.ao.traceMode : 'unset',
      pid: this.pid,
      os: this.os
    }
  }

  set (setting, value) {
    value = +value
    if (setting === 'sample-rate') {
      this.ao.sampleRate = value
      if (this.ao.sampleRate === value) {
        return {sampleRate: this.ao.sampleRate}
      }
    } else if (setting === 'sample-mode') {
      this.ao.sampleMode = value
      if (this.ao.sampleMode === value) {
        return {sampleMode: this.ao.sampleMode}
      }
    } else {
      return {status: 404, message: `invalid setting: "${setting}"`}
    }

    // here for valid settings but bad values
    return {status: 422, message: `invalid value ${value} for ${setting}`}
  }

}

module.exports = Config


