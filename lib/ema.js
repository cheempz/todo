'use strict'

//
// works very well for average based on number of events
// for the sampling time period
//
class ExponentialMovingAverage {
  constructor (alpha, mean) {
    this.alpha = alpha
    this.mean = !mean ? 0 : mean
  }

  get beta () {
    return 1 - this.alpha
  }

  update (newValue) {
    const redistributedMean = this.beta * this.mean

    const meanIncrement = this.alpha * newValue

    const newMean = redistributedMean + meanIncrement

    this.mean = newMean
  }

  get () {
    return this.mean
  }
}

//
// in theory works better when the sampling time period differs
// from the desired moving average period. e.g., i sample every 10
// seconds but want a 60 second moving average.
//
class EMA {
  constructor (timespan) {
    this.timespan = timespan
    this.ma = 0
    this.init = false
  }

  update (deltaT, value) {
    if (!this.init) {
      this.init = true
      this.ma = value
      return this.ma
    }

    const alpha = 1 - Math.exp(-deltaT / this.timespan)

    this.ma = alpha * value + (1 - alpha) * this.ma

    return this.ma
  }

  get () {
    return this.ma
  }

}

module.exports = {
  ExponentialMovingAverage,
  EMA
}

