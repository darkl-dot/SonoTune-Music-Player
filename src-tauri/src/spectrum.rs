//! Lightweight real-time audio spectrum tap for the mini-player visualizer.
//!
//! Captures mono-summed output samples into a 512-sample ring buffer only while
//! a visualizer is actively polling. When idle, the audio callback pays a single
//! relaxed atomic load and performs zero allocations or locks.
use rodio::{source::SeekError, Source};
use std::{
    f32::consts::PI,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    time::{Duration, Instant},
};

const FFT_SIZE: usize = 512;
pub const BANDS: usize = 32;
const SAMPLE_RATE: f32 = 48_000.0;
const IDLE_TIMEOUT: Duration = Duration::from_millis(1500);

struct Ring {
    samples: [f32; FFT_SIZE],
    cursor: usize,
    smoothed: [f32; BANDS],
    last_read: Instant,
}
impl Default for Ring {
    fn default() -> Self {
        Self {
            samples: [0.0; FFT_SIZE],
            cursor: 0,
            smoothed: [0.0; BANDS],
            last_read: Instant::now() - IDLE_TIMEOUT,
        }
    }
}

pub struct SpectrumTap {
    active: AtomicBool,
    ring: Mutex<Ring>,
}
impl Default for SpectrumTap {
    fn default() -> Self {
        Self {
            active: AtomicBool::new(false),
            ring: Mutex::new(Ring::default()),
        }
    }
}
impl SpectrumTap {
    pub fn new() -> Arc<Self> {
        Arc::new(Self::default())
    }
    fn push_block(&self, block: &[f32]) {
        if !self.active.load(Ordering::Relaxed) {
            return;
        }
        if let Ok(mut ring) = self.ring.try_lock() {
            if ring.last_read.elapsed() > IDLE_TIMEOUT {
                self.active.store(false, Ordering::Relaxed);
                return;
            }
            for &sample in block {
                let index = ring.cursor;
                ring.samples[index] = sample;
                ring.cursor = (index + 1) % FFT_SIZE;
            }
        }
    }
    pub fn clear(&self) {
        if let Ok(mut ring) = self.ring.lock() {
            ring.samples.fill(0.0);
            ring.smoothed.fill(0.0);
        }
    }
    pub fn read_bars(&self) -> [f32; BANDS] {
        let mut ring = match self.ring.lock() {
            Ok(guard) => guard,
            Err(_) => return [0.0; BANDS],
        };
        ring.last_read = Instant::now();
        self.active.store(true, Ordering::Relaxed);

        let mut re = [0.0_f32; FFT_SIZE];
        let mut im = [0.0_f32; FFT_SIZE];
        let start = ring.cursor;
        for i in 0..FFT_SIZE {
            let sample = ring.samples[(start + i) % FFT_SIZE];
            let window = 0.5 * (1.0 - (2.0 * PI * i as f32 / (FFT_SIZE - 1) as f32).cos());
            re[i] = sample * window;
        }
        fft(&mut re, &mut im);

        let half = FFT_SIZE / 2;
        let min_freq = 45.0_f32;
        let max_freq = 14_000.0_f32;
        let ratio = (max_freq / min_freq).powf(1.0 / BANDS as f32);
        let bin_hz = SAMPLE_RATE / FFT_SIZE as f32;

        for band in 0..BANDS {
            let low_hz = min_freq * ratio.powi(band as i32);
            let high_hz = low_hz * ratio;
            let low_bin = ((low_hz / bin_hz).floor() as usize).clamp(1, half - 1);
            let high_bin = ((high_hz / bin_hz).ceil() as usize).clamp(low_bin + 1, half);
            let mut peak = 0.0_f32;
            for k in low_bin..high_bin {
                let mag = (re[k] * re[k] + im[k] * im[k]).sqrt() / (FFT_SIZE as f32 * 0.25);
                if mag > peak {
                    peak = mag;
                }
            }
            let db = if peak > 1e-6 {
                20.0 * peak.log10()
            } else {
                -80.0
            };
            let normalized = ((db + 56.0) / 52.0).clamp(0.0, 1.0);
            let prev = ring.smoothed[band];
            ring.smoothed[band] = if normalized > prev {
                prev + (normalized - prev) * 0.58
            } else {
                prev + (normalized - prev) * 0.24
            };
        }
        ring.smoothed
    }
}

