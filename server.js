'use strict'
/**
 * @license
 * Everything in this repo is MIT License unless otherwise specified.
 *
 * Copyright (c) Addy Osmani, Sindre Sorhus, Pascal Hartig, Stephen  Sawchuk, Google, Inc.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of
 * this software and associated documentation files (the "Software"), to deal in
 * the Software without restriction, including without limitation the rights to
 * use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
 * the Software, and to permit persons to whom the Software is furnished to do so,
 * subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
 * FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
 * COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
 * IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
 * CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

//==============================================================================
// set up ======================================================================
//==============================================================================

// this sets up with either a real appoptics-apm or a dummy appoptics-apm
const serverConfig = require('./lib/get-server-config')
const ao = serverConfig.ao

// request wraps the individual request constructors and fills in ao for them
// there's certainly a better way to do this but i haven't figured it out yet.
const requests = require('./lib/requests')(ao)
const accounting = new requests.Accounting()

// standard require files that should be instrumented
const express  = require('express');
const app      = express(); 								// create our app w/ express

const morgan = require('morgan'); 			// log requests to the console (express4)
const bodyParser = require('body-parser'); 	// pull information from HTML POST (express4)
const methodOverride = require('method-override'); // simulate DELETE and PUT (express4)
const argv = require('optimist').argv;
const http = require('http')
const url = require('url')
const path = require('path')

const modeMap = {
  0: 0,
  1: 1,
  never: 0,
  always: 1
}
if ('sampleMode' in argv) {
  ao.sampleMode = modeMap[argv.sampleMode]
}

if (ao.setCustomTxNameFunction && (argv.c || argv.custom)) {
  ao.setCustomTxNameFunction('express', customExpressTxName)
}

function customExpressTxName (req, res) {
  // ignore global routes
  if (req.route.path === '*') {
    console.log('called for * route')
    return ''
  }
  console.log('req.method', req.method, 'r.r.p', req.route.path, 'url', req.url, 'r.r.m', req.route.methods, 'ourl', req.originalUrl)
  const customTxname = 'TODO-' + req.method + req.route.path
  console.log('custom name: ', customTxname)
  return customTxname
}

//=========================================================
// configuration and command line options =================
//=========================================================

//
// mongo DB
//
let mongoHost = typeof argv.be_ip === 'string' ? argv.be_ip : '127.0.0.1:27017'
if (!~mongoHost.indexOf(':')) mongoHost += ':27017'

//
// web server
//
let webServerHost
if (typeof argv.fe_ip === 'number') {
  webServerHost = 'localhost:' + argv.fe_ip
} else {
  webServerHost = argv.fe_ip || '0.0.0.0:8088'
}
if (!~webServerHost.indexOf(':')) webServerHost += ':8088'

// log headers to console
// TODO BAM use morgan.
const show = argv.s || argv['show-headers'] || argv.h

//
// appoptics settings
//
let rate = ('rate' in argv) ? +argv.rate : 1000000

// also allow shorthand -r which does 0-100 (interpreted as percent)
// this overrides a --rate setting.
if ('r' in argv) rate = +argv.r * 10000
ao.sampleRate = rate


//==================================
//==================================
// app configuration ===============
//==================================
//==================================

// taken from appoptics test suite. these are not valid for any real
// servers - only used for local testing.
const options = {
  key: "-----BEGIN RSA PRIVATE KEY-----\nMIICXQIBAAKBgQCsJU2dO/K3oQEh9wo60VC2ajCZjIudc8cqHl9kKNKwc9lP4Rw9\nKWso/+vHhkp6Cmx6Cshm6Hs00rPgZo9HmY//gcj0zHmNbagpmdvAmOudK8l5Npzd\nQwNROKN8EPoKjlFEBMnZj136gF5YAgEN9ydcLtS2TeLmUG1Y3RR6ADjgaQIDAQAB\nAoGBAJTD9/r1n5/JZ+0uTIzf7tx1kGJh7xW2xFtFvDIWhV0wAJDjfT/t10mrQNtA\n1oP5Fh2xy9YC+tZ/cCtw9kluD93Xhzg1Mz6n3h+ZnvnlMb9E0JCgyCznKSS6fCmb\naBz99pPJoR2JThUmcuVtbIYdasqxcHStYEXJH89Ehr85uqrBAkEA31JgRxeuR/OF\n96NJFeD95RYTDeN6JpxJv10k81TvRCxoOA28Bcv5PwDALFfi/LDya9AfZpeK3Nt3\nAW3+fqkYdQJBAMVV37vFQpfl0fmOIkMcZKFEIDx23KHTjE/ZPi9Wfcg4aeR4Y9vt\nm2f8LTaUs/buyrCLK5HzYcX0dGXdnFHgCaUCQDSc47HcEmNBLD67aWyOJULjgHm1\nLgIKsBU1jI8HY5dcHvGVysZS19XQB3Zq/j8qMPLVhZBWA5Ek41Si5WJR1EECQBru\nTUpi8WOpia51J1fhWBpqIbwevJ2ZMVz0WPg85Y2dpVX42Cf7lWnrkIASaz0X+bF+\nTMPuYzmQ0xHT3LGP0cECQQCqt4PLmzx5KtsooiXI5NVACW12GWP78/6uhY6FHUAF\nnJl51PB0Lz8F4HTuHhr+zUr+P7my7X3b00LPog2ixKiO\n-----END RSA PRIVATE KEY-----",
  cert: "-----BEGIN CERTIFICATE-----\nMIICWDCCAcGgAwIBAgIJAPIHj8StWrbJMA0GCSqGSIb3DQEBCwUAMEUxCzAJBgNV\nBAYTAkFVMRMwEQYDVQQIDApTb21lLVN0YXRlMSEwHwYDVQQKDBhJbnRlcm5ldCBX\naWRnaXRzIFB0eSBMdGQwHhcNMTQwODI3MjM1MzUwWhcNMTQwOTI2MjM1MzUwWjBF\nMQswCQYDVQQGEwJBVTETMBEGA1UECAwKU29tZS1TdGF0ZTEhMB8GA1UECgwYSW50\nZXJuZXQgV2lkZ2l0cyBQdHkgTHRkMIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKB\ngQCsJU2dO/K3oQEh9wo60VC2ajCZjIudc8cqHl9kKNKwc9lP4Rw9KWso/+vHhkp6\nCmx6Cshm6Hs00rPgZo9HmY//gcj0zHmNbagpmdvAmOudK8l5NpzdQwNROKN8EPoK\njlFEBMnZj136gF5YAgEN9ydcLtS2TeLmUG1Y3RR6ADjgaQIDAQABo1AwTjAdBgNV\nHQ4EFgQUTqL/t/yOtpAxKuC9zVm3PnFdRqAwHwYDVR0jBBgwFoAUTqL/t/yOtpAx\nKuC9zVm3PnFdRqAwDAYDVR0TBAUwAwEB/zANBgkqhkiG9w0BAQsFAAOBgQBn1XAm\nAsVdXKr3aiZIgOmw5q+F1lKNl/CHtAPCqwjgntPGhW08WG1ojhCQcNaCp1yfPzpm\niaUwFrgiz+JD+KvxvaBn4pb95A6A3yObADAaAE/ZfbEA397z0RxwTSVU+RFKxzvW\nyICDpugdtxRjkb7I715EjO9R7LkSe5WGzYDp/g==\n-----END CERTIFICATE-----"
}

app.use('/js', express.static(path.join(__dirname, '/js')))
app.use('/bower_components', express.static(path.join(__dirname, '/bower_components')))
// log every request to the console
app.use(morgan('dev', {
  skip: function (req, res) {return false}
}));
// parse application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({'extended':'true'}));
// parse application/json
app.use(bodyParser.json());
// parse application/vnd.api+json as json
app.use(bodyParser.json({type: 'application/vnd.api+json' }));
app.use(methodOverride());

//==============================================================================
// routes ======================================================================
//==============================================================================

// api ---------------------------------------------------------------------
app.all('*', function allRoutes (req, res, next) {
  accounting.count()
  next()
})

app.get('/accounting', function (req, res) {
  res.json(accounting.get())
})

//==============================================================================
// the todo api ================================================================
//==============================================================================

// get the lower level api that knows nothing of web server frameworks
const todoapi = new requests.TodoApi(mongoHost)

// get all todos
app.get('/api/todos', getAllTodos)

function getAllTodos (req, res) {
  todoapi.getAll().then(todos => {
    res.json(todos)
  }).catch(err => {
    res.send(err)
  })
}

// create a todo and send it back with all todos after creation
app.post('/api/todos', createTodo)

function createTodo (req, res) {
  let todo
  todoapi.create(req.body.title, false).then(r => {
    todo = r
    return todoapi.getAll()
  }).then(todos => {
    res.json({todo, todos})
  }).catch(e => {
    res.send(e)
  })
}

// update a todo and return it
app.put('/api/todos/:todo_id', updateTodo)

function updateTodo (req, res) {
  const p = req.params
  todoapi.update(p.todo_id, p.title, p.completed).then(todo => {
    res.json(todo)
  }).catch(e => {
    res.send(e)
  })
}

// delete a todo and return all todos after deletion
app.delete('/api/todos/:todo_id', deleteTodo)

function deleteTodo (req, res) {
  todoapi.delete(req.params.todo_id).then(r => {
    return todoapi.getAll()
  }).then(todos => {
    res.json(todos)
  }).catch(e => {
    res.send(e)
  })
}

//==============================================================================
// Config information and settings =============================================
//==============================================================================
const config = new requests.Config()

app.get('/config', function getCfg (req, res) {
  const r = config.get()
  if (r.status && r.status !== 200) {
    res.statusCode = r.status
  }
  res.json(r)
})

app.put('/config/:setting/:value', function putCfg (req, res) {
  const r = config.set(req.params.setting, req.params.value)
  if (r.status && r.status !== 200) {
    res.statusCode = r.status
  }
  res.json(r)
})

//==============================================================================
// Simple little snippets ======================================================
//==============================================================================

//
// get memory data
//
const memory = new requests.Memory()

app.get('/memory/:what?', function rss (req, res) {
  const r = memory.get(req.params.what || 'rss')
  if (r.status && r.status !== 200) {
    res.statusCode = r.status
  }
  res.json(r)
})

//
// delay for a fixed period of time
//
const delay = new requests.Delay()
app.get('/delay/:ms', function delayRequest (req, res) {
  delay.milliseconds(req.params.ms).then(r => {
    res.json(r)
  })
})

// generate an error response code

app.get('/error/:code', function error (req, res) {
  const code = +req.params.code || 422
  res.statusCode = code
  res.send(`received "${req.params.code}" set status ${code}\n`)
})

//=====================================================================================
// custom instrumentation for sync, async, and promises ===============================
//=====================================================================================

const customPromise = new requests.CustomPromise()
const customAsync = new requests.CustomAsync()
const customSync = new requests.CustomSync()

const wrap = requests.CustomPromise.wrapAsync

const cp = require('child_process')

// how: sync, async, promise
// what: ls, delay
// x: execute, [r: result | j: json]
const hows = {
  sync: {
    ls: {x: () => cp.spawnSync('ls', ['-lR']), r: r => r.stdout},
  },
  async: {
    ls: {x: cb => cp.exec('ls -lR ./node_modules/appoptics-apm', cb), r: r => r[1]},
    delay: {x: cb => delay.cbMilliseconds(250, cb), j: r => r[0]},
  },
  promise: {
    ls: {x: wrap(cb => cp.exec('ls -lR ./node_modules/appoptics-apm', cb)), r: r => r[1]},
    delay: {x: () => delay.milliseconds(275), j: r => r},
  }
}

app.get('/custom/:how?/:what?', function custom (req, res) {
  const how = req.params.how
  const what = req.params.what
  if (!hows[how] || !hows[how][what]) {
    res.statusCode = 404
    res.json(hows)
    res.end()
    return
  }

  const executor = {
    sync: customSync,
    async: customAsync,
    promise: customPromise,
  }[how]
  const name = `custom-${how}-${what}`

  const cfg = hows[how][what]

  executor['instrument'](name, cfg.x).then(r => {
    res[cfg.r ? 'send' : 'json']((cfg.r || cfg.j)(r))
  }).catch(e => {
    console.log(e)
    res.statusCode = 418
    res.end()
  })

})

//=====================================================================================
// random more complicated stuff for now.
//=====================================================================================

/*
const soap = require('soap')
const wsdlURL = 'http://localhost:3000/wsdl?wsdl'
app.get('/soap/:string', function makeSoapCall (req, res) {
  soap.createClientAsync(wsdlURL).then(client => {
    console.log('got soap async client')
    const args = {
      message: req.params.string,
      splitter: ':'
    }
    return client.MessageSplitterAsync(args)
  }).then(result => {
    console.log('got MessageSplitter result', result)
    res.send(result)
  }).catch(err => {
    console.log('soap - got error', err)
    res.statusCode = 418
    res.send('')
  })

})

// */

