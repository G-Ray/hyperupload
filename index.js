const swarm = require('discovery-swarm')
const hypercore = require('hypercore')
const hyperdiscovery = require('hyperdiscovery')
const ram = require('random-access-memory')
// const worker = require('./lib/worker')

module.exports = Hyperupload

function Hyperupload (key, opts) {
  if (!(this instanceof Hyperupload)) return new Hyperupload(key, opts)

  var self = this

  if (!opts) opts = {}

  this.connections = [] // all connections in the hyperupload swarms
  this.sw = null
  this.feedCreating = []
  this.feeds = [] // pinned feeds
  this.swarms = []
  this.jobs = []
  this.discoveryPort = opts.discoveryPort

  joinNetwork(key)
  setInterval(() => this._processJobs(), 1000)

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

  let i = 0

  for (let block = 0; block < archive.length; block++) {
    if (uploaded[block] === true) continue // already uploaded

    let connection = this.connections[i]
    let blocks = { start: block, end: block + 1 }
    uploadBlocks(archive.key.toString('hex'), blocks, connection)

    if (i < this.connections.length) i++
    else i = 0
  }
}

function uploadBlocks (key, blocks, connection) {
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
      this._pin(msg.key, msg.blocks)
      break
    default:
  }
}

Hyperupload.prototype._processJobs = function () {
  for (let j in this.jobs) {
    let job = this.jobs[j]
    if (this.feeds[job.key]) {
      download(this.feeds[job.key], job.blocks)
      delete this.jobs[j]
    }
  }

  var nodeId = this.sw.id.toString('hex')

  function download (feed, blocks) {
    feed.download(blocks, (err, data) => {
      if (err) return console.error(err)
      console.log(nodeId, 'downloaded blocks', blocks)
    })
  }
}

Hyperupload.prototype._pin = function (key, blocks) {
  this.jobs.push({key: key, blocks: blocks})

  if (this.feeds[key] || this.feedCreating[key]) return // feed created or creating

  this.createFeed(key)
}

Hyperupload.prototype.createFeed = function (key) {
  this.feedCreating[key] = true

  // create the feed before downloading blocks
  let feed = hypercore((filename) => { return ram() }, key, {
    sparse: true
  })

  feed.on('ready', (err) => {
    if (err) throw err

    // join swarm
    let sw = hyperdiscovery(feed, { live: false, port: this.discoveryPort })

    // add to created feeds
    this.swarms[key] = sw
    this.feeds[key] = feed
    delete this.feedCreating[key]

    sw.on('error', (err) => console.error(err))
  })

  feed.on('error', (err) => console.error(err))
}
