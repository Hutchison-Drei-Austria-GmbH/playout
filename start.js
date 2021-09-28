import HlsPlayout from './index.js'

const live_path = process.env.CH_LIVE_PATH ?? '/live'
const live_segment_type = process.env.CH_LIVE_SEGMENT_TYPE ?? 'relative_symlink' // absolute_symlink, relative_symlink, hardlink, copy
const start_time = process.env.CH_START_TIME ?? 'now'
const sources = process.env.CH_SOURCES.split(/\s+/).filter(Boolean)
const debug = process.env.CH_DEBUG == 'true'
const live_discontinuity_sequence = process.env.CH_LIVE_DISCONTINUTIY_SEQUENCE == 'true'

HlsPlayout(sources, {
  start_time: new Date(start_time),

  live_path,
  live_max_segments: 30,
  live_max_stale_segments: 30,
  live_playlist_name: 'index.m3u8',
  live_layer_folder: 'hls{}',
  live_segment_name: 'hls_{}.ts',
  live_segment_type,
  live_discontinuity_sequence,

  debug,
}).catch(console.error);
