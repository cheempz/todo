'use strict'
/**
 * @license
 * Everything in this repo is MIT License unless otherwise specified.
 *
 * Copyright (c) Addy Osmani, Sindre Sorhus, Pascal Hartig, Stephen  Sawchuk, Google, Inc.
 * Copyright (c) Bruce MacNaughton, Solarwinds, Inc.
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

const {argv, showHelp} = require('./lib/get-cli-options')
if (argv.help) {
  showHelp()
  process.exit(1)
}

// this sets up with either a real appoptics-apm or a dummy appoptics-apm
const serverConfig = require('./lib/get-server-config')
const ao = serverConfig.ao

// standard require files
const fs = require('fs')

// request wraps the individual request constructors and fills in ao for them
// there's certainly a better way to do this but i haven't figured it out yet.
const Requests = require('./lib/requests')(ao)
const accounting = new Requests.Accounting()

// get host name for metrics and general status/config
let hostname = fs.readFileSync('/etc/hostname', 'utf8')
if (hostname[hostname.length - 1] === '\n') {
  hostname = hostname.slice(0, -1)
}

const version = require('./package.json').version

//==============================================================================
// process command line options ================================================
//==============================================================================

function defaultMissing (host, port) {
  // maybe they just gave a port?
  if (typeof host === 'number') {
    return `localhost:${host}`
  }
  // if no port add the default
  if (!~host.indexOf(':')) {
    return `${host}:${port}`
  }
  // nothing to do
  return host
}
// for backwards compability look for be_ip before db-ip
const mongoHost = defaultMissing(argv.be_ip || argv.d, 27017)

// for backwards compatibility look for fe_ip before ws-ip
const webServerHost = defaultMissing(argv.fe_ip || argv.w, 8088)

// get log setttings
const log = argv.log

//
// appoptics settings
//

// use percent rate from r first, then rate as fraction of 1000000
// and finally default to 1000000.
const rate = 'r' in argv ? argv.r * 10000 : argv.rate || 1000000;
ao.sampleRate = rate;


const modeMap = {0: 0, 1: 1, never: 0, always: 1, disabled: 0, enabled: 1}
if ('trace-mode' in argv && argv.t in modeMap) {
  ao.traceMode = argv.t
}

//
// finally host metrics configuration
//

const minutesToMs = m => m * 60000
//
// if supplied, metrics must be a valid appoptics token (not service key) or metrics
// won't be collected.
//
if (argv.metrics) {
  const Metrics = require('./lib/metrics')

  // set key, endpoint, and default tags
  const m = new Metrics(
    argv.metrics,
    'https://api.appoptics.com/v1/measurements',
    {image_name: `${hostname}-${ao.version}`}
  )

  const ctx = m.sendOnInterval(5000, () => {
    return {
      metrics: {
        'todo.memory.rss': process.memoryUsage().rss,
        'todo.cpu.perTransaction': accounting.get().cpuUserPerTx[minutesToMs(1)],
        'todo.apm.lastRate': accounting.get().lastRate,
      }
    }
  })

  // could work on restarting but not sure why
  ctx.promise.catch(e => {
    console.log(e)
  })
}

//==============================================================================
// set up the framework ========================================================
//==============================================================================

const staticFiles = {
  '/js': '/js',
  '/bower_components': '/bower_components'
}

// get the lower level api that knows nothing of web server frameworks
const todoapi = new Requests.TodoApi(mongoHost)

const options = {
  staticFiles,
  Requests,
  accounting,
  todoapi,
}

const frameworkSelection = argv.f || 'express'
let framework
let server
let settings

if (frameworkSelection === 'express') {
  framework = require('./frameworks/express')
  settings = framework.settings

  server = framework.init(options)
} else if (frameworkSelection === 'koa') {
  framework = require('./frameworks/koa')
  settings = framework.settings

  server = framework.init(options)
} else {
  console.error(`invalid framework ${argv.f}`)
  showHelp()
  process.exit(1)
}

settings.log = log

//const methodOverride = require('method-override'); // simulate DELETE and PUT (express4)

/*

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

//
// appoptics settings
//
let rate = ('rate' in argv) ? +argv.rate : 1000000

// also allow shorthand -r which does 0-100 (interpreted as percent)
// this overrides a --rate setting.
if ('r' in argv) rate = +argv.r * 10000
ao.sampleRate = rate

const minutesToMs = m => m * 60000
//
// if supplied metrics must be a valid appoptics token (not service key)
//
if (argv.metrics || argv.m) {
  const Metrics = require('./lib/metrics')

  // set key, endpoint, and default tags
  const m = new Metrics(
    argv.metrics,
    'https://api.appoptics.com/v1/measurements',
    {image_name: `${hostname}-${ao.version}`}
  )

  const ctx = m.sendOnInterval(5000, () => {
    return {metrics: {
      'todo.memory.rss': process.memoryUsage().rss,
      'todo.cpu.perTransaction': accounting.get().cpuUserPerTx[minutesToMs(1)],
      'todo.apm.lastRate': accounting.get().lastRate,
    }}
  })

  // could work on restarting but not sure why
  ctx.promise.catch(e => {
    console.log(e)
  })
}
// */


//==============================================================================
//==============================================================================
// get the server running ======================================================
//==============================================================================
//==============================================================================

