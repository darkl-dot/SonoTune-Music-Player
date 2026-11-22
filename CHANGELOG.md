# Changelog

## v1.1.6 — 2026-11-14

- Add overload protection: one stereo-linked brickwall limiter now sits on the summed output, so
  the equalizer, preamp, and both sides of a crossfade share a single gain envelope. Peaks are
  held at −1 dBFS; below the ceiling the stream stays transparent. It can be switched off.
- Add volume leveling: ReplayGain 2.0 over EBU R128 with a −18 LUFS target, per-track and
  per-album modes, true-peak capping, and smoothing for live mode changes. Embedded ReplayGain
  tags are used instead of re-decoding, and files without a measurement play at unity.
- Measure loudness in a background thread and store it in `library.sqlite`; imports are analyzed
  automatically, the backlog follows when leveling is enabled, damaged files are not retried, and
  Settings shows progress plus a re-measure action. See [volume leveling](docs/loudness-and-protection.md).
- Watch music folders in real time instead of scheduling intervals: debounced rescans of just the
  changed folder, added or removed roots picked up without a restart, and a note in Settings that
  folders are checked continuously. The scan interval option is gone.
- Persist leveling and protection settings in SQLite so the engine restores them before the first
  Play, and refresh the playing track when its measurement arrives.
- Make settings notes readable: the hint text under controls grows from 8 px to 12 px, and the
  version labels read their value from `package.json` instead of a hard-coded string.
- Add **More themes** under Appearance with eighteen fixed palettes: Absolutely, Ayu, Catppuccin,
  Dracula, Everforest, GitHub, Gruvbox, Linear, and Lobster, each in a dark and a light variant,
  with a swatch preview. The standard color palettes stay hidden while one of them is active,
  because these themes carry their own colors. Light variants also switch the window chrome.
- Change the volume with the mouse wheel over the player slider: 5% per step, 1% with Shift.
- Replace OS tooltips with themed popovers that follow the active appearance, including the
  window over the App root.
- Rebuild Settings as a wider tabbed dialog: General, Appearance, Audio, Library, and Application
  tabs with icons, a pinned header, an independently scrolling panel, a footer with the version,
  arrow-key navigation, and a short panel transition. Appearance keeps the themed swatch strips for
  all eighteen extra themes.
- Forget a music folder from Settings → Library after a confirmation: its tracks leave the library
  and the queue, the watcher stops following it, and the files stay on disk. Folder rows get a
  remove button and the sidebar no longer carries its own “Add folder” button.
- Tidy the sidebar: hide its scrollbar, compact the bottom settings row, and give the navigation
  more room.
- Add **Show in Explorer** (`explorer /select,...`) to the track context menu on Windows.
- Add a **Sleep timer** on the player bar: stop after 15, 30, 45, or 60 minutes with a 10-second
  fade-out, or stop after the current track finishes.
- Support **drag-and-drop from Explorer** onto the main window: dropped folders are added and
  scanned into the library, and dropped audio files are imported and played right away.
- Add **custom equalizer presets**: save and delete user presets alongside the five built-in ones.
- Add **M3U / M3U8 playlist import and export**: export any playlist to `.m3u8` and import
  `.m3u`/`.m3u8` files into the library.
- Add **Library health** in Settings → Library: inspect missing/unavailable entries and duplicate
  tracks, and clean them from the library with confirmation without touching files on disk.
- Add an **always-on-top Mini player** opened from the player bar beside Volume, with its own
  Settings → Mini player tab (live preview, always-on-top, artwork glow, backdrop motion, and
  real-time spectrum visualizer modes: Off, Bars, Wave, Bars & wave).
- Extend coverage with limiter transparency and clipping tests, gain smoothing, reference-level
  loudness measurements, album combination, tag parsing, database invalidation, live mode changes,
  watcher helpers, spectrum FFT, M3U8 import/export, sleep timer fade/stop, library health, custom
  equalizer presets, and the new settings controls.

## v1.1.5 — 2026-11-06

- Add a ten-band equalizer from 31 Hz to 16 kHz, with ±12 dB on every band, a preamp, and Flat, Bass, Vocal, Rock, and Electronic presets. A new Equalizer page holds the controls.
- Changes apply while a song is playing and are smoothed so sliders do not click. The equalizer covers every playback path, including gapless transitions and both tracks during a crossfade.
- Add crossfade from 0 to 12 seconds in Settings → Audio. Short tracks use a shorter overlap, and manual seek, skip, stop, or output changes cancel the fade instead of leaving a stray tail.
- Choose an output device in Settings. An explicit device ignores changes to the Windows default and reports a disconnected device rather than silently switching outputs.
- Quiet the interface: remove the title-bar wordmark, the settings tagline, the Home heading ornament, the sidebar status note, and the separate theme shortcut.
- Document the equalizer and audio output behavior; extend regression coverage for filters, crossfade, device handling, and audio preferences.

## v1.1.4 — 2026-10-27

- Select several tracks at once with Alt+click in the list or grid, or with Select in a track's context menu.
- A selection bar shows the selected count and offers Select all and Clear selection. Alt+A selects every visible track, and Escape leaves selection.
- Context-menu actions apply to the whole selection: play, queue, add to a playlist, favorite, edit tags, pin, remove from a playlist, or remove from the library.
- Tag and pin editors open one after another for each selected track.
- Selection follows the current view and resets when the section or grouping changes.
- English/Russian labels and regression coverage for track selection, keyboard control, and multi-track playlist actions.

## v1.1.3 — 2026-10-18

- Remove the library status footer to give more space to tracks.
- Show the source folder in track context menus, available from both right-click and the three-dot button.
- Restore rounded capsule backgrounds in sidebar navigation.
- Draw the animated playback wave as a single continuous path up to the seek thumb at every window width, without tiled-image seams.
- Increase the space between playback buttons and the seek bar by 6 px.
- Compact category headers and the top bar while retaining search, metadata, sorting, and playback controls.
- Move sorting and list/grid controls into the top bar beside search, eliminating their separate desktop row.
- Reduce the desktop player to 100 px by trimming outer padding; retain control sizes, gaps, and column positions.
- Pin a song from the bottom player or any Home highlight card, with the existing optional-caption editor.

## v1.1.2 — 2026-10-18

- Closing the window now keeps SonoTune in the system tray by default. Settings can restore full exit on close.
- Tray actions: open the player, Play/Pause, and quit completely. Menu labels follow the interface language.
- Optional Windows startup for the current user, disabled by default. Playback still restores paused.
- Single-instance handling: another launch restores the existing window and forwards audio-file arguments.
- Open audio files from Explorer or the command line. An explicit Settings action registers SonoTune in Windows “Open with” without changing existing defaults.
- Audio output errors and default-device changes pause playback while preserving the queue, position, and listening session. Play reconnects to the current output device.
- A Technical section with version information, data-folder access, and copyable diagnostics with a selectable fallback.
- Six soft Material-inspired navigation silhouettes, shuffled once per session, with themed hover/selection and smooth press transitions.
- English/Russian labels and regression tests for desktop preferences, external files, registry operations, device recovery, and navigation shapes.

See [desktop behavior](docs/desktop-integration.md) for portable-path requirements and verification limits.

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
