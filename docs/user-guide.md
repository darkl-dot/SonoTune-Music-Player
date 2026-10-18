# Using SonoTune

## Get started

1. Open the [latest release](https://github.com/darkl-dot/SonoTune-Music-Player/releases/latest).
2. Download **SonoTune-Windows.zip** and extract the entire archive.
3. Run **SonoTune.exe**, keeping the accompanying DLLs, licenses, and `demo` folder beside it.
4. Choose your language and use **Add folder** to import your local music.

No installer is needed. Microsoft Edge WebView2 Runtime is required for the interface.
You can also try the six bundled, original demo tracks before importing your own files.

To update, close SonoTune, extract the new release, and run its executable.
Your library and preferences are stored separately from the application folder.

## Features

| Your music                                         | Your listening space                             |
| -------------------------------------------------- | ------------------------------------------------ |
| MP3, FLAC, WAV, Ogg Vorbis, Opus, M4A, and AAC     | Adaptive artwork colors and three fixed palettes |
| Recursive folder import and incremental rescanning | Light, dark, and system appearance               |
| Search by title, artist, or album                  | A customizable Home page with optional banner    |
| Artists, albums, genres, favorites, and playlists  | Recent, most-played, and random song cards       |
| Custom playlist covers                             | Pinned tracks with optional personal captions    |
| Metadata and artwork editing                       | Bundled fonts and reduced-motion support         |

### Pick up where you left off

SonoTune remembers the selected track, queue, position, volume, shuffle, and playback mode.
It opens **paused**; press Play when you are ready. Startup can open any library section,
a specific playlist, or the last section you visited.

Click the song title in the bottom player to find and highlight it in All tracks.
Right-click a track or use its three-dot menu to see its source folder below the actions.
The path can be selected and copied; imports without folder information say so explicitly.
Use the pin icon beside the current song or on any Home highlight card to pin it to
Home with an optional caption. A filled pin opens the existing pin for editing or removal.

### A queue you can shape

Drag songs to reorder them, use the move buttons, remove individual entries, or clear
upcoming tracks. Editing the queue preserves the current song and its playback position.
The currently selected song stays in the queue.

The playback-mode button cycles through four choices:

| Mode                 | At the end                   |
| -------------------- | ---------------------------- |
| One track            | Stop after this song         |
| Play list            | Stop at the end of the queue |
| Repeat current track | Play this song again         |
| Repeat current list  | Restart the queue            |

Hover over the button to see the full menu, or open it with Enter or an arrow key.
Manual Next and Previous remain available in every mode.

### Keep your library up to date

Added folders are checked at every startup. Optionally, set a background scan interval
in minutes in Settings. Scans read metadata for new or changed files rather than reparsing
every unchanged recording. Missing files remain visible as unavailable, preserving
playlist references. An unavailable drive does not empty your library.

### At home in Windows

Native Windows media-session integration publishes the current title, artist, album,
cover, playback state, and timeline. System playback controls and compatible media
flyouts can control the same player engine.

### Edit metadata locally

Edit title, artists, album, year, genres, and artwork. Direct file writes create a backup
and verify the audio data before replacing the original. A JSON sidecar is available as
an alternative. Ogg/Opus metadata uses its container's tags rather than MP3 ID3 tags.

## Keyboard shortcuts

| Action                           | Shortcut                   |
| -------------------------------- | -------------------------- |
| Search                           | `Ctrl+K`                   |
| Play / pause                     | `Space`                    |
| Stop and return to the beginning | `Shift+Space`              |
| Next / previous                  | `Ctrl+Right` / `Ctrl+Left` |
| Close a dialog or menu           | `Esc`                      |

Playback shortcuts apply when focus is outside inputs, buttons, and dialogs.
Previous restarts the current song if more than three seconds have elapsed.

## Local data

On Windows, application data lives in `%APPDATA%\app.sonotune.player\`:

- `library.sqlite`: tracks, folders, favorites, playlists, listening statistics, pins, and playback snapshots.
- `artwork/`: cached album artwork.
- `backups/`: original files saved before direct metadata edits. Backups are not automatically removed.
- `demo/`: demo recordings copied into the library when requested.

Interface preferences use the local WebView storage. A sidecar is stored next to its
audio file, for example `song.flac.sonotune.json`.

Removing a song from the library does **not** delete its audio file. SonoTune does not
upload your music or library to a service. Fonts are bundled for offline use: **Nunito**
for Russian and **Varela Round** for English, with Nunito providing Cyrillic fallback.

## Windows desktop integration

Closing the window keeps SonoTune in the tray by default. Settings → **App behavior**
can disable that or enable startup at Windows login. The tray menu provides Open,
Play/Pause, and a full Quit action. Starting another copy restores the existing window.

**Technical** settings show the version, open the data directory, copy diagnostics,
and register the portable app in Windows “Open with”. You choose the default player
in Windows yourself. Audio interruptions pause playback; press Play after reconnecting
to restore the position on the current output.

See [desktop integration](desktop-integration.md) for behavior, path requirements,
and the distinction between paused startup and explicitly opening an audio file.

## Current boundaries

Windows is the supported release platform. Linux and macOS builds are future work.
Gapless playback is enabled by default; turn it off in Settings with **Gapless playback**
(**Без пауз между треками** in Russian). It prepares the next file ahead of time and
preserves silence that belongs to the recording. [Codec details and limits](gapless-and-formats.md).

M4A supports AAC-LC and ALAC; raw AAC uses ADTS. AAC and Opus decoding support mono and stereo.
HE-AAC, DRM-protected files, multichannel AAC/Opus, crossfade,
and real-time filesystem watching are not implemented. Renaming or moving a file
outside the app imports it as a new library entry at the next scan.

Lightweight operation and smooth interaction are design goals, not a claim of measured
60 FPS or a fixed memory footprint. Lists are virtualized, but library metadata is
currently held in the frontend as a whole. Playback checkpoints are saved periodically
and at normal shutdown; a crash may lose the most recent few seconds.

## Credits and licensing

SonoTune is licensed under the [MIT License](../LICENSE). Copyright (c) 2026 darkl-dot.
Dependencies retain their own licenses. Nunito and Varela Round are distributed under the SIL Open Font License
1.1; their notices are included in `public/fonts/` and the Windows download.
The bundled demo recordings and synthetic test audio were created for SonoTune and
are provided under CC0. Repository artwork is generated locally as SVG.
