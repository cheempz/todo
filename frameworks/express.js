'use strict'

// create the framework's app/server
const Express = require('express')
const app = new Express()

const http = require('http')
const url = require('url')
const path = require('path')

const settings = {log: 'errors'}

exports.settings = settings
exports.init = function (options) {
  const staticFiles = options.staticFiles
  const Requests = options.Requests
  const accounting = options.accounting
  const todoapi = options.todoapi

  //server.use(methodOverride());

  //==============================================================================
  // get the middleware ==========================================================
  //==============================================================================

  // logger
  const morgan = require('morgan')

  //handle the static files
  Object.keys(staticFiles).forEach(k => {
    app.use(k, Express.static(path.join(__dirname, staticFiles[k])))
  })

  // add the logger
  const logger = morgan('dev', {
    skip: function (req, res) {
      if (settings.log === 'errors') {
        return res.statusCode < 400 || res.statusCode === 512
      }
      return false
    }
  })
  app.use(logger)

  // help parsing request data
  const bodyParser = require('body-parser')

  // parse application / x-www-form-urlencoded
  app.use(bodyParser.urlencoded({'extended': 'true'}))
  // parse application/json
  app.use(bodyParser.json())
  // parse application/vnd.api+json as json
  app.use(bodyParser.json({type: 'application/vnd.api+json'}))


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
  const config = new Requests.Config()

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
  const memory = new Requests.Memory()

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
  const delay = new Requests.Delay()
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

  const customPromise = new Requests.CustomPromise()
  const customAsync = new Requests.CustomAsync()
  const customSync = new Requests.CustomSync()

  const wrap = Requests.CustomPromise.wrapAsync

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

    const request = require('request')
    const options = {
      url: url.parse(req.query.target),
      headers: {
        'user-agent': 'request'
      }
    }
    function callback (err, response, body) {
      if (!err && response.statusCode === 200) {
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

  return app

}
