use super::{position, ticks, MediaAction, SystemRepeat};
use crate::{
    model::{Playback, Repeat, Track},
    playback::{next_index, Message},
};
use std::{io::Read, path::Path, sync::mpsc::Sender, time::Instant};
use windows::{
    core::{factory, HSTRING},
    Foundation::{TimeSpan, TypedEventHandler},
    Media::{
        AutoRepeatModeChangeRequestedEventArgs, MediaPlaybackAutoRepeatMode, MediaPlaybackStatus,
        MediaPlaybackType, PlaybackPositionChangeRequestedEventArgs,
        ShuffleEnabledChangeRequestedEventArgs, SystemMediaTransportControls,
        SystemMediaTransportControlsButton, SystemMediaTransportControlsButtonPressedEventArgs,
        SystemMediaTransportControlsTimelineProperties,
    },
    Storage::Streams::{DataWriter, InMemoryRandomAccessStream, RandomAccessStreamReference},
    Win32::{
        Foundation::HWND,
        System::WinRT::{
            ISystemMediaTransportControlsInterop, RoInitialize, RoUninitialize,
            RO_INIT_MULTITHREADED,
        },
    },
};

struct Apartment;

fn thumbnail(path: &str) -> Option<RandomAccessStreamReference> {
    // Own the small cached image in memory: Windows must not keep the cache file
    // locked, or read different bytes after a later tag edit replaces that file.
    let mut bytes = Vec::new();
    std::fs::File::open(path)
        .ok()?
        .take(2_097_153)
        .read_to_end(&mut bytes)
        .ok()?;
    if bytes.is_empty() || bytes.len() > 2_097_152 {
        return None;
    }
    let stream = InMemoryRandomAccessStream::new().ok()?;
    let output = stream.GetOutputStreamAt(0).ok()?;
    let writer = DataWriter::CreateDataWriter(&output).ok()?;
    writer.WriteBytes(&bytes).ok()?;
    writer.StoreAsync().ok()?.join().ok()?;
    writer.DetachStream().ok()?;
    stream.Seek(0).ok()?;
    RandomAccessStreamReference::CreateFromStream(&stream).ok()
}

impl Apartment {
    fn new() -> windows::core::Result<Self> {
        // This guard lives and is dropped on the dedicated audio-controller thread.
        unsafe {
            RoInitialize(RO_INIT_MULTITHREADED)?;
        }
        Ok(Self)
    }
}
impl Drop for Apartment {
    fn drop(&mut self) {
        unsafe {
            RoUninitialize();
        }
    }
}

pub struct SystemMedia {
    controls: SystemMediaTransportControls,
    buttons: Option<i64>,
    seek: Option<i64>,
    shuffle: Option<i64>,
    repeat: Option<i64>,
    enabled: bool,
    last_status: Option<MediaPlaybackStatus>,
    last_modes: Option<(bool, Repeat)>,
    last_buttons: Option<(bool, bool)>,
    current_index: Option<usize>,
    last_timeline: Option<(Instant, f64, bool, bool)>,
    // Must be declared last: COM interfaces are released before RoUninitialize.
    _apartment: Apartment,
}

