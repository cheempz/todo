'use strict'

// create the framework's app/server
const Koa = require('koa')
const version = require('koa/package.json').version
const KoaRouter = require('koa-router')
const StaticKoaRouter = require('static-koa-router')
const morgan = require('koa-morgan')
const bodyParser = require('koa-bodyparser')
const koaSend = require('koa-send')
const winston = require('winston');

const app = new Koa()

const http = require('http')
const url = require('url')
const path = require('path')
const fs = require('fs')

const {shrink, getLogOptions} = require('../lib/utility')

const settings = {logLevel: 'errors'}

const defaultFormats = {
  morgan: {req: 'dev', int: 'simple'},
  winston: {req: 'pretty', int: 'simple'},
  bunyan: {req: undefined, int: undefined},
  pino: {req: undefined, int: undefined},
}

exports.config = {version}
exports.settings = settings
exports.init = function (options) {
  const staticFiles = options.staticFiles
  const Requests = options.Requests
  const accounting = options.accounting
  const todoapi = options.todoapi
  const host = options.host
  const httpPort = options.httpPort
  const httpsPort = options.httpsPort
  const traceToken = options.traceToken;
  const logOpts = options.logger || 'morgan:dev:simple';

  // get the logger and formats
  const {reqLogger, reqLogFormat, intLogFormat} = getLogOptions(logOpts, defaultFormats);

  // create the internal (not request) logger
  const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(winston.format.colorize(), winston.format[intLogFormat]()),
    transports: [new winston.transports.Console()]
  });

  // consider allowing a custom format to be used that manually inserts the traceId.
  //const logFormat = ':method :url :status :res[content-length] :trace-id - :response-time ms'
  //morgan.token('trace-id', function (req, res) {return traceToken();});
  traceToken;  // get rid of eslint error for now.

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

  //
  // set up the request logger
  //
  if (reqLogger === 'morgan') {
    // add the request logger
    const logger = morgan(reqLogFormat, {
      skip: function (req, res) {
        if (settings.logLevel === 'errors') {
          return res.statusCode < 400 || res.statusCode === 512
        }
        return false
      }
    })
    app.use(logger)
  } else {
    throw new TypeError(`koa does not support the ${reqLogger} logger`);
  }

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
  // Config information and settings =============================================
  //==============================================================================
  const config = new Requests.Config()

  router.get('/config', async function getCfg (ctx) {
    const r = config.get()
    if (r.status && r.status !== 200) {
      ctx.status = r.status
    }
    r.framework = 'koa'
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

  router.get('/log/:level/:string', async function doLog (ctx) {
    const level = ctx.params.level;
    if (!logger[level]) {
      ctx.status = 404;
      return;
    }
    logger[level](ctx.params.string);
    ctx.body = {status: 'logged'};
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
    const todo = await todoapi.update(ctx.params.id, b.title, b.completed)
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
    const r = await delay.milliseconds(ctx.params.ms)
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
      ls: {x: () => cp.spawnSync('ls', ['-lR']), r: r => shrink(r.stdout)},
      readfile: {x: () => fs.readFileSync('appoptics-apm.js'), r: r => shrink(r)},
      readfail: {x: () => fs.readFileSync('xyzzy.not-here'), r: r => r},
    },
    async: {
      ls: {x: cb => cp.exec('ls -lR ./node_modules/appoptics-apm', cb), r: r => shrink(r[1])},
      readfile: {x: cb => fs.readFile('package.json', 'utf8', cb), r: r => shrink(r[1])},
      readfail: {x: cb => fs.readFile('i\'m not there', cb), r: r => r[1]},
      delay: {x: cb => delay.cbMilliseconds(250, cb), r: r => r[0]},
    },
    promise: {
      ls: {x: wrap(cb => cp.exec('ls -lR ./node_modules/appoptics-apm', cb)), r: r => shrink(r[1])},
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
  router.get('/downstream/:url', async function downstream (ctx) {

    const options = {
      protocol: 'http:',
      port: 8881,
      hostname: 'localhost',
      method: 'post',
      path: (ctx.params.url ? '/' + ctx.params.url : '/'),
      headers: {
        'Content-Type': 'application/json'
      }
    }

    return new Promise((resolve, reject) => {
      const oreq = http.request(options, function (ires) {
        let body = ''
        ires.on('data', function (d) {
          body += d
        })
        // and on end log it
        ires.on('end', function () {
          ctx.body =  body
          resolve()
        })
        ires.on('error', function (e) {
          console.log('GOT ERROR', e)
          reject(e)
        })
      })

      oreq.on('error', function (err) {
        console.log('got error', err)
        reject(err)
      })
      oreq.write(JSON.stringify({url: options.path}))
      oreq.end()
    })

  })


  function makePrefix (URL) {
    return '--- response from ' + URL + ' ---\nheaders: '
  }
  //
  // now make a chained URL
  //
  router.get('/chain', async function chain (ctx) {

    const q = ctx.query.target

    if (!q) {
      ctx.body = 'this is the end!\n';
      return;
    }

    const options = url.parse(q);
    if (ctx.request.headers['X-Trace']) {
      options.headers = {'X-Trace': ctx.request.headers['X-Trace']}
    }

    return new Promise((resolve, reject) => {
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
          ctx.body = p + h + '\nbody: ' + body + '\n';
          resolve()
        })
        ires.on('error', function (e) {
          console.log('GOT ERROR', e)
          reject(e)
        })
      })

      // if the outbound request failed send the error
      oreq.on('error', function (err) {
        console.log('got error', err)
        ctx.status = 422
        ctx.body = err
        oreq.end()
      })
      oreq.end('')

    })
  })


  //
  // version of chain that uses request() instead of
  // http.request()
  //
  router.get('/chain2', async function chain2 (ctx) {

    const request = require('request')
    const options = {
      url: url.parse(ctx.query.target),
      headers: {
        'user-agent': 'request'
      }
    }

    return new Promise((resolve, reject) => {
      function callback (err, response, body) {
        if (err) {
          reject(err);
          return;
        }
        const p = makePrefix(ctx.query.target)
        const h = JSON.stringify(response.headers)
        ctx.body = p + h + '\nbody: ' + body + '\n';
      }

      request(options, callback)
    })
  })

  //==========================================================================
  // aws kinesis =============================================================
  //==========================================================================
  const awsKinesis = new Requests.AwsKinesis()

  router.post('/aws/kinesis', async function kinesis (ctx, next) {
    const p = awsKinesis.put();
    p.then().catch(e => {
      const {message, code, time, requestId, statusCode, retryable, retryDelay} = e;
      logger.error({message, code, time, requestId, statusCode, retryable, retryDelay});
    })
    ctx.body = {status: 'received'};
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

  //
  // now get the server listening
  //
  const promises = []
  let httpStatus
  let httpsStatus

  // it's kind of funky but let the caller decide whether a failure to
  // listen on a port is OK or not. that's why the promises are always
  // resolved, not rejected.
  const p1 = new Promise((resolve, reject) => {
    function x (...args) {
      if (args.length && args[0] instanceof Error) {
        httpStatus = args[0]
      }
      resolve(args)
    }
    app.listen(httpPort, host).on('listening', x).on('error', x)
  })
  promises.push(p1)

  if (httpsPort) {
    const p2 = new Promise((resolve, reject) => {
      function x (...args) {
        if (args.length && args[0] instanceof Error) {
          httpsStatus = args[0]
        }
        resolve(args)
      }
      app.listen(httpsPort, host).on('listening', x).on('error', x)
    })
    promises.push(p2)
  }

  return Promise.all(promises).then(r => {
    return {
      server: app,
      httpStatus,
      httpsStatus,
    }
  })

}
