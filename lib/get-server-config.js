'use strict'

//
// provide functions in case addon is not loaded
//
const dummyAddon = {
  Config: {
    getVersionString () {
      return 'not-loaded'
    },
    getSettings () {
      return {}
    },
    getStats () {
      return {}
    }
  },
  version: 'not-loaded'
}

//
// provide a dummy ao as well
//
const ao = {
  sampleRate: 300000,
  traceMode: undefined,
  serviceKey: 'not in use',
  lastSettings: {},
  probes: {
    express: {}
  },
  addon: dummyAddon,
  version: 'not-loaded',
  requestStore: {
    get () {
      return undefined
    }
  },
  Span: {
    entrySpanEnters: 0,
    entrySpanExits: 0
  }
}

//
// start with a dummy ao
//
const config = {
  appoptics: 'dummy-appoptics',
  bindings: 'dummy-bindings',

  source: 'none',
  ao
}

const configuration = process.env.AO_BENCHMARK_REQUIRE

//
// the default is to load 'appoptics'
//
if (configuration === 'appoptics' || !configuration) {
  try {
    config.source = 'appoptics'
    config.ao = require('appoptics-apm')

    // handle pre 6.0.0 versions of appoptics-apm so they don't
    // result in NaN
    if (!('entrySpanEntries' in config.ao.Span)) {
      config.ao.Span.entrySpanEnters = 0
      config.ao.Span.entrySpanExits = 0
    }
    if (!config.ao.lastSettings) {
      config.ao.lastSettings = {}
    }
    if (!config.ao.control) {
      config.ao.control = {logging: {}}
    }

    config.appoptics = 'appoptics-apm'
    config.bindings = 'appoptics-bindings'
    // restore the dummy addon if it wasn't loaded with ao for any reason.
    if (!ao.addon) {
      config.bindings = 'dummy-bindings'
      ao.addon = dummyAddon
    }
  } catch (e) {
    console.warn('failed to load appoptics-apm')
    config.source =  'appoptics-failed'
  }

} else if (configuration !== 'none') {
  console.warn(`unknown AO_BENCHMARK_REQUIRE "${configuration}" using "none"`)
}

//
// now there's either a real agent, maybe without bindings, or no agent so set
// it up in the request base class.
//
module.exports = config
