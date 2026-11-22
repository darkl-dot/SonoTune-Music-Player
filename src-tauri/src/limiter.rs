//! Stereo-linked brickwall limiter. It sits after the equalizer on the summed
//! output bus, so both sinks of a crossfade share one gain envelope.
//!
//! A short look-ahead delay lets the gain drop before a peak reaches the
//! output. Below the ceiling the gain stays exactly 1.0 and the stream is
//! transparent. The source never ends: the output bus must stay attached to
//! the device mixer while no sink is playing.
use rodio::{source::SeekError, Source};
use std::{
    collections::VecDeque,
    sync::{Arc, Mutex},
    time::Duration,
};

pub const LOOKAHEAD_SECONDS: f64 = 0.005;
pub const DEFAULT_CEILING_DB: f64 = -1.0;
const RELEASE_SECONDS: f64 = 0.15;

#[derive(Clone, Copy, Debug)]
pub struct Settings {
    pub enabled: bool,
    pub ceiling_db: f64,
}
impl Default for Settings {
    fn default() -> Self {
        Self {
            enabled: true,
            ceiling_db: DEFAULT_CEILING_DB,
        }
    }
}
impl Settings {
    pub fn normalized(mut self) -> Self {
        if !self.ceiling_db.is_finite() {
            self.ceiling_db = DEFAULT_CEILING_DB;
        }
        self.ceiling_db = self.ceiling_db.clamp(-12.0, 0.0);
        self
    }
}
pub type Shared = Arc<Mutex<Settings>>;

pub struct Limiter<S> {
    source: S,
    shared: Shared,
    channels: usize,
    lookahead: usize,
    delay: Vec<f32>,
    incoming: Vec<f32>,
    slot: usize,
    filled: usize,
    window: VecDeque<(usize, f32)>,
    frame: usize,
    ready: Vec<f32>,
    next_ready: usize,
    gain: f64,
    ceiling: f64,
    release: f64,
    settings: Settings,
    flushed: bool,
    ended: bool,
}

