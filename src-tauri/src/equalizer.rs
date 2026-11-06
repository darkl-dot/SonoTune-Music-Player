//! Ten peaking biquads, RBJ Audio EQ Cookbook (W3C). Runs after the gapless queue.
use rodio::{source::SeekError, Source};
use serde::{Deserialize, Serialize};
use std::{
    sync::{Arc, Mutex},
    time::Duration,
};
pub const FREQUENCIES: [f64; 10] = [
    31., 62., 125., 250., 500., 1000., 2000., 4000., 8000., 16000.,
];
#[derive(Clone, Debug, Serialize, Deserialize, Default)]
pub struct Settings {
    pub enabled: bool,
    pub preamp: f64,
    pub gains: [f64; 10],
}
impl Settings {
    pub fn normalized(mut self) -> Self {
        fn clamp(v: f64, min: f64, max: f64) -> f64 {
            if v.is_finite() {
                v.clamp(min, max)
            } else {
                0.
            }
        }
        self.preamp = clamp(self.preamp, -24., 0.);
        for gain in &mut self.gains {
            *gain = clamp(*gain, -12., 12.);
        }
        self
    }
}
pub type Shared = Arc<Mutex<Settings>>;
#[derive(Clone, Copy)]
struct Coeff {
    b0: f64,
    b1: f64,
    b2: f64,
    a1: f64,
    a2: f64,
}
impl Coeff {
    fn peak(frequency: f64, gain: f64, rate: f64) -> Self {
        let w = 2. * std::f64::consts::PI * frequency / rate;
        let a = 10_f64.powf(gain / 40.);
        let alpha = w.sin() / (2. * 1.4);
        let a0 = 1. + alpha / a;
        Self {
            b0: (1. + alpha * a) / a0,
            b1: -2. * w.cos() / a0,
            b2: (1. - alpha * a) / a0,
            a1: -2. * w.cos() / a0,
            a2: (1. - alpha / a) / a0,
        }
    }
}
pub struct Equalized<S> {
    source: S,
    shared: Shared,
    target: Settings,
    gains: [f64; 10],
    preamp: f64,
    amplitude: f64,
    coefficients: [Coeff; 10],
    history: Vec<[[f64; 2]; 10]>,
    channel: usize,
    frames: usize,
}
impl<S: Source<Item = f32>> Equalized<S> {
    pub fn new(source: S, shared: Shared) -> Self {
        let settings = shared.lock().unwrap().clone();
        let gains = if settings.enabled {
            settings.gains
        } else {
            [0.; 10]
        };
        let preamp = if settings.enabled {
            settings.preamp
        } else {
            0.
        };
        let coefficients = std::array::from_fn(|i| {
            Coeff::peak(
                FREQUENCIES[i].min(source.sample_rate() as f64 * 0.45),
                gains[i],
                source.sample_rate() as f64,
            )
        });
        let channels = source.channels() as usize;
        Self {
            source,
            shared,
            target: settings,
            gains,
            preamp,
            amplitude: 10_f64.powf(preamp / 20.),
            coefficients,
            history: vec![[[0.; 2]; 10]; channels],
            channel: 0,
            frames: 0,
        }
    }
    fn update(&mut self) {
        if let Ok(settings) = self.shared.try_lock() {
            self.target = settings.clone();
        }
        // Smooth parameter changes over several short blocks. No per-sample locks.
        let approach = |a: f64, b: f64| a + (b - a).clamp(-0.5, 0.5);
        for i in 0..10 {
            self.gains[i] = approach(
                self.gains[i],
                if self.target.enabled {
                    self.target.gains[i]
                } else {
                    0.
                },
            );
            self.coefficients[i] = Coeff::peak(
                FREQUENCIES[i].min(self.source.sample_rate() as f64 * 0.45),
                self.gains[i],
                self.source.sample_rate() as f64,
            );
        }
        self.preamp = approach(
            self.preamp,
            if self.target.enabled {
                self.target.preamp
            } else {
                0.
            },
        );
        self.amplitude = 10_f64.powf(self.preamp / 20.);
    }
}
impl<S: Source<Item = f32>> Iterator for Equalized<S> {
    type Item = f32;
    fn next(&mut self) -> Option<f32> {
        let input = self.source.next()?;
        if self.channel == 0 && self.frames.is_multiple_of(128) {
            self.update();
        }
        let mut sample = input as f64;
        for (i, c) in self.coefficients.iter().enumerate() {
            let h = &mut self.history[self.channel][i];
            let out = c.b0 * sample + h[0];
            h[0] = c.b1 * sample - c.a1 * out + h[1];
            h[1] = c.b2 * sample - c.a2 * out;
            sample = out;
        }
        self.channel += 1;
        if self.channel == self.history.len() {
            self.channel = 0;
            self.frames = self.frames.wrapping_add(1);
        }
        Some((sample * self.amplitude) as f32)
    }
}
impl<S: Source<Item = f32>> Source for Equalized<S> {
    fn channels(&self) -> u16 {
        self.source.channels()
    }
    fn sample_rate(&self) -> u32 {
        self.source.sample_rate()
    }
    fn current_span_len(&self) -> Option<usize> {
        self.source.current_span_len()
    }
    fn total_duration(&self) -> Option<Duration> {
        self.source.total_duration()
    }
    fn try_seek(&mut self, pos: Duration) -> Result<(), SeekError> {
        self.source.try_seek(pos)?;
        self.history.fill([[0.; 2]; 10]);
        self.channel = 0;
        Ok(())
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    fn process(gain: f64, frequency: f64, enabled: bool) -> Vec<f32> {
        let samples: Vec<f32> = (0..48000)
            .map(|i| {
                (0.05 * (2. * std::f64::consts::PI * frequency * i as f64 / 48000.).sin()) as f32
            })
            .collect();
        let source = rodio::buffer::SamplesBuffer::new(1, 48000, samples);
        let mut settings = Settings {
            enabled,
            ..Settings::default()
        };
        settings.gains[5] = gain;
        Equalized::new(source, Arc::new(Mutex::new(settings))).collect()
    }
    fn rms(v: &[f32]) -> f64 {
        (v[24000..].iter().map(|s| (*s as f64).powi(2)).sum::<f64>() / 24000.).sqrt()
    }
    #[test]
    fn center_gain_and_cut() {
        let flat = rms(&process(0., 1000., true));
        for gain in [-12., 6., 12.] {
            let ratio = rms(&process(gain, 1000., true)) / flat;
            assert!((20. * ratio.log10() - gain).abs() < 0.1);
        }
    }
    #[test]
    fn bypass_and_off_band() {
        assert_eq!(process(12., 1000., false), process(0., 1000., false));
        assert!((rms(&process(12., 100., true)) / rms(&process(0., 100., true)) - 1.).abs() < 0.06);
    }
    #[test]
    fn channels_stay_independent_and_live_update() {
        let source = rodio::buffer::SamplesBuffer::new(2, 48000, vec![0.01, 0.0].repeat(4800));
        let shared = Arc::new(Mutex::new(Settings::default()));
        let mut output = Equalized::new(source, shared.clone());
        for _ in 0..512 {
            output.next();
        }
        shared.lock().unwrap().enabled = true;
        shared.lock().unwrap().gains = [12.; 10];
        let rest: Vec<_> = output.collect();
        assert!(rest.iter().all(|v| v.is_finite()));
        assert!(rest.chunks_exact(2).all(|frame| frame[1] == 0.));
    }
}
