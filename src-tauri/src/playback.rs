use crate::{
    audio,
    listening::ListeningSession,
    metadata,
    model::{
        ListeningUpdate, Playback, PlayerCommand, Repeat, SavedPlayback, TagDraft, TagSaveResult,
        Track,
    },
    storage::Database,
    system_media::{external_repeat, MediaAction, SystemMedia},
};
use rodio::{OutputStream, OutputStreamBuilder, Sink};
use std::{
    path::{Path, PathBuf},
    sync::{
        mpsc::{self, Receiver, Sender, SyncSender},
        Arc, Mutex,
    },
    time::{Duration, Instant},
};
use tauri::{AppHandle, Emitter};

trait PlaybackEvents: Send + Sync {
    fn playback(&self, state: &Playback);
    fn error(&self, message: String);
    fn listening(&self, update: ListeningUpdate);
}
struct AppEvents(AppHandle);
impl PlaybackEvents for AppEvents {
    fn playback(&self, state: &Playback) {
        let _ = self.0.emit("playback", state);
    }
    fn error(&self, message: String) {
        let _ = self.0.emit("playback-error", message);
    }
    fn listening(&self, update: ListeningUpdate) {
        let _ = self.0.emit("listening", update);
    }
}

pub enum Message {
    Media(MediaAction),
    Shutdown,
    Command(PlayerCommand, SyncSender<Result<(), String>>),
    Save {
        track: Track,
        draft: TagDraft,
        sidecar: bool,
        reply: SyncSender<Result<TagSaveResult, String>>,
    },
}
#[derive(Clone)]
pub struct AudioEngine {
    send: Sender<Message>,
    thread: Arc<Mutex<Option<std::thread::JoinHandle<()>>>>,
}
impl AudioEngine {
    pub fn start(
        app: AppHandle,
        db: Arc<Database>,
        data_dir: PathBuf,
        media_hwnd: Option<usize>,
    ) -> Self {
        let (send, receive) = mpsc::channel();
        let system_send = send.clone();
        let thread = std::thread::Builder::new()
            .name("sonotune-audio".into())
            .spawn(move || {
                let (media, media_error) = match SystemMedia::new(media_hwnd, system_send) {
                    Ok(session) => (Some(session), None),
                    Err(error) => (None, Some(error)),
                };
                let mut engine = Engine {
                    media,
                    media_error,
                    media_track: None,
                    media_dirty: false,
                    pending_position: None,
                    checkpoint_at: Instant::now(),
                    checkpoint_dirty: false,
                    checkpoint_force: false,
                    events: Arc::new(AppEvents(app)),
                    #[cfg(test)]
                    test_mixer: None,
                    db,
                    data_dir,
                    stream: None,
                    sink: None,
                    state: Playback::default(),
                    original_queue: vec![],
                    session: None,
                };
                if let Err(error) = engine.restore() {
                    engine.error(error);
                }
                engine.run(receive);
            })
            .expect("Could not start audio controller");
        Self {
            send,
            thread: Arc::new(Mutex::new(Some(thread))),
        }
    }
    pub fn shutdown(&self) {
        let _ = self.send.send(Message::Shutdown);
        if let Ok(mut worker) = self.thread.lock() {
            if let Some(worker) = worker.take() {
                let _ = worker.join();
            }
        }
    }
    pub fn command(&self, command: PlayerCommand) -> Result<(), String> {
        let (send, receive) = mpsc::sync_channel(1);
        self.send
            .send(Message::Command(command, send))
            .map_err(|e| e.to_string())?;
        receive.recv().map_err(|e| e.to_string())?
    }
    pub fn save(
        &self,
        track: Track,
        draft: TagDraft,
        sidecar: bool,
    ) -> Result<TagSaveResult, String> {
        let (send, receive) = mpsc::sync_channel(1);
        self.send
            .send(Message::Save {
                track,
                draft,
                sidecar,
                reply: send,
            })
            .map_err(|e| e.to_string())?;
        receive.recv().map_err(|e| e.to_string())?
    }
}
struct Engine {
    media: Option<SystemMedia>,
    media_error: Option<String>,
    media_track: Option<Track>,
    media_dirty: bool,
    pending_position: Option<f64>,
    checkpoint_at: Instant,
    checkpoint_dirty: bool,
    checkpoint_force: bool,
    events: Arc<dyn PlaybackEvents>,
    #[cfg(test)]
    test_mixer: Option<rodio::mixer::Mixer>,
    db: Arc<Database>,
    data_dir: PathBuf,
    stream: Option<OutputStream>,
    sink: Option<Sink>,
    state: Playback,
    original_queue: Vec<String>,
    session: Option<ListeningSession>,
}
impl Engine {
    fn restore(&mut self) -> Result<(), String> {
        let Some(saved) = self.db.state::<SavedPlayback>("playback")? else {
            return Ok(());
        };
        if saved.queue.len() > 100_000 || saved.original_queue.len() > 100_000 {
            return Ok(());
        }
        let library = self.db.load()?;
        let tracks: std::collections::HashMap<_, _> = library
            .tracks
            .into_iter()
            .map(|t| (t.id.clone(), t))
            .collect();
        let clean = |values: Vec<String>| {
            let mut seen = std::collections::HashSet::new();
            values
                .into_iter()
                .filter(|id| tracks.contains_key(id) && seen.insert(id.clone()))
                .collect::<Vec<_>>()
        };
        self.state.queue = clean(saved.queue);
        self.original_queue = clean(saved.original_queue);
        let queued: std::collections::HashSet<_> = self.state.queue.iter().collect();
        self.original_queue.retain(|id| queued.contains(id));
        let mut original: std::collections::HashSet<_> =
            self.original_queue.iter().cloned().collect();
        for id in &self.state.queue {
            if original.insert(id.clone()) {
                self.original_queue.push(id.clone());
            }
        }
        self.state.shuffle = saved.shuffle;
        self.state.repeat = saved.repeat;
        self.state.volume = if saved.volume.is_finite() {
            saved.volume.clamp(0.0, 1.0)
        } else {
            0.7
        };
        let requested = saved.track_id.clone();
        let current = saved
            .track_id
            .filter(|id| tracks.contains_key(id))
            .or_else(|| self.state.queue.first().cloned());
        if let Some(track) = current.and_then(|id| tracks.get(&id)) {
            self.state.track_id = Some(track.id.clone());
            if !self.state.queue.contains(&track.id) {
                self.state.queue.insert(0, track.id.clone());
            }
            if !self.original_queue.contains(&track.id) {
                self.original_queue.insert(0, track.id.clone());
            }
            self.state.duration = if track.duration.is_finite() {
                track.duration.max(0.0)
            } else {
                0.0
            };
            self.state.position =
                if requested.as_ref() == Some(&track.id) && saved.position.is_finite() {
                    saved.position.clamp(0.0, self.state.duration)
                } else {
                    0.0
                };
            self.pending_position = Some(self.state.position);
            self.media_track = Some(track.clone());
            self.media_dirty = true;
        }
        self.state.playing = false;
        Ok(())
    }
    fn checkpoint(&mut self, force: bool) {
        if !self.checkpoint_dirty
            || (!force && self.checkpoint_at.elapsed() < Duration::from_secs(5))
        {
            return;
        }
        let saved = SavedPlayback {
            track_id: self.state.track_id.clone(),
            queue: self.state.queue.clone(),
            original_queue: self.original_queue.clone(),
            position: self.state.position,
            volume: self.state.volume,
            shuffle: self.state.shuffle,
            repeat: self.state.repeat.clone(),
        };
        match self.db.save_state("playback", &saved) {
            Ok(()) => {
                self.checkpoint_dirty = false;
                self.checkpoint_at = Instant::now();
            }
            Err(error) => {
                self.checkpoint_at = Instant::now();
                self.error(error);
            }
        }
    }
    fn resume(&mut self) -> Result<(), String> {
        if self.sink.as_ref().is_none_or(Sink::empty) {
            if let Some(id) = self.state.track_id.clone() {
                let position = self.pending_position.unwrap_or(0.0);
                self.load(&id, false)?;
                if position > 0.0 {
                    let seek = self
                        .sink
                        .as_ref()
                        .unwrap()
                        .try_seek(Duration::from_secs_f64(position.min(self.state.duration)));
                    if let Err(error) = seek {
                        self.sink.take();
                        self.session = None;
                        self.pending_position = Some(position);
                        self.state.position = position;
                        self.state.playing = false;
                        return Err(format!("Не удалось перемотать: {error}"));
                    }
                    if let Some(session) = &mut self.session {
                        session.seek(position, self.state.duration, Instant::now());
                    }
                }
            }
        }
        if let Some(sink) = &self.sink {
            sink.play();
            self.mark_started();
        }
        Ok(())
    }
    fn record_listening(&self, counted: bool) {
        if let Some(id) = &self.state.track_id {
            match self.db.record_listening(id, counted) {
                Ok(stats) => {
                    self.events.listening(ListeningUpdate {
                        track_id: id.clone(),
                        stats,
                    });
                }
                Err(error) => self.error(error),
            }
        }
    }
    fn mark_started(&mut self) {
        if let Some(session) = &mut self.session {
            if !session.started {
                session.started = true;
                self.record_listening(false);
            }
        }
    }
    fn tick(&mut self) {
        if self
            .session
            .as_mut()
            .is_some_and(|s| s.tick(Instant::now(), self.state.playing))
        {
            self.record_listening(true);
        }
    }
    fn emit(&mut self) {
        if let Some(sink) = &self.sink {
            self.state.position = sink.get_pos().as_secs_f64().min(self.state.duration);
            self.state.playing = !sink.is_paused();
        }
        let stopped = self.pending_position.is_none() && self.sink.as_ref().is_none_or(Sink::empty);
        if self.media_track.is_some() {
            if let Some(error) = self.media_error.take() {
                self.error(format!(
                    "Интеграция с медиапанелью Windows недоступна: {error}"
                ));
            }
        }
        let failure = self.media.as_mut().and_then(|media| {
            media
                .update(
                    &self.state,
                    self.media_track.as_ref(),
                    stopped,
                    self.media_dirty,
                )
                .err()
        });
        self.media_dirty = false;
        if let Some(error) = failure {
            self.media.take();
            self.error(format!(
                "Интеграция с медиапанелью Windows недоступна: {error}"
            ));
        }
        self.events.playback(&self.state);
        self.checkpoint_dirty |= self.state.playing || self.checkpoint_force;
        self.checkpoint(self.checkpoint_force);
        self.checkpoint_force = false;
    }
    fn error(&self, message: String) {
        self.events.error(message);
    }
    fn play(&mut self, id: &str) -> Result<(), String> {
        self.load(id, true)
    }
    fn load(&mut self, id: &str, playing: bool) -> Result<(), String> {
        let track = self.db.track(id)?;
        let events = self.events.clone();
        let title = track.title.clone();
        let report: audio::ErrorHandler = Box::new(move |message| {
            events.error(format!("{title}: {message}"));
        });
        let decoder = audio::open(
            Path::new(&track.path),
            Some(Duration::from_secs_f64(track.duration.max(0.0))),
            Some(report),
        )
        .map_err(|error| format!("Не удалось прочитать аудио «{}»: {}", track.title, error))?;
        let duration = decoder
            .total_duration()
            .map(|v| v.as_secs_f64())
            .unwrap_or(track.duration);
        let sink = self.create_sink()?;
        sink.pause();
        sink.set_volume(self.state.volume);
        sink.append(decoder);
        self.tick();
        if let Some(old) = self.sink.take() {
            old.stop();
        }
        if playing {
            sink.play();
        }
        self.sink = Some(sink);
        self.pending_position = None;
        self.checkpoint_force = true;
        self.media_track = Some(track);
        self.media_dirty = true;
        self.state.track_id = Some(id.to_owned());
        self.state.duration = duration;
        self.state.position = 0.0;
        self.state.playing = playing;
        self.session = Some(ListeningSession::new(duration, Instant::now()));
        if playing {
            self.mark_started();
        }
        Ok(())
    }
    fn create_sink(&mut self) -> Result<Sink, String> {
        #[cfg(test)]
        if let Some(mixer) = &self.test_mixer {
            return Ok(Sink::connect_new(mixer));
        }
        if self.stream.is_none() {
            self.stream = Some(
                OutputStreamBuilder::open_default_stream()
                    .map_err(|e| format!("Не удалось открыть звуковое устройство: {e}"))?,
            );
        }
        Ok(Sink::connect_new(self.stream.as_ref().unwrap().mixer()))
    }
    fn advance(&mut self, direction: i8, ended: bool) -> Result<(), String> {
        if !ended
            && direction == -1
            && self.state.position > 3.0
            && self.sink.as_ref().is_none_or(Sink::empty)
        {
            self.sink.take();
            self.session = None;
            self.pending_position = Some(0.0);
            self.state.position = 0.0;
            return Ok(());
        }
        if !ended
            && direction == -1
            && self
                .sink
                .as_ref()
                .is_some_and(|s| s.get_pos().as_secs_f64() > 3.0)
        {
            self.sink
                .as_ref()
                .unwrap()
                .try_seek(Duration::ZERO)
                .map_err(|e| format!("Не удалось перемотать: {e}"))?;
            if let Some(session) = &mut self.session {
                session.seek(0.0, self.state.duration, Instant::now());
            }
            return Ok(());
        }
        let mut attempts = 0;
        let mut last_error = None;
        let mut index = self
            .state
            .queue
            .iter()
            .position(|id| Some(id) == self.state.track_id.as_ref());
        let limit = if ended && self.state.repeat == Repeat::One {
            1
        } else {
            self.state.queue.len()
        };
        while attempts < limit {
            let random = uuid::Uuid::new_v4().as_u128();
            let next = next_index(
                self.state.queue.len(),
                index,
                direction,
                false,
                &self.state.repeat,
                ended && attempts == 0,
                random,
            );
            let Some(next) = next else {
                break;
            };
            let id = self.state.queue[next].clone();
            match self.play(&id) {
                Ok(()) => {
                    if let Some(error) = last_error {
                        self.error(error);
                    }
                    return Ok(());
                }
                Err(error) => {
                    last_error = Some(error);
                    index = Some(next);
                    attempts += 1;
                }
            }
        }
        if let Some(sink) = &self.sink {
            sink.pause();
        }
        self.state.playing = false;
        self.checkpoint_force = true;
        if let Some(error) = last_error {
            return Err(error);
        }
        Ok(())
    }
    fn command(&mut self, command: PlayerCommand) -> Result<(), String> {
        self.checkpoint_dirty |= !matches!(
            &command,
            PlayerCommand::Snapshot | PlayerCommand::RefreshMetadata
        );
        match command {
            PlayerCommand::Play { id, queue } => {
                if queue.len() > 100_000 {
                    return Err("Слишком большая очередь воспроизведения.".into());
                }
                self.play(&id)?;
                let mut seen = std::collections::HashSet::new();
                self.original_queue = queue
                    .into_iter()
                    .filter(|v| seen.insert(v.clone()))
                    .collect();
                if !self.original_queue.contains(&id) {
                    self.original_queue.insert(0, id.clone());
                }
                self.state.queue =
                    ordered_queue(&self.original_queue, Some(&id), self.state.shuffle);
            }
            PlayerCommand::Toggle => {
                if let Some(sink) = self.sink.as_ref().filter(|s| !s.empty() && !s.is_paused()) {
                    sink.pause();
                } else {
                    self.resume()?;
                }
            }
            PlayerCommand::Resume => {
                self.resume()?;
            }
            PlayerCommand::Pause => {
                if let Some(sink) = &self.sink {
                    sink.pause();
                }
                self.state.playing = false;
            }
            PlayerCommand::Stop => {
                self.pending_position = None;
                self.sink.take();
                self.stream.take();
                self.state.playing = false;
                self.state.position = 0.0;
                self.session = None;
            }
            PlayerCommand::Step { direction } => {
                self.advance(if direction < 0 { -1 } else { 1 }, false)?
            }
            PlayerCommand::Seek { seconds } => {
                if !seconds.is_finite() {
                    return Err("Некорректная позиция воспроизведения.".into());
                }
                if self.sink.as_ref().is_none_or(Sink::empty) {
                    if self.state.track_id.is_some() {
                        self.sink.take();
                        self.session = None;
                        self.state.position = seconds.clamp(0.0, self.state.duration);
                        self.pending_position = Some(self.state.position);
                    }
                }
                if let Some(sink) = &self.sink {
                    sink.try_seek(Duration::from_secs_f64(
                        seconds.clamp(0.0, self.state.duration),
                    ))
                    .map_err(|e| format!("Не удалось перемотать: {e}"))?;
                    if let Some(session) = &mut self.session {
                        session.seek(
                            seconds.clamp(0.0, self.state.duration),
                            self.state.duration,
                            Instant::now(),
                        );
                    }
                }
            }
            PlayerCommand::Volume { value } => {
                if !value.is_finite() {
                    return Err("Некорректная громкость.".into());
                }
                self.state.volume = value.clamp(0.0, 1.0);
                if let Some(sink) = &self.sink {
                    sink.set_volume(self.state.volume);
                }
            }
            PlayerCommand::Mode { shuffle, repeat } => {
                if shuffle != self.state.shuffle {
                    self.state.queue = ordered_queue(
                        &self.original_queue,
                        self.state.track_id.as_deref(),
                        shuffle,
                    );
                }
                self.state.shuffle = shuffle;
                self.state.repeat = repeat;
            }
            PlayerCommand::Enqueue { id } => {
                self.db.track(&id)?;
                if Some(&id) != self.state.track_id.as_ref() {
                    self.state.queue.retain(|value| value != &id);
                    let index = self
                        .state
                        .queue
                        .iter()
                        .position(|value| Some(value) == self.state.track_id.as_ref())
                        .map(|v| v + 1)
                        .unwrap_or(0);
                    self.state.queue.insert(index, id);
                    self.original_queue = self.state.queue.clone();
                }
            }
            PlayerCommand::Remove { id } => {
                self.state.queue.retain(|value| value != &id);
                self.original_queue.retain(|value| value != &id);
                if self.state.track_id.as_ref() == Some(&id) {
                    self.sink.take();
                    self.pending_position = None;
                    self.media_track = None;
                    self.media_dirty = true;
                    self.state.track_id = None;
                    self.state.playing = false;
                    self.state.position = 0.0;
                    self.state.duration = 0.0;
                    self.session = None;
                }
            }
            PlayerCommand::SelectQueue { id } => {
                if !self.state.queue.contains(&id) {
                    return Err("Трека больше нет в очереди.".into());
                }
                self.play(&id)?;
            }
            PlayerCommand::ReorderQueue { ids } => {
                self.state.queue = crate::queue::reorder(&self.state.queue, ids)?;
                self.original_queue = self.state.queue.clone();
            }
            PlayerCommand::RemoveQueue { id } => {
                if self.state.track_id.as_ref() == Some(&id) {
                    return Err("Текущий трек остаётся в очереди.".into());
                }
                self.state.queue.retain(|v| v != &id);
                self.original_queue.retain(|v| v != &id);
            }
            PlayerCommand::ClearNext => {
                crate::queue::clear_next(&mut self.state.queue, self.state.track_id.as_deref());
                let keep: std::collections::HashSet<_> = self.state.queue.iter().collect();
                self.original_queue.retain(|id| keep.contains(id));
            }
            PlayerCommand::RefreshMetadata => {
                if let Some(id) = &self.state.track_id {
                    if let Ok(track) = self.db.track(id) {
                        let changed = self.media_track.as_ref().is_none_or(|old| {
                            old.title != track.title
                                || old.artists != track.artists
                                || old.album != track.album
                                || old.artwork != track.artwork
                                || old.modified != track.modified
                        });
                        if changed {
                            self.media_track = Some(track);
                            self.media_dirty = true;
                        }
                    }
                }
            }
            PlayerCommand::Snapshot => {}
        }
        Ok(())
    }
    fn save(
        &mut self,
        track: Track,
        draft: TagDraft,
        sidecar: bool,
    ) -> Result<TagSaveResult, String> {
        let restore =
            !sidecar && self.state.track_id.as_ref() == Some(&track.id) && self.sink.is_some();
        let position = self
            .sink
            .as_ref()
            .map(|sink| sink.get_pos())
            .unwrap_or_default();
        let was_playing = self.state.playing;
        let previous_session = if restore { self.session.take() } else { None };
        if restore {
            self.sink.take();
            self.state.playing = false;
            self.emit();
        }
        let result = metadata::save(&track, &draft, sidecar, &self.data_dir).and_then(|result| {
            self.db.upsert_batch(std::slice::from_ref(&result.track))?;
            Ok(result)
        });
        if restore {
            match self.load(&track.id, false) {
                Ok(()) => {
                    if let Some(sink) = &self.sink {
                        let _ = sink.try_seek(
                            position.min(Duration::from_secs_f64(self.state.duration.max(0.0))),
                        );
                        if was_playing {
                            sink.play();
                        }
                    }
                    self.session = previous_session;
                    if let Some(session) = &mut self.session {
                        session.seek(position.as_secs_f64(), self.state.duration, Instant::now());
                    }
                }
                Err(error) => self.error(error),
            }
        }
        if let Ok(saved) = &result {
            if self.state.track_id.as_ref() == Some(&saved.track.id) {
                self.media_track = Some(saved.track.clone());
                self.media_dirty = true;
            }
        }
        self.emit();
        result
    }
    fn finish_ended(&mut self) {
        if self.state.playing
            && self
                .sink
                .as_ref()
                .is_some_and(|sink| !sink.is_paused() && sink.empty())
        {
            if let Err(error) = self.advance(1, true) {
                self.error(error);
            }
        }
    }
    fn media_action(&mut self, action: MediaAction) -> Result<(), String> {
        let command = match action {
            MediaAction::Play => PlayerCommand::Resume,
            MediaAction::Pause => PlayerCommand::Pause,
            MediaAction::Stop => PlayerCommand::Stop,
            MediaAction::Next => PlayerCommand::Step { direction: 1 },
            MediaAction::Previous => PlayerCommand::Step { direction: -1 },
            MediaAction::Seek(seconds) => PlayerCommand::Seek { seconds },
            MediaAction::Shuffle(shuffle) => PlayerCommand::Mode {
                shuffle,
                repeat: self.state.repeat.clone(),
            },
            MediaAction::Repeat(mode) => PlayerCommand::Mode {
                shuffle: self.state.shuffle,
                repeat: external_repeat(&self.state.repeat, mode),
            },
        };
        self.command(command)
    }
    fn run(&mut self, receive: Receiver<Message>) {
        loop {
            let wait = if self.state.playing {
                Duration::from_millis(250)
            } else {
                Duration::from_secs(10)
            };
            let incoming = receive.recv_timeout(wait);
            self.tick();
            match incoming {
                Ok(Message::Command(command, reply)) => {
                    self.checkpoint_force |= !matches!(
                        &command,
                        PlayerCommand::Volume { .. }
                            | PlayerCommand::Snapshot
                            | PlayerCommand::RefreshMetadata
                            | PlayerCommand::Seek { .. }
                    );
                    let result = self.command(command);
                    self.finish_ended();
                    self.emit();
                    let _ = reply.send(result);
                }
                Ok(Message::Shutdown) => {
                    self.checkpoint_dirty = true;
                    self.emit();
                    self.checkpoint(true);
                    break;
                }
                Ok(Message::Media(action)) => {
                    self.checkpoint_force |= !matches!(&action, MediaAction::Seek(_));
                    if let Err(error) = self.media_action(action) {
                        self.error(error);
                    }
                    self.finish_ended();
                    self.emit();
                }
                Ok(Message::Save {
                    track,
                    draft,
                    sidecar,
                    reply,
                }) => {
                    let result = self.save(track, draft, sidecar);
                    let _ = reply.send(result);
                }
                Err(mpsc::RecvTimeoutError::Timeout) => {
                    self.finish_ended();
                    if self.state.playing || self.sink.as_ref().is_some_and(Sink::empty) {
                        self.emit();
                    }
                }
                Err(mpsc::RecvTimeoutError::Disconnected) => {
                    self.checkpoint(true);
                    break;
                }
            }
        }
    }
}

