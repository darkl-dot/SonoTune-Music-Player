# Volume leveling and overload protection

Two independent stages protect the output and even out the loudness between songs.

## Overload protection

A stereo-linked brickwall limiter sits after the equalizer on the summed output bus, so both
sides of a crossfade share one gain envelope. The ceiling is −1 dBFS. A 5 ms look-ahead delay
lets the gain fall before a peak leaves the delay line; below the ceiling the gain stays at
exactly 1.0 and the stream is sample-transparent. Release follows about 150 ms. Samples are
clamped to the ceiling as a last resort.

The limiter can be disabled in Settings → Audio. While disabled the chain is bit-exact and has
no added delay. Switching it on or off changes the output delay by 5 ms once, which is
inaudible during playback.

Because the source never ends, the device mixer keeps the bus attached while no sink is
playing. Seeking restarts the envelope. Stopping playback releases the bus and stream.

## Volume leveling

Leveling uses ReplayGain 2.0 values derived from EBU R128 integrated loudness. The target is
−18 LUFS. Each measurement also records the true peak (4× oversampling); the gain is capped so
the measured peak stays below the limiter ceiling. Gains are clamped to −24…+18 dB. Tracks in
silence (integrated loudness below −70 LUFS), recordings shorter than the gating window, and
files without a measurement play at unity.

Modes in Settings → Audio:

| Mode         | Gain source                                                                 |
| ------------ | --------------------------------------------------------------------------- |
| Off          | No leveling (default)                                                       |
| Per track    | Every track matched to −18 LUFS                                             |
| Per album    | One gain for the whole album, from tags or combined track energies          |

Files that already carry ReplayGain tags (`REPLAYGAIN_TRACK_GAIN`, `..._PEAK`,
`..._ALBUM_GAIN`, `..._ALBUM_PEAK`, including the MP4 `----:com.apple.iTunes:` forms) are
trusted; SonoTune reads them during scanning and does not decode those files again. Peak tags
are accepted both as linear ratios and as decibels.

Album gain is read from tags when present. Otherwise SonoTune combines the gated energies of
the measured tracks, weighted by duration. This avoids re-decoding an album and stays within
roughly 0.5 LU of a single album pass; the difference is not claimed to be exact.

Gain changes are smoothed in decibels, so switching modes while a song plays does not click.
The gain applies before the user volume, the equalizer, and the limiter.

## Measurement

Measurements use a pure-Rust EBU R128 implementation (`ebur128`, gated integrated loudness and
true peak, EBU TECH 3341/3342 compliant) over the same decoders as playback, so MP4/AAC and
Opus files are measured with their encoder trim applied.

The background analyzer runs in its own thread:

- With leveling enabled it measures the backlog continuously, one track at a time.
- With leveling off it measures only files imported in the current session, so an existing
  library is not decoded for hours unasked.
- Missing files are skipped instead of being marked; damaged files get an inert row so they are
  not retried forever.

Settings → Audio shows how many tracks have a measurement and offers **Re-measure loudness**,
which clears the stored rows and lets the analyzer fill them again.

## Storage

Measured values live in the `loudness` table of `library.sqlite`: integrated loudness, true
peak, optional album gain, the album key, duration, gated energy, source (`scan`, `tag`, or
`none`), and the file's modification stamp. Rows are removed with their track and invalidated
when the file changes, so tag edits or replaced files are measured again.

## Limits

Leveling changes relative levels, not perceived quality; heavily compressed masters can still
sound flat. The limiter is transparent below the ceiling but is not a mastering-grade
loudness maximizer. Measurements and the album combination run against synthetic fixtures in
tests; audible results on real hardware were not measured.
