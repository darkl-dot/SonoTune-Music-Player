//! Per-track level correction from stored loudness measurements. The gain is
//! smoothed in decibels so switching the mode while a song is playing does not
//! click, and the source reads the target without locking per sample.
use rodio::{source::SeekError, Source};
use std::{
    sync::{Arc, Mutex},
    time::Duration,
};

const UPDATE_FRAMES: usize = 128;
const MAX_STEP_DB: f64 = 0.5;

pub type Shared = Arc<Mutex<f64>>;

pub struct Gain<S> {
    source: S,
    shared: Shared,
    target: f64,
    current: f64,
    amplitude: f64,
    frames: usize,
    channel: usize,
    channels: usize,
}
impl<S: Source<Item = f32>> Gain<S> {
    pub fn new(source: S, shared: Shared) -> Self {
        let mut target = *shared.lock().unwrap();
        if !target.is_finite() {
            target = 0.0;
        }
        Self {
            channels: source.channels().max(1) as usize,
            source,
            shared,
            target,
            current: target,
            amplitude: 10_f64.powf(target / 20.0),
            frames: 0,
            channel: 0,
        }
    }
    fn update(&mut self) {
        if let Ok(target) = self.shared.try_lock() {
            self.target = *target;
        }
        if self.target.is_finite() {
            self.current += (self.target - self.current).clamp(-MAX_STEP_DB, MAX_STEP_DB);
        }
        self.amplitude = 10_f64.powf(self.current / 20.0);
    }
}
impl<S: Source<Item = f32>> Iterator for Gain<S> {
    type Item = f32;
    fn next(&mut self) -> Option<f32> {
        let value = self.source.next()?;
        if self.channel == 0 && self.frames.is_multiple_of(UPDATE_FRAMES) {
            self.update();
        }
        self.channel += 1;
        if self.channel == self.channels {
            self.channel = 0;
            self.frames = self.frames.wrapping_add(1);
        }
        Some((value as f64 * self.amplitude) as f32)
    }
}
impl<S: Source<Item = f32>> Source for Gain<S> {
    fn channels(&self) -> u16 {
        self.source.channels().max(1)
    }
    fn sample_rate(&self) -> u32 {
        self.source.sample_rate().max(1)
    }
    fn current_span_len(&self) -> Option<usize> {
        self.source.current_span_len()
    }
    fn total_duration(&self) -> Option<Duration> {
        self.source.total_duration()
    }
    fn try_seek(&mut self, position: Duration) -> Result<(), SeekError> {
        self.source.try_seek(position)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rodio::buffer::SamplesBuffer;
    #[test]
    fn applies_the_stored_correction_at_the_start_of_a_track() {
        let shared = Arc::new(Mutex::new(-6.0));
        let source = SamplesBuffer::new(2, 48_000, vec![0.5_f32; 4096]);
        let output: Vec<f32> = Gain::new(source, shared).collect();
        assert!(output.iter().all(|value| value.is_finite()));
        let expected = 0.5 * 10_f64.powf(-6.0 / 20.0);
        assert!((output[0] as f64 - expected).abs() < 1e-6);
    }
    #[test]
    fn smooths_a_live_mode_change_instead_of_jumping() {
        let shared = Arc::new(Mutex::new(-6.0));
        let source = SamplesBuffer::new(2, 48_000, vec![0.5_f32; 240_000]);
        let mut gain = Gain::new(source, shared.clone());
        let before: Vec<f32> = gain.by_ref().take(256).collect();
        *shared.lock().unwrap() = 6.0;
        let after: Vec<f32> = gain.collect();
        assert!((after[0] - before[255]).abs() < 0.02);
        let expected = 0.5 * 10_f64.powf(6.0 / 20.0);
        assert!((*after.last().unwrap() as f64 - expected).abs() < 1e-3);
        assert!(after.last().unwrap() <= &(expected as f32));
        // Each 128-frame block moves at most MAX_STEP_DB.
        let step = 10_f64.powf(MAX_STEP_DB / 20.0);
        for pair in after.chunks(128).map(|chunk| chunk[0] as f64) {
            if pair > 0.0 {
                assert!(pair <= expected * (1.0 + 1e-6));
            }
        }
        let max_ratio = after
            .chunks(128)
            .filter(|chunk| chunk.len() == 128 && chunk[0].abs() > 1e-6)
            .map(|chunk| chunk[127] as f64 / chunk[0] as f64)
            .fold(0_f64, f64::max);
        assert!(max_ratio <= step * step + 1e-3);
    }
    #[test]
    fn ignores_non_finite_targets() {
        let shared = Arc::new(Mutex::new(f64::NAN));
        let source = SamplesBuffer::new(1, 48_000, vec![0.25_f32; 512]);
        let output: Vec<f32> = Gain::new(source, shared).collect();
        assert!(output.iter().all(|value| value.is_finite()));
    }
}
