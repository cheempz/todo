'use strict'

// create the framework's app/server
const Express = require('express')
const version = require('express/package.json').version
const bodyParser = require('body-parser')

const winston = require('winston');

const app = new Express()

const http = require('http')
const url = require('url')
const path = require('path')
const fs = require('fs')

const {shrink, getLogOptions} = require('../lib/utility')

const settings = {logLevel: 'errors'}

//
// the int (internal) value is for winston as it is the only internal logger
// currently implemented.
//
const defaultFormats = {
  morgan: {req: 'dev', int: 'simple'},
  winston: {req: 'pretty', int: 'simple'},
  bunyan: {req: undefined, int: 'simple'},
  pino: {req: undefined, int: 'simple'},
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
  const traceToken = options.traceToken; // eslint-disable-line
  const logOpts = options.logger || 'morgan:dev';

  const {reqLogger, reqLogFormat, intLogFormat} = getLogOptions(logOpts, defaultFormats);

  const format = reqLogFormat;
  // set up a winston logger for messages not associated with requests and responses.
  const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(winston.format.colorize(), winston.format[intLogFormat]()),
    transports: [new winston.transports.Console()],
  });

  //server.use(methodOverride());

  //==============================================================================
  // get the middleware ==========================================================
  //==============================================================================

  //handle the static files
  Object.keys(staticFiles).forEach(k => {
    app.use(k, Express.static(path.join(process.cwd(), staticFiles[k])))
  })

  //
  // one of the supported logging packages
  //
  if (!reqLogger || reqLogger === 'morgan') {
    const morgan = require('morgan')
    //const logFormat = ':method :url :status :res[content-length] :trace-id - :response-time ms';
    //morgan.token('trace-id', function (req, res) {return traceToken();});

    // add the logger
    const logger = morgan(reqLogFormat, {
      skip: function (req, res) {
        if (settings.logLevel === 'errors') {
          return res.statusCode < 400 || res.statusCode === 512
        }
        return false
      }
    })
    app.use(logger)
  //
  // morgan's builtin dev format
  //
  } else if (reqLogger === 'morgan-dev') {
    const morgan = require('morgan');
    const logger = morgan('dev', {
      skip: function (req, res) {
        if (settings.logLevel === 'errors') {
          return res.statusCode < 400 || res.statusCode === 512
        }
        return false
      }
    });
    app.use(logger);
  //
  // pino
  //
  } else if (reqLogger === 'pino') {
    const pino = require('express-pino-logger');
    app.use(pino());
  //
  // winston
  //
  } else if (reqLogger === 'winston') {
    const winston = require('winston');
    const expressWinston = require('express-winston');
    const formats = [winston.format.json()];
    if (format === 'pretty') {
      expressWinston.requestWhitelist = ['url', 'method', 'httpVersion', 'originalUrl', 'query'];
      formats.push(winston.format.prettyPrint());
    }
    app.use(expressWinston.logger({
      format: winston.format.combine.apply(null, formats),
      transports: [new winston.transports.Console()]
    }));
  //
  // bunyan
  //
  } else if (reqLogger === 'bunyan') {
    // https://medium.com/@tobydigz/logging-in-a-node-express-app-with-morgan-and-bunyan-30d9bf2c07a
    const bunyan = require('bunyan');
    const logger = bunyan.createLogger({
      name: 'bunyan-todo',
      serializers: {
        req: bunyan.stdSerializers.req,
        res: bunyan.stdSerializers.res,
      },
      level: 'info',
    })
    app.use(function (req, res, next) {
      function afterResponse () {
        res.removeListener('finish', afterResponse);
        res.removeListener('close', afterResponse);
        logger.info({res});
      }
      res.on('finish', afterResponse);
      res.on('close', afterResponse);
      next();
    })
  }

  // parse application / x-www-form-urlencoded
  app.use(bodyParser.urlencoded({'extended': 'true'}))
  // parse application/json
  app.use(bodyParser.json())
  // parse application/vnd.api+json as json
  app.use(bodyParser.json({type: 'application/vnd.api+json'}))


  //==============================================================================
  // routes ======================================================================
  //==============================================================================

  app.all('*', function allRoutes (req, res, next) {
    accounting.count()
    next()
  })

  app.get('/accounting', function getAccounting (req, res) {
    //process.nextTick(() => res.json(accounting.get()))
    res.json(accounting.get())
  })


  //==============================================================================
  // Config information, settings, and stats =====================================
  //==============================================================================
  const config = new Requests.Config()

  app.get('/config/:what?', function getCfg (req, res) {
    const r = config.get(req.params.what)
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

  const oboe = new Requests.Oboe()

  app.get('/oboe/:what', function getOboe (req, res) {
    const r = oboe.get(req.params.what)
    if (r.status && r.status !== 200) {
      res.statusCode = r.status
      res.end()
      return
    }
    r.framework = 'express'
    res.json(r)
  })

  app.get('/log/:level/:string', function doLog (req, res) {
    const level = req.params.level;
    if (level !== 'error' && level !== 'warn' && level !== 'info') {
      res.statusCode = 404;
      res.end();
      return;
    }
    logger[level](req.params.string);
    res.end();
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

  app.get('/read-file', function readFile (req, res) {
    const r = fs.readFileSync('package.json', 'utf8')
    res.send(shrink(r))
  })

  app.get('/read-file-fail', function readFileError (req, res) {
    const r = fs.readFileSync('i\'m not there')
    res.send(shrink(r))
  })


  //=====================================================================================
  // custom instrumentation for sync, async, and promises ===============================
  //=====================================================================================

  const customSync = new Requests.CustomSync()
  const customAsync = new Requests.CustomAsync()
  const customPromise = new Requests.CustomPromise()

  const wrap = Requests.CustomPromise.wrapAsync

  const cp = require('child_process')

  // how: sync, async, promise
  // what: ls, delay
  // x: execute, [r: result | j: json]
  const hows = {
    sync: {
      ls: {x: () => cp.spawnSync('ls', ['-lR']), r: r => shrink(r.stdout)},
      readfile: {x: () => fs.readFileSync('package.json', 'utf8'), r: r => shrink(r)},
      readfail: {x: () => fs.readFileSync('xyzzy.not-here'), r: r => r},
    },
    async: {
      ls: {x: cb => cp.exec('ls -lR ./node_modules/appoptics-apm', cb), r: r => shrink(r[1])},
      readfile: {x: cb => fs.readFile('package.json', 'utf8', cb), r: r => shrink(r[1])},
      readfail: {x: cb => fs.readFile('i\'m not there', cb), r: r => r[1]},
      delay: {x: cb => delay.cbMilliseconds(250, cb), j: r => r[0]},
    },
    promise: {
      ls: {x: wrap(cb => cp.exec('ls -lR ./node_modules/appoptics-apm', cb)), r: r => shrink(r[1])},
      delay: {x: () => delay.milliseconds(275), j: r => r},
    }
  }

  app.get('/custom/:how?/:what?/:catch?', function custom (req, res, next) {
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
  // curl -i localhost:8088/chain?target=http://localhost:8088/chain?target=...
  //
  app.get('/chain', function chain (req, res) {

    const q = req.query.target

    if (!q) {
      logger.info('this is the end of the chain');
      res.send('this is the end!\n')
      return
    }
    logger.info(`chain about to fetch ${q}`);

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
        logger.info('chain sent body');
      })
      ires.on('error', function (e) {
        logger.error('chain got an error', e);
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
    const q = req.query.target

    if (!q) {
      logger.info('this is the end of the chain2');
      res.send('this is the end!\n')
      return
    }
    logger.info(`chain2 about to fetch ${q}`);

    const request = require('request')
    const options = {
      url: url.parse(q),
      headers: {
        'user-agent': 'request'
      }
    }
    function callback (err, response, body) {
      if (!err && response.statusCode === 200) {
        const p = makePrefix(req.query.target)
        const h = JSON.stringify(response.headers)
        res.send(p + h + '\nbody: ' + body + '\n')
        logger.info('chain2 sent body')
      }
    }

    request(options, callback)
  })

  //==========================================================================
  // application =============================================================
  //==========================================================================
  app.get('/', function home (req, res) {
    // load the single view file (angular will handle the page changes on the front-end)
    res.sendFile(process.cwd() + '/index.html');
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
