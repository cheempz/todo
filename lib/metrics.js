'use strict'

const https = require('https')
const url = require('url')

// https://docs.appoptics.com/api/?shell#measurement-properties

class Metrics {
  constructor (key, host, tags, opts = {}) {
    this.key = key
    this.host = host
    this.tags = tags || {}

    const u = url.parse(this.host);
    const port = u.port || u.protocol === 'https:' ? 443 : 80;

    this.options = {
      hostname: u.hostname,
      port,
      path: u.path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Basic ' + new Buffer(key  + ':').toString('base64')
      }
    }
    this.sent = 0

    this.errorCount = 0
    this.lastErrorEvent = undefined

    this.non200Count = 0
    this.lastNon200 = undefined
    this.lastNon200Received = undefined

    this.agent = new https.Agent({
      keepAlive: true,
      keepAliveMsecs: 250,
      maxSockets: 10,
      maxFreeSockets: 1,
    })

    this.options.agent = this.agent
  }

  send (metrics, tags = {}) {
    let pres
    let prej
    const p = new Promise((resolve, reject) => {
      pres = resolve
      prej = reject
    })

    tags = Object.assign({}, this.tags, tags)

    if (Object.keys(tags).length === 0) {
      prej(new Error('there are no metrics tags to send'))
      return
    }

    metrics = Object.keys(metrics).map(m => {
      return {name: m, value: metrics[m]}
    })

    const payload = JSON.stringify({tags, measurements: metrics})

    this.options.headers['Content-Length'] = payload.length

    let not200 = false
    const req = https.request(this.options, res => {
      this.sent += 1

      if (res.statusCode !== 200) {
        not200 = true
        this.non200Count += 1
        this.lastNon200 = res.statusCode
      }

      let received = []
      res.on('data', d => {
        received.push(d.toString('utf8'))
      })

      res.on('end', () => {
        received = received.join('')
        this.lastReceived = received
        if (not200) {
          this.lastNon200Received = received
        }
        pres({headers: res.headers, statusCode: res.statusCode, body: received})
      })
    })

    req.on('error', e => {
      this.errorCount += 1
      this.lastErrorEvent = e
      prej(e)
    })

    req.write(payload)
    req.end()

    return p
  }

  sendOnInterval (interval, metricsFunction, sentFunction) {
    let id

    // this promise never resolves, it only rejects.
    const p = new Promise((resolve, reject) => {
      const send = () => {
        const {metrics, tags} = metricsFunction()

        this.send(metrics, tags)
          .then(r => {
            if (sentFunction) {
              sentFunction(r)
            }
            return r
          })
          .then(r => {
            if (r.statusCode >= 300) {
              clearInterval(id)
              reject(r)
            }
          }).catch(e => {
            clearInterval(id)
            reject(e)
          })
      }
      id = setInterval(send, interval)
    })

    return {promise: p, id}
  }

  getStats () {
    return {
      sent: this.sent,
      errorCount: this.errorCount,
      lastErrorEvent: this.lastErrorEvent,
      non200Count: this.non200Count,
      lastNon200: this.lastNon200,
      lastNon200Received: this.lastNon200Received,
    }
  }
}

module.exports = Metrics

//
// simple test
//
if (!module.parent || module.parent.id === '<repl>') {

  const m = new Metrics(
    process.env.AO_TOKEN_BENCH,
    'https://api.appoptics.com/v1/measurements',
    {image_name: 'todo-mvc-metrics-test'}
  )


  const ident = m.sendOnInterval(
    5000,
    () => {return {metrics: {'todo-memory-rss': process.memoryUsage().rss}}},
    logger
  )

  // handle errors - ident contains a promise that never resolves and the
  // interval id to cancel the interval if desired.
  ident.promise.catch(e => console.log(e))

  let lastWasGood = true
  function logger (r) {
    if (r.statusCode !== 200 && r.statusCode !== 202) {
      lastWasGood = false
      process.stdout.write(`${lastWasGood ? '\n' : ''}${r.statusCode} ${r.body}\n`)
    } else {
      lastWasGood = true
      process.stdout.write('.')
    }
  }

}