/// Iterative in-place radix-2 Cooley-Tukey FFT.
fn fft(re: &mut [f32; FFT_SIZE], im: &mut [f32; FFT_SIZE]) {
    let mut j = 0usize;
    for i in 1..FFT_SIZE {
        let mut bit = FFT_SIZE >> 1;
        while j & bit != 0 {
            j ^= bit;
            bit >>= 1;
        }
        j ^= bit;
        if i < j {
            re.swap(i, j);
            im.swap(i, j);
        }
    }
    let mut len = 2;
    while len <= FFT_SIZE {
        let half = len / 2;
        let angle = -2.0 * PI / len as f32;
        let w_re = angle.cos();
        let w_im = angle.sin();
        let mut start = 0;
        while start < FFT_SIZE {
            let mut cur_re = 1.0_f32;
            let mut cur_im = 0.0_f32;
            for offset in 0..half {
                let u = start + offset;
                let v = u + half;
                let t_re = re[v] * cur_re - im[v] * cur_im;
                let t_im = re[v] * cur_im + im[v] * cur_re;
                re[v] = re[u] - t_re;
                im[v] = im[u] - t_im;
                re[u] += t_re;
                im[u] += t_im;
                let next_re = cur_re * w_re - cur_im * w_im;
                cur_im = cur_re * w_im + cur_im * w_re;
                cur_re = next_re;
            }
            start += len;
        }
        len <<= 1;
    }
}

pub struct Tapped<S> {
    source: S,
    tap: Arc<SpectrumTap>,
    channels: usize,
    channel: usize,
    frame_sum: f32,
    batch: [f32; 64],
    batch_len: usize,
}
impl<S: Source<Item = f32>> Tapped<S> {
    pub fn new(source: S, tap: Arc<SpectrumTap>) -> Self {
        let channels = source.channels().max(1) as usize;
        Self {
            source,
            tap,
            channels,
            channel: 0,
            frame_sum: 0.0,
            batch: [0.0; 64],
            batch_len: 0,
        }
    }
}
impl<S: Source<Item = f32>> Iterator for Tapped<S> {
    type Item = f32;
    fn next(&mut self) -> Option<f32> {
        let value = self.source.next()?;
        if self.tap.active.load(Ordering::Relaxed) {
            self.frame_sum += value;
            self.channel += 1;
            if self.channel >= self.channels {
                self.batch[self.batch_len] = self.frame_sum / self.channels as f32;
                self.batch_len += 1;
                self.frame_sum = 0.0;
                self.channel = 0;
                if self.batch_len == self.batch.len() {
                    self.tap.push_block(&self.batch);
                    self.batch_len = 0;
                }
            }
        } else {
            self.channel = 0;
            self.frame_sum = 0.0;
            self.batch_len = 0;
        }
        Some(value)
    }
}
impl<S: Source<Item = f32>> Source for Tapped<S> {
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
    fn detects_tone_energy_and_returns_silence_when_empty() {
        let tap = SpectrumTap::new();
        assert!(tap.read_bars().iter().all(|&v| v == 0.0));
        let samples: Vec<f32> = (0..1024)
            .flat_map(|i| {
                let s = 0.5 * (2.0 * PI * 1000.0 * i as f32 / SAMPLE_RATE).sin();
                [s, s]
            })
            .collect();
        let source = SamplesBuffer::new(2, SAMPLE_RATE as u32, samples);
        let _: Vec<f32> = Tapped::new(source, tap.clone()).collect();
        let bars = tap.read_bars();
        let peak_band = bars
            .iter()
            .enumerate()
            .max_by(|a, b| a.1.total_cmp(b.1))
            .unwrap()
            .0;
        assert!(bars[peak_band] > 0.35, "bars: {bars:?}");
        assert!((10..=22).contains(&peak_band), "peak_band: {peak_band}");
        tap.clear();
        assert!(tap.read_bars().iter().all(|&v| v == 0.0));
    }
}
