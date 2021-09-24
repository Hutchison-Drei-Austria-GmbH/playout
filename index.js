import path from 'path'

import {
  sleep,
  now,
  mod
} from './inc/helpers.js'

import {
  parseM3U8,
  createM3U8,
  playlistDuration,
  m3u8AttrPolyfill
} from './inc/m3u8.js';

import {
  mkdir,
  existsFile,
  linkFile,
  copyFile,
  writeFile,
  unlinkFile
} from './inc/fs.js'

export default async function HlsPlayout(sources, config = {}) {
  let last_timestamp = now();

  const {
    start_time = new Date(),

    live_path = "live/",
    live_max_segments = 4,
    live_max_stale_segments = 4,
    live_playlist_name = "hls.m3u8",
    live_layer_folder = "layer{}",
    live_segment_name = "hls_{}.ts",
    live_segment_type = "relative_symlink", // absolute_symlink, relative_symlink, hardlink, copy
    live_segment_missing = "ignore", // skip, fail, ignore

    debug = false,
  } = config;

  const debug_log = (...params) => debug && console.log(...params);

  if (sources.length === 0) {
    throw new Error("Provide at least one source.");
  }

  if (!(start_time instanceof Date) || !isFinite(start_time)) {
    throw new Error("Invalid start time.");
  }

  if (start_time > last_timestamp) {
    throw new Error("Start time cannot be set in future.");
  }

  if (!existsFile(live_path)) {
    await mkdir(live_path, true);
  }

  // save reference playlist metadata for offset counting
  let ref_playlists = [];
  let ref_playlist_push = (playlist) => {
    ref_playlists.push({
      duration: playlistDuration(playlist) * 1000,
      segments: playlist.items.PlaylistItem.length
    });
  };

  // use first playlist as reference
  let first_source = sources.shift();
  let master_playlist = await parseM3U8(first_source);
  debug_log("First source `" + first_source + "` will be used as reference source.");

  // parse layers
  let layers = [];
  if (master_playlist.items.StreamItem.length > 0) {
    let playlist = createM3U8();
    let index = 0;
    for (let {
      attributes: { attributes },
      properties: { uri }
    } of master_playlist.items.StreamItem) {
      let layer_folder = live_layer_folder.replace("{}", Number(index++));
      let layer_playlist_name = path.join(layer_folder, live_playlist_name);

      playlist.addStreamItem({ ...m3u8AttrPolyfill(attributes), uri: layer_playlist_name });
      layers.push({
        vod_playlist: await parseM3U8(uri),
        live_playlist: createM3U8(),
        layer_path: path.join(live_path, layer_folder),
        layer_playlist_path: path.join(live_path, layer_playlist_name),
      });
    }

    // list of layers in segments
    let live_playlist_path = path.join(live_path, live_playlist_name);
    await writeFile(live_playlist_path, playlist.toString());
  } else {
    layers.push({
      vod_playlist: master_playlist,
      live_playlist: createM3U8(),
      layer_path: live_path,
      layer_playlist_path: path.join(live_path, live_playlist_name),
    });
  }

  console.log("Found", layers.length, "layers.");
  ref_playlist_push(layers[0].vod_playlist);

  // append another sources to vod playlists
  for (let source of sources) {
    debug_log("Append source", source);

    if (!existsFile(source)) {
      throw new Error("Source `" + source + "` not found.");
    }

    let playlist = await parseM3U8(source);
    if (playlist.items.StreamItem.length !== master_playlist.items.StreamItem.length) {
      throw new Error("Layers count mismatch for `" + source + "`.");
    }

    // handle single layered playlists
    if (playlist.items.StreamItem.length === 0) {
      layers[0].vod_playlist.merge(playlist);
      ref_playlist_push(playlist);
      continue;
    }

    let i = 0;
    for (let {
      //attributes: { attributes },
      properties: { uri }
    } of playlist.items.StreamItem) {
      let vod_playlist = await parseM3U8(uri);
      // Add only first layer to ref playlist
      (i == 0) && ref_playlist_push(vod_playlist);
      // TODO: Find proper layer using attributes.
      layers[i++].vod_playlist.merge(vod_playlist);
    }
  }

  // use first layer as reference
  let playlist = layers[0].vod_playlist;

  // playlist segments metadata
  let playlist_duration = playlistDuration(playlist) * 1000;
  let segments_total = playlist.items.PlaylistItem.length;
  let segment_duration = playlist.properties.targetDuration;

  // get starting `start_offset` from sequence `playlist_duration`, that
  // started (or will start) at `start_time` relative to `last_timestamp`
  let start_offset = mod(last_timestamp - start_time, playlist_duration);
  // get total whole loops, that have been made until now
  let loops_total = Math.floor((last_timestamp - start_time) / playlist_duration);
  // get first segment ID, that should be played right now
  let segment_offset = 0;
  for (let { segments, duration } of ref_playlists) {
    if (start_offset - duration < 0) break;
    start_offset -= duration;
    segment_offset += segments;
  }
  segment_offset += Math.floor(start_offset / segment_duration / 1000);
  // get timestamp at which should have been first segment played
  let sync_timestamp = last_timestamp - mod(start_offset, segment_duration * 1000);

  // initial media sequence
  let media_sequence = (loops_total * segments_total) + segment_offset;
  let media_sequence_segment_offset = 0;

  // init live playlists
  layers.forEach(async ({ live_playlist, layer_path }) => {
    live_playlist.set('targetDuration', segment_duration);
    live_playlist.set('mediaSequence', media_sequence);

    // create layer folders
    if (!existsFile(layer_path)) {
      await mkdir(layer_path, true);
    }
  });

  // rewind segements back to start, where manifest should start
  let segment_id = mod(segment_offset - live_max_segments + 1, segments_total);
  let last_segment_id = mod(segment_id - 1, segments_total);

  // rewind timestamp back to start, when manifest should start
  let c_segment_id = segment_id;
  for (let i = 0; i < live_max_segments; i++) {
    c_segment_id = mod(c_segment_id + 1, segments_total);
    sync_timestamp -= layers[0].vod_playlist.items.PlaylistItem[c_segment_id].properties.duration * 1000
  }

  // stale segments left behind only because of cacheing
  const live_max_stale_segments_total = live_max_stale_segments * layers.length;
  let live_stale_segments = [];

  // loop through segments
  segments_loop:
  while (true) {
    debug_log("Timestamp    :", last_timestamp, "(sync", last_timestamp - sync_timestamp, "ms)");
    debug_log("Segment id   :", segment_id, "/", segments_total);
    let duration_ms;

    for (const {
      vod_playlist,
      live_playlist,
      layer_path,
      layer_playlist_path
    } of layers) {
      // get segment duration and url
      let { duration, uri, discontinuity } = vod_playlist.items.PlaylistItem[segment_id].properties;
      duration_ms = duration * 1000;
      debug_log("Segment src  :", duration, "sec, from", uri);
      debug_log("Segment id  :", segment_id, "/", segments_total);

      // set discontinuity
      if (segment_id !== last_segment_id + 1) {
        discontinuity = true;

        // console log new video
        let next_segment_id = mod(segment_id + 1, segments_total);
        let next_uri = vod_playlist.items.PlaylistItem[next_segment_id].properties.uri;
        console.log("New video:", next_uri, "Segment ID:", next_segment_id);
      }

      // handle not existing segments
      if (live_segment_missing != 'ignore' && !existsFile(uri)) {
        console.error("Segment `" + uri + "` not found!");

        if (live_segment_missing == 'skip') {
          console.error("Skipping...");

          // skip to next segment
          segment_id = mod(segment_id + 1, segments_total);
          continue segments_loop;
        }

        if (live_segment_missing == 'fail') {
          throw new Error("Segment `" + uri + "` not found!");
        }
      }

      // create segment link
      let segment_name = live_segment_name.replace("{}", Number(media_sequence + media_sequence_segment_offset));
      let segment_path = path.join(layer_path, segment_name);
      switch (live_segment_type) {
        case 'absolute_symlink':
          let uri_absolute = path.resolve(uri);
          await linkFile(uri_absolute, segment_path);
          break;
        case 'relative_symlink':
          let uri_relative = path.relative(layer_path, uri);
          await linkFile(uri_relative, segment_path);
          break;
        case 'hardlink':
          await linkFile(uri, segment_path, true);
          break;
        case 'copy':
          await copyFile(uri, segment_path);
          break;
        default:
          throw new Error("Unknown `live_segment_type`.");
      }

      // add segment to live playlist
      debug_log("Segment name :", segment_name);
      live_playlist.addPlaylistItem({
        date: new Date(sync_timestamp),
        discontinuity,
        duration,
        title: 'no desc',
        uri: segment_name,
      });

      // remove first segment from live playlist
      if (live_playlist.items.PlaylistItem.length > live_max_segments) {
        // segment is not needed for live playback anymore
        let segment_name = live_playlist.items.PlaylistItem[0].properties.uri;
        let segment_path = path.join(layer_path, segment_name);
        live_stale_segments.push(segment_path);

        live_playlist.removePlaylistItem(0);
        live_playlist.set('mediaSequence', media_sequence);
      }

      // cleanup stale segments
      while (live_stale_segments.length >= live_max_stale_segments_total) {
        let stale_semgent_path = live_stale_segments.shift();
        await unlinkFile(stale_semgent_path);
      }

      // warm startup - skip buffer
      if (media_sequence_segment_offset == live_max_segments - 1) {
        // update live playlist
        await writeFile(layer_playlist_path, live_playlist.toString());
      }
    }

    if (media_sequence_segment_offset == live_max_segments - 1) {
      ++media_sequence;

      // wait segment duration
      debug_log("Next segment :", sync_timestamp + duration_ms);
      debug_log("--------------");
      sleep(duration_ms - (last_timestamp - sync_timestamp));
      last_timestamp = now();
    } else {
      media_sequence_segment_offset++;
    }

    // next segment
    last_segment_id = segment_id;
    segment_id = mod(segment_id + 1, segments_total);
    sync_timestamp += duration_ms;
  }
}

/* TOOD: Cleanup before exit.
  Cleanup((eventType) => {
      let playlist_path = path.join(live_path, live_playlist_name);
      let playlist = await parseM3U8(playlist_path);
      for(let { properties } of  playlist.items.PlaylistItem){
        console.log("removing", properties.uri);
        await unlink(properties.uri);
      }

      await unlink(playlist_path);
    });
  });
*/
