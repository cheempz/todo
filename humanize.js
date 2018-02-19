#!/usr/bin/env node
'use strict'

//
// Tools to filter events from java-collector logs and make
// them more human readable.
//

const argv = require('minimist')(process.argv.slice(2))
const fs = require('fs')

// adding timestamps to docker log, so
// 2018-02-18T21:29:54.397055000Z
// is the format at the beginning of a line. (could tighten up but...)
var logLineRegex = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{9}Z\s+(.+)$/gm

var important = [
  'Layer',
  'ProfileName',
  'Label',
  'QueryOp',
  'X-Trace',
  'Edge'
]

// if there is a file try to open it
let file = argv._[0]

if (!file) {
  console.warn('usage: humanize [options] file')
  process.exit(1)
}

function taskID(text) {return text.substr(2, 40)}
function opID(text) {return text.substr(42, 16)}

let text = fs.readFileSync(file, {encoding: 'utf8'})

let eventMap = {}

let lineCount = 0
let objCount = 0
let metricsCount = 0
let skips = []
let results
while ((results = logLineRegex.exec(text)) !== null) {
  let line = results[1]
  lineCount += 1
  if (line[0] !== '{') {
    skips.push(line)
    continue
  }
  let logObject = JSON.parse(line)
  if ('MetricsFlushInterval' in logObject) {
    metricsCount += 1
    continue
  }
  objCount += 1
  // make an abbreviated object (skip noise like backtrace)
  let o = {}
  for (let k of important) {
    if (k in logObject) {
      o[k] = logObject[k]
    }
  }
  if ('X-Trace' in o) {
    let task = taskID(o['X-Trace'])
    let op = opID(o['X-Trace'])
    if (!(task in eventMap)) {
      eventMap[task] = {}
    }
    if (op in eventMap[task]) {
      console.warn('unexpected duplicate opID', op)
    } else {
      let tag = (o.Layer || o.ProfileName) + ':' + o.Label
      eventMap[task][op] = tag
    }
    if ('Edge' in o) {
      let found = []
      let edges = Array.isArray(o.Edge) ? o.Edge.slice() : [o.Edge]
      for (let e of edges) {
        if (e in eventMap[task]) {
          found.push(e + '=' + eventMap[task][e])
        }
      }
      o.edges = found
    }
  }
  console.log(JSON.stringify(o, null, 2))
}

console.log('found: lines', lineCount, 'objects:', objCount, 'metrics:', metricsCount)
//console.log(skips) so far INFO [ThriftServerUtils]
