'use strict'

module.exports = {
  shrink (string, n = 5) {
    if (n < 3) {
      n = 3;
    }
    // make it odd
    n |= 1;

    if (string instanceof Buffer) {
      string = string.toString('utf8')
    }

    const lines = string.split('\n')
    if (lines.length < n) {
      return string
    }

    let count = lines.length - (n - 1);
    if (lines[lines.length - 1] === '') {
      count -= 1;
    }

    lines.splice(Math.trunc(n / 2), count, '...')
    return lines.join('\n')
  },

  getLogOptions (string, defaults) {
    // make all three parts exist.
    const parts = string.split(':');
    if (!parts.length || !defaults[parts[0]]) {
      throw new TypeError(`${parts[0]} is not a valid logger`);
    }
    // default them.
    const reqLogger = parts[0];
    let reqLogFormat = defaults[reqLogger].req;
    let intLogFormat = defaults[reqLogger].int;

    if (parts.length >= 2) {
      reqLogFormat = parts[1];
    }
    if (parts.length >= 3) {
      intLogFormat = parts[2];
    }

    return {reqLogger, reqLogFormat, intLogFormat};
  }

}
