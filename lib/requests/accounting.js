'use strict'

const ServerRequest = require('../server-request')

const {ExponentialMovingAverage, EMA} = require('../ema')
const ExpMovAvg = ExponentialMovingAverage

const timeBased = false

// take minutes and return ms
const minutes = m => m * 60000

//
// the config manipulation class
//
class Accounting extends ServerRequest {
  constructor () {
    super()
    this.total = 0
    this.sampled = 0

    this.interval = 10000
    this.timerIds = []

    this.divisor = this.interval / 1000
    // timebases in seconds
    this.averageTimeBases = [minutes(1)]

    // the averages kept for each timebase
    this.totalAverages = {}
    this.cpuUserPerTx = {}
    this.cpuSystemPerTx = {}
    this.spansActive = {}

    this.averageTimeBases.forEach(t => {
      const make = () => timeBased ? new EMA(t) : new ExpMovAvg(0.1)

      this.totalAverages[t] = make()
      this.cpuUserPerTx[t] = make()
      this.cpuSystemPerTx[t] = make()
      this.spansActive[t] = make()
    })

    this.pCpuUsage = 0
    this.pTotal = 0

    // keep track of intervals
    this.intervals = 0
  }

  describe () {
    return 'get memory data'
  }

  get (what) {
    return {
      count: this.total,
      sampled: this.sampled,
      totalAverages: this.fixed(this.totalAverages),
      cpuUserPerTx: this.fixed(this.cpuUserPerTx, 0),
      cpuSystemPerTx: this.fixed(this.cpuSystemPerTx, 0),
      spansActive: this.fixed(this.spansActive, 0)
    }
  }

  fixed (averages, n = 2) {
    const o = {}
    if (this.intervals) {
      this.averageTimeBases.forEach(t => {
        o[t] = +averages[t].get().toFixed(n)
      })
    }
    return o
  }

  startIntervalAverages (opts = {}) {
    // this.interval._repeat is ms value for interval timer. can be
    // adjusted.

    let pTotal = this.total
    let pCpuUsage = process.cpuUsage()
    let pTime = Date.now()

    const context = {}
    const timerId = setInterval (() => {
      this.intervals += 1
      const cpuUsage = process.cpuUsage()

      const deltaU = cpuUsage.user - pCpuUsage.user
      const deltaS = cpuUsage.system - pCpuUsage.system
      const deltaTot = this.total - pTotal
      const now = Date.now()
      const deltaTime = now - pTime
      const spansActive = this.ao.Span.entrySpanEnters - this.ao.Span.entrySpanExits

      // reset the previous values
      pCpuUsage = cpuUsage
      pTotal = this.total
      pTime = now

      this.averageTimeBases.forEach(t => {
        // if any traces occurred
        if (deltaTot) {
          if (timeBased) {
            this.totalAverages[t].update(deltaTime, deltaTot / 1000)
            this.cpuUserPerTx[t].update(deltaTime, deltaU / deltaTot)
            this.cpuSystemPerTx[t].update(deltaTime, deltaS / deltaTot)
            this.spansActive[t].update(deltaTime, spansActive)
          } else {
            this.totalAverages[t].update(deltaTot / 1000)
            this.cpuUserPerTx[t].update(deltaU / deltaTot)
            this.cpuSystemPerTx[t].update(deltaS / deltaTot)
            this.spansActive[t].update(spansActive)
          }
        }
      })

      if (context.display) {
        context.display()
      }
    }, this.interval)

    // allow multiple of these to be going
    this.timerIds.push(timerId)
    context.timerId = timerId
    return context
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

if (!module.parent) {
  const ao = {requestStore: {get: function () {return undefined}}}
  const r = require('../requests')(ao)
  const a = new r.Accounting()

  // generate a constant load of 1/sec
  const id = setInterval(() => {
    a.count()
  }, 1000)
  id

  const ctx = a.startIntervalAverages()

  ctx.display = function () {
    const times = a.averageTimeBases
    const totalAverages = Object.assign({}, a.cpuUserPerTx)
    const formatted = {}
    times.forEach(t => {
      formatted[t] = +totalAverages[t].toFixed(0)
    })
    console.log(formatted)
  }

}
