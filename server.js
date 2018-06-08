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

// set up ========================

var skeletalAddon = {
  Event: {
    getEventData: function () { return { active: 0, freedBytes: 0, freedCount: 0 } }
  },
  Metadata: {
    getMetadataData: function () { return { active: 0, freedBytes: 0, freedCount: 0 } }
  }
}

var ao = {
  configuration: 'none',
  dummyAddon: true,
  sampleRate: 0,
  probes: {
    express: {}
  },
  addon: skeletalAddon,
}

var configuration = process.env.AO_BENCHMARK_REQUIRE
//
// successfully loading traceview or appoptics-apm will replace ao
// with with traceview or appoptics, neither of which have a dummyAddon
// property, so it will be undefined.
//
if (configuration === 'traceview') {
  try {
    ao = require('traceview')
    ao.configuration = 'traceview'
    ao.traceMode = 'always'
  } catch (e) {
    console.log(e)
    ao.configuration = 'failed-traceview'
  }
  ao.addon.Event.getEventData = skeletalAddon.Event.getEventData
  ao.addon.Metadata.getMetadataData = skeletalAddon.Metadata.getMetadataData
  ao.probes = {express: {}}
} else if (configuration === 'appoptics' || configuration === '' || configuration === undefined) {
  try {
    ao = require('appoptics-apm')
    ao.configuration = 'appoptics'
    if (!ao.addon) {
      ao.addon = skeletalAddon
    }
  } catch (e) {
    ao.configuration = 'failed-appoptics-apm'
  }
} else if (configuration !== 'none') {
  console.warn('invalid AO_BENCHMARK_REQUIRE', configuration, 'using none')
  ao.configuration = 'none'
}


var memwatch = require('memwatch-next')
var express  = require('express');
var app      = express(); 								// create our app w/ express
var mongoose = require('mongoose'); 					// mongoose for mongodb
var morgan = require('morgan'); 			// log requests to the console (express4)
var bodyParser = require('body-parser'); 	// pull information from HTML POST (express4)
var methodOverride = require('method-override'); // simulate DELETE and PUT (express4)
var argv = require('optimist').argv;
var http = require('http')
var url = require('url')
var fs = require('fs')
var heapdump = require('heapdump')

function clsCheck (msg) {
  let c = ao.requestStore
  let ok = c && c.active
  if (!ok && msg) {
    console.log('[ERROR] CLS NOT ACTIVE', msg)
  } else if (ok) {
    console.log('CLS ACTIVE!!!', msg)
  }
  return ok
}

var requests = 0


// memwatch setup
var firstStats
var lastStats

var leakDetected = 0
var leakInfo
var leakTime
var lastLeakInfo
var lastLeakTime

function getRSS () {
  return {
    n: requests,
    ts: new Date().getTime(),
    rss: process.memoryUsage().rss
  }
}

var rssHistory = [getRSS()]

function ObjectData (name, n, fn) {
  this.name = name
  this.maxItems = n
  this.fn = fn
  this.low = 0
  this.high = 0
  this.data = {0: fn()}
}

ObjectData.prototype.addItem = function () {
  this.high += 1
  if (this.high - this.low >= this.maxItems) {
    delete this.data[this.low]
    this.low += 1
  }
  this.data[this.high] = this.fn()
}
var events = new ObjectData('events', 5, ao.addon.Event.getEventData)
var metadatas = new ObjectData('metadatas', 5, ao.addon.Metadata.getMetadataData)

function minutes (n) {
  return n * 1000 * 60
}

var memInt = setInterval(function () {
  //rssHistory.push(getRSS())
  //events.addItem()
  //metadatas.addItem()
}, minutes(10))

memwatch.on('stats', function (stats) {
  if (!firstStats) {
    firstStats = stats
    lastStats = stats
  }


  let line = [
    '\nn ', requests,
    ', fgc ', stats.num_full_gc,
    ', igc ', stats.num_inc_gc,
    ', hc ', stats.heap_compactions,
    ', heap ', stats.current_base,
    ', delta ', stats.current_base - firstStats.current_base,
    ', rss ', process.memoryUsage().rss
    //'min', stats.min, 'max', stats.max
  ]

  // add a new item after each garbage collection event.
  events.addItem()
  metadatas.addItem()

  //console.log(line.join(''))
  //console.log('events\n', events.data)
  //console.log('metadata\n', metadatas.data)

  lastStats = stats
})

