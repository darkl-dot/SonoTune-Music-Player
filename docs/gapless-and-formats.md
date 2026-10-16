# Gapless playback and audio formats

Gapless playback is **on by default** in the Windows app. Settings → **Gapless playback**
turns it off or back on, without restarting the current song. The preference survives closing
the app. Turning it off disables look-ahead transitions; valid encoder trim metadata is
still respected when decoding a recording.

The next recording is opened and primed while the current one plays. Both use the same
output sink, so the audio callback moves directly to the next source without waiting for
the interface or a polling timer. SonoTune keeps one future decoder, rather than decoding
whole songs into memory. Queue edits replace that future decoder. A new listening session,
Windows metadata, and the per-track position follow the transition.

## Supported files

| File                         | Native decoding                   | Encoder delay and end padding                                                            |
| ---------------------------- | --------------------------------- | ---------------------------------------------------------------------------------------- |
| MP3                          | MPEG audio, including CBR and VBR | Xing/LAME delay and padding when present                                                 |
| FLAC, WAV                    | Lossless audio / PCM              | No lossy encoder padding to infer                                                        |
| Ogg Vorbis                   | Vorbis                            | Container granule positions and decoder trim                                             |
| Ogg Opus (`.opus` or `.ogg`) | Mono and stereo Opus              | OpusHead pre-skip and final audible duration                                             |
| M4A                          | Mono/stereo AAC-LC, or ALAC       | AAC iTunSMPB or a single normal-speed MP4 audio edit; exact media timing where available |
| AAC                          | Mono/stereo AAC-LC in ADTS        | ADTS does not supply reliable encoder delay/end-padding instructions                     |

M4A is a container, not a codec. HE-AAC/SBR/PS, multichannel AAC/Opus, DRM, fragmented MP4,
and complex MP4 edit lists are outside the current support boundary. Existing MP3 files
without delay/padding metadata may also contain unavoidable encoder silence. A seamless
output queue cannot reconstruct missing encoder information. Silence intentionally stored
in any recording is preserved; there is no silence detector or crossfade.

Files at different sample rates/channel counts are normalized as streaming stereo/48 kHz
sources, then converted to the audio device format by the output mixer. This is not a
bit-perfect passthrough mode. A missing/unreadable future file uses the normal skip/error
path; an unavailable or very slow storage device can still interrupt playback.

## Tags and artwork

M4A tags/artwork use MP4 atoms; ADTS AAC uses its supported tag representation. Direct
editing creates an original-file backup, verifies the encoded audio payload, and replaces
the original atomically. Tests also verify that M4A edit-list/iTunSMPB timing and decoded
samples survive title/artwork changes. Sidecar editing remains available for all formats.
Ogg artwork continues to use its container's `METADATA_BLOCK_PICTURE`, not MP3 ID3.

## Browser preview

The development browser preview imports the new extensions and reads their metadata,
but playback depends on the browser's codecs. Its HTMLAudio playback does not promise
sample-accurate transitions; the gapless switch is disabled there. The released Windows
app uses the native audio engine described above.

## Verification

Synthetic CC0 fixtures cover MP3 CBR/VBR with and without encoder timing, AAC/ALAC M4A,
MP4 edit lists, iTunSMPB, raw ADTS AAC, and the existing formats. Silent mixer tests compare
the complete output of prepared track pairs with their expected sample concatenation,
without advancing the controller at the boundary. They also exercise mode changes,
pending-queue replacement, stop, and the setting switch.

`scripts/generate-audio-fixtures.py --ffmpeg <path>` regenerates the new recordings with
an installed FFmpeg. FFmpeg is only a development fixture tool and is not bundled or used
at playback time. See [verification notes](../VERIFICATION.md) for the release checks.
