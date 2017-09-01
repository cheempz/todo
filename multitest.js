'use strict'

const axios = require('axios')
const randomstring = require('randomstring')


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

let inFlight = 0
let int = 1         // interval in seconds
let nPerInt = 5     // number of adds per interval
let fn = 'add'      // add or delete
let ids = []

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
            console.log(inFlight)

            if (inFlight <= 0) {
                if (fn === 'add') {
                    // get the IDs to delete and change the function
                    debugger
                    ids = r.data
                    fn = 'delete'
                    //console.log('added', ids)
                } else {
                    fn = 'add'
                }
                let hrdelta = process.hrtime(ts)
                let etString = hrdelta[0] + 's ' + hrdelta[1]/1000 + 'us'
                let msg = fn === 'add' ? 'deleted' : 'added'
                console.log(`${msg} ${nPerInt} in ${etString}`)

            }
        }).catch(r => {
            console.error(r.httpStatus)
        })
    }
}


setInterval(submitAdds, int * 1000)

