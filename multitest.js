'use strict'

const axios = require('axios')
const randomstring = require('randomstring')
const argv = require('minimist')(process.argv)


let url = 'http://localhost:8088/api/todos'
let options = {
    headers: {
        'X-Requested-With': 'XMLHttpRequest',
        'Content-Type': 'application/json'
    }
}

function makePlainText (min=10, max=30) {
    let length = min + Math.random() * (max - min)
    return randomstring.generate(length)
}

if (argv.h || argv.help) {
  console.log('usage: node multitest.js')
  console.log('    options:')
  console.log('        -i <interval in seconds>')
  console.log('        -n <add/delete pairs per interval')
  console.log()
  process.exit(0)
}

// params
let int = argv.i || 5         // interval in seconds
let nPerInt = argv.n || 5     // number of adds per interval

if (argv.ws_ip) {
  url = 'http://' + argv.ws_ip + '/api/todos'
}


let inFlight = 0
let fn = 'add'      // add or delete
let ids = []
let addCount = 0
let delCount = 0
let addsSampled = 0
let delsSampled = 0

function submitAdds () {
    if (inFlight > 0) return

    let ts = process.hrtime()
    for (let i = 0; i < nPerInt; i++) {
        let req
        let reqURL
        let afn
        let args
        if (fn === 'add') {
            afn = 'post'
            let s = makePlainText()
            req = {title: s, completed: false}
            reqURL = url
            args = [reqURL, req, options]
        } else {
            afn = 'delete'
            reqURL = url + '/' + ids.pop()._id;
            args = [reqURL, options]
        }
        inFlight += 1
        axios[afn](...args).then(r => {
            inFlight -= 1
            if (afn === 'post') {
              addCount += 1
            } else if (afn === 'delete') {
              delCount += 1
            }
            console.log('total adds', addCount, 'total dels', delCount)
            //console.log(inFlight)
            if (r.headers['x-trace'] && r.headers['x-trace'].substr(-2) === '01') {
              if (afn === 'post') {
                addsSampled += 1
              } else if (afn === 'delete') {
                delsSampled += 1
              }
            }
            if (inFlight <= 0) {
                if (fn === 'add') {
                    // get the IDs to delete and change the function
                    debugger
                    ids = r.data
                    fn = 'delete'
                } else {
                    fn = 'add'
                }
                let hrdelta = process.hrtime(ts)
                let etString = hrdelta[0] + 's ' + hrdelta[1]/1000 + 'us'
                let msg = fn === 'add' ? 'deleted' : 'added'
                console.log(`${msg} ${nPerInt} in ${etString}`)
                console.log('total adds sampled', addsSampled, 'deletes sampled', delsSampled)
            }
        }).catch(r => {
            console.error('ERROR:', r.httpStatus)
        })
    }
}


setInterval(submitAdds, int * 1000)

