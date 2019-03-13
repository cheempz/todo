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
  }
}