// do a transaction to another server
app.get('/downstream/:url', function downstream (req, res) {

  const options = {
    protocol: 'http:',
    port: 8881,
    hostname: 'localhost',
    method: 'post',
    path: (req.params.url ? '/' + req.params.url : '/'),
    headers: {
      'Content-Type': 'application/json'
    }
  }

  const oreq = http.request(options, function (ires) {
    let body = ''
    ires.on('data', function (d) {
      body += d
    })
    // and on end log it
    ires.on('end', function () {
      res.send(body)
    })
    ires.on('error', function (e) {
      console.log('GOT ERROR', e)
    })
  })

  oreq.on('error', function (err) {
    console.log('got error', err)
  })
  oreq.write(JSON.stringify({url: options.path}))
  oreq.end()

})


function makePrefix (URL) {
  return '--- response from ' + URL + ' ---\nheaders: '
}
//
// now make a chained URL
//
app.get('/chain', function chain (req, res) {
  show && console.log('chain req headers', req.headers)

  const q = req.query.target

  if (!q) {
    res.send('this is the end!\n')
    return
  }

  const options = url.parse(q)
  if (req.headers['X-Trace']) {
    options.headers = {'X-Trace': req.headers['X-Trace']}
  }

  // now do the outbound request and get the inbound response
  const oreq = http.request(options, function (ires) {
    let body = ''
    ires.on('data', function (d) {
      body += d
    })
    // on end return it along with the headers
    ires.on('end', function () {
      show && console.log(ires.headers)
      const p = makePrefix(q)
      const h = JSON.stringify(ires.headers)
      res.send(p + h + '\nbody: ' + body + '\n')
    })
    ires.on('error', function (e) {
      console.log('GOT ERROR', e)
    })
  })

  // if the outbound request failed send the error
  oreq.on('error', function (err) {
    console.log('got error', err)
    res.statusCode = 422
    res.send(JSON.stringify(err))
    oreq.end()
  })
  oreq.end('')

})

