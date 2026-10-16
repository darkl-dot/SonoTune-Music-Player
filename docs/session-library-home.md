# Returning to your music — v1 behavior

## Startup and persistence

Choose Home, All tracks, Artists, Albums, Genres, Favorites, Playlists, a specific
playlist, or the last opened section. A removed playlist falls back to Home.

Restore the selected song, exact queue, original shuffle order, position, volume,
shuffle, and one of the four playback modes. Always start paused. Do not open a decoder
or audio device and do not record a listening event before explicit Play. Playback
checkpoints are written every five seconds during playback, on important changes,
and at normal shutdown. An abnormal termination may lose recent progress.

Clicking the bottom player's title opens All tracks, clears search/group filters,
switches to list view, scrolls to the song, focuses it, and highlights it without playing.

## Queue

Support dragging, keyboard-friendly move buttons, removal of individual songs, and
clearing upcoming songs. Keep the selected song in the queue. Editing must not replace
its source, change the position, or toggle pause. Choosing a row plays that song in the
existing queue order. Reject stale reorder requests rather than silently dropping songs.

## Scanning

Check added folders on every startup. Optionally schedule additional scans using a
whole-number interval from 1 to 10080 minutes. The native worker sleeps between runs,
works independently of WebView visibility, and prevents overlapping scans. Shutdown
cancels scanning. Parse metadata for new/changed files, preserve concurrent favorite
changes, and mark missing files unavailable. A disconnected root must not clear its
library entries. Completion updates the visible library.

The browser preview does not claim persistent access to previously selected folders.

## Home

Allow the banner to be hidden. Show pinned songs below the three listening cards,
with artwork, title, artist, and optional caption. Add through the searchable picker
or a track's context menu, edit/clear the caption, and unpin. Keep pins locally;
removing a track from the library also removes its pin.

## Compatibility and checks

Preserve older SQLite libraries and appearance preferences. Provide RU/EN text.
Cover session/queue behavior with a real decoder and silent mixer, plus scheduling,
preferences, pins, revealing offscreen songs, regression, and packaging checks.