fn ordered_queue(queue: &[String], current: Option<&str>, shuffle: bool) -> Vec<String> {
    if !shuffle {
        return queue.to_vec();
    }
    let mut rest = queue
        .iter()
        .filter(|id| Some(id.as_str()) != current)
        .cloned()
        .collect::<Vec<_>>();
    for i in (1..rest.len()).rev() {
        let j = (uuid::Uuid::new_v4().as_u128() % (i + 1) as u128) as usize;
        rest.swap(i, j);
    }
    if let Some(current) = current {
        if queue.iter().any(|id| id == current) {
            rest.insert(0, current.to_owned());
        }
    }
    rest
}

pub fn next_index(
    length: usize,
    index: Option<usize>,
    direction: i8,
    shuffle: bool,
    repeat: &Repeat,
    ended: bool,
    random: u128,
) -> Option<usize> {
    if length == 0 {
        return None;
    }
    if ended && *repeat == Repeat::Single {
        return None;
    }
    if ended && *repeat == Repeat::One {
        if let Some(index) = index {
            return Some(index);
        }
    }
    if shuffle && length > 1 {
        let candidate = (random % (length - 1) as u128) as usize;
        return Some(if index.is_some_and(|index| candidate >= index) {
            candidate + 1
        } else {
            candidate
        });
    }
    let next = index
        .map(|index| index as i64 + direction as i64)
        .unwrap_or(0);
    if next >= 0 && next < length as i64 {
        Some(next as usize)
    } else if *repeat == Repeat::All {
        Some(next.rem_euclid(length as i64) as usize)
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[derive(Default)]
    struct RecordedEvents {
        errors: Mutex<Vec<String>>,
    }
    impl PlaybackEvents for RecordedEvents {
        fn playback(&self, _: &Playback) {}
        fn error(&self, message: String) {
            self.errors.lock().unwrap().push(message);
        }
        fn listening(&self, _: ListeningUpdate) {}
    }
    struct Harness {
        engine: Engine,
        output: rodio::mixer::MixerSource,
        events: Arc<RecordedEvents>,
        directory: tempfile::TempDir,
        ids: Vec<String>,
    }
    impl Harness {
        fn new() -> Self {
            let directory = tempfile::tempdir().unwrap();
            let db = Arc::new(Database::open(&directory.path().join("test.sqlite")).unwrap());
            let mut ids = vec![];
            for name in ["a", "b", "c"] {
                let path = directory.path().join(format!("{name}.wav"));
                std::fs::copy(
                    Path::new(env!("CARGO_MANIFEST_DIR")).join("../tests/fixtures/tone.wav"),
                    &path,
                )
                .unwrap();
                let track = metadata::read_track(&path, None, directory.path(), false).unwrap();
                ids.push(track.id.clone());
                db.upsert_batch(&[track]).unwrap();
            }
            let (mixer, output) = rodio::mixer::mixer(2, 48_000);
            let events = Arc::new(RecordedEvents::default());
            let engine = Engine {
                events: events.clone(),
                test_mixer: Some(mixer),
                media: None,
                media_error: None,
                media_track: None,
                media_dirty: false,
                pending_position: None,
                checkpoint_at: Instant::now(),
                checkpoint_dirty: false,
                checkpoint_force: false,
                db,
                data_dir: directory.path().to_owned(),
                stream: None,
                sink: None,
                state: Playback::default(),
                original_queue: vec![],
                session: None,
            };
            Self {
                engine,
                output,
                events,
                directory,
                ids,
            }
        }
        fn start(&mut self, index: usize, mode: Repeat) {
            self.engine
                .command(PlayerCommand::Mode {
                    shuffle: false,
                    repeat: mode,
                })
                .unwrap();
            self.command(PlayerCommand::Play {
                id: self.ids[index].clone(),
                queue: self.ids.clone(),
            });
        }
        fn command(&mut self, command: PlayerCommand) {
            self.engine.command(command).unwrap();
            self.engine.finish_ended();
            self.engine.emit();
        }
        fn drain(&mut self) {
            for _ in 0..1_000_000 {
                self.output.next();
                if self.engine.sink.as_ref().unwrap().empty() {
                    return;
                }
            }
            panic!("fixture did not end");
        }
    }
    #[test]
    fn restored_session_is_lazy_paused_and_resumes_the_real_decoder_at_saved_position() {
        let mut h = Harness::new();
        let saved = SavedPlayback {
            track_id: Some(h.ids[1].clone()),
            queue: vec![h.ids[1].clone(), h.ids[2].clone(), h.ids[0].clone()],
            original_queue: h.ids.clone(),
            position: 0.05,
            volume: 0.3,
            shuffle: true,
            repeat: Repeat::All,
        };
        h.engine.db.save_state("playback", &saved).unwrap();
        h.engine.restore().unwrap();
        h.engine.emit();
        assert_eq!(h.engine.state.queue, saved.queue);
        assert_eq!(h.engine.original_queue, h.ids);
        assert_eq!(h.engine.state.position, 0.05);
        assert_eq!(h.engine.state.volume, 0.3);
        assert!(h.engine.state.shuffle);
        assert_eq!(h.engine.state.repeat, Repeat::All);
        assert!(!h.engine.state.playing);
        assert!(h.engine.sink.is_none() && h.engine.stream.is_none() && h.engine.session.is_none());
        assert!(h.engine.db.load().unwrap().listening.is_empty());
        // Drive a silent output mixer while Sink synchronously seeks on the audio thread.
        let done = std::sync::atomic::AtomicBool::new(false);
        std::thread::scope(|scope| {
            let output = &mut h.output;
            let done = &done;
            scope.spawn(move || {
                while !done.load(std::sync::atomic::Ordering::Relaxed) {
                    for _ in 0..128 {
                        output.next();
                    }
                    std::thread::sleep(Duration::from_millis(1));
                }
            });
            let result = h.engine.resume();
            done.store(true, std::sync::atomic::Ordering::Relaxed);
            result.unwrap();
        });
        h.engine.emit();
        assert!(h.engine.state.playing);
        assert!(
            h.engine.state.position >= 0.045 && h.engine.state.position < 0.1,
            "{}",
            h.engine.state.position
        );
        assert_eq!(h.engine.state.queue, saved.queue);
        assert_eq!(h.engine.db.load().unwrap().listening.len(), 1);
        h.engine.command(PlayerCommand::Pause).unwrap();
        h.engine.emit();
        h.engine.checkpoint(true);
        let db = Database::open(&h.directory.path().join("test.sqlite")).unwrap();
        let saved_again = db.state::<SavedPlayback>("playback").unwrap().unwrap();
        assert_eq!(saved_again.queue, saved.queue);
        assert!(saved_again.position >= 0.045);
    }
    #[test]
    fn restore_filters_stale_ids_and_never_applies_a_deleted_tracks_position_to_the_next_song() {
        let mut h = Harness::new();
        let saved = SavedPlayback {
            track_id: Some("deleted".into()),
            queue: vec!["deleted".into(), h.ids[0].clone(), h.ids[0].clone()],
            original_queue: vec![h.ids[1].clone(), "deleted".into()],
            position: 100.0,
            volume: 2.0,
            shuffle: false,
            repeat: Repeat::Single,
        };
        h.engine.db.save_state("playback", &saved).unwrap();
        h.engine.restore().unwrap();
        assert_eq!(h.engine.state.track_id.as_ref(), Some(&h.ids[0]));
        assert_eq!(h.engine.state.queue, vec![h.ids[0].clone()]);
        assert_eq!(h.engine.original_queue, h.engine.state.queue);
        assert_eq!(h.engine.state.position, 0.0);
        assert_eq!(h.engine.state.volume, 1.0);
        h.engine
            .command(PlayerCommand::Seek { seconds: 0.04 })
            .unwrap();
        h.engine.emit();
        assert!(h.engine.sink.is_none());
        assert_eq!(h.engine.state.position, 0.04);
        h.engine.command(PlayerCommand::Stop).unwrap();
        h.engine.emit();
        assert_eq!(h.engine.state.position, 0.0);
    }
    #[test]
    fn editing_queue_preserves_the_source_playhead_and_pause_state() {
        let mut h = Harness::new();
        h.start(0, Repeat::All);
        for _ in 0..2000 {
            h.output.next();
        }
        h.command(PlayerCommand::Pause);
        let position = h.engine.sink.as_ref().unwrap().get_pos();
        let reordered = vec![h.ids[2].clone(), h.ids[0].clone(), h.ids[1].clone()];
        h.command(PlayerCommand::ReorderQueue {
            ids: reordered.clone(),
        });
        assert_eq!(h.engine.state.queue, reordered);
        assert_eq!(h.engine.sink.as_ref().unwrap().get_pos(), position);
        assert!(!h.engine.state.playing);
        assert!(h
            .engine
            .command(PlayerCommand::RemoveQueue {
                id: h.ids[0].clone()
            })
            .is_err());
        assert!(h
            .engine
            .command(PlayerCommand::ReorderQueue {
                ids: vec![h.ids[0].clone()]
            })
            .is_err());
        h.command(PlayerCommand::ClearNext);
        assert_eq!(
            h.engine.state.queue,
            vec![h.ids[2].clone(), h.ids[0].clone()]
        );
        assert_eq!(h.engine.state.track_id.as_ref(), Some(&h.ids[0]));
        h.command(PlayerCommand::RemoveQueue {
            id: h.ids[2].clone(),
        });
        assert_eq!(h.engine.state.queue, vec![h.ids[0].clone()]);
        h.command(PlayerCommand::SelectQueue {
            id: h.ids[0].clone(),
        });
        assert!(h.engine.state.playing);
        assert_eq!(h.engine.state.queue, vec![h.ids[0].clone()]);
    }
    #[test]
    fn four_modes_obey_natural_end_and_manual_navigation() {
        for mode in [Repeat::Single, Repeat::None, Repeat::One, Repeat::All] {
            for current in 0..3 {
                let expected = match mode {
                    Repeat::Single => None,
                    Repeat::One => Some(current),
                    Repeat::All => Some((current + 1) % 3),
                    Repeat::None => (current < 2).then_some(current + 1),
                };
                assert_eq!(
                    next_index(3, Some(current), 1, false, &mode, true, 0),
                    expected,
                    "{mode:?}"
                );
                assert_eq!(
                    next_index(3, Some(current), 1, false, &mode, false, 0),
                    if current < 2 {
                        Some(current + 1)
                    } else if mode == Repeat::All {
                        Some(0)
                    } else {
                        None
                    }
                );
            }
            assert_eq!(next_index(0, None, 1, false, &mode, true, 0), None);
            assert_eq!(
                next_index(1, Some(0), 1, false, &mode, true, 0),
                if matches!(mode, Repeat::All | Repeat::One) {
                    Some(0)
                } else {
                    None
                }
            );
        }
    }
    #[test]
    fn real_decoder_finishes_correctly_even_when_a_command_arrives_at_the_end() {
        for (mode, expected, playing) in [
            (Repeat::Single, 0, false),
            (Repeat::None, 1, true),
            (Repeat::One, 0, true),
            (Repeat::All, 1, true),
        ] {
            let mut h = Harness::new();
            h.start(0, mode);
            h.drain();
            h.command(PlayerCommand::Volume { value: 0.4 });
            assert_eq!(h.engine.state.track_id.as_ref(), Some(&h.ids[expected]));
            assert_eq!(h.engine.state.playing, playing);
            assert_eq!(h.engine.state.volume, 0.4);
        }
        let mut h = Harness::new();
        h.start(2, Repeat::None);
        h.drain();
        h.command(PlayerCommand::Snapshot);
        assert!(!h.engine.state.playing);
        h.command(PlayerCommand::Resume);
        assert!(h.engine.state.playing);
        assert_eq!(h.engine.state.track_id.as_ref(), Some(&h.ids[2]));
    }
    #[test]
    fn system_play_pause_are_idempotent_and_stop_releases_the_source() {
        let mut h = Harness::new();
        h.start(0, Repeat::None);
        for _ in 0..12_000 {
            h.output.next();
        }
        let before = h.engine.sink.as_ref().unwrap().get_pos();
        assert!(before > Duration::ZERO);
        for _ in 0..2 {
            h.engine.media_action(MediaAction::Play).unwrap();
            h.engine.emit();
        }
        assert_eq!(h.engine.sink.as_ref().unwrap().get_pos(), before);
        for _ in 0..2 {
            h.engine.media_action(MediaAction::Pause).unwrap();
            h.engine.emit();
            assert!(!h.engine.state.playing);
        }
        h.engine.media_action(MediaAction::Play).unwrap();
        h.engine.emit();
        assert!(h.engine.state.playing);
        h.engine.media_action(MediaAction::Stop).unwrap();
        h.engine.emit();
        assert!(h.engine.sink.is_none());
        assert_eq!(h.engine.state.position, 0.0);
        h.engine.media_action(MediaAction::Play).unwrap();
        h.engine.emit();
        assert!(h.engine.state.playing);
    }
    #[test]
    fn repeat_one_does_not_fall_through_to_another_song_on_decoder_failure() {
        let mut h = Harness::new();
        h.start(0, Repeat::One);
        h.drain();
        std::fs::remove_file(h.directory.path().join("a.wav")).unwrap();
        h.engine.finish_ended();
        h.engine.emit();
        assert_eq!(h.engine.state.track_id.as_ref(), Some(&h.ids[0]));
        assert!(!h.engine.state.playing);
        assert_eq!(h.events.errors.lock().unwrap().len(), 1);
    }
    #[test]
    fn list_skips_unreadable_files_and_media_failure_is_only_reported_once() {
        let mut h = Harness::new();
        h.engine.media_error = Some("test failure".into());
        h.start(0, Repeat::None);
        h.engine.emit();
        assert_eq!(h.events.errors.lock().unwrap().len(), 1);
        h.drain();
        std::fs::remove_file(h.directory.path().join("b.wav")).unwrap();
        h.engine.finish_ended();
        h.engine.emit();
        assert_eq!(h.engine.state.track_id.as_ref(), Some(&h.ids[2]));
        assert!(h.engine.state.playing);
        assert_eq!(h.events.errors.lock().unwrap().len(), 2);
    }
    #[test]
    fn queue_boundaries_and_repeat() {
        assert_eq!(next_index(0, None, 1, false, &Repeat::All, true, 0), None);
        assert_eq!(
            next_index(3, Some(2), 1, false, &Repeat::None, true, 0),
            None
        );
        assert_eq!(
            next_index(3, Some(2), 1, false, &Repeat::All, true, 0),
            Some(0)
        );
        assert_eq!(
            next_index(3, Some(1), 1, false, &Repeat::One, true, 0),
            Some(1)
        );
        assert_eq!(
            next_index(3, Some(1), 1, false, &Repeat::One, false, 0),
            Some(2)
        );
    }
    #[test]
    fn shuffle_never_picks_current() {
        for current in 0..4 {
            for random in 0..100 {
                assert_ne!(
                    next_index(4, Some(current), 1, true, &Repeat::None, false, random),
                    Some(current)
                );
            }
        }
    }
    #[test]
    fn shuffled_queue_contains_each_track_once_and_has_an_end() {
        let queue = vec!["a".to_owned(), "b".to_owned(), "c".to_owned()];
        let shuffled = ordered_queue(&queue, Some("b"), true);
        assert_eq!(shuffled[0], "b");
        assert_eq!(
            shuffled
                .iter()
                .collect::<std::collections::HashSet<_>>()
                .len(),
            3
        );
        assert_eq!(
            next_index(3, Some(2), 1, false, &Repeat::None, true, 0),
            None
        );
    }
}
