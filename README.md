<p align="center">
  <img src="docs/assets/sonotune-banner.svg" alt="SonoTune — less noise, more music" width="640" />
</p>

<p align="center">
  A local music player for Windows. Adaptive colors, a wavy player bar, and your own music.
</p>

<p align="center">
  <a href="https://github.com/darkl-dot/SonoTune-Music-Player/releases/latest"><img src="docs/assets/download-windows.svg" alt="Download for Windows" width="280" /></a>
  <br />
  &nbsp; · &nbsp;
  <a href="docs/user-guide.md">User guide</a>
  &nbsp; · &nbsp;
  <a href="docs/development.md">Build from source</a>
</p>

<p align="center">
  <img src="docs/assets/home-lilac.png" alt="SonoTune Home in a dark lilac palette, with listening cards and the wavy playback bar" width="840" />
  <br />
  <sub>Home · lilac palette. Screenshots were captured before the v1 wording update.</sub>
</p>

<details>
  <summary>See the warm palette</summary>
  <p align="center">
    <img src="docs/assets/home-warm.png" alt="SonoTune Home in a warm dark palette, with album cards and active playback" width="840" />
    <br />
    <sub>The same Home page with a warm palette. Both screenshots use dark appearance.</sub>
  </p>
</details>

## Play your music

Download **SonoTune-Windows.zip** from the release, extract it, and run **SonoTune.exe**.
Keep the accompanying DLLs and folders beside it. Choose your language, add a music
folder, and press Play. Windows x64 and Microsoft Edge WebView2 Runtime are required.

## Features

- **Your local library:** MP3, FLAC, WAV, Ogg Vorbis, Opus, M4A, and AAC; search by title, artist, or album.
- **Gapless playback:** on by default, with a Settings switch. [Format details](docs/gapless-and-formats.md).
- **Shape the sound:** a ten-band equalizer with built-in and custom presets, preamp, optional crossfade, sleep timer, and output-device selection.
- **No clipping, even levels:** a limiter holds peaks at −1 dBFS, and ReplayGain 2.0 leveling matches tracks or albums to −18 LUFS. [Details](docs/loudness-and-protection.md).
- **A look you can change:** artwork colors, fixed palettes, light/dark appearance, and eighteen extra themes — Absolutely, Ayu, Catppuccin, Dracula, Everforest, GitHub, Gruvbox, Linear, and Lobster, each in dark and light — plus gentle motion.
- **Always-on-top mini player:** compact floating window with ambient artwork backdrop, hover playback & repeat controls, and a live FFT visualizer (Bars, Wave, Bars & wave).
- **Your way to listen:** playlists with custom covers and M3U/M3U8 import & export, favorites, pinned tracks, and an editable queue.
- **Pick up later:** saved playback position and queue, restored on pause; choose your startup page.
- **Folders keep themselves current:** watched in real time, with drag-and-drop from Explorer, missing-file & duplicate cleanup, and already-seen files left unparsed.
- **Windows integration:** system media controls, a tray menu, optional startup, “Open with” support, and “Show in Explorer” in track menus.
- **Local tools:** metadata editing with backups, folder rescanning, offline English/Russian fonts.

No account or cloud library required. Windows is the current release platform.

## More

- [User guide](docs/user-guide.md) — playback modes, shortcuts, library updates, and local data.
- [Development](docs/development.md) — prerequisites, build commands, and project structure.
- [Changelog](CHANGELOG.md) · [Verification](VERIFICATION.md) · [Contributing](CONTRIBUTING.md)

Licensed under [MIT](LICENSE). Bundled fonts and dependencies retain their own licenses.
