'use strict'

// create the framework's app/server
const Koa = require('koa')
const version = require('koa/package.json').version
const KoaRouter = require('koa-router')
const StaticKoaRouter = require('static-koa-router')
const morgan = require('koa-morgan')
const bodyParser = require('koa-bodyparser')
const koaSend = require('koa-send')

const app = new Koa()

const http = require('http')
const url = require('url')
const path = require('path')
const fs = require('fs')

const settings = {log: 'errors'}

exports.config = {version}
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

  // handle the static files
  Object.keys(staticFiles).forEach(k => {
    const router = new KoaRouter({prefix: k})
    StaticKoaRouter.Serve(path.join(process.cwd(), k), router)
    app.use(router.routes())
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

  // [json, form] are defaults so no need to set them up
  // parse application / x-www-form-urlencoded
  //app.use(bodyParser.urlencoded({'extended': 'true'}))

  // parse application/vnd.api+json as json
  app.use(bodyParser({
    enableType: ['json', 'form', 'text'],
    extendTypes: {json: ['application/vnd.api+json']}
  }))


  //==============================================================================
  // routes ======================================================================
  //==============================================================================

  const router = new KoaRouter()

  //
  app.use(async (ctx, next) => {
    accounting.count()
    return next()
  })

  router.get('/accounting', async function (ctx, next) {
    ctx.body = accounting.get()
    return next()
  })

  //==============================================================================
  // the todo api ================================================================
  //==============================================================================

  // the todos are a separate application
  const todos = new KoaRouter()

  // get all todos
  todos.get('/', getAllTodos)
  async function getAllTodos (ctx, next) {
    const todos = await todoapi.getAll()
    ctx.body = todos
  }

  // create a todo and send it back with all todos after creation
  // curl -d 'title=your title' -X POST localhost:8088/api/todos
  todos.post('/', createTodo)
  async function createTodo (ctx, next) {
    const todo = await todoapi.create(ctx.request.body.title, false)
    const todos = await todoapi.getAll()
    ctx.body = {todo, todos}
  }

  // update a todo and return it
  todos.put('/:id', updateTodo)
  async function updateTodo (ctx, next) {
    const b = ctx.request.body
    const todo = todoapi.update(ctx.params.id, b.title, b.completed)
    ctx.body = todo
  }

  // delete a todo and return all todos after deletion
  todos.delete('/:id', deleteTodo)
  async function deleteTodo (ctx, next) {
    await todoapi.delete(ctx.params.id)
    const todos = await todoapi.getAll()
    ctx.body = todos
  }

  // mount the todo api on this url.
  router.use('/api/todos', todos.routes(), todos.allowedMethods())

  //==============================================================================
  // Config information and settings =============================================
  //==============================================================================
  const config = new Requests.Config()

  router.get('/config', async function getCfg (ctx) {
    const r = config.get()
    if (r.status && r.status !== 200) {
      ctx.status = r.status
    }
    ctx.body = r
  })

  router.put('/config/:setting/:value', async function putCfg (ctx) {
    const r = config.set(ctx.params.setting, ctx.params.value)
    if (r.status && r.status !== 200) {
      ctx.status = r.status
    }
    ctx.body = r
  })

  const oboe = new Requests.Oboe()

  router.get('/oboe/:what', async function getOboe (ctx) {
    const r = oboe.get(ctx.params.what)
    if (r.status && r.status !== 200) {
      ctx.status = r.status
    }
    ctx.body = r
  })

  //==============================================================================
  // Simple little snippets ======================================================
  //==============================================================================

  //
  // get memory data
  //
  const memory = new Requests.Memory()

  router.get('/memory/:what?', async function rss (ctx) {
    const r = memory.get(ctx.params.what || 'rss')
    if (r.status && r.status !== 200) {
      ctx.status = r.status
    }
    ctx.body = r
  })

  //
  // delay for a fixed period of time
  //
  const delay = new Requests.Delay()
  router.get('/delay/:ms', async function delayRequest (ctx) {
    const r = await delay.millisecond(ctx.params.ms)
    ctx.body = r
  })

  // generate an error response code
  router.get('/error/:code', async function error (ctx) {
    const code = +ctx.params.code || 422
    ctx.status = code
    ctx.body = {received: ctx.params.code, set: code}
  })

  router.get('/read-file', function readFile (ctx) {
    const r = fs.readFileSync('package.json', 'utf8')
    ctx.body = shrink(r)
  })

  router.get('/read-file-fail', async function fileReadError (ctx) {
    ctx.body = fs.readFileSync('i\'m not there', 'utf8')
  })


  //=====================================================================================
  // custom instrumentation for sync, async, and promises ===============================
  //=====================================================================================

  const customSync = new Requests.CustomSync()
  const customAsync = new Requests.CustomAsync()
  const customPromise = new Requests.CustomPromise()

  const wrap = Requests.CustomPromise.wrapAsync

  const cp = require('child_process')

  // how: [sync, async, promise]
  // what: [ls, delay, readfile, readfail]
  // x: execute, r: result
  const hows = {
    sync: {
      ls: {x: () => cp.spawnSync('ls', ['-lR']), r: r => r.stdout},
      readfile: {x: () => fs.readFileSync('appoptics-apm.js'), r: r => r},
      readfail: {x: () => fs.readFileSync('xyzzy.not-here'), r: r => r},
    },
    async: {
      ls: {x: cb => cp.exec('ls -lR ./node_modules/appoptics-apm', cb), r: r => r[1]},
      readfile: {x: cb => fs.readFile('package.json', 'utf8', cb), r: r => shrink(r[1])},
      readfail: {x: cb => fs.readFile('i\'m not there', cb), r: r => r[1]},
      delay: {x: cb => delay.cbMilliseconds(250, cb), r: r => r[0]},
    },
    promise: {
      ls: {x: wrap(cb => cp.exec('ls -lR ./node_modules/appoptics-apm', cb)), r: r => r[1]},
      delay: {x: () => delay.milliseconds(275), r: r => r},
    }
  }

  router.get('/custom/:how?/:what?/:catch?', async function custom (ctx) {
    const how = ctx.params.how
    const what = ctx.params.what
    if (!hows[how] || !hows[how][what]) {
      ctx.status = 404
      ctx.body = hows
      return
    }

    const executor = {
      sync: customSync,
      async: customAsync,
      promise: customPromise,
    }[how]
    const name = `custom-${how}-${what}`

    const cfg = hows[how][what]

    if (ctx.params.catch) {
      try {
        const r = await executor['instrument'](name, cfg.x)
        ctx.body = cfg.r(r)
      } catch (e) {
        ctx.status = 500
        ctx.body = {message: e.code}
      }
    } else {
      const r = await executor['instrument'](name, cfg.x)
      ctx.body = cfg.r(r)
    }
  })

  //=====================================================================================
  // random more complicated stuff for now.
  //=====================================================================================

  /*
  const soap = require('soap')
  const wsdlURL = 'http://localhost:3000/wsdl?wsdl'
  router.get('/soap/:string', function makeSoapCall (req, res) {
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
  router.get('/downstream/:url', function downstream (req, res) {

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
  router.get('/chain', function chain (req, res) {

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
  router.get('/chain2', function chain2 (req, res) {

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
  router.get('/', async function home (ctx, next) {
    // load the single view file (angular will handle the page changes on the front-end)
    await koaSend(ctx, 'index.html')
  });

  router.use(async (ctx, next) => {
    await next()
    if (ctx.status === 404 && ctx.request.accepts('json')) {
      ctx.body = {message: 'page not found'}
    }
  })

  app.use(router.routes())

  return app

}


function shrink (string) {
  const lines = string.split('\n')
  if (lines.length < 5) {
    return string
  }

  let count = lines.length - 4;
  if (lines[lines.length - 1] === '') {
    count -= 1;
  }

  lines.splice(2, count, '...')
  return lines.join('\n')
}
