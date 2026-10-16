# Changelog

## v1.1.0 — 2026-10-16

- Gapless playback, enabled by default with a persistent Settings switch in English and Russian.
- One streaming decoder is prepared ahead of time; track transitions use the same output sink.
- MP3 encoder delay and padding from Xing/LAME, Opus pre-skip, and M4A AAC edit-list/iTunSMPB trimming.
- M4A (AAC-LC and ALAC) and ADTS AAC scanning, playback, metadata, artwork, and tag editing with backups.
- Queue edits replace the pending track without restarting the song; repeat modes and session restoration remain intact.
- Fixed initial format handling and continuous resampling for mixed-rate and mixed-channel queues.
- Added synthetic fixtures and sample-level transition, seek, format, and metadata-preservation checks.

Raw ADTS AAC and MP3 without encoder trim metadata can retain codec padding. SonoTune does not guess
by removing quiet audio. See [format notes](docs/gapless-and-formats.md) for the exact support boundary.

## v1 — 2026-10-16

- Updated English and Russian interface copy with shorter, conversational labels.
- Home banner: “Можно просто нажать Play.” / “You can just press Play.”
- Updated category signatures, listening cards, pins, search and empty-list messages.
- Favorites now explain how to save a song with the heart button.
- Version v1 in the interface and release, with 1.0.0 build metadata.
- MIT license included inside the portable and source archives.

## Library and listening features

### Added

- Startup destination: every library section, a specific playlist, or the last opened section.
- Restored track, queue, position, volume, shuffle, and playback mode. Startup always stays paused.
- Click the current song title to reveal and focus it in the virtualized track list.
- Queue drag-and-drop, keyboard-friendly move buttons, individual removal, and clear-upcoming action.
- A folder scan at startup, plus an optional background interval from 1 to 10080 minutes.
- A Home banner toggle and pinned tracks with optional editable captions.
- English and Russian translations for the new controls.

### Under the hood

- SQLite schema migration for playback snapshots, pinned tracks, and scan preferences.
- Lazy session restoration: no decoder, audio device, or listening event before Play.
- Native scan scheduling independent of WebView activity; unchanged audio is not reparsed.
- Stale queue IDs are filtered without applying a deleted song's position to another song.
- Regression coverage for restoration, queue editing, scanning, preferences, and pins.

English project documentation and repository artwork are included.

## Windows integration

- Native Windows media-session integration with metadata, artwork, timeline, and playback commands.
- Four playback modes with an animated menu and keyboard support.
- More reliable end-of-track handling and idempotent system Play/Pause commands.

## Earlier development

- Ogg Opus playback, seeking, metadata, and artwork support.
- Adaptive Material You-inspired UI, custom window title bar, and wavy progress control.
- Home listening cards, playlist artwork, local listening statistics, and offline RU/EN fonts.
- Local library import, search, playlists, favorites, metadata editing, and virtualized lists.
