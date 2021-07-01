# Playout (VOD HLS loop)

Create 24/7 live playout channel from multiple multi-layered VOD HLS media files.

## Prerequisites for media files

Every media should have same layers in specified order, same segment length and use same codecs. Only first layer of first media will be used as reference playlist and all other playlists must correspond to that. This rule applies per channel. Other channels (such as HD or 4K) can have independent settings.

# Example using docker

```sh
docker build -t vod-hls-loop .

docker run -d \
  --name "vod-hls1" \
  --restart="unless-stopped" \
  -v "./media:/media" \
  -e "CH_START_TIME=2021-05-31 00:00" \
  -e "CH_LIVE_PATH=/media/live/hls1" \
  -e "CH_SOURCES=/media/sources/hls1/index.m3u8 /media/hls2/index.m3u8 ..." \
  -e "CH_DEBUG=true" \
  vod-hls-loop;
```

## Webserver

All channels are looped in a folder, but they should be available to a streamer via URL. We will use nginx for that:

```sh
docker run -d \
  --name "vod-webserver" \
  --restart="unless-stopped" \
  -v "./media:/media/live" \
  -v "./nginx/nginx.conf:/etc/nginx/nginx.conf" \
  nginx;
```

# Example using docker-compose

```yml
version: '3.7'

services:
  vod-hls1:
    build: ./
    volumes:
      - "./media:/media"
    environment:
      CH_LIVE_PATH: '/media/live/hls1'
      CH_LIVE_SEGMENT_TYPE: 'relative_symlink'
      CH_START_TIME: '2021-05-31 00:00'
      CH_SOURCES: |
        /media/sources/hls2/index.m3u8
        /media/sources/hls3/index.m3u8
        ...
      CH_DEBUG: 'true'
```

Looping channels will be in `./media/live` and sources in `./media/sources`.

## Channel Name
Channel name creates a new folder in `./media/live` and inside is a channel placed.

## Start Time
Every channel must have defined start time. This time is reference time to point, where channel started in order to synchronize multiple running instances. Additionally, it is used as media sequence for playlists. This time **CAN NOT** be set in future.

## Media Input
Multiple media input can be passed to one channel. They will be sequentially looped in order, as specified. Input can be single layered HLS playlist consisting of segments or one master playlist containing multiple layers.

# Usage as module

This program can be used as module in other Node.js projects.

Example:
```js
import HlsPlayout from './index.js'

HlsPlayout([
  "vod1/playlist.m3u8",
  "vod2/playlist.m3u8",
  "vod3/playlist.m3u8",
], {
  start_time: new Date("2021-05-31 00:00"),

  live_path: "live/",
  live_max_segments: 4,
  live_max_stale_segments: 4,
  live_playlist_name: "hls.m3u8",
  live_layer_folder: "hls{}",
  live_segment_name: "hls_{}.ts",
  live_segment_type: "relative_symlink", // absolute_symlink, relative_symlink, hardlink, copy
  live_segment_missing = "ignore", // skip, fail, ignore

  debug = false,
});
```

## Configs
Following configs can be adjusted:

 * `start_time` - For channel synchronization purposes, must be `new Date()` instance.
 * `live_path` - Directory, where live channels will be played.
 * `live_max_segments` - Maximum of segments in live playlist.
 * `live_max_stale_segments` - Maximum of segments kept on the disk after they expired.
 * `live_playlist_name` - Name of channel playlist.
 * `live_layer_folder` - Name of layer folder, where `{}` will be replaced by layer index.
 * `live_segment_name` - Name of channel segments, where `{}` will be replaced by segment id.
 * `live_segment_type` - Type of segment, whether it should be `absolute_symlink`, `relative_symlink`, `hardlink` or `copy`.
 * `live_segment_missing` - What to do in case of segment is not found:
    * `skip` all invalid (this could lead to synchronization inaccuracy),
    * `fail` and stop channel,
    * or `ignore` and include invalid segment in playlist.
 * `debug` - Show extended logs (for debugging or monitoring purposes).

**!!NOTICE!!**

This function is blocking event loop thus must be called in dedicated thread.

# Roadmap

- [x] Single channel.
- [x] Start time synchronization.
- [x] Missing segment validation (TODO: On startup).
- [x] Warm startup (all segments at once).
- [x] Start time synchronization, when time set in future.
- [x] Multiple layers.
- [x] Multiple videos in source playlist.
- [x] Start time synchronization, with respect to multiple playlists.
- [x] Constant segment names & media sequence.
- [ ] Warm load stale segments after startup.
- [ ] On SIGINT - clear files.
- [ ] On SIGHUP (or other) - reload configuration.
