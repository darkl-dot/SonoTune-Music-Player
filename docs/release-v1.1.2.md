# SonoTune v1.1.2

SonoTune now stays in the system tray when you close its window. Open it again with
the tray icon, pause music from its menu, or choose **Quit SonoTune** to exit completely.
You can disable close-to-tray in Settings.

## Changes

- **Optional Windows startup**, off by default. Opening at login restores your music paused.
- **One running instance.** A second launch brings back the existing window and forwards audio files.
- **Open with SonoTune.** Open local audio from Explorer or the command line; register the portable app through Settings → Technical → Add to “Open with”. Windows defaults stay under your control.
- **Audio-device recovery.** Output loss or a default-device change pauses playback and keeps your track, queue, and position. Press Play after reconnecting to continue.
- **Technical settings.** Version information, Open data folder, and Copy diagnostics with a manual-copy fallback.
- **Material-inspired navigation.** Six soft silhouettes replace the capsule backgrounds. Their session-wide shuffle stays stable while navigating, with smooth themed hover/press states.
- English/Russian text and regression coverage for the new desktop behavior.

Gapless playback and MP3, FLAC, WAV, Ogg Vorbis, Opus, M4A AAC-LC/ALAC, and ADTS AAC
support remain available. ReplayGain is not included in this update.

## Download

Extract **SonoTune-Windows.zip** and run **SonoTune.exe**, keeping its DLLs and folders
beside it. Windows x64 and Microsoft Edge WebView2 Runtime are required. Close an older
running release before starting this version. Existing library data is retained.

Keep a portable installation in a stable folder. If you move it, update startup and
“Open with” registration from Settings. Windows default-player selection is a separate
user choice; startup and file registration do not silently change it.

The release includes the portable app, source ZIP, MIT license, build information,
and SHA-256 checksums. Third-party license notices are bundled.

[Desktop behavior and limitations](https://github.com/darkl-dot/SonoTune-Music-Player/blob/main/docs/desktop-integration.md)
· [Verification](https://github.com/darkl-dot/SonoTune-Music-Player/blob/main/VERIFICATION.md)