impl SystemMedia {
    pub fn new(hwnd: Option<usize>, send: Sender<Message>) -> Result<Self, String> {
        Self::create(hwnd.ok_or("Главное окно Windows недоступно")?, send)
            .map_err(|e| e.to_string())
    }
    fn create(hwnd: usize, send: Sender<Message>) -> windows::core::Result<Self> {
        let apartment = Apartment::new()?;
        let interop: ISystemMediaTransportControlsInterop =
            factory::<SystemMediaTransportControls, _>()?;
        // HWND belongs to this process and remains owned by Tauri.
        let controls: SystemMediaTransportControls =
            unsafe { interop.GetForWindow(HWND(hwnd as *mut _))? };
        drop(interop);
        let mut session = Self {
            controls,
            buttons: None,
            seek: None,
            shuffle: None,
            repeat: None,
            enabled: false,
            last_status: None,
            last_modes: None,
            last_buttons: None,
            current_index: None,
            last_timeline: None,
            _apartment: apartment,
        };
        session.controls.SetIsEnabled(false)?;
        session.controls.SetIsPlayEnabled(true)?;
        session.controls.SetIsPauseEnabled(true)?;
        session.controls.SetIsStopEnabled(true)?;
        session.controls.SetPlaybackRate(1.0)?;
        let commands = send.clone();
        session.buttons =
            Some(session.controls.ButtonPressed(&TypedEventHandler::<
                SystemMediaTransportControls,
                SystemMediaTransportControlsButtonPressedEventArgs,
            >::new(move |_, args| {
                if let Some(args) = args.as_ref() {
                    let action = match args.Button()? {
                        SystemMediaTransportControlsButton::Play => Some(MediaAction::Play),
                        SystemMediaTransportControlsButton::Pause => Some(MediaAction::Pause),
                        SystemMediaTransportControlsButton::Stop => Some(MediaAction::Stop),
                        SystemMediaTransportControlsButton::Next => Some(MediaAction::Next),
                        SystemMediaTransportControlsButton::Previous => Some(MediaAction::Previous),
                        _ => None,
                    };
                    if let Some(action) = action {
                        let _ = commands.send(Message::Media(action));
                    }
                }
                Ok(())
            }))?);
        let commands = send.clone();
        session.seek = Some(session.controls.PlaybackPositionChangeRequested(
            &TypedEventHandler::<
                SystemMediaTransportControls,
                PlaybackPositionChangeRequestedEventArgs,
            >::new(move |_, args| {
                if let Some(args) = args.as_ref() {
                    let _ = commands.send(Message::Media(MediaAction::Seek(
                        args.RequestedPlaybackPosition()?.Duration as f64 / 10_000_000.0,
                    )));
                }
                Ok(())
            }),
        )?);
        let commands = send.clone();
        session.shuffle = Some(session.controls.ShuffleEnabledChangeRequested(
            &TypedEventHandler::<
                SystemMediaTransportControls,
                ShuffleEnabledChangeRequestedEventArgs,
            >::new(move |_, args| {
                if let Some(args) = args.as_ref() {
                    let _ = commands.send(Message::Media(MediaAction::Shuffle(
                        args.RequestedShuffleEnabled()?,
                    )));
                }
                Ok(())
            }),
        )?);
        session.repeat = Some(session.controls.AutoRepeatModeChangeRequested(
            &TypedEventHandler::<
                SystemMediaTransportControls,
                AutoRepeatModeChangeRequestedEventArgs,
            >::new(move |_, args| {
                if let Some(args) = args.as_ref() {
                    let mode = match args.RequestedAutoRepeatMode()? {
                        MediaPlaybackAutoRepeatMode::Track => SystemRepeat::Track,
                        MediaPlaybackAutoRepeatMode::List => SystemRepeat::List,
                        _ => SystemRepeat::None,
                    };
                    let _ = send.send(Message::Media(MediaAction::Repeat(mode)));
                }
                Ok(())
            }),
        )?);
        Ok(session)
    }