impl<S: Source<Item = f32>> Limiter<S> {
    pub fn new(source: S, shared: Shared) -> Self {
        let settings = *shared.lock().unwrap();
        let channels = source.channels().max(1) as usize;
        let rate = source.sample_rate().max(1);
        let lookahead = ((rate as f64 * LOOKAHEAD_SECONDS).round() as usize).max(1);
        let ceiling = 10_f64.powf(settings.ceiling_db / 20.0);
        Self {
            source,
            shared,
            channels,
            lookahead,
            delay: vec![0.0; channels * lookahead],
            incoming: vec![0.0; channels],
            slot: 0,
            filled: 0,
            window: VecDeque::with_capacity(lookahead + 1),
            frame: 0,
            ready: Vec::with_capacity(channels),
            next_ready: 0,
            gain: 1.0,
            ceiling,
            release: 1.0 - (-1.0 / (rate as f64 * RELEASE_SECONDS)).exp(),
            settings: settings.normalized(),
            flushed: false,
            ended: false,
        }
    }
    fn refresh(&mut self) {
        if let Ok(settings) = self.shared.try_lock() {
            self.settings = settings.normalized();
            self.ceiling = 10_f64.powf(self.settings.ceiling_db / 20.0);
        }
    }
    fn reset_flow(&mut self) {
        self.delay.fill(0.0);
        self.slot = 0;
        self.filled = 0;
        self.window.clear();
        self.frame = 0;
        self.gain = 1.0;
        self.flushed = false;
    }
    /// Pull one frame, limit it, and queue the frame that left the delay line.
    fn process(&mut self) -> bool {
        if self.ended {
            self.reset_flow();
            self.ended = false;
        }
        let mut peak = 0_f32;
        for sample in &mut self.incoming {
            match self.source.next() {
                Some(value) => {
                    *sample = value;
                    peak = peak.max(value.abs());
                }
                None => return false,
            }
        }
        // The window covers the delayed frame and every later peak.
        self.window.push_back((self.frame, peak));
        while self
            .window
            .back()
            .is_some_and(|&(index, value)| index != self.frame && value <= peak)
        {
            self.window.pop_back();
        }
        let oldest = self.frame.saturating_sub(self.lookahead);
        while self
            .window
            .front()
            .is_some_and(|&(index, _)| index < oldest)
        {
            self.window.pop_front();
        }
        let window_peak = self.window.front().map(|&(_, value)| value).unwrap_or(peak);
        let target = if window_peak > 0.0 && window_peak as f64 > self.ceiling {
            self.ceiling / window_peak as f64
        } else {
            1.0
        };
        if target < self.gain {
            self.gain = target;
        } else {
            self.gain += (target - self.gain) * self.release;
        }
        let start = self.slot * self.channels;
        self.ready.clear();
        for sample in &self.delay[start..start + self.channels] {
            self.ready
                .push((*sample as f64 * self.gain).clamp(-self.ceiling, self.ceiling) as f32);
        }
        {
            let (delay, incoming) = (&mut self.delay, &self.incoming);
            delay[start..start + self.channels].copy_from_slice(incoming);
        }
        self.slot = (self.slot + 1) % self.lookahead;
        self.filled = (self.filled + 1).min(self.lookahead);
        self.frame = self.frame.wrapping_add(1);
        true
    }
    /// Emit the audio still held by the delay line, then silence.
    fn flush(&mut self) {
        self.ready.clear();
        for offset in 0..self.filled {
            let start = ((self.slot + offset) % self.lookahead) * self.channels;
            for sample in &self.delay[start..start + self.channels] {
                self.ready
                    .push((*sample as f64 * self.gain).clamp(-self.ceiling, self.ceiling) as f32);
            }
        }
        self.flushed = true;
    }
}
impl<S: Source<Item = f32>> Iterator for Limiter<S> {
    type Item = f32;
    fn next(&mut self) -> Option<f32> {
        loop {
            if self.next_ready < self.ready.len() {
                let value = self.ready[self.next_ready];
                self.next_ready += 1;
                return Some(value);
            }
            self.ready.clear();
            self.next_ready = 0;
            self.refresh();
            if !self.settings.enabled {
                return Some(self.source.next().unwrap_or(0.0));
            }
            if self.process() || {
                if self.flushed {
                    self.ended = true;
                } else {
                    self.flush();
                }
                !self.ready.is_empty()
            } {
                continue;
            }
            return Some(0.0);
        }
    }
}
impl<S: Source<Item = f32>> Source for Limiter<S> {
    fn channels(&self) -> u16 {
        self.source.channels().max(1)
    }
    fn sample_rate(&self) -> u32 {
        self.source.sample_rate().max(1)
    }
    fn current_span_len(&self) -> Option<usize> {
        None
    }
    fn total_duration(&self) -> Option<Duration> {
        None
    }
    fn try_seek(&mut self, position: Duration) -> Result<(), SeekError> {
        self.source.try_seek(position)?;
        self.reset_flow();
        self.ready.clear();
        self.next_ready = 0;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rodio::buffer::SamplesBuffer;

    const RATE: u32 = 48_000;

    fn sine(amplitude: f32, seconds: f64) -> Vec<f32> {
        (0..(RATE as f64 * seconds) as usize)
            .flat_map(|i| {
                let value =
                    amplitude * (std::f32::consts::TAU * 997.0 * i as f32 / RATE as f32).sin();
                [value, value]
            })
            .collect()
    }
    fn limiter(samples: Vec<f32>, settings: Settings) -> Limiter<SamplesBuffer> {
        Limiter::new(
            SamplesBuffer::new(2, RATE, samples),
            Arc::new(Mutex::new(settings.normalized())),
        )
    }
    fn ceiling(settings: Settings) -> f32 {
        10_f64.powf(settings.ceiling_db / 20.0) as f32
    }
    #[test]
    fn clips_a_hot_signal_at_the_ceiling() {
        let settings = Settings::default();
        let output: Vec<f32> = limiter(sine(1.0, 1.0), settings)
            .take(RATE as usize)
            .collect();
        let limit = ceiling(settings);
        assert!(output.iter().all(|value| value.abs() <= limit + 1e-4));
        assert!(output.iter().any(|value| value.abs() > limit * 0.9));
    }
    #[test]
    fn stays_transparent_below_the_ceiling() {
        let settings = Settings::default();
        let input = sine(0.1, 0.5);
        let output: Vec<f32> = limiter(input.clone(), settings)
            .take(input.len() + 2048)
            .collect();
        let delay = (LOOKAHEAD_SECONDS * RATE as f64).round() as usize * 2;
        assert!(output[..delay].iter().all(|value| value.abs() < 1e-6));
        for (expected, actual) in input.iter().zip(&output[delay..]) {
            assert!((expected - actual).abs() < 1e-6);
        }
        assert!(output[delay + input.len()..].iter().all(|v| v.abs() < 1e-6));
    }
    #[test]
    fn stereo_gain_is_shared_and_releases_after_a_burst() {
        let settings = Settings::default();
        let mut samples = Vec::new();
        for i in 0..(RATE as usize / 10) {
            let phase = std::f32::consts::TAU * 500.0 * i as f32 / RATE as f32;
            samples.push(1.0 * phase.sin());
            samples.push(0.5 * phase.sin());
        }
        samples.extend(sine(0.2, 0.4));
        let output: Vec<f32> = limiter(samples.clone(), settings)
            .take(samples.len() + 2048)
            .collect();
        let delay = (LOOKAHEAD_SECONDS * RATE as f64).round() as usize * 2;
        let audio = &output[delay..delay + samples.len()];
        let floor = ceiling(settings);
        assert!(output.iter().all(|value| value.abs() <= floor + 1e-4));
        for (index, frame) in audio[..RATE as usize / 10 * 2].chunks_exact(2).enumerate() {
            if frame[0].abs() > 1e-4 {
                assert!(
                    (frame[1] / frame[0] - 0.5).abs() < 1e-3,
                    "frame {index}: {:?}",
                    frame
                );
            }
        }
        // After the burst the release restores transparency for quiet audio.
        let tail = &audio[audio.len() - 4096..];
        let input_tail = &samples[samples.len() - 4096..];
        for (expected, actual) in input_tail.iter().zip(tail) {
            assert!((expected - actual).abs() < 2e-3);
        }
    }
    #[test]
    fn disabled_limiter_bypasses_without_latency() {
        let settings = Settings {
            enabled: false,
            ..Settings::default()
        };
        let input = sine(1.0, 0.1);
        let output: Vec<f32> = limiter(input.clone(), settings)
            .take(input.len() + 2048)
            .collect();
        assert_eq!(output[..input.len()], input[..]);
    }
    #[test]
    fn flushes_the_tail_and_never_ends() {
        let settings = Settings::default();
        let mut output = limiter(sine(0.5, 0.1), settings);
        let samples: Vec<f32> = output.by_ref().take(20_000).collect();
        assert!(samples.iter().any(|value| *value != 0.0));
        assert!(samples[..480].iter().all(|value| value.abs() < 1e-6));
        assert!(samples[600..1000].iter().any(|value| value.abs() > 1e-6));
        assert!(samples[samples.len() - 1000..]
            .iter()
            .all(|value| *value == 0.0));
    }
    #[test]
    fn clamps_ceiling_and_settings() {
        assert_eq!(
            Settings {
                enabled: true,
                ceiling_db: f64::NAN
            }
            .normalized()
            .ceiling_db,
            DEFAULT_CEILING_DB
        );
        assert_eq!(
            Settings {
                enabled: true,
                ceiling_db: 4.0
            }
            .normalized()
            .ceiling_db,
            0.0
        );
    }
}
