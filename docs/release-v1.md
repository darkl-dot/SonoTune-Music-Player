# SonoTune v1

A local music player for Windows. Add a folder, pick a song, and press Play.
No account or cloud library required.

## What's included

- MP3, FLAC, WAV, Ogg Vorbis, and Ogg Opus playback.
- A Material You-inspired interface, adaptive artwork colors, soft motion, and a wavy progress bar.
- Artists, albums, genres, favorites, playlists, and instant library search.
- Custom playlist covers, local metadata editing, backup-protected file writes, and JSON sidecars.
- Native Windows media controls, including metadata, artwork, and the playback timeline.
- English and Russian interfaces with offline Nunito and Varela Round fonts.

## Updated in v1

- Shorter, more conversational English and Russian interface text.
- Home banner: “Можно просто нажать Play.” / “You can just press Play.”
- Updated category labels, listening cards, pinned tracks, and empty-list messages.
- A separate Favorites hint explaining the heart button.
- v1 in the interface; 1.0.0 in build metadata. MIT license included in both downloads.

## Library and playback

- Choose any startup page, a specific playlist, or the last section you visited.
- Restore your track, queue, position, volume, shuffle, and playback mode. The player opens paused.
- Click the bottom player's title to find and highlight the current song in your library.
- Reorder the queue by dragging or with move buttons, remove entries, and clear upcoming songs.
- Check music folders at startup and optionally rescan them at your own interval in minutes.
- Hide the Home banner and pin tracks below the listening cards, with optional captions.

## Download and run

1. Download **SonoTune-Windows.zip** below.
2. Extract the entire archive and run **SonoTune.exe**.
3. Keep the DLLs, `demo` folder, and licenses next to the executable.
4. Choose your language and select **Add folder**.

**Requirements:** Windows x64 and Microsoft Edge WebView2 Runtime. No installer is required.
Close any older instance before opening this version. Your existing library is stored
separately and is preserved.

## Attached files

| File                   | Purpose                                                                         |
| ---------------------- | ------------------------------------------------------------------------------- |
| `SonoTune-Windows.zip` | Portable Windows application, runtime files, offline fonts, demos, and licenses |
| `SonoTune-source.zip`  | Source from the exact release commit                                            |
| `build-info.json`      | Version, source commit, file sizes, and SHA-256 hashes                          |
| `SHA256SUMS.txt`       | Checksums for the two ZIP downloads                                             |

## Verification and current limits

113 automated checks passed, including a real Windows SMTC/GSMTC integration test.
The production frontend, embedded assets, fonts, and release ZIPs were verified.
Native-window visual review and real-device listening are not claimed for this build;
see `VERIFICATION.md` for the full scope.

Windows is currently the supported release platform. Multichannel Opus, gapless playback,
crossfade, and real-time filesystem watching are not included. Lightweight operation
is a design goal rather than a measured FPS or memory guarantee.

## License

SonoTune is licensed under the MIT License, copyright (c) 2026 darkl-dot. Both ZIP
archives include the application license. Bundled fonts and dependencies retain
their own licenses and notices.
