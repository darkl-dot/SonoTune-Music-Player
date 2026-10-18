# Windows desktop behavior

## Closing and the tray

By default, the title-bar X and Alt+F4 hide the main window in the system tray.
Playback and library scheduling continue. A left click on the tray icon restores
the window; its right-click menu offers **Open SonoTune**, **Play / Pause**, and
**Quit SonoTune**. Quit performs the normal playback checkpoint and shutdown.

Settings → **App behavior** → **Close to the system tray** turns this behavior off.
The preference is stored natively, so it applies before the interface finishes loading.
If tray creation fails, closing exits normally rather than leaving an inaccessible app.
Ordinary Minimize still uses the taskbar. The tray menu follows English/Russian language changes.

Starting SonoTune again restores the existing window, including when it is hidden
or minimized. The single-instance plugin also forwards audio-file arguments. Close
older releases before upgrading: versions without this integration cannot receive
the new instance messages.

## Optional startup

**Launch at system startup** is off by default. Enabling it registers the current
executable under the current user's Windows Run key; disabling it removes only
SonoTune's own value. No administrator access is needed. Windows may delay startup
or disable it separately through its own startup controls.

The app opens its configured startup page and restores playback **on pause**.
It never starts music merely because Windows signed in. This is startup at user logon,
not a system service running before login.

For the portable release, keep the extracted folder in a stable location. After moving
it, turn startup on again to register the new path. The same applies to “Open with”.
The interface reads the native registration rather than trusting a browser preference.

## Opening audio files

Supported extensions: MP3, FLAC, WAV, Ogg, Opus, M4A, and AAC. The command line accepts
one or more existing audio-file paths, including quoted Unicode paths with spaces.
Relative paths are resolved against the launching process's working directory.
Duplicate paths are filtered and batches are limited to 512 files.

Settings → **Technical** → **Add to “Open with”** registers the current executable as
an available Windows audio application. It does not overwrite file-type defaults or
Windows UserChoice. Choose SonoTune through Windows “Open with”/default-app settings
if you want a double-click to launch it automatically. You can also browse directly
to SonoTune.exe in Windows “Open with”.

Explicitly opening a file starts it; this differs from paused restoration on ordinary
startup. A batch becomes the playback queue. These files are indexed without adding
their parent directories as watched library folders. Import work runs outside the UI
thread and shares the file-work lock with scanning and tag editing.

## Output-device recovery

The engine listens for Windows default render-endpoint changes and output-stream errors.
On an interruption it releases the old stream and pending decoder, saves the audible
position and queue, and pauses. Once an output is available, press Play to reopen the
current Windows default output and continue. There is no automatic switch to playing
through speakers after headphones disappear.

Repeated interruption callbacks do not repeatedly notify, and late callbacks from an
old stream cannot close a newly opened stream. The listening session is retained when
continuing after recovery. If a different song is selected, normal track-start behavior applies.

An analog jack that does not change the Windows endpoint and does not report a stream
error cannot be distinguished from an unchanged device. Bluetooth/driver behavior can
vary. Physical unplug/replug and system-login scenarios still require hardware/manual
verification; see [release verification](../VERIFICATION.md).

## Technical settings and diagnostics

Technical settings show the version, open the native data directory in Explorer, and
copy diagnostics. If clipboard access fails, a read-only text field remains available
for manual selection. No report is uploaded automatically.

The report contains platform/version, basic playback/queue status, desktop integration
state, and up to 30 recent errors from this session. It does not dump the music library.
User-profile path prefixes are shortened; error messages may still include filenames.
Diagnostics can still describe a controller or registry query that fails or times out.

## Navigation shapes

The six library pages receive a shuffled set of soft SVG silhouettes once per session.
Playlists use stable per-session variants too. Hovering, changing pages, searching, or
rerendering does not choose a new shape. Text, focus, selection semantics, and rectangular
click targets remain intact. Existing reduced-motion styling also applies to transitions.
