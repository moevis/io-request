/**
 * Created by wolfman on 16-12-12.
 */
"use strict"

const utils = require('./utils')

const nextClientId = utils.generateCounter()
const nextMessageId = utils.generateCounter()
const createPromise = utils.createPromise

const IORequestError = require('./error')

module.exports = class IORequestServer {

  constructor (io) {
    this.io = io

    this.methods = {}
    this.unresponsed = {}

    this.io.on('connection', socket => {

      socket.on('io-connect', () => {
        const client_id = nextClientId()
        socket.emit('io-connect', {client_id})
        socket.client_id = client_id
      })

      socket.on('io-request', ({message_id, method, data}) => {
        const handler = this.methods[method]
        if (handler) {
          handler({ socket, data,
            response: (_data) =>
              socket.emit('io-response', {success: true, message_id, data: _data}),
            reject: (error) =>
              socket.emit('io-response', {success: false, message_id, data: error})
          })
        } else {
          socket.emit('io-response', {success: false, message_id, data: IORequestError['NOT_FOUND']})
        }

      })

      socket.on('io-response', ({success, message_id, data}) => {
        const promise = this.unresponsed[message_id]
        if (promise) {
          clearTimeout(promise.timer)
          if (success) {
            promise.resolve(data)
          } else {
            promise.reject(new IORequestError(data))
          }
          delete this.unresponsed[message_id]
        }
      })

      socket.ioRequest = (...args) => this.ioRequest(socket, ...args)
    })

  }

  handle (method, handler) {
    this.methods[method] = handler
    return this
  }

  remove (method) {
    delete  this.methods[method]
    return this
  }

  ioRequest (socket, {method, data = null, timeout = 0}) {
    const message_id = nextMessageId()
    const promise = createPromise(() => {
        socket.emit('io-request', {message_id, method, data})
    })

    if (timeout) {
      promise.timer = setTimeout(() => {
        promise.reject(new IORequestError(IORequestError['TIMEOUT']))
        delete this.unresponsed[message_id]
      }, timeout)
    }

    this.unresponsed[message_id] = promise
    promise.message_id = message_id

    return promise
  }

}
