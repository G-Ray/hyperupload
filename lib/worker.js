const ram = require('random-access-memory')
const hyperdiscovery = require('hyperdiscovery')
const hypercore = require('hypercore')

module.exports = {
  pin: pin,
  closeAll: closeAll
}

var feedCreating = []
var feeds = [] // pinned feeds
var swarms = []
var jobs = []

function download (feed, blocks) {
  feed.download(blocks, (err, data) => {
    if (err) return console.error(err)
    console.log(feed.key.toString('hex'), 'blocks', blocks, 'downloaded')
  })
}

setInterval(processJobs, 1000)

function processJobs () {
  // console.log(feeds)
  for (let j in jobs) {
    let job = jobs[j]
    if (feeds[job.key]) {
      download(feeds[job.key], job.blocks)
      delete jobs[j]
    }
  }
}

function pin (key, blocks) {
  jobs.push({key: key, blocks: blocks})

  if (feeds[key] || feedCreating[key]) return // feed created or creating

  createFeed(key)
}

function createFeed (key) {
  feedCreating[key] = true

  // create the feed before downloading blocks
  let feed = hypercore((filename) => { return ram() }, key, {
    sparse: true
  })

  feed.on('ready', (err) => {
    if (err) throw err

    // add to created feeds
    feeds[key] = feed
    delete feedCreating[key]

    // join swarm
    let sw = hyperdiscovery(feed, { live: false })
    swarms[key] = sw

    sw.on('connection', (peer, type) => {
      // console.log('connected to', sw.connections.length, 'peers')
      // peer.on('close', () => console.log('peer disconnected'))
    })

    sw.on('error', (err) => console.error(err))
  })

  feed.on('error', (err) => console.error(err))
}

function closeAll () {
  feeds.forEach((feed) => feed.close())
  swarms.forEach((sw) => sw.close())
}
