'use strict'

const {version} = require('appoptics-apm/package.json');
const key = process.env.AO_TOKEN_STG;

module.exports = {
  enabled: true,
  hostnameAlias: '',
  domainPrefix: false,
  serviceKey: `${key}:ao-node-${version}`,
  insertTraceIdsIntoLogs: 'traced',
  probes: {
    fs: {
      enabled: true
    }
  }
};
