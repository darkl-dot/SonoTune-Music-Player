//! One replaceable, streaming look-ahead source. Queue edits replace the pending
//! decoder, not the playing sink. No full-song PCM cache or per-sample lock.
use crate::{audio::AudioSource, model::Track};
use rodio::{source::SeekError, Source};
use std::{
    sync::{Arc, Mutex},
    time::Duration,
};

pub struct Prepared {
    pub track: Track,
    pub duration: f64,
    source: AudioSource,
}
impl Prepared {
    pub fn new(track: Track, source: AudioSource) -> Self {
        let duration = source
            .total_duration()
            .map(|d| d.as_secs_f64())
            .unwrap_or(track.duration);
        Self {
            track,
            duration,
            source: crate::audio::normalized(source),
        }
    }
}
#[derive(Default)]
struct State {
    pending: Option<Prepared>,
    started: Option<(Track, f64)>,
    claimed: bool,
}
#[derive(Clone, Default)]
pub struct NextSlot(Arc<Mutex<State>>);
impl NextSlot {
    pub fn replace(&self, next: Option<Prepared>) -> Result<(), Option<Prepared>> {
        let mut state = self.0.lock().unwrap();
        if state.claimed {
            return Err(next);
        }
        let previous = std::mem::replace(&mut state.pending, next);
        drop(state);
        drop(previous);
        Ok(())
    }
    pub fn id(&self) -> Option<String> {
        self.0
            .lock()
            .unwrap()
            .pending
            .as_ref()
            .map(|p| p.track.id.clone())
    }
    pub fn poll(&self) -> (bool, Option<(Track, f64)>) {
        // Claim and notification must be observed together. Two separate locks
        // could lose a transition if the callback starts between those reads.
        let mut state = self.0.lock().unwrap();
        (state.claimed, state.started.take())
    }
    pub fn source(&self, wake: Option<Box<dyn FnOnce() + Send>>) -> NextSource {
        NextSource {
            slot: self.clone(),
            active: None,
            checked: false,
            wake,
        }
    }
}
pub struct NextSource {
    slot: NextSlot,
    active: Option<AudioSource>,
    checked: bool,
    wake: Option<Box<dyn FnOnce() + Send>>,
}
/// Every appended track is normalized before entering the sink. Its idle filler
/// uses Rodio's unrelated mono/44.1k defaults; expose the actual fixed format so
/// the output mixer never resamples the first stereo span as mono audio.
pub struct FixedOutput(pub rodio::queue::SourcesQueueOutput);
impl Iterator for FixedOutput {
    type Item = f32;
    fn next(&mut self) -> Option<f32> {
        self.0.next()
    }
}
impl Source for FixedOutput {
    fn channels(&self) -> u16 {
        2
    }
    fn sample_rate(&self) -> u32 {
        48_000
    }
    fn current_span_len(&self) -> Option<usize> {
        None
    }
    fn total_duration(&self) -> Option<Duration> {
        None
    }
    fn try_seek(&mut self, pos: Duration) -> Result<(), SeekError> {
        self.0.try_seek(pos)
    }
}
impl Iterator for NextSource {
    type Item = f32;
    fn next(&mut self) -> Option<f32> {
        if !self.checked {
            self.checked = true;
            let mut state = self.slot.0.lock().unwrap();
            state.claimed = true;
            if let Some(next) = state.pending.take() {
                state.started = Some((next.track, next.duration));
                self.active = Some(next.source);
            }
            drop(state);
            if let Some(wake) = self.wake.take() {
                wake();
            }
        }
        self.active.as_mut()?.next()
    }
}
impl Source for NextSource {
    fn channels(&self) -> u16 {
        2
    }
    fn sample_rate(&self) -> u32 {
        48_000
    }
    fn total_duration(&self) -> Option<Duration> {
        None
    }
    fn current_span_len(&self) -> Option<usize> {
        None
    }
    fn try_seek(&mut self, pos: Duration) -> Result<(), SeekError> {
        match self.active.as_mut() {
            Some(source) => source.try_seek(pos),
            None => Ok(()),
        }
    }
}
