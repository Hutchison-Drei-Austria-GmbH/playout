import m3u8 from 'm3u8'
import fs from 'fs'
import path from 'path'

export function parseM3U8(file_path) {
  return new Promise((res, rej) => {
    let parser = m3u8.createStream();
    let readStream = fs.createReadStream(file_path);
    readStream.on('error', rej);
    readStream.pipe(parser);

    // Handle relative urls
    let basepath = path.dirname(file_path)
    parser.on('item', (item) => {
      let uri = item.get('uri')
      if (uri) {
        item.set('uri', path.join(basepath, uri))
      }
    })

    parser.on('m3u', res)
  });
}

export function createM3U8(version = 3) {
  let playlist = m3u8.M3U.create();
  playlist.set('version', version);
  return playlist;
}

export function playlistDuration(playlist) {
  return playlist.items.PlaylistItem.reduce(
    (sum, { properties }) => sum + properties.duration, 0);
}

// Bug in upstream dependency: not all exported attributes are accepted as input!
export function m3u8AttrPolyfill(attrs) {
  if ('resolution' in attrs && Array.isArray(attrs.resolution)) {
    attrs.resolution = attrs.resolution.join('x')
  }

  return attrs
}
