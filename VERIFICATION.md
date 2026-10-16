# Verification — SonoTune 0.5.0

Verified on Windows x64 on October 16, 2026.

## Automated checks

**113 checks passed:** 76 frontend/browser-adapter tests, 36 regular Rust tests, and
one separately executed native Windows media-session integration test.

```sh
pnpm test
pnpm build
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo test --manifest-path src-tauri/Cargo.toml --lib
cargo test --manifest-path src-tauri/Cargo.toml --lib native_session_round_trip -- --ignored --nocapture
```

The native integration test is normally ignored because it creates a temporary real
Windows media session. It was explicitly run and passed for this release.

## Session, library, and Home coverage

- Every startup section, a named playlist, last-section restoration, invalid preferences,
  and fallback to Home for a removed playlist.
- Custom scan interval validation, persistence, startup-only mode, native scheduler
  reconfiguration, and prompt shutdown.
- Real decoder restoration into a silent output mixer: queue, original shuffle order,
  position, volume, and playback mode. No decoder, audio device, or listening event
  is created until explicit Play. The saved position survives reopening SQLite.
- Removed and duplicate IDs are filtered; a missing track's position is not applied to
  another song. Seeking while restored and paused does not open an audio source.
- Queue changes preserve the current source, position, and pause state. Current-track
  removal is protected, stale reorder requests fail, and row selection retains order.
- Clicking the player title clears filters and reveals the song. A 10000-track virtual
  list scrolls to and focuses track 8500 while rendering fewer than 40 rows.
- Banner hiding, pin search, optional caption editing/clearing, unpinning, and SQLite
  persistence. Deleting a track clears its pin without deleting its source file.
- Real temporary-folder scans detect added/missing files, preserve favorites, skip
  unchanged metadata, and retain records when a whole root is unavailable.
- Browser restoration and queue behavior use mocked Audio/IDB. Newer shutdown snapshots
  take precedence. These tests do not verify real browser codec implementations.
- Initialization preserves restored volume and does not overwrite a newer background
  scan result with an earlier initial library snapshot.
- English/Russian controls and translation-key coverage.

## Audio and metadata regression coverage

- End-of-track and manual-navigation behavior for all four playback modes, empty and
  single-track queues, boundaries, shuffle, and unreadable recordings.
- Actual decoder/mixer behavior when another command arrives at the natural end of a song.
  System Play/Pause are idempotent; Stop releases the source.
- MP3, FLAC, WAV, Ogg Vorbis, and Ogg Opus fixtures; malformed files return errors.
- Opus mono/stereo/short recordings: sample counts, encoder delay, duration, output gain,
  channel alignment, seeking forward/backward/to the end, and Opus inside `.ogg`.
- Metadata round trips preserve audio packet fingerprints and create exact backups.
  Sidecars preserve the original audio, support artwork, and survive subsequent edits.
- Artwork caching/removal and rejection of files changed since the last scan.
- Legacy SQLite migration, playlists, covers, favorites, listening statistics, and
  cleanup of references when removing a library entry.

## Windows media integration

A real WinRT session attached to an isolated test window was found through GSMTC.
The test verified title, artist, album, thumbnail, timeline, and all eight command
types: Play, Pause, Stop, Next, Previous, Seek, Shuffle, and Repeat. Artwork remains
available after removing its temporary source image and is cleared when requested.
The test session shuts down cleanly and does not control other applications.

Time conversion and Windows repeat-mode mapping are separately covered. Integration
failures are reported without stopping local playback.

## Interface regression coverage

- Full app composition: library loading, search, navigation, and playlist creation.
- Home highlights use real listening statistics and exclude unavailable songs.
- Custom title-bar commands, resize-state changes, subscriptions, RU/EN labels, and IPC
  failure handling are tested with mocked native APIs.
- Themed sorting controls and playback-mode menus cover pointer and keyboard input,
  focus changes, Escape, outside clicks, timers, and reduced motion.
- Player sizing, artwork bounds, and responsive geometry are checked in happy-dom.
  These are component/CSS checks, not screenshots of a native Windows window.
- All six bundled WOFF2 subsets were previously decoded and checked for the required
  Latin/Cyrillic glyphs; the release archive includes the font licenses.

## Build and package

The supplied Windows executable is an optimized 0.5.0 build produced using Rust 1.99,
LLVM-MinGW, and Node.js 24.19. Frontend JavaScript/CSS filenames and all six offline
font subsets are verified inside the executable. The portable ZIP includes its DLLs,
demo files, documentation, and third-party license notices. libopus is linked statically.

ZIP CRCs, release version, packaged executable equality, and SHA-256 hashes are checked
when packaging. `build-info.json` and `SHA256SUMS.txt` in the release identify the assets.

## Verification limits

Opening the local 0.5.0 preview was blocked by the browser tool's saved origin
permissions. That restriction was not bypassed. A native-window visual review and
physical Windows drag-and-drop are therefore not confirmed for 0.5.0. The user's
running older instance was left untouched.

The Windows media API test confirms integration at the SMTC/GSMTC level, not the
appearance of every third-party flyout. Real-device listening, multiple display DPI
settings, measured 60 FPS, and a fixed memory/CPU budget are not claimed.

Linux and macOS releases have not been built or tested.
