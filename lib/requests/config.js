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
      configuration: this.ao.addon.Config.getSettings(),
      stats: this.ao.addon.Config.getStats(),
      appopticsVersion: this.ao.version,
      bindingsVersion: this.ao.addon.version,
      oboeVersion: this.ao.addon.Config.getVersionString(),
      contextProvider: this.ao.contextProvider,
      serviceKey: this.ao.serviceKey,
      sampleRate: this.ao.sampleRate,
      sampleMode: this.ao.traceMode !== undefined ? this.ao.traceMode : 'unset',
      lastSettings: this.ao.lastSettings,
      logging: this.ao.control.logging,
      pid: this.pid,
      os: this.os,
    }
  }

  set (setting, value) {
    if (setting === 'sample-rate') {
      this.ao.sampleRate = +value
      if (this.ao.sampleRate === value) {
        return {sampleRate: this.ao.sampleRate}
      }
    } else if (setting === 'sample-mode') {
      this.ao.traceMode = +value
      if (this.ao.traceMode === value) {
        return {sampleMode: this.ao.traceMode}
      }
    } else if (setting === 'logging') {
      const [what, torf] = value.split(':')
      if (what && !Number.isNaN(+torf)) {
        this.ao.control.logging[what] = +torf
        return {'control.logging': this.ao.control.logging}
      }
    } else {
      return {status: 404, message: `invalid setting: "${setting}"`}
    }

    // here for valid settings but bad values
    return {status: 422, message: `invalid value ${value} for ${setting}`}
  }

}

module.exports = Config


