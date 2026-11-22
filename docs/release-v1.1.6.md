# SonoTune v1.1.6

This update protects the output from clipping, levels the volume between songs, and keeps
music folders current without any scheduled scanning to configure.

## Changes

- **Overload protection.** A stereo-linked brickwall limiter now sits after the equalizer on the
  summed output, so the preamp, the bands, and both sides of a crossfade share one gain envelope.
  Peaks are held at −1 dBFS. Below the ceiling the stream is transparent; while the limiter is
  off the chain is bit-exact. Settings → Audio can switch it off, and it is on by default.
- **Volume leveling.** ReplayGain 2.0 over EBU R128 with a −18 LUFS target, per track or per
  album. The measured true peak caps each gain so the limiter rarely has to work. Files that
  already carry ReplayGain tags are trusted instead of being decoded again. Gains are smoothed,
  so switching modes while a song plays does not click.
- **Background measurement.** Loudness is measured in its own thread and stored in
  `library.sqlite`. Imports are analyzed automatically; with leveling off only the current
  session's imports are processed, so an existing library is not decoded for hours unasked.
  Settings shows progress and offers re-measurement, and a measurement that arrives for the
  playing song is applied immediately.
- **Folders keep themselves current.** Music folders are watched in real time. Bursts are
  debounced, only the changed folder is rescanned, nested paths collapse into one pass, and
  added roots are picked up without restarting. The scan interval option is gone; Settings
  simply says at the bottom that folders are checked continuously.
- **Volume icon menu.** Right-clicking the volume icon now opens the output-device list beside
  the player, with keyboard support and the same persistence as Settings.
- **More themes.** Appearance now has a **More themes** entry with eighteen fixed palettes: in
  alphabetical order, Absolutely, Ayu, Catppuccin, Dracula, Everforest, GitHub, Gruvbox, Linear,
  and Lobster, each available in a dark and a light variant. Each card shows a swatch strip, the
  window chrome follows the variant, and the standard palettes hide while one of these themes is
  active. Choosing light, dark, or system brings them back.
- **Smaller conveniences.** The player volume slider responds to the mouse wheel (5% per step,
  1% with Shift), and tooltips are now drawn by the app in the active theme instead of the
  operating system.
- **A tidier Settings window.** Settings is now a wider, fixed-height dialog with six tabs —
  General, Appearance, Mini player, Audio, Library, and Application — a pinned header, its own
  scrolling panel, and a footer that keeps the version visible. Tabs work with the arrow keys, and
  theme cards keep their swatch strips.
- **Folder housekeeping & library health.** Settings → Library lists each music folder with a
  remove button, plus a Library health utility showing missing files and duplicate tracks with
  one-click cleanup from the library (files on disk are never deleted).
- **Mini player (always on top).** A compact floating window toggled from the player bar beside
  Volume, with centered artwork, optional ambient cover glow and drift, hover transport controls,
  and a live FFT spectrum visualizer (Off, Bars, Wave, Bars & wave) configurable in Settings →
  Mini player.
- **Everyday workflow additions.** “Show in Explorer” in track context menus, a Sleep timer
  (15/30/45/60 min with 10 s fade-out or after the current track), Explorer drag-and-drop for
  folders and audio files, user-saved Equalizer presets, and M3U/M3U8 playlist import and export.
- Documentation for [volume leveling and protection](loudness-and-protection.md), an updated
  user guide, and new regression coverage for the limiter, gain smoothing, reference loudness
  measurements, album combination, tag parsing, database invalidation, folder watching, sleep timer,
  M3U8 playlists, spectrum FFT, library health, custom equalizer presets, and mini-player settings.

## Download and update

Download **SonoTune-Windows.zip**, extract the entire archive, and run **SonoTune.exe**.
Keep the accompanying DLLs and folders beside it. Windows x64 and Microsoft Edge
WebView2 Runtime are required.

Before updating, choose **Quit SonoTune** from the tray menu to fully close the old
version. Your library and preferences are retained. Keep the portable app in a stable
folder; if you move it, update startup and “Open with” registration from Settings.

The release includes the portable player, source archive, MIT license, build information,
and SHA-256 checksums. Third-party license notices and offline fonts are bundled.

[Full changelog](https://github.com/darkl-dot/SonoTune-Music-Player/blob/main/CHANGELOG.md)
· [Verification and limits](https://github.com/darkl-dot/SonoTune-Music-Player/blob/main/VERIFICATION.md)
