'use strict'

const axios = require('axios')
const randomstring = require('randomstring')
const argv = require('minimist')(process.argv)

const validActions = {
  'add-delete': actionAddDelete,
  'ad': actionAddDelete,
  delay: actionDelay
}

// params
let int = argv.i || 5         // interval in seconds
let nPerInt = argv.n || 5     // number of adds/delete pairs per interval
let delay = 'delay' in argv ? +argv.delay : 1500

// get action to perform n times per i
let action = argv.action || 'add-delete'
if (argv.a) action = argv.a

if (!(action in validActions)) {
  console.warn('invalid action: "%s"', action)
}

// if not good this will cause help to be displayed then process exit.
action = validActions[action]

if (!action || argv.h || argv.help) {
  console.log('usage: node multitest.js')
  console.log('    options:')
  console.log('        --action={add-delete|ad|delay}')
  console.log('        -a synonym for --action')
  console.log('        -i <interval in seconds>')
  console.log('        -n <add/delete pairs per interval')
  console.log('        --ws_ip=host[:port] todo server to connect to')
  console.log('        --delete delete existing todos before starting')
  console.log('        --delay=<ms> delay time for action=delay (default 1500)')
  console.log()
  process.exit(0)
}




//
// new timer-based distribution of transactions
//
let interval = (argv.i || 10) * 1000
let transactionsPerInterval = argv.n || 1
let timerInterval =  interval / transactionsPerInterval * 1000

let url = 'http://localhost:8088'
if (argv.ws_ip) {
  url = 'http://' + argv.ws_ip
}

let outputStats
if (process.stdout.isTTY) {
  outputStats = function (getLine) {
    let et = (mstime() - startTime) / 1000
    let prefix = 'et: ' + et.toFixed(0) + ' '
    process.stdout.clearLine()
    process.stdout.cursorTo(0)
    process.stdout.write(prefix + getLine(et))
  }
} else {
  outputStats = function (getLine) {
    process.stdout.write(prefix + getLine(et) + '\n')
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

//
// mstime, wait, getDelay need to become base class of
// action classes
//
const mstime = () => new Date().getTime()
//
// promisify setTimeout
// if the time is zero don't get rescheduled in the event loop
//
const wait = ms => ms === 0 ?
  Promise.resolve() :
  new Promise(resolve => setTimeout(resolve, ms))

//
// get a time in the interval. it will average 1/2 of the interval time.
//
function getDelay (interval) {
  return Math.round(Math.random() * interval, 0)
}

const rd = n => n.toFixed(2)


//
// Special code to delete existing todos as an option
// TODO BAM needs to be reworked - depended on url, executeDelete, etc.
//
if (argv.delete) {
  let executeGet = function (interval) {
    return wait(interval).then(() => {
      return axios.get(url, options).then(r => r)
    })
  }

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

//
// class-based add-delete implementation
//
function actionAddDelete (host, output) {
  this.host = host
  this.output = output
  this.interval = interval
  this.url = host + '/api/todos'

  this.start = mstime()
  this.addCount = 0
  this.addsSampled = 0
  this.delCount = 0
  this.delsSampled = 0
}

actionAddDelete.prototype.execute = function () {
  var f = (et) => this.makeStatsLine(et)

  return this.addTodo(0).then(r => {
    this.addCount += 1
    if (r.headers['x-trace'] && r.headers['x-trace'].substr(-2) === '01') {
      this.addsSampled += 1
    }
    this.output(f)

    // if there isn't a todo returned there isn't anything to delete
    if (!(r.data && r.data.todo)) {
      return Promise.reject('transaction failed')
    }

    return wait(getDelay(this.interval)).then(() => {
      this.deleteTodo(r.data.todo).then(r => {
        this.delCount += 1
        if (r.headers['x-trace'] && r.headers['x-trace'].substr(-2) === '01') {
          this.delsSampled += 1
        }
        this.output(f)
        return r
      })
    })
  })
}

actionAddDelete.prototype.executeAfter = function (interval) {
  if (arguments.length === 0) {
    interval = getDelay(this.interval)
  }
  return wait(interval).then(() => {
    return this.execute().then(r => r)
  }).catch (e => {
    console.log('error executing add-delete', e)
  })
}

//
// add a random todo
//
actionAddDelete.prototype.addTodo = function () {
  let start = mstime()
  let ipso = makePlainText()
  let req = { title: ipso, completed: false }
  this.inFlight += 1
  return axios.post(this.url, req, options).then(r => {
    this.inFlight -= 1
    // accumulate time
    this.addTime += mstime() - start
    return r
  }).catch(e => {
    console.log(e)
    inFlight -= 1
    return {}
  })
}

actionAddDelete.prototype.deleteTodo = function (todo) {
  let start = mstime()
  this.inFlight += 1
  return axios.delete(this.url + '/' + todo._id, options).then(r => {
    this.inFlight -= 1
    this.delTime += mstime() - start
    return r
  }).catch(e => {
    console.log(e)
    this.inFlight -= 1
    return {}
  })
}

actionAddDelete.prototype.makeStatsLine = function (et) {
  return [
    'added:', this.addCount, '(', rd(this.addCount / et), '/sec), ',
    'deleted:', this.delCount, '(', rd(this.delCount / et), '/sec), ',
    'sampled a:', this.addsSampled, ', d:', this.delsSampled
  ].join('')
}


//
// class-based delay implementation
//
function actionDelay (host, output) {
  this.host = host
  this.output = output
  this.interval = interval
  this.delay = delay
  this.url = host + '/delay/' + delay

  this.start = mstime()
  this.delayCalls = 0
  this.totalServerDelay = 0
  this.totalDelay = 0
}

actionDelay.prototype.execute = function () {
  var start = mstime()
  return axios.get(this.url, options).then(r => {
    return {serverDelay: r.data.actualDelay, totalDelay: mstime() - start}
  })
}

actionDelay.prototype.executeAfter = function (interval) {
  if (arguments.length === 0) {
    interval = this.interval
  }
  return wait(getDelay(interval)).then(() => {
    return this.execute().then(r => {
      this.delayCalls += 1
      this.totalServerDelay += r.serverDelay
      this.totalDelay += r.totalDelay
      var f = (et) => this.makeStatsLine(r)
      this.output(f)
    })
  })
}

actionDelay.prototype.makeStatsLine = function (r) {
  return [
    'n: ', this.delayCalls,
    ', delay (tot, server) avg (',
    rd(this.totalDelay / this.delayCalls), ', ',
    rd(this.totalServerDelay / this.delayCalls),
    ') last (', r.totalDelay, ', ', r.serverDelay, ')'
  ].join('')
}


// execute the action. always execute the first time with no delay

var a = new action(url, outputStats)
var startTime = mstime()

a.executeAfter(0)
let iid = setInterval(() => a.executeAfter(), interval/transactionsPerInterval)