    pub fn update(
        &mut self,
        state: &Playback,
        track: Option<&Track>,
        stopped: bool,
        force: bool,
    ) -> Result<(), String> {
        self.publish(state, track, stopped, force)
            .map_err(|error| error.to_string())
    }
    fn publish(
        &mut self,
        state: &Playback,
        track: Option<&Track>,
        stopped: bool,
        force: bool,
    ) -> windows::core::Result<()> {
        let enabled = track.is_some();
        if force {
            let updater = self.controls.DisplayUpdater()?;
            updater.ClearAll()?;
            if let Some(track) = track {
                updater.SetType(MediaPlaybackType::Music)?;
                let music = updater.MusicProperties()?;
                music.SetTitle(&HSTRING::from(&track.title))?;
                music.SetArtist(&HSTRING::from(track.artists.join("; ")))?;
                music.SetAlbumTitle(&HSTRING::from(&track.album))?;
                if let Some(path) = track
                    .artwork
                    .as_deref()
                    .filter(|p| Path::new(p).is_absolute() && Path::new(p).is_file())
                {
                    // A missing/invalid thumbnail must not disable transport controls.
                    if let Some(image) = thumbnail(path) {
                        let _ = updater.SetThumbnail(&image);
                    }
                }
            }
            updater.Update()?;
        }
        if enabled != self.enabled {
            self.controls.SetIsEnabled(enabled)?;
            self.enabled = enabled;
        }
        let status = if !enabled {
            MediaPlaybackStatus::Closed
        } else if stopped {
            MediaPlaybackStatus::Stopped
        } else if state.playing {
            MediaPlaybackStatus::Playing
        } else {
            MediaPlaybackStatus::Paused
        };
        if self.last_status != Some(status) {
            self.controls.SetPlaybackStatus(status)?;
            self.last_status = Some(status);
        }
        if self.last_modes.as_ref() != Some(&(state.shuffle, state.repeat.clone())) {
            self.controls.SetShuffleEnabled(state.shuffle)?;
            self.controls.SetAutoRepeatMode(match state.repeat {
                Repeat::One => MediaPlaybackAutoRepeatMode::Track,
                Repeat::All => MediaPlaybackAutoRepeatMode::List,
                _ => MediaPlaybackAutoRepeatMode::None,
            })?;
            self.last_modes = Some((state.shuffle, state.repeat.clone()));
        }
        let index = self
            .current_index
            .filter(|&i| state.queue.get(i) == state.track_id.as_ref())
            .or_else(|| {
                state
                    .queue
                    .iter()
                    .position(|id| Some(id) == state.track_id.as_ref())
            });
        self.current_index = index;
        let previous = enabled
            && (position(state) > 3.0
                || next_index(state.queue.len(), index, -1, false, &state.repeat, false, 0)
                    .is_some());
        let next = enabled
            && next_index(state.queue.len(), index, 1, false, &state.repeat, false, 0).is_some();
        if self.last_buttons != Some((previous, next)) {
            self.controls.SetIsPreviousEnabled(previous)?;
            self.controls.SetIsNextEnabled(next)?;
            self.last_buttons = Some((previous, next));
        }
        let now = Instant::now();
        let pos = position(state);
        let timeline_due = force
            || self
                .last_timeline
                .is_none_or(|(last, prev, playing, was_stopped)| {
                    let elapsed = now.duration_since(last).as_secs_f64();
                    let expected = prev + if playing { elapsed } else { 0.0 };
                    playing != state.playing
                        || was_stopped != stopped
                        || (pos - expected).abs() > 0.75
                        || (state.playing && elapsed >= 1.0)
                });
        if timeline_due {
            let timeline = SystemMediaTransportControlsTimelineProperties::new()?;
            timeline.SetStartTime(TimeSpan { Duration: 0 })?;
            timeline.SetMinSeekTime(TimeSpan { Duration: 0 })?;
            timeline.SetEndTime(TimeSpan {
                Duration: ticks(state.duration),
            })?;
            timeline.SetMaxSeekTime(TimeSpan {
                Duration: ticks(state.duration),
            })?;
            timeline.SetPosition(TimeSpan {
                Duration: ticks(pos),
            })?;
            self.controls.UpdateTimelineProperties(&timeline)?;
            self.last_timeline = Some((now, pos, state.playing, stopped));
        }
        Ok(())
    }
}
impl Drop for SystemMedia {
    fn drop(&mut self) {
        if let Some(token) = self.buttons.take() {
            let _ = self.controls.RemoveButtonPressed(token);
        }
        if let Some(token) = self.seek.take() {
            let _ = self.controls.RemovePlaybackPositionChangeRequested(token);
        }
        if let Some(token) = self.shuffle.take() {
            let _ = self.controls.RemoveShuffleEnabledChangeRequested(token);
        }
        if let Some(token) = self.repeat.take() {
            let _ = self.controls.RemoveAutoRepeatModeChangeRequested(token);
        }
        let _ = self.controls.SetPlaybackStatus(MediaPlaybackStatus::Closed);
        let _ = self.controls.SetIsEnabled(false);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{sync::mpsc, time::Duration};
    use windows::{
        core::w,
        Media::Control::GlobalSystemMediaTransportControlsSessionManager,
        Win32::UI::WindowsAndMessaging::{
            CreateWindowExW, DestroyWindow, WINDOW_EX_STYLE, WS_OVERLAPPEDWINDOW,
        },
    };

    struct TestWindow(HWND);
    impl Drop for TestWindow {
        fn drop(&mut self) {
            let _ = unsafe { DestroyWindow(self.0) };
        }
    }

    /// Real Windows integration, isolated to our own hidden test window/session.
    /// Run explicitly: cargo test --lib native_session_round_trip -- --ignored --nocapture
    #[test]
    #[ignore = "creates a temporary Windows media session; run explicitly on a Windows desktop"]
    fn native_session_round_trip() {
        let window = TestWindow(unsafe {
            CreateWindowExW(
                WINDOW_EX_STYLE::default(),
                w!("STATIC"),
                w!("SonoTune SMTC test"),
                WS_OVERLAPPEDWINDOW,
                0,
                0,
                640,
                480,
                None,
                None,
                None,
                None,
            )
            .unwrap()
        });
        let (send, receive) = mpsc::channel();
        let mut publisher = SystemMedia::new(Some(window.0 .0 as usize), send).unwrap();
        let directory = tempfile::tempdir().unwrap();
        let cover = directory.path().join("cover.png");
        image::RgbImage::from_pixel(16, 16, image::Rgb([90, 150, 210]))
            .save(&cover)
            .unwrap();
        let title = format!("SonoTune native test {}", std::process::id());
        let mut track = Track {
            id: "test".into(),
            title: title.clone(),
            artists: vec!["Исполнитель".into()],
            album: "Test album".into(),
            path: "test.opus".into(),
            year: None,
            genres: vec![],
            duration: 123.0,
            artwork: Some(cover.to_string_lossy().into_owned()),
            format: "OPUS".into(),
            size: 1,
            modified: 1,
            added_at: 1,
            favorite: false,
            available: true,
            demo: false,
        };
        let mut state = Playback {
            track_id: Some("test".into()),
            queue: vec!["before".into(), "test".into(), "after".into()],
            playing: true,
            position: 12.5,
            duration: 123.0,
            ..Playback::default()
        };
        publisher.update(&state, Some(&track), false, true).unwrap();
        // No file lock or delayed file reads: the session owns its image bytes.
        std::fs::remove_file(&cover).unwrap();
        let manager = GlobalSystemMediaTransportControlsSessionManager::RequestAsync()
            .unwrap()
            .join()
            .unwrap();
        let executable = std::env::current_exe()
            .unwrap()
            .file_name()
            .unwrap()
            .to_string_lossy()
            .to_lowercase();
        let mut found = None;
        for _ in 0..100 {
            let sessions = manager.GetSessions().unwrap();
            for i in 0..sessions.Size().unwrap() {
                let session = sessions.GetAt(i).unwrap();
                // Do not inspect or control unrelated applications' media metadata.
                let app = session
                    .SourceAppUserModelId()
                    .unwrap()
                    .to_string_lossy()
                    .to_lowercase();
                if app.contains(&executable) || app.contains("sonotune_lib-") {
                    let properties = session
                        .TryGetMediaPropertiesAsync()
                        .unwrap()
                        .join()
                        .unwrap();
                    if properties.Title().unwrap() == title.as_str() {
                        found = Some(session);
                        break;
                    }
                }
            }
            if found.is_some() {
                break;
            }
            std::thread::sleep(Duration::from_millis(30));
        }
        let session = found.expect("Windows did not expose our own SMTC session");
        let properties = session
            .TryGetMediaPropertiesAsync()
            .unwrap()
            .join()
            .unwrap();
        assert_eq!(properties.Artist().unwrap(), "Исполнитель");
        assert_eq!(properties.AlbumTitle().unwrap(), "Test album");
        assert!(
            properties
                .Thumbnail()
                .unwrap()
                .OpenReadAsync()
                .unwrap()
                .join()
                .unwrap()
                .Size()
                .unwrap()
                > 0
        );
        assert_eq!(
            session
                .GetTimelineProperties()
                .unwrap()
                .EndTime()
                .unwrap()
                .Duration,
            1_230_000_000
        );
        assert_eq!(
            session
                .GetTimelineProperties()
                .unwrap()
                .Position()
                .unwrap()
                .Duration,
            125_000_000
        );

        let expect_action = |expected| match receive.recv_timeout(Duration::from_secs(3)).unwrap() {
            Message::Media(action) => assert_eq!(action, expected),
            _ => panic!("unexpected controller message"),
        };
        assert!(session.TryPauseAsync().unwrap().join().unwrap());
        expect_action(MediaAction::Pause);
        state.playing = false;
        publisher
            .update(&state, Some(&track), false, false)
            .unwrap();
        assert!(session.TryPlayAsync().unwrap().join().unwrap());
        expect_action(MediaAction::Play);
        assert!(session.TrySkipNextAsync().unwrap().join().unwrap());
        expect_action(MediaAction::Next);
        assert!(session.TrySkipPreviousAsync().unwrap().join().unwrap());
        expect_action(MediaAction::Previous);
        assert!(session.TryStopAsync().unwrap().join().unwrap());
        expect_action(MediaAction::Stop);
        assert!(session
            .TryChangePlaybackPositionAsync(300_000_000)
            .unwrap()
            .join()
            .unwrap());
        expect_action(MediaAction::Seek(30.0));
        assert!(session
            .TryChangeShuffleActiveAsync(true)
            .unwrap()
            .join()
            .unwrap());
        expect_action(MediaAction::Shuffle(true));
        assert!(session
            .TryChangeAutoRepeatModeAsync(MediaPlaybackAutoRepeatMode::Track)
            .unwrap()
            .join()
            .unwrap());
        expect_action(MediaAction::Repeat(SystemRepeat::Track));
        state.position = 30.0;
        state.repeat = Repeat::One;
        state.shuffle = true;
        publisher
            .update(&state, Some(&track), false, false)
            .unwrap();
        assert_eq!(
            publisher.controls.PlaybackStatus().unwrap(),
            MediaPlaybackStatus::Paused
        );
        assert_eq!(
            publisher.controls.AutoRepeatMode().unwrap(),
            MediaPlaybackAutoRepeatMode::Track
        );
        assert!(publisher.controls.ShuffleEnabled().unwrap());
        // GSMTC is an asynchronous consumer; allow its cached timeline to catch up.
        let mut observed = 0;
        for _ in 0..100 {
            observed = session
                .GetTimelineProperties()
                .unwrap()
                .Position()
                .unwrap()
                .Duration;
            if observed == 300_000_000 {
                break;
            }
            std::thread::sleep(Duration::from_millis(20));
        }
        assert_eq!(observed, 300_000_000);
        track.title = "Updated title".into();
        track.artwork = None;
        publisher.update(&state, Some(&track), false, true).unwrap();
        assert!(publisher
            .controls
            .DisplayUpdater()
            .unwrap()
            .Thumbnail()
            .is_err());
        assert_eq!(
            publisher
                .controls
                .DisplayUpdater()
                .unwrap()
                .MusicProperties()
                .unwrap()
                .Title()
                .unwrap(),
            "Updated title"
        );
        publisher
            .update(&Playback::default(), None, true, true)
            .unwrap();
        assert!(!publisher.controls.IsEnabled().unwrap());
        drop(publisher);
        println!("Real SMTC/GSMTC metadata, thumbnail, timeline and all eight commands verified");
    }
}