//
// version of chain that uses request() instead of
// http.request()
//
app.get('/chain2', function chain2 (req, res) {
  show && console.log('chain2 req headers', req.headers)

  const request = require('request')
  const options = {
    url: url.parse(req.query.target),
    headers: {
      'user-agent': 'request'
    }
  }
  function callback (err, response, body) {
    if (!err && response.statusCode === 200) {
      show && console.log('chain2 callback:', response.headers)
      const p = makePrefix(req.query.target)
      const h = JSON.stringify(response.headers)
      res.send(p + h + '\nbody: ' + body + '\n')
    }
  }

  request(options, callback)
})

//==========================================================================
// application =============================================================
//==========================================================================
app.get('/', function home (req, res) {
  // load the single view file (angular will handle the page changes on the front-end)
  res.sendfile('index.html');
});

app.use(function (req, res) {
  res.status(404)
  let body
  if (req.accepts('json')) {
    body = {error: 'page not found'}
  } else {
    body = 'page not found\n'
  }
  res.send(body)
})

let port
let host
let httpsPort
if (!argv.heroku) {
  host = webServerHost.split(':')
  port = +host[1]
  host = host[0]
  // hardcode the https port
  let httpsPort = 8443
  app.listen(port, host)
  app.listen(httpsPort).on('error', function (e) {
    console.log('https disabled:', e.code)
    httpsPort = 'N/A'
  })
} else {
  port = process.env.PORT
  app.listen(port)
}

const tty = require('tty')
const text = tty.isatty(process.stdout.fd) ? 'on a tty' : 'not a tty'
const https = httpsPort ? '(https:' + httpsPort + ')' : ''
const line = ['todo-tester listening on', webServerHost, https, text].join(' ')
const dashes = Buffer.alloc(line.length, '-').toString()
console.log(dashes)
console.log(line)

console.log(`active: ${serverConfig.appoptics}, bindings: ${serverConfig.bindings}`)
console.log(
  `apm ${ao.version}, bindings ${ao.addon.version}, oboe ${ao.addon.Config.getVersionString()}`
)
console.log(`sample rate ${ao.sampleRate}, sampleMode ${ao.sampleMode}`)
console.log(dashes)
