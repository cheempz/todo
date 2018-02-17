const http = require('http')
const fs = require('fs')
const argv = require('minimist')(process.argv)

const ao = require('appoptics')

const port = argv.p || argv.port || 8881
const host = argv.host || 'localhost'
const show = argv.s || argv.show

var counters = {}

var log = function (string, cb) {cb(null, string.length)}

fs.open('./tiny-server-log', 'a+', function (err, fd) {
  if (!err) {
    log = function (string, cb) {fs.write(fd, string, cb)}
  } else {
    console.log ('error:', err)
  }
})

var wip

var server = http.createServer(function (req, res) {
  const {headers, method, url} = req

  console.log(method, 'to', url)
  show && console.log(headers)
  if (method === 'POST') {
    let body = []
    // get the body so we can reply
    req.on('data', d => {
      body.push(d)
    }).on('end', () => {
      body = Buffer.concat(body).toString()
      body = JSON.parse(body)
      var entry = [new Date(), JSON.stringify(body), '\n'].join(' ')

      if (!wip) {
        wip = true
        log(entry, function (err, written) {
          wip = false
        })
      }

      let reqURL = body.url
      if (!(reqURL in counters)) {
        counters[reqURL] = 0
      }
      counters[reqURL] += 1
      res.write('Times "' + reqURL + '" has been requested: ' + counters[reqURL])
      res.end()
      body = []
    })
    req.on('error', function (err) {
      console.log('ERROR', err)
    })
  } else {
    res.end('What\'s up?')
  }
  //server.close()
})

server.listen(port, host, function () {
  console.log('listening on ' + host + ':' + port + ' now, talk to me')
})
