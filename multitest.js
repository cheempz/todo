'use strict'

const axios = require('axios')
const randomstring = require('randomstring')
const argv = require('minimist')(process.argv)

if (argv.h || argv.help) {
  console.log('usage: node multitest.js')
  console.log('    options:')
  console.log('        -i <interval in seconds>')
  console.log('        -n <add/delete pairs per interval')
  console.log('        --ws_ip=host[:port] todo server to connect to')
  console.log('        --delete delete existing todos before starting')
  console.log('        --delay=<ms> perform delayed url fetches, not add/deletes')
  console.log()
  process.exit(0)
}

// params
let int = argv.i || 5         // interval in seconds
let nPerInt = argv.n || 5     // number of adds/delete pairs per interval

//
// new timer-based distribution of transactions
//
let interval = (argv.i || 10) * 1000
let transactionsPerInterval = argv.n || 1
let timerInterval =  interval / transactionsPerInterval * 1000

let url = 'http://localhost:8088/api/todos'
let delayUrl = 'http://localhost:8088/delay/'
if (argv.ws_ip) {
  url = 'http://' + argv.ws_ip + '/api/todos'
  delayUrl = 'http://' + argv.ws_ip + '/delay/'
}
let transaction = 'delay' in argv ? 'delay' : 'addDelete'


let inFlight = 0    // number of transactions in progress

let startTime
let addCount = 0    // number of transactions executed
let delCount = 0
let addsSampled = 0 // number of transactions sampled
let delsSampled = 0
let addTime = 0     // ms to complete the transactions
let delTime = 0

const rd = n => n.toFixed(2)
let makeAddDeleteStatsLine = function () {
  let et = (mstime() - startTime) / 1000
  let prefix = 'et: ' + et.toFixed(0)
  let addText = 'added:' + addCount + '(' + rd(addCount/et) + '/sec)'
  let delText = 'deleted:' + delCount + '(' + rd(delCount/et) + '/sec)'
  let sampledText = 'sampled a:' + addsSampled + ', d:' + delsSampled
  return prefix + ' ' + addText + ', ' + delText + ', ' + sampledText
}
let outputStats
if (process.stdout.isTTY) {
  outputStats = function (getLine) {
    process.stdout.clearLine()
    process.stdout.cursorTo(0)
    process.stdout.write(getLine())
  }
} else {
  outputStats = function (getLine) {
    process.stdout.write(getLine() + '\n')
  }
}

let options = {
  headers: {
    'X-Requested-With': 'XMLHttpRequest',
    'Content-Type': 'application/json'
  }
}

function makePlainText(min = 10, max = 30) {
  let length = min + Math.random() * (max - min)
  return randomstring.generate(length)
}

const mstime = () => new Date().getTime()
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))

//
// get a time in the interval
//
function getDelay (interval) {
  return Math.round(Math.random() * interval, 0)
}

function executeGet (interval) {
  return wait(interval).then(() => {
    return axios.get(url, options).then(r => r)
  })
}

//
// add a random todo after interval ms
//
function executeAdd (interval) {
  return wait(interval).then(() => {
    let start = mstime()
    let s = makePlainText()
    let req = { title: s, completed: false }
    inFlight += 1
    return axios.post(url, req, options).then(r => {
      inFlight -= 1
      // accumulate time
      addTime += mstime() - start
      return r
    }).catch(e => {
      console.log(e)
      inFlight -= 1
      return {}
    })
  })
}

//
// delete a specific todo after interval ms
//
function executeDelete (interval, todo) {
  return wait(interval).then(() => {
    let start = mstime()
    inFlight += 1
    return axios.delete(url + '/' + todo._id, options).then(r => {
      inFlight -= 1
      delTime += mstime() - start
      return r
    }).catch(e => {
      console.log(e)
      inFlight -= 1
      return {}
    })
  })
}

//
// make a function to add a todo (after addInterval) then delete
// it (after delInterval)
//
function makeAddDeletePair (addInterval, delInterval) {
  return function () {
    return executeAdd(addInterval).then(r => {
      addCount += 1
      if (r.headers['x-trace'] && r.headers['x-trace'].substr(-2) === '01') {
        addsSampled += 1
      }
      outputStats(writeAddDeleteStatsLine)

      return executeDelete(delInterval, r.data.todo).then(r => {
        delCount += 1
        if (r.headers['x-trace'] && r.headers['x-trace'].substr(-2) === '01') {
          delsSampled += 1
        }
        outputStats(writeAddDeleteStatsLine)
        return r
      })
    }).catch(e => {
      console.log(e)
    })
  }
}

function executeDelay (interval, msDelay) {
  return wait(interval).then(() => {
    var start = mstime()
    return axios.get(delayUrl + msDelay, options).then(r => {
      return {serverDelay: r.data.actualDelay, totalDelay: mstime() - start}
    })
  })
}

if (argv.delete) {
  let outstanding = []
  executeGet(0).then(r => {
    let todosToDelete = r.data
    while(todosToDelete.length) {
      console.log('todos to delete: ', todosToDelete.length)
      let todo = todosToDelete.shift()
      let p = executeDelete(100, todo).then(() => {
        return 1
      }).catch(e => {
        console.log(e)
      })
      outstanding.push(p)
    }
    return 'queued'
  }).then(() => {
    Promise.all(outstanding).then(values => {
      if (values.length) {
        console.log('deleted todos:', values.reduce((acc, val) => acc + val))
      }
    })
  })
}

startTime = mstime()

if (transaction === 'delay') {
  // just make the delayed calls.
  // TODO BAM consider adjusting interval for delay in transaction?
  var delayCalls = 0
  var totalServerDelay = 0
  var totalDelay = 0
  let iid = setInterval(function () {
    executeDelay(0, +argv.delay).then(r => {
      delayCalls += 1
      totalServerDelay += r.serverDelay
      totalDelay += r.totalDelay
      var makeLine = () => [
        'n: ', delayCalls,
        ', delay (tot, server) avg (',
        rd(totalDelay/delayCalls), ', ', rd(totalServerDelay/delayCalls),
        ') last (', r.totalDelay, ', ', r.serverDelay, ')'
      ].join('')
      outputStats(makeLine)
    })
  }, interval / transactionsPerInterval)
} else {
  // start an add/delete pair immediately then let the delays kick in.
  var pair = makeAddDeletePair(0, getDelay())
  pair();

  // start additional add/delete pairs on interval
  let iid = setInterval(function () {
    makeAddDeletePair(getDelay(interval), getDelay(interval))()
  }, interval / transactionsPerInterval)
}
// */

