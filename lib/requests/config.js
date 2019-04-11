'use strict'

const ServerRequest = require('../server-request')

const insertionSettings = {
  insertTraceIdsIntoLogs: [false, true, 'traced', 'sampledOnly', 'always'],
  insertTraceIdsIntoMorgan: [false, true],
  createTraceIdsToken: [false, true],
}

const trueOrFalse = {
  'true': true,
  'false': false,
}

//
// the config manipulation class
//
class Config extends ServerRequest {
  constructor () {
    super()
    const osInfo = require('linux-os-info');
    this.osInfo = osInfo().then(r => {
      this.os = `${r.id} ${r.version || r.version_id}`;
      this.osInfo = r;
    });
  }

  describe () {
    return 'get configuration and set sample-rate and sample-mode'
  }

  //
  // before changing the format of what is returned consider multiload - it depends
  // on some elements of the returned data.
  //
  get (what) {
    const config = {
      appopticsVersion: this.ao.version,
      bindingsVersion: this.ao.addon.version,
      oboeVersion: this.ao.addon.Config.getVersionString(),
      contextProvider: this.ao.contextProvider,
      config: this.ao.cfg,
      sampleRate: this.ao.sampleRate,
      sampleMode: this.ao.traceMode !== undefined ? this.ao.traceMode : 'unset',
      lastSettings: this.ao.lastSettings,
      logging: this.ao.control.logging,
      pid: this.pid,
      os: this.os,
    }

    if (what in config) {
      return {[what]: config[what]};
    }
    if (what) {
      return {status: 404, message: `unknown config ${what}`};
    }
    return config;
  }

  set (setting, value) {
    if (setting === 'sample-rate') {
      this.ao.sampleRate = +value
      if (this.ao.sampleRate === value) {
        return {sampleRate: this.ao.sampleRate}
      }
    } else if (setting === 'trace-mode') {
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
    } else if (setting === 'insert') {
      let [which, choice] = value.split(':');   // eslint-disable-line
      // convert 'true' or 'false' to true or false.
      if (choice in trueOrFalse) {
        choice = trueOrFalse[choice];
      }
      if (which in insertionSettings && insertionSettings[which].indexOf(choice) >= 0) {
        this.ao.cfg[which] = choice;
        // handle this until cfg has a setter.
        if (which === 'insertTraceIdsIntoMorgan') {
          this.ao.cfg.createTraceIdsToken = !!choice;
        }
        return {[which]: choice};
      } else {
        return {
          status: 422,
          message: `insert is not a valid setting or one of ${Object.keys(insertionSettings)}`
        };
      }
    } else {
      return {status: 404, message: `invalid setting: "${setting}"`}
    }

    // here for valid settings but bad values
    return {status: 422, message: `invalid value ${value} for ${setting}`}
  }

}

module.exports = Config


