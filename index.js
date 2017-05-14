const swarm = require('discovery-swarm')
const worker = require('./lib/worker')

module.exports = Hyperupload

function Hyperupload (key) {
  if (!(this instanceof Hyperupload)) return new Hyperupload(key)

  var self = this

  this.connections = [] // all connections in the hyperupload swarms
  this.sw = null

  joinNetwork(key)

  function joinNetwork (key) {
    self.sw = swarm()

    self.sw.on('connection', (connection, info) => {
      self.connections.push(connection)
      // console.log('connected peers to ' + key + ' : ', self.sw.connected)

      connection.on('data', (data) => self.ondata(data, connection, info))

      connection.on('close', () => {
        // delete connection
        // console.log('connection closed')
        let i = self.connections.indexOf(connection)
        if (i > -1) {
          let last = self.connections.pop()
          if (last !== connection) self.connections[i] = last
        }
      })
    })

    // join your hyperupload swarm
    // console.log('joining ' + key + ' network')
    self.sw.join(key)
  }
}

Hyperupload.prototype.upload = function (archive, cb) {
  if (!this.connections.length) throw new Error('no connections')

  var uploaded = []

  archive.on('upload', (index, data) => {
    uploaded[index] = true
    console.log('block ' + index + '/' + (archive.length - 1) + ' uploaded.')
    if (uploaded.every((e) => e === true)) {
      archive.close((err) => {
        if (err) return cb(err)
        return cb()
      })
    }
  })

  for (let block = 0; block < archive.length; block++) {
    uploaded[block] = false
  }

  for (let block = 0; block < archive.length; block++) {
    if (uploaded[block] === true) continue // already uploaded

    let rand = Math.floor(Math.random() * (this.connections.length))
    let connection = this.connections[rand]

    let blocks = { start: block, end: block + 1 }
    uploadBlocks(archive.key.toString('hex'), blocks, connection)
  }
}

function uploadBlocks (key, blocks, connection) {
  console.log('uploadBlocks', blocks)
  let msg = { cmd: 'pin', key: key, blocks: blocks }
  connection.write(Buffer.from(JSON.stringify(msg) + '\n'))
}

Hyperupload.prototype.ondata = function (data, connection, info) {
  // console.log('received msg from peer', info.id.toString('hex'))
  let strings = data.toString().split('\n')
  strings.pop()
  let messages = strings.map((s) => { return JSON.parse(s) })
  messages.forEach(msg => { this._processMsg(msg, connection) })
}

Hyperupload.prototype._processMsg = function (msg, connection) {
  switch (msg.cmd) {
    case 'pin':
      // console.log('received pin request!')
      worker.pin(msg.key, msg.blocks)
      break
    default:
  }
}

Hyperupload.prototype.close = function () {
  worker.closeAll()
}