var modeMap = {
  0: 0,
  1: 1,
  never: 0,
  always: 1
}
if ('sampleMode' in argv) {
  ao.sampleMode = modeMap[argv.sampleMode]
}

if (ao.setCustomTxNameFunction) {
  ao.setCustomTxNameFunction('express', customExpressTxName)
}

function customExpressTxName (req, res) {
  // ignore global routes
  if (req.route.path === '*') {
    console.log('called for * route')
    return ''
  }
  console.log('req.method', req.method, 'r.r.p', req.route.path, 'url', req.url, 'r.r.m', req.route.methods, 'ourl', req.originalUrl)
  let customTxname = 'TODO-' + req.method + req.route.path
  console.log('custom name: ', customTxname)
  return customTxname
}

function wait (n) {
  return new Promise(function (resolve) {
    setTimeout(resolve, n)
  })
}

const mstime = () => new Date().getTime()
//
// configuration and command line options =================
//

//
// mongo DB
//
var mongoHost = typeof argv.be_ip === 'string' ? argv.be_ip : '127.0.0.1:27017'
if (!~mongoHost.indexOf(':')) mongoHost += ':27017'

var mongoOpts = {
  reconnectTries: 10,
  reconnectInterval: 2000
}

//
// if heroku mode don't look for a mongo server. only a subset
// of pages are available without error.
//
if (!argv.heroku) {
  mongoose.connect('mongodb://' + mongoHost + '/my_database', mongoOpts)
}

//
// web server
//
var webServerHost = argv.fe_ip || '0.0.0.0:8088'
if (!~webServerHost.indexOf(':')) webServerHost += ':8088'

// log headers to console
var show = argv.s || argv['show-headers'] || argv.h

// host to log requests to. don't log if not present
var logHost = argv.log_ip || ''

//
// appoptics settings
//
var rate = ('rate' in argv) ? +argv.rate : 1000000

// also allow shorthand -r which does 0-100 (interpreted as percent)
// this overrides a --rate setting.
if ('r' in argv) rate = +argv.r * 10000
ao.sampleRate = rate


var pid = process.pid

//
// app configuration ===============
//

// taken from appoptics test suite. these are not valid for any real
// servers - only used for local testing.
var options = {
  key: "-----BEGIN RSA PRIVATE KEY-----\nMIICXQIBAAKBgQCsJU2dO/K3oQEh9wo60VC2ajCZjIudc8cqHl9kKNKwc9lP4Rw9\nKWso/+vHhkp6Cmx6Cshm6Hs00rPgZo9HmY//gcj0zHmNbagpmdvAmOudK8l5Npzd\nQwNROKN8EPoKjlFEBMnZj136gF5YAgEN9ydcLtS2TeLmUG1Y3RR6ADjgaQIDAQAB\nAoGBAJTD9/r1n5/JZ+0uTIzf7tx1kGJh7xW2xFtFvDIWhV0wAJDjfT/t10mrQNtA\n1oP5Fh2xy9YC+tZ/cCtw9kluD93Xhzg1Mz6n3h+ZnvnlMb9E0JCgyCznKSS6fCmb\naBz99pPJoR2JThUmcuVtbIYdasqxcHStYEXJH89Ehr85uqrBAkEA31JgRxeuR/OF\n96NJFeD95RYTDeN6JpxJv10k81TvRCxoOA28Bcv5PwDALFfi/LDya9AfZpeK3Nt3\nAW3+fqkYdQJBAMVV37vFQpfl0fmOIkMcZKFEIDx23KHTjE/ZPi9Wfcg4aeR4Y9vt\nm2f8LTaUs/buyrCLK5HzYcX0dGXdnFHgCaUCQDSc47HcEmNBLD67aWyOJULjgHm1\nLgIKsBU1jI8HY5dcHvGVysZS19XQB3Zq/j8qMPLVhZBWA5Ek41Si5WJR1EECQBru\nTUpi8WOpia51J1fhWBpqIbwevJ2ZMVz0WPg85Y2dpVX42Cf7lWnrkIASaz0X+bF+\nTMPuYzmQ0xHT3LGP0cECQQCqt4PLmzx5KtsooiXI5NVACW12GWP78/6uhY6FHUAF\nnJl51PB0Lz8F4HTuHhr+zUr+P7my7X3b00LPog2ixKiO\n-----END RSA PRIVATE KEY-----",
  cert: "-----BEGIN CERTIFICATE-----\nMIICWDCCAcGgAwIBAgIJAPIHj8StWrbJMA0GCSqGSIb3DQEBCwUAMEUxCzAJBgNV\nBAYTAkFVMRMwEQYDVQQIDApTb21lLVN0YXRlMSEwHwYDVQQKDBhJbnRlcm5ldCBX\naWRnaXRzIFB0eSBMdGQwHhcNMTQwODI3MjM1MzUwWhcNMTQwOTI2MjM1MzUwWjBF\nMQswCQYDVQQGEwJBVTETMBEGA1UECAwKU29tZS1TdGF0ZTEhMB8GA1UECgwYSW50\nZXJuZXQgV2lkZ2l0cyBQdHkgTHRkMIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKB\ngQCsJU2dO/K3oQEh9wo60VC2ajCZjIudc8cqHl9kKNKwc9lP4Rw9KWso/+vHhkp6\nCmx6Cshm6Hs00rPgZo9HmY//gcj0zHmNbagpmdvAmOudK8l5NpzdQwNROKN8EPoK\njlFEBMnZj136gF5YAgEN9ydcLtS2TeLmUG1Y3RR6ADjgaQIDAQABo1AwTjAdBgNV\nHQ4EFgQUTqL/t/yOtpAxKuC9zVm3PnFdRqAwHwYDVR0jBBgwFoAUTqL/t/yOtpAx\nKuC9zVm3PnFdRqAwDAYDVR0TBAUwAwEB/zANBgkqhkiG9w0BAQsFAAOBgQBn1XAm\nAsVdXKr3aiZIgOmw5q+F1lKNl/CHtAPCqwjgntPGhW08WG1ojhCQcNaCp1yfPzpm\niaUwFrgiz+JD+KvxvaBn4pb95A6A3yObADAaAE/ZfbEA397z0RxwTSVU+RFKxzvW\nyICDpugdtxRjkb7I715EjO9R7LkSe5WGzYDp/g==\n-----END CERTIFICATE-----"
}



