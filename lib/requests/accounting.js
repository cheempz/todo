'use strict'

const ServerRequest = require('../server-request')

//
// the config manipulation class
//
class Accounting extends ServerRequest {
  constructor () {
    super()
    this.total = 0
    this.sampled = 0
  }

  describe () {
    return 'get memory data'
  }

  get (what) {
    return {
      count: this.total,
      sampled: this.sampled
    }
  }

  count () {
    this.total += 1

    const last = this.ao.requestStore.get('lastEvent')
    if (last && last.event.getSampleFlag()) {
      this.sampled += 1
    }
  }
}

module.exports = Accounting
