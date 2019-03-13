'use strict'

// create the framework's app/server
// basic but a good place to start https://hapijs.com/tutorials/getting-started?lang=en_US
const Hapi = require('hapi')
const version = require('hapi/package.json').version
const Inert = require('inert')

const http = require('http')
const url = require('url')
const axios = require('axios')
const path = require('path')
const fs = require('fs')
const Boom = require('boom')


const {shrink} = require('../lib/utility')

const settings = {log: 'errors'}

exports.config = {version}
exports.settings = settings
exports.init = async function (options) {
  const staticFiles = options.staticFiles
  const Requests = options.Requests
  const accounting = options.accounting
  const todoapi = options.todoapi
  const host = options.host
  const httpPort = options.httpPort
  const httpsPort = options.httpsPort // eslint-disable-line

  const server = Hapi.server({
    port: httpPort,
    host,
  })


  //==============================================================================
  // get the middleware ==========================================================
  //==============================================================================

  // handle the static files
  // kind of random docs but https://hapijs.com/tutorials/serving-files
  await server.register(Inert)

  // hardcoded one level of directory. consider making the value an array of directories?
  Object.keys(staticFiles).forEach(k => {
    server.route({
      method: 'GET',
      path: `${k}/{directory}/{filename}`,
      handler: function staticFile (req, h) {
        const file = path.join(process.cwd(), k, req.params.directory, req.params.filename)
        return h.file(file)
      }
    })
  })

  server.events.on('response', function logger (req) {
    // eslint-disable-next-line
    console.log(`${req.info.remoteAddress}: ${req.method.toUpperCase()} ${req.url.pathname} -> ${req.response.statusCode}`)
  })


  // capture each request as it comes in but do nothing other than account for it.
  // hard won info. lots of api docs. not much on how to do common tasks. https://hapijs.com/api#server.ext()
  server.ext({
    type: 'onRequest',
    method: async function (req, h) {
      accounting.count();
      return h.continue;
    }
  })

  //==============================================================================
  // routes ======================================================================
  //==============================================================================


  //==============================================================================
  // information and settings ====================================================
  //==============================================================================

  server.route({
    method: 'GET',
    path: '/accounting',
    handler (req, h) {
      return accounting.get()
    }
  })

  const config = new Requests.Config()

  server.route({
    method: 'GET',
    path: '/config',
    handler: async function getConfig (req, h) {
      const r = config.get();
      if (r.status && r.status !== 200) {
        throw new Boom(r.message, {statusCode: r.status})
      }
      return r;
    }
  })

  server.route({
    method: 'PUT',
    path: '/config/{setting}/{value}',
    handler: async function putConfig (req, h) {
      const r = config.set(req.params.setting, req.params.value)
      if (r.status && r.status !== 200) {
        throw new Boom(r.message, {statusCode: r.status})
      }
      return r;
    }
  })

  const oboe = new Requests.Oboe()

  server.route({
    method: 'GET',
    path: '/oboe/{what}',
    handler: async function getOboe (req, h) {
      const r = oboe.get(req.params.what)
      if (r.status && r.status !== 200) {
        throw new Boom(r.message, {statusCode: r.status})
      }
      return r;
    }
  })

  //==============================================================================
  // the todo api ================================================================
  //==============================================================================


  // get all todos
  server.route({
    method: 'GET',
    path: '/api/todos',
    async handler (req, h) {
      return await todoapi.getAll()
    }
  })

  // create a todo and send it back with all todos after creation
  // curl -d 'title=your title' -X POST localhost:8088/api/todos
  server.route({
    method: 'POST',
    path: '/api/todos',
    async handler (req, h) {
      const todo = await todoapi.create(req.payload.title, false)
      const todos = await todoapi.getAll()
      return {todo, todos}
    }
  })

  // update a todo and return it
  server.route({
    method: 'PUT',
    path: '/api/todos/{id}',
    async handler (req, h) {
      const p = req.payload;
      const todo = await todoapi.update(req.params.id, p.title, p.completed);
      return todo
    }
  })

  // delete a todo and return all todos after deletion
  server.route({
    method: 'DELETE',
    path: '/api/todos/{id}',
    async handler (req, h) {
      await todoapi.delete(req.params.id)
      const todos = await todoapi.getAll()
      return todos
    }
  })


  //==============================================================================
  // Simple little snippets ======================================================
  //==============================================================================

  //
  // get memory data
  //
  const memory = new Requests.Memory()
  server.route({
    method: 'GET',
    path: '/memory/{what?}',
    handler: async function getMemory (req, h) {
      const r = memory.get(req.params.what || 'rss')
      if (r.status && r.status !== 200) {
        throw new Boom(r.message, {statusCode: r.status})
      }
      return r;
    }
  })

  //
  // delay for a fixed period of time
  //
  const delay = new Requests.Delay()
  server.route({
    method: 'GET',
    path: '/delay/{ms?}',
    handler: async function delayRequest (req, h) {
      const r = await delay.milliseconds(req.params.ms)
      return r
    }
  })

  // generate an error response code
  server.route({
    method: 'GET',
    path: '/error/{code}',
    handler: async function (req, h) {
      const code = +req.params.code || 422;
      throw new Boom({received: req.params.code, set: code}, code);
    }
  })

  server.route({
    method: 'GET',
    path: '/read-file',
    handler: async function readFile (req, h) {
      const r = fs.readFileSync('package.json', 'utf8');
      return shrink(r)
    }
  })

  server.route({
    method: 'GET',
    path: '/read-file-fail',
    handler: async function readFileFail (req, h) {
      return fs.readFileSync('i\'m not there', 'utf8');
    }
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

  server.route({
    method: 'GET',
    path: '/custom/{howWhat*2}/{catch?}',
    handler: async function custom (req, h) {
      const [how, what] = req.params.howWhat.split('/')
      if (!hows[how] || !hows[how][what]) {
        throw new Boom(hows, 404);
      }

      const executor = {
        sync: customSync,
        async: customAsync,
        promise: customPromise,
      }[how];

      const name = `custom-${how}-${what}`;
      const cfg = hows[how][what];

      if (req.params.catch) {
        try {
          const r = await executor['instrument'](name, cfg.x);
          return cfg.r(r)
        } catch (e) {
          throw new Boom({message: e.code, statusCode: 500});
        }
      } else {
        const r = await executor['instrument'](name, cfg.x);
        return cfg.r(r)
      }
    }
  })

  //=====================================================================================
  // downstream requests ================================================================
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

  // do a transaction to another server. the url can be specified as a query param
  // or as JSON.
  server.route({
    method: 'POST',
    path: '/downstream',
    handler: async function downstream (req, h) {
      const p = req.payload || {};
      if (!p.url && !req.query.url) {
        throw Boom.badRequest('no url')
      }

      const options = {
        method: p.method || 'get',
        url: p.url || req.query.url,
        headers: {
          'Content-Type': 'application/json'
        }
      }

      return axios(options)
        .then(res => {
          return res.data
        })
        .catch(e => {
          console.log('axios request error', e)
          return {error: e, message: e.message}
        })
    }
  })


  function makePrefix (URL) {
    return '--- response from ' + URL + ' ---\nheaders: '
  }

  //
  // now make a chained URL
  //
  server.route({
    method: 'GET',
    path: '/chain',
    handler: async function (req, h) {
      const url = req.query.target

      if (!url) {
        return 'this is the end!\n';
      }

      const options = {}
      // propagate the xtrace
      if (req.headers['X-Trace']) {
        options.headers = {'X-Trace': req.headers['X-Trace']}
      }

      // fetch the supplied url and
      return axios.get(url, options)
        .then(res => {
          const headers = JSON.stringify(res.headers);
          const body = JSON.stringify(res.data);
          return [makePrefix(url), headers, `\nbody: ${body}\n`].join('')
        })
    }
  })

  //
  // version of chain that uses request() instead of
  // http.request()
  //
  server.route({
    method: 'GET',
    path: '/chain2',
    handler: async function (req, h) {
      const request = require('request')
      const options = {
        url: url.parse(req.query.target),
        headers: {
          'user-agent': 'request'
        }
      }
      return new Promise((resolve, reject) => {
        function callback (err, response, body) {
          if (!err) {
            const p = makePrefix(req.query.target)
            const h = JSON.stringify(response.headers)
            resolve(p + h + '\nbody: ' + body + '\n')
          } else {
            throw err
          }
        }

        request(options, callback)
      })
    }
  })

  //==========================================================================
  //==========================================================================
  // application =============================================================
  //==========================================================================
  //==========================================================================

  // the angular app fetches / and uses the todo api.
  server.route({
    method: 'GET',
    path: '/',
    handler: {
      file: function (req) {
        return 'index.html';
      }
    }
  })

  // start the server and return it's promise
  return server.start().then(r => {
    return {
      server,
      httpStatus: undefined,
      httpsStatus: undefined,
    }
  })

}