app.use('/js', express.static(__dirname + '/js'));
app.use('/bower_components', express.static(__dirname + '/bower_components'));
// log every request to the console
app.use(morgan('dev', {
  skip: function (req, res) {return false}
}));
// parse application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({'extended':'true'}));
// parse application/json
app.use(bodyParser.json());
// parse application/vnd.api+json as json
app.use(bodyParser.json({ type: 'application/vnd.api+json' }));
app.use(methodOverride());

//
// define mongo model =================
//
var Todo = mongoose.model('Todo', {
  title : String,
  completed: Boolean
});

//
// routes ======================================================================
//

// api ---------------------------------------------------------------------
app.all('*', function allRoutes (req, res, next) {
  clsCheck('in globalroute')
  requests += 1
  next()
})
// get all todos
app.get('/api/todos', function getAllTodos (req, res) {
  show && console.log(req.headers)
  clsCheck('in app.get before todo.find')
  // use mongoose to get all todos in the database
  Todo.find(function(err, todos) {
    clsCheck('in todo.find cb')
    var data = fs.readFileSync('package.json', { encoding: 'utf8' })
    // if there is an error retrieving, send the error.
    // nothing after res.send(err) will execute
    if (err)
      res.send(err)

    res.json(todos); // return all todos in JSON format
  });
});

var active = 0

// create todo and send back all todos after creation
app.post('/api/todos', function createTodo (req, res) {
  active += 1
  //console.log('active', active)
  show && console.log(req.headers)
  console.log(res._ao_metrics)
  clsCheck('in post/api/todos')



  // create a todo, information comes from AJAX request from Angular
  Todo.create({
    title : req.body.title,
    completed : false
  }, function(err, todo) {
    clsCheck('in todo.create cb')
    if (err) {
      active -= 1
      res.send(err);
    }

    // get and return all the todos after you create another
    // also return the specific todo so the sender knows which
    // was just added (if they care)
    Todo.find(function(err, todos) {
      active -= 1
      if (err)
        res.send(err)
      res.json({todo, todos});
    });
  });
});

app.put('/api/todos/:todo_id', function updateTodo (req, res) {
  show && console.log(req.headers)
  return Todo.findById(req.params.todo_id, function(err, todo) {
    todo.title = req.body.title;
    todo.completed = req.body.completed;
    return todo.save(function(err) {
      if (err) {
        res.send(err);
      }
      return res.send(todo);
    });
  });
});

