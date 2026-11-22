# Verification — SonoTune v1.1.6

Verified on Windows x64 on November 22, 2026.

## Automated checks

**193 checks passed:** 115 frontend/browser-adapter tests and 78 regular Rust tests.

```sh
pnpm test
pnpm build
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo test --manifest-path src-tauri/Cargo.toml --lib
cargo test --manifest-path src-tauri/Cargo.toml --lib native_ -- --ignored --nocapture
```

The two native integration tests are normally ignored because they create a temporary
real Windows media session or register an audio-device notification. They passed in the
v1.1.5 run and were **not** re-executed for this build.

## Leveling and output protection

- The limiter is stereo-linked and lives on one internal bus that receives every sink, so a
  crossfade cannot sum two independently limited outputs. Tests cover ceiling enforcement on a
  hot signal, sample transparency below the ceiling, shared gain across channels, release after a
  burst, bypass without added latency, tail flush when the source ends, and a never-ending source
  that keeps the bus attached to the device.
- Playback tests verify that the bus is created with the first sink and released on Stop, and that
  the limiter starts disabled only inside the test harness so existing exact-sample comparisons
  stay meaningful. The real engine enables it by default.
- Loudness measurement is checked against generated stereo WAV files: a 0.1-amplitude 997 Hz tone
  reads about −20 LUFS with a matching true peak, a full-scale file is capped by the peak guard
  instead of reaching the target, and silence or a missing file becomes an inert row.
- Gain policy tests cover tag reconstruction (`gain → lufs`), the peak cap, clamping, album
  energy combination, and preferred album tags. The gain source smooths a live mode change in
  0.5 dB steps and ignores non-finite targets.
- Playback tests confirm that Per track applies the stored gain, Off returns to unity, and a
  measurement that arrives while the song plays updates the current gain through `RefreshGain`.
- ReplayGain tags are parsed from `REPLAYGAIN_*` fields in ID3, Vorbis, and MP4 forms; peaks are
  accepted both as linear ratios and as decibels.

## Library watching

- Helper checks cover collapsing nested folders and queueing the parent folder of a changed file.
- Startup still performs one incremental scan; unchanged files are skipped without reparsing.
- The watcher debounces bursts, rescans only the affected folders, retries a skipped scan while
  another scan is running, re-reads the root list every few seconds, and stops on shutdown.
- A real file-system event round trip in the packaged application was not exercised by an
  automated test.

## Interface changes

- Settings → Audio now exposes volume leveling (off, per track, per album), overload protection,
  measurement progress, and a re-measure action. Tests cover persistence, native commands, the
  progress line, and defaults (leveling off, protection on).
- The scan-interval controls are removed; the settings dialog states at the bottom that music
  folders are watched continuously. Startup expectations were updated accordingly.
- The volume icon opens the output-device list on right-click, with keyboard support, persistence,
  and a kept-but-unavailable saved device. Covered in the v1.1.5 player work and still passing.
- Appearance offers **More themes** with eighteen fixed palettes: nine themes, each in a dark and
  a light variant — Absolutely, Ayu, Catppuccin, Dracula, Everforest, GitHub, Gruvbox, Linear, and
  Lobster. Tests cover normalization of every new appearance value, listing and selecting them,
  persistence, hiding the fixed palettes, switching between variants, and returning to a standard
  theme. Gruvbox, Ayu, Catppuccin, Dracula, Everforest, and GitHub use their official dark palettes;
  their light counterparts are Gruvbox Light, Ayu Light, Catppuccin Latte, Dracula Alucard,
  Everforest Light, and GitHub Light. Absolutely, Linear, and Lobster are adapted in both variants
  from their reference looks. Contrast was checked by calculation, not by eye.
- The volume slider changes 5% per mouse-wheel step (1% with Shift); a player test dispatches wheel
  events and checks the native volume command.
- Tooltips are drawn by the app: tests cover the delay, the themed popover text, suppressing and
  restoring the native `title`, `data-tooltip` labels, switching between elements, and dismissal on
  wheel or touch.
- Settings is a tabbed dialog: tests cover the five-tab list, default selection, panel labelling,
  per-tab content, click and arrow/Home key navigation, the pinned footer version, and the close
  button. The production build was opened in the browser preview and measured: 680 px maximum width,
  a fixed height across tabs and themes, internal panel scrolling with a stable scrollbar gutter,
  all eighteen theme cards with six swatches each, and the panel transition. A native-window
  screenshot was not captured.
- Selects render their list through a portal with fixed positioning. Inside a dialog they always
  open downward and cap their height to the free space, so the startup-page list stays reachable
  instead of covering the tabs. A test covers the dialog placement and height cap.
- Removing a music folder deletes its tracks and playlist references in SQLite, drops them from the
  live queue, and keeps the files. A Rust test covers the database side and the Settings test covers
  the confirmation flow. Sidebar scrollbar and spacing changes are CSS-only.
- Added automated coverage for the new v1.1.6 additions: real-time spectrum FFT tap, sleep timer
  (after-track stop and 10s deadline fade-out), M3U/M3U8 export & import with BOM/relative paths,
  batch track removal in SQLite, library health (unavailable & duplicate ranking), custom equalizer
  presets, and the sixth Settings tab (Mini player) with always-on-top / backdrop / visualizer
  persistence.

## Verification limits

Final native-window visual review is not confirmed for v1.1.6. The player is not launched by the
build process.

Loudness figures come from synthetic fixtures, not from a listening test on hardware. The album
combination is an energy approximation and is not compared against a full album-mode ReplayGain
scan. Equalizer boosts under the limiter were not auditioned on physical outputs.

Folder watching was verified through helper tests and code review; no automated test creates a
real directory event. Network drives, very large copies, and watch limits on many roots were not
measured.

Physical audio unplug/replug, Windows media flyouts, tray interaction, Explorer drag-and-drop,
and startup after login remain outside this verification, as in v1.1.5.
