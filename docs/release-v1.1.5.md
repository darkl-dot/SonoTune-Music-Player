# SonoTune v1.1.5

This update adds a ten-band equalizer, crossfade, and output selection, and quietly trims some interface chrome.

## Changes

- **A ten-band equalizer.** 31 Hz to 16 kHz, ±12 dB on each band, an overall preamp, and Flat, Bass, Vocal, Rock, and Electronic presets. Reset returns every band to zero, and double-clicking a slider resets that band alone.
- **Tune it while it plays.** The curve changes on the current song without a restart. Gain moves are smoothed so dragging a slider does not click, and the filter runs on every playback path, including gapless transitions and both sides of a crossfade. The engine uses peaking filters at a fixed Q of 1.4 and 64-bit state per channel.
- **Preamp, not a limiter.** Boosting bands raises the level, so the preamp attenuates from 0 to −24 dB for headroom. There is no brick-wall limiter; keep boosts moderate or lower the preamp.
- **Crossfade.** Settings → Audio offers 0 to 12 seconds of overlap. A short track shortens the transition, and a seek, skip, stop, or output change cancels it cleanly. Crossfade and gapless preloading are mutually exclusive: while crossfade is on, the next file is opened at the transition instead of ahead of time.
- **Choose an output.** Settings → Audio lists the Windows output devices. An explicit device keeps playing when the system default changes, and a disconnected device pauses playback and asks you to choose another output instead of switching silently.
- **A quieter shell.** The title bar is now just the window controls and a small audio mark, the settings dialog no longer carries a tagline, the Home heading loses its ornament, the sidebar drops its status note, and the top bar no longer repeats a theme shortcut that Settings already provides.
- **A dedicated Equalizer page** in the navigation, with English and Russian labels throughout.
- Documentation for the [equalizer](equalizer.md) and [audio output and crossfade](audio-output-and-crossfade.md), plus regression coverage for filters, crossfade, device handling, and audio preferences.

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