// delete a todo
app.delete('/api/todos/:todo_id', function deleteTodo (req, res) {
  active += 1
  //console.log('active', active)
  show && console.log(req.headers)
  var item = {
    _id: req.params.todo_id
  }
  if (req.params.todo_id === '*') {
    item = {}
  }
  clsCheck('before todo.remove')
  Todo.remove(item, function(err, todo) {
    if (err) {
      active -= 1
      res.send(err)
    }
    clsCheck('in todo.remove cb')

    // get and return all the todos (maybe some were created
    // in the interim?)
    Todo.find(function(err, todos) {
      clsCheck('in to.remove cb todo.find cb')
      active -= 1
      if (err)
        res.send(err)
      res.json(todos)
    });
  });
});

// function so client can get appoptics configuration
app.get('/config', function getConfig (req, res) {
  show && console.log(req.headers)
  show && console.log(req.socket.localPort)

  res.json({
    configuration: ao.configuration,
    bindings: ao.dummyAddon ? false : !!ao.addon,
    serviceKey: process.env.APPOPTICS_SERVICE_KEY || '<not present>',
    sampleRate: ao.sampleRate,
    sampleMode: (ao.traceMode !== undefined) ? ao.traceMode : 'unset',
    pid: pid
  })
})

// function so client can set sampleRate and sampleMode
app.put('/config/:setting/:value', function updateConfig (req, res) {
  show && console.log(req.headers)

  if (req.params.setting !== 'sample-rate' && req.params.setting !== 'sample-mode') {
    res.statusCode = 404
    res.json({error: 404, message: 'Invalid setting: ' + req.params.setting})
  }

  if (req.params.setting === 'sample-rate') {
    ao.sampleRate = +req.params.value
    if (ao.sampleRate !== +req.params.value) {
      res.statusCode = 422
      res.json({
        error: 422,
        message: 'invalid rate ' + req.params.value,
        sampleRate: ao.sampleRate
      })
    }
  } else if (req.params.setting === 'sample-mode') {
    ao.sampleMode = +req.params.value
    if (ao.sampleMode !== +req.params.value) {
      res.statusCode = 422
      res.json({
        error: 422,
        message: 'invalid mode ' + req.params.value,
        sampleMode: ao.sampleMode
      })
    }
  }

  res.json({
    sampleRate: ao.sampleRate,
    sampleMode: ao.sampleMode
  })
})

app.get('/sdk/:how', function sdk (req, res) {
  show && console.log(req.headers)

  const s = require('child_process')


  if (req.params.how === 'sync') {
    var p
    function runSpawnSync () {
      console.log('runSpawn() invoked')
      p = s.spawnSync('ls', ['-lR'])
      console.log('runSpawn() done')
    }
    ao.instrument(
      'todo-sdk-sync-ls',
      runSpawnSync,
      {customTxName: 'this-should-not-appear'}
    )
    res.send()
  } else if (req.params.how === 'async') {
    var p
    function runExecAsync (cb) {
      console.log('runExecAsync () invoked')
      s.exec('ls -lR ./node_modules/appoptics-apm', cb)
    }
    ao.instrument(
      'todo-sdk-async-ls',
      runExecAsync,
      {customTxName: 'this-should-not-appear'},
      function (err, stdout, stderr) {
        if (err) {
          res.statusCode = 418
          console.log(err)
        }
        res.send()
      }
    )
  } else {
    res.statusCode = 404
    res.send()
  }
})

var heapBase

app.get('/diff/:what', function heapDiff (req, res) {
  show && console.log(req.headers)

  if (req.params.what === 'mark') {
    heapBase = new memwatch.HeapDiff()
    heapBase.__ao = getRSS()
    res.send('heap diff baseline set\n')
  } else if (req.params.what === 'end') {
    var diff = heapBase.end()
    diff.rss0 = heapBase.__ao
    diff.rss1 = getRSS()
    res.json(diff)
  } else {
    res.statusCode = 404
    res.send()
  }
})

app.get('/heapdump', function heapDump (req, res) {
  heapdump.writeSnapshot(function (err, filename) {
    if (err) {
      res.statusCode = 400
      res.send('error writing heapdump', err)
    }
    res.send('wrote ' + filename + '\n')
  })
})

app.get('/rss', function rssHistory (req, res) {
  show && console.log(req.headers)

  res.json(rssHistory)
})

