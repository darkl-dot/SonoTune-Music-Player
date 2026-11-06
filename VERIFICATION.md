# Verification — SonoTune v1.1.5

Verified on Windows x64 on November 6, 2026.

## Automated checks

**153 checks passed:** 95 frontend/browser-adapter tests, 56 regular Rust tests, and
two separately executed native Windows integration tests.

```sh
pnpm test
pnpm build
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo test --manifest-path src-tauri/Cargo.toml --lib
cargo test --manifest-path src-tauri/Cargo.toml --lib native_ -- --ignored --nocapture
```

The two native integration tests are normally ignored because they create a temporary
real Windows media session or register an audio-device notification. Both were
explicitly run and passed. The device-notification check does not change physical devices.

## Desktop integration coverage

- Closing hides the window only when the tray is available; the setting and explicit
  Quit allow a full exit. A failed tray cannot leave an inaccessible hidden application.
- Per-user startup registration handles Unicode/quoted paths, enabling, disabling,
  and moved executable paths. Tests use isolated registry keys, not the real Run key.
- Open-with registration covers all seven extensions, quotes file arguments, and
  preserves an existing default player. Tests use isolated registry keys.
- External paths are validated and deduplicated; importing reuses existing track IDs
  without adding parent directories to the scan list. Frontend tests cover initial
  file delivery, event delivery, and a late initial response racing a newer request.
- Device-loss handling in the real decoder's silent mixer preserves position, queue,
  and listening-session accounting. Repeated and stale-stream callbacks are ignored.
- Desktop settings read native state, report failed changes, disable close-to-tray
  when unavailable, and provide manual diagnostic copying when the clipboard fails.
- Real second-process forwarding and tray input are implemented but were not manually
  exercised in this run.

## v1.1.5 interface and audio changes

- The Equalizer page exposes ten bands from 31 Hz to 16 kHz in 0.5 dB steps, a preamp,
  presets, per-band double-click reset, and a global reset. Bypass keeps the curve.
- Filter tests cover center-frequency gain and cut, off-band flatness, independent
  channels, and live parameter updates. The native path uses RBJ peaking coefficients
  with Q = 1.4 and 64-bit state; the browser preview mirrors the frequencies and Q.
- Gain and preamp changes are smoothed per block, so a slider drag does not step the
  output. The equalizer wraps the gapless mixer, which places it on every decoder path,
  including both sinks during a crossfade.
- Crossfade accepts 0–12 s in half-second steps, caps the overlap at half of either
  track, pauses and resumes both streams together, and releases the old tail on seek,
  skip, stop, output change, and natural advance. Selecting a non-zero crossfade
  disables gapless preloading while it is active.
- Output selection lists native devices, persists the choice with interface preferences,
  ignores default-device changes for an explicit selection, and stops with a warning
  instead of falling back when the chosen device disappears.
- The shell drops the title-bar wordmark, the settings tagline, the Home heading
  ornament, the sidebar status note, and the top-bar theme shortcut; Settings and the
  audio controls remain reachable.

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
- MP3, FLAC, WAV, Ogg Vorbis, Opus, AAC/ALAC M4A, and ADTS AAC fixtures; malformed files return errors.
- Complete sample concatenation across WAV → WAV, MP3 VBR → CBR, M4A → AAC,
  FLAC → Opus, and Ogg → WAV, without controller polling at the boundary.
- MP3 CBR/VBR and M4A edit-list/iTunSMPB sample counts, 44.1/48 kHz normalization,
  mono/stereo AAC, bounded-preroll AAC seeks, and missing encoder-timing behavior.
- Gapless default, toggle persistence, queue replacement, repeat-one/list wrap,
  pause, stop, and keeping the current playhead while changing upcoming tracks.
- M4A/AAC title and artwork writes preserve decoded audio and encoder-trim instructions.
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

The supplied Windows executable is an optimized v1.1.5 build produced using Rust 1.99,
the MSVC toolchain, and Node.js 24.21. Frontend JavaScript/CSS filenames and all six offline
font subsets are verified inside the executable. The portable ZIP includes its DLLs,
demo files, documentation, and third-party license notices. libopus is linked statically.

ZIP CRCs, release version, packaged executable equality, and SHA-256 hashes are checked
when packaging. `build-info.json` and `SHA256SUMS.txt` in the release identify the assets.

## Verification limits

Final native-window visual review is not confirmed for v1.1.5. The user's running player
was left untouched during the build.
Tray clicks, second-launch restoration, Explorer interaction, and physical drag-and-drop
are not claimed as manually verified.

Physical audio unplug/replug and startup after Windows login were not exercised.
The implementation uses endpoint notifications and stream errors, but actual driver,
Bluetooth, and analog-jack behavior can vary.

Switching between real outputs and the audible result of crossfade and equalizer settings
were not checked on hardware. The mixer and filter tests run against synthetic audio;
the browser preview exercises Web Audio, not the native path.

The Windows media API test confirms integration at the SMTC/GSMTC level, not the
appearance of every third-party flyout. Real-device listening, multiple display DPI
settings, measured 60 FPS, and a fixed memory/CPU budget are not claimed.

Linux and macOS releases have not been built or tested.
