const tape = require('tape')
const hyperdiscovery = require('hyperdiscovery')
const hypercore = require('hypercore')
const ram = require('random-access-memory')
const hyperupload = require('../')

tape('upload an archive to hyperupload and download it', function (t) {
  const opts = { sparse: true }

  var uploader = hyperupload('hyperupload', { discoveryPort: 2999 })
  var feed = hypercore((filename) => { return ram() }, opts)
  var sw = null

  hyperupload('hyperupload', { discoveryPort: 3000 }) // worker 1
  hyperupload('hyperupload', { discoveryPort: 3001 }) // worker 2

  feed.on('ready', () => {
    sw = hyperdiscovery(feed, { live: false, port: 3300 })
  })

  feed.append('hello')
  feed.append('hyperupload', function (err) {
    if (err) throw err
    feed.close()

    let key = feed.key

    setTimeout(() => { // wait for connections to establish
      uploader.upload(feed, (err) => {
        if (err) return console.error(err)

        sw.close(() => {
          var feed2 = hypercore((filename) => { return ram() }, key, opts)

          feed2.on('ready', () => {
            hyperdiscovery(feed2, { live: false, port: 3301 })
            // close sw to not upload from the person who uploaded
          })

          feed2.on('download', (index, data) => {
            console.log('downloaded block', index)
          })

          feed2.on('sync', () => {
            console.log('synced!')
            t.error(err, 'no error')
            t.equal(feed.byteLength, feed2.byteLength)
            t.end(err)
            process.exit(0)
          })

          feed2.download(() => {
            if (err) return console.log(err)
            console.log('downloaded!')
          })
        })
      })
    }, 1000)
  })
})