// taken from appoptics test suite. these are not valid for any real
// servers - only used for local testing.
const sslInfo = { // eslint-disable-line
  key: '-----BEGIN RSA PRIVATE KEY-----\nMIICXQIBAAKBgQCsJU2dO/K3oQEh9wo60VC2ajCZjIudc8cqHl9kKNKwc9lP4Rw9\nKWso/+vHhkp6Cmx6Cshm6Hs00rPgZo9HmY//gcj0zHmNbagpmdvAmOudK8l5Npzd\nQwNROKN8EPoKjlFEBMnZj136gF5YAgEN9ydcLtS2TeLmUG1Y3RR6ADjgaQIDAQAB\nAoGBAJTD9/r1n5/JZ+0uTIzf7tx1kGJh7xW2xFtFvDIWhV0wAJDjfT/t10mrQNtA\n1oP5Fh2xy9YC+tZ/cCtw9kluD93Xhzg1Mz6n3h+ZnvnlMb9E0JCgyCznKSS6fCmb\naBz99pPJoR2JThUmcuVtbIYdasqxcHStYEXJH89Ehr85uqrBAkEA31JgRxeuR/OF\n96NJFeD95RYTDeN6JpxJv10k81TvRCxoOA28Bcv5PwDALFfi/LDya9AfZpeK3Nt3\nAW3+fqkYdQJBAMVV37vFQpfl0fmOIkMcZKFEIDx23KHTjE/ZPi9Wfcg4aeR4Y9vt\nm2f8LTaUs/buyrCLK5HzYcX0dGXdnFHgCaUCQDSc47HcEmNBLD67aWyOJULjgHm1\nLgIKsBU1jI8HY5dcHvGVysZS19XQB3Zq/j8qMPLVhZBWA5Ek41Si5WJR1EECQBru\nTUpi8WOpia51J1fhWBpqIbwevJ2ZMVz0WPg85Y2dpVX42Cf7lWnrkIASaz0X+bF+\nTMPuYzmQ0xHT3LGP0cECQQCqt4PLmzx5KtsooiXI5NVACW12GWP78/6uhY6FHUAF\nnJl51PB0Lz8F4HTuHhr+zUr+P7my7X3b00LPog2ixKiO\n-----END RSA PRIVATE KEY-----',
  cert: '-----BEGIN CERTIFICATE-----\nMIICWDCCAcGgAwIBAgIJAPIHj8StWrbJMA0GCSqGSIb3DQEBCwUAMEUxCzAJBgNV\nBAYTAkFVMRMwEQYDVQQIDApTb21lLVN0YXRlMSEwHwYDVQQKDBhJbnRlcm5ldCBX\naWRnaXRzIFB0eSBMdGQwHhcNMTQwODI3MjM1MzUwWhcNMTQwOTI2MjM1MzUwWjBF\nMQswCQYDVQQGEwJBVTETMBEGA1UECAwKU29tZS1TdGF0ZTEhMB8GA1UECgwYSW50\nZXJuZXQgV2lkZ2l0cyBQdHkgTHRkMIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKB\ngQCsJU2dO/K3oQEh9wo60VC2ajCZjIudc8cqHl9kKNKwc9lP4Rw9KWso/+vHhkp6\nCmx6Cshm6Hs00rPgZo9HmY//gcj0zHmNbagpmdvAmOudK8l5NpzdQwNROKN8EPoK\njlFEBMnZj136gF5YAgEN9ydcLtS2TeLmUG1Y3RR6ADjgaQIDAQABo1AwTjAdBgNV\nHQ4EFgQUTqL/t/yOtpAxKuC9zVm3PnFdRqAwHwYDVR0jBBgwFoAUTqL/t/yOtpAx\nKuC9zVm3PnFdRqAwDAYDVR0TBAUwAwEB/zANBgkqhkiG9w0BAQsFAAOBgQBn1XAm\nAsVdXKr3aiZIgOmw5q+F1lKNl/CHtAPCqwjgntPGhW08WG1ojhCQcNaCp1yfPzpm\niaUwFrgiz+JD+KvxvaBn4pb95A6A3yObADAaAE/ZfbEA397z0RxwTSVU+RFKxzvW\nyICDpugdtxRjkb7I715EjO9R7LkSe5WGzYDp/g==\n-----END CERTIFICATE-----'
}

let promises
let port
let host
let httpsPort
if (!argv.heroku) {
  host = webServerHost.split(':')
  port = +host[1]
  host = host[0]

  const p1 = new Promise((resolve, reject) => {
    function x (...args) {
      resolve(args)
    }
    server.listen(port, host).on('listening', x).on('error', x)
  })
  // hardcode the https port
  httpsPort = 8443
  const p2 = new Promise((resolve, reject) => {
    function x (...args) {
      resolve(args)
    }
    server.listen(httpsPort).on('listening', x).on('error', x)
  })
  promises = [p1, p2]
} else {
  port = process.env.PORT
  const p1 = new Promise((resolve, reject) => {
    function x (...args) {
      resolve(args)
    }
    server.listen(port, host).on('listening', x).on('error', x)
  })
  promises = [p1]
}

Promise.all(promises).then(r => {
  // check https
  if (r.length === 2) {
    if (r[1] instanceof Error) {
      console.log(r[1])
      httpsPort = 'NA'
    }
  }
  if (r[0] instanceof Error) {
    throw r[0]
  }

  //const isatty = require('tty').isatty
  //const tty = [isatty(process.stdout.fd) ? 'on a tty' : 'not a tty']
  const https = '(https:' + httpsPort + ')'
  const line = `todo ${version} listening on ${webServerHost} ${https} log: ${log}`
  const dashes = Buffer.alloc(line.length, '-').toString()
  console.log(dashes)
  console.log(line)

  console.log(`active: ${serverConfig.appoptics}, bindings: ${serverConfig.bindings}`)

  const av = ao.version
  const bv = ao.addon.version
  const ov = ao.addon.Config.getVersionString()
  console.log(`apm ${av}, bindings ${bv}, oboe ${ov}`)

  console.log(`sample rate ${ao.sampleRate}, sampleMode ${ao.traceMode}`)
  console.log(dashes)

  accounting.startIntervalAverages()

})