// delay a specific number of milliseconds before responding.
app.get('/delay/:ms', function delay (req, res) {
  show && console.log(req.headers)
  let start = mstime()
  let delay = (+req.params.ms) || 0
  clsCheck('in delay (' + delay + ')')
  // respond after the delay.
  wait(delay/2).then(function () {
    clsCheck('in promise.then()')
    var data = fs.readFileSync('package.json', { encoding: 'utf8' })
    setTimeout(function () {
      clsCheck('in timeout()')
      res.json({
        requestedDelay: delay,
        actualDelay: mstime() - start
      })
    }, delay/2)
  })
})

// generate an error response code
app.get('/error/:code', function error (req, res) {
  show && console.log(req.headers)
  let status = req.params.code ? +req.params.code : ''
  if (status) {
    res.status(status).send('here is your code: ' + status + '\n')
  } else {
    res.send('no code')
  }
})

// do a transaction to another server
app.get('/downstream/:url', function downstream (req, res) {
  show && console.log(req.headers)

  var options = {
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
    body = ''
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


function makePrefix(URL) {
  return '--- response from ' + URL + ' ---\nheaders: '
}
//
// now make a chained URL
//
app.get('/chain', function chain (req, res) {
  show && console.log('chain req headers', req.headers)

  var q = req.query.target

  if (!q) {
    res.send('this is the end!\n')
    return
  }

  var options = url.parse(q)
  if (req.headers['X-Trace']) {
    options.headers = {'X-Trace': req.headers['X-Trace']}
  }

  // now do the outbound request and get the inbound response
  const oreq = http.request(options, function (ires) {
    var body = ''
    ires.on('data', function (d) {
      body += d
    })
    // on end return it along with the headers
    ires.on('end', function () {
      show && console.log(ires.headers)
      var p = makePrefix(q)
      var h = JSON.stringify(ires.headers)
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

  var request = require('request')
  var options = {
    url: url.parse(req.query.target),
    headers: {
      'user-agent': 'request'
    }
  }
  function callback (err, response, body) {
    if (!err && response.statusCode === 200) {
      show && console.log('chain2 callback:', response.headers)
      var p = makePrefix(req.query.target)
      var h = JSON.stringify(response.headers)
      res.send(p + h + '\nbody: ' + body + '\n')
    }
  }

  request(options, callback)
})


// application -------------------------------------------------------------
app.get('/', function home (req, res) {
  // load the single view file (angular will handle the page changes on the front-end)
  show && console.log(req.headers)
  show && console.log(req.query)
  show && console.log(req.originalUrl)
  show && console.log('hostname:', req.hostname)
  res.sendfile('index.html');
});

app.use(function (req, res) {
  res.status(404)
  var body = 'page not found\n'
  if (req.accepts('json')) body = {error: 'page not found'}
  res.send(body)
})

var port
var host
var httpsPort
if (!argv.heroku) {
  host = webServerHost.split(':')
  port = +host[1]
  host = host[0]
  // hardcode the https port
  var httpsPort = 8443
  app.listen(port, host)
  app.listen(httpsPort).on('error', function (e) {
    console.log('https disabled:', e.code)
    httpsPort = 'N/A'
  })
} else {
  port = process.env.PORT
  app.listen(port)
}

var tty = require('tty')
var text = tty.isatty(process.stdout.fd) ? 'on a tty' : 'not a tty'
var https = httpsPort ? '(https:' + httpsPort + ')' : ''
let line = ['todo-tester listening on', webServerHost, https, text].join(' ')
let dashes = Buffer.alloc(line.length, '-').toString()
console.log(dashes)
console.log(line)
if (ao.configuration === 'none') {
  console.warn('NO AGENT LOADED - executing normally')
} else if (ao.configuration === 'traceview') {
  console.log('TRACEVIEW AGENT loaded')
} else if (ao.configuration === 'appoptics') {
  var addon
  if (ao.addon !== skeletalAddon) {
    addon = 'addon active'
  } else {
    addon = 'but DISABLED (no addon)'
    ao.configuration = 'appoptics-disabled'
  }
  var addon = ao.addon !== skeletalAddon ? 'addon active' : 'but DISABLED (no addon)'
  console.log('APPOPTICS-APM loaded', addon, '- sample rate', ao.sampleRate, 'sampleMode', ao.sampleMode)
} else {
  console.error('NO AGENT ACTIVE', ao.configuration)
}
console.log(dashes)
