# Crossfade and audio output

Windows Settings includes crossfade (0–12 seconds, half-second steps) and output
selection. Zero disables overlap and uses the existing gapless setting. The overlap
is capped at half the duration of either track. The next track becomes current at
the start of the overlap. Manual seek, skip, stop, or output changes cancel the old
tail; pause/resume affects both streams. Both streams receive the current EQ.

Output selection is local to SonoTune and persists with the UI preferences.
The Windows default follows system output changes; an explicit selection does not.
Unavailable selected devices never fall back silently to another output. Stream
errors and a one-second availability check pause playback, preserving the position,
and show the application's themed warning dialog. Paused devices are checked when
the controller next wakes. Refresh devices in Settings after connecting an output.

The browser preview does not offer these Windows audio controls.

Validation: native mixer tests exercise overlap, pause/resume and seek cancellation;
output-loss tests verify position preservation and ignoring unrelated default-device
changes. Hardware unplug/replug and subjective listening require a physical-device
check. Endpoints use their reported name plus duplicate occurrence as a persisted
key; renaming an endpoint requires selecting it again.
