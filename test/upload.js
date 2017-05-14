const tape = require('tape')
const hyperdiscovery = require('hyperdiscovery')
const hypercore = require('hypercore')
const ram = require('random-access-memory')
const hyperupload = require('../')

tape('upload an archive to hyperupload and download it', function (t) {
  const opts = { valueEncoding: 'utf-8' }

  var uploader = hyperupload('hyperupload')
  var feed = hypercore((filename) => { return ram() }, opts)
  var sw = null

  hyperupload('hyperupload') // worker 1
  hyperupload('hyperupload') // worker 2

  feed.on('ready', () => {
    sw = hyperdiscovery(feed, { live: false, port: 3288 })
  })

  feed.append('hello')
  feed.append('hyperupload', function (err) {
    if (err) throw err

    let key = feed.key

    setTimeout(() => { // wait for connections to establish
      uploader.upload(feed, (err) => {
        if (err) return console.error(err)

        var feed2 = hypercore((filename) => { return ram() }, key, opts)

        feed2.on('ready', () => {
          hyperdiscovery(feed2, { live: false, port: 3288 })
        })

        // close sw to not upload from the person who upload
        sw.close(() => {
          feed2.download((err) => {
            t.error(err, 'no error')
            t.equal(feed.byteLength, feed2.byteLength)
            t.end(err)
            // TODO: close
            process.exit(0)
          })
        })
      })
    }, 300)
  })
})
