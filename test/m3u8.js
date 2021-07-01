import { equal } from 'assert';

import {
  parseM3U8,
  createM3U8,
  playlistDuration
} from '../inc/m3u8.js';

describe('m3u8', function () {
  it('should parse segments playlist', async function () {
    let m3u8 = await parseM3U8("./test/files/segments.m3u8");

    equal(m3u8.items.PlaylistItem.length, 367);
    equal(m3u8.items.StreamItem.length, 0);
    equal(m3u8.items.IframeStreamItem.length, 0);

    equal(m3u8.properties.version, 3);
    equal(m3u8.properties.playlistType, 'VOD');
  });

  it('should create segments playlist', async function () {
    let m3u8 = createM3U8();
    m3u8.addPlaylistItem({ duration: 10, uri: "test1" });
    m3u8.addPlaylistItem({ duration: 15, uri: "test2" });

    equal(m3u8.items.PlaylistItem.length, 2);
    equal(m3u8.items.PlaylistItem[1].properties.duration, 15);
  });

  it('should count correct playlist duration', async function () {
    let m3u8 = await parseM3U8("./test/files/segments.m3u8");
    let duration = playlistDuration(m3u8);
    equal(duration, 1466.48);
  });
});
