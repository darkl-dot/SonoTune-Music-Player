# SonoTune v1.1.0

Gapless playback is now enabled by default. Add an album, press Play, and the next track
is prepared ahead of time. You can turn it off in Settings.

- M4A (AAC-LC and ALAC) and raw ADTS AAC support.
- MP3 Xing/LAME encoder-delay handling and M4A edit-list/iTunSMPB trimming.
- Streaming transitions with one future decoder, including mixed formats and sample rates.
- Queue editing, repeat modes, Windows media information, and pause-on-reopen restoration.
- Metadata/artwork editing with backups for the newly supported formats.

Download **SonoTune-Windows.zip**, extract the entire folder, and run **SonoTune.exe**.
Keep the DLLs and accompanying folders beside it. Windows x64 and Microsoft Edge WebView2
Runtime are required. Existing local library data and preferences are retained.

**Format limits:** AAC-LC is supported; HE-AAC and DRM-protected music are not. ADTS AAC
and MP3 without encoder timing can retain padding already encoded in the file. Silence
in the recording is preserved. [Full format notes](https://github.com/darkl-dot/SonoTune-Music-Player/blob/main/docs/gapless-and-formats.md).

The release includes the portable app, source archive, build information, SHA-256 checksums,
and MIT license. Third-party dependencies retain their respective licenses.
