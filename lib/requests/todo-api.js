'use strict'

const ServerRequest = require('../server-request')


const mongoose = require('mongoose')
const version = require('mongoose/package.json').version
const semver = require('semver')

// mongoose's built in promises are deprecated
mongoose.Promise = Promise

//
// the config manipulation class
//
class TodoApi extends ServerRequest {
  constructor (mongoHost) {
    super()
    this.connectString = undefined
    this.db = undefined
    this.connect(mongoHost)

    //
    // define mongo model
    //
    this.Todo = mongoose.model('Todo', {
      title: String,
      completed: Boolean
    })
  }

  describe () {
    return 'implement the todo API'
  }

  // allow opening later if desired
  connect (mongoHost) {
    if (mongoHost) {
      this.connectString = `mongodb://${mongoHost}/my_database`
      this.openMongoDB()
    }
  }

  create (title, completed) {
    return new Promise((resolve, reject) => {
      this.Todo.create({title, completed}, (err, todo) => {
        if (err) {
          reject(err)
        } else {
          resolve(todo)
        }
      })
    })
  }

  delete (id) {
    const item = id === '*' ? {} : {_id: id}
    return new Promise((resolve, reject) => {
      this.Todo.remove(item, (err, r) => {
        if (err) {
          reject(err)
        } else {
          resolve(r.result)
        }
      })
    })
  }

  getAll () {
    return new Promise((resolve, reject) => {
      this.Todo.find((err, todos) => {
        if (err) {
          reject(err)
        } else {
          resolve(todos)
        }
      })
    })
  }

  get (id) {
    return new Promise((resolve, reject) => {
      this.Todo.findById(id, (err, todo) => {
        if (err) {
          reject(err)
        } else {
          resolve(todo)
        }
      })
    })
  }

  save (todo) {
    return new Promise((resolve, reject) => {
      todo.save(err => {
        if (err) {
          reject(err)
        } else {
          resolve(todo)
        }
      })
    })
  }

  update (id, title, completed) {
    return this.get(id).then(todo => {
      todo.title = title
      todo.completed = completed
      return todo
    }).then(todo => todo.save())
  }

  openMongoDB () {
    const opts = {
      useMongoClient: true,
      reconnectTries: 10,
      reconnectInterval: 2000
    }

    if (semver.gte(version, '5.0.0')) {
      mongoose.connect(this.connectString, opts).then(db => {
        this.db = db
        this.connectMechanism = 'promise'
      }).catch(err => {
        throw err
      })
    } else if (semver.gte(version, '4.0.0')) {
      mongoose.connect(this.connectString, opts, function (err) {
        if (err) {
          throw err
        }
      }).then(db => {
        this.db = db
        this.connectMechanism = 'promise'
      })
    } else if (semver.gte(version, '3.0.0')) {
      mongoose.connect(this.connectString, opts, function (err) {
        if (err) {
          throw err
        } else {
          this.connectMechanism = 'callback'
        }
      })
    }

  }

}

module.exports = TodoApi

