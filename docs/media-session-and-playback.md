# Windows media session and playback modes

## Playback behavior

The button cycles through One track → Play list → Repeat current track → Repeat
current list. The initial mode is Play list. Internal values are `single`, `none`,
`one`, and `all`; the earlier values remain compatible with the command protocol.
Modes apply to the playback queue rather than the currently visible page. Shuffle
changes the order without changing the stop condition.

Manual navigation ignores repeat-one. Previous restarts a song after three seconds.
Only repeat-all wraps at a queue boundary. At the end, the song remains selected;
Play can start it again.

Hover opens the animated menu after a short delay. Pointer travel from the button
into the menu keeps it open. A normal click cycles the mode; arrows/Enter open the
keyboard menu, and Escape, outside clicks, or focus leaving close it. Touch/context
menu can open the choices. The menu fits above the player, respects reduced motion,
and includes English and Russian labels and explanations.

## Windows integration

Rust uses windows-rs directly, with SMTC attached to the main HWND through GetForWindow.
WinRT is initialized on the audio-controller thread. The session is enabled after
selecting or restoring a song. It publishes title, artist, album, local artwork,
Playing/Paused/Stopped state, duration, position, shuffle, and repeat. Restored songs
remain paused until Play. Artwork is cleared when absent; external artwork URLs are
not fetched. Metadata updates when a song changes or is edited. Routine timeline
updates are limited to once a second, with immediate pause/seek updates. Times are
validated and clamped to the duration.

Windows Play/Pause/Stop/Next/Previous, Seek, Shuffle, and Repeat callbacks send messages
to the same controller used by the interface. Callbacks do not block on the audio
thread. Windows has three repeat values: None represents both stop modes; an external
None preserves `single` if it is already selected in SonoTune.

Shutdown removes handlers and disables the session. Integration failure must not stop
audio playback and is reported once. Non-Windows builds do not gain a WinRT dependency;
Linux media integration remains future work.

## Checks

- Natural-end and manual-navigation matrix for all four modes, boundaries, empty and
  single-track queues, shuffle, and unreadable files.
- Natural end is processed even when volume, a snapshot, or another command arrives.
- Menu input, focus, timers, placement, reduced motion, and translations.
- Time/status/repeat conversion, idempotent commands, and real WinRT metadata/events
  through a dedicated temporary test window.
- Production frontend, Rust tests, current embedded assets/fonts, and matching release archives.
- Native-window/flyout review is recorded separately from API tests in [VERIFICATION.md](../VERIFICATION.md).
