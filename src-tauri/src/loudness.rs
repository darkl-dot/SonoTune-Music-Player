//! Loudness measurement and level policy (ReplayGain 2.0 over EBU R128).
//!
//! Tracks are measured once and the result is stored. Files that already carry
//! ReplayGain tags are trusted instead of being decoded again. The playback
//! target is -18 LUFS; the gain is also capped so the measured peak stays
//! below the limiter ceiling.
use crate::{
    commands::AppState,
    model::{PlayerCommand, Track},
};
use ebur128::{EbuR128, Mode as Modes};
use serde::{Deserialize, Serialize};
use std::{
    path::Path,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    thread::JoinHandle,
    time::Duration,
};

pub const TARGET_LUFS: f64 = -18.0;
pub const CEILING_DB: f64 = -1.0;
pub const MIN_GAIN_DB: f64 = -24.0;
pub const MAX_GAIN_DB: f64 = 18.0;
/// Integrated loudness below this value is treated as silence.
pub const SILENCE_LUFS: f64 = -69.0;
const FRAMES_PER_CHUNK: usize = 4096;

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Mode {
    #[default]
    Off,
    Track,
    Album,
}
impl Mode {}

#[derive(Clone, Copy, Debug)]
pub struct Tags {
    pub track_gain_db: Option<f64>,
    pub track_peak_db: Option<f64>,
    pub album_gain_db: Option<f64>,
    pub album_peak_db: Option<f64>,
}
impl Tags {}

#[derive(Clone, Debug)]
pub struct Row {
    pub lufs: f64,
    pub peak_db: f64,
    pub album_gain_db: Option<f64>,
    pub album_key: String,
    pub duration: f64,
    /// Mean square of the gated loudness, used to combine an album.
    pub energy: f64,
    pub source: String,
    pub modified: u64,
}
impl Row {
    pub fn measured(track: &Track, lufs: f64, peak_db: f64) -> Self {
        let integrated = if lufs.is_finite() {
            lufs.max(SILENCE_LUFS)
        } else {
            SILENCE_LUFS
        };
        Self {
            lufs: integrated,
            peak_db: if peak_db.is_finite() { peak_db } else { 0.0 },
            album_gain_db: None,
            album_key: album_key(track),
            duration: track.duration.max(0.0),
            energy: energy(integrated),
            source: "scan".into(),
            modified: track.modified,
        }
    }
    pub fn unmeasurable(track: &Track) -> Self {
        let mut row = Self::measured(track, SILENCE_LUFS, 0.0);
        row.source = "none".into();
        row
    }
    pub fn from_tags(track: &Track, tags: &Tags) -> Option<Self> {
        let gain = tags.track_gain_db?;
        let peak = tags.track_peak_db.unwrap_or(CEILING_DB);
        let lufs = (TARGET_LUFS - gain).max(SILENCE_LUFS);
        Some(Self {
            lufs,
            peak_db: peak,
            album_gain_db: tags.album_gain_db.map(|gain| {
                let peak = tags
                    .album_peak_db
                    .or(tags.track_peak_db)
                    .unwrap_or(CEILING_DB);
                gain.min(CEILING_DB - peak)
            }),
            album_key: album_key(track),
            duration: track.duration.max(0.0),
            energy: energy(lufs),
            source: "tag".into(),
            modified: track.modified,
        })
    }
}

/// Album identity matches the interface grouping: every artist plus the album.
pub fn album_key(track: &Track) -> String {
    format!("{}\u{0}{}", track.artists.join(", "), track.album)
}
pub fn energy(lufs: f64) -> f64 {
    10_f64.powf((lufs + 0.691) / 10.0)
}
pub fn clamp_gain(gain: f64) -> f64 {
    if gain.is_finite() {
        gain.clamp(MIN_GAIN_DB, MAX_GAIN_DB)
    } else {
        0.0
    }
}
/// Track gain, capped so the measured peak stays under the limiter ceiling.
pub fn track_gain(lufs: f64, peak_db: f64) -> f64 {
    if !lufs.is_finite() || lufs <= SILENCE_LUFS {
        return 0.0;
    }
    let headroom = CEILING_DB - peak_db;
    clamp_gain((TARGET_LUFS - lufs).min(headroom))
}
/// Prefer an embedded album gain. Otherwise combine the gated energies of the
/// measured tracks; the error against a single album pass stays under about
/// 0.5 LU and needs no extra decoding.
pub fn album_gain(rows: &[Row]) -> Option<f64> {
    if rows.is_empty() {
        return None;
    }
    let peak = rows
        .iter()
        .map(|row| row.peak_db)
        .fold(f64::NEG_INFINITY, f64::max);
    if let Some(tagged) = rows.iter().find_map(|row| row.album_gain_db) {
        return Some(clamp_gain(tagged.min(CEILING_DB - peak)));
    }
    let total: f64 = rows.iter().map(|row| row.duration.max(0.001)).sum();
    let energy: f64 = rows
        .iter()
        .map(|row| row.energy * row.duration.max(0.001))
        .sum::<f64>()
        / total;
    if !energy.is_finite() || energy <= 0.0 {
        return None;
    }
    let lufs = -0.691 + 10.0 * energy.log10();
    Some(track_gain(lufs.max(SILENCE_LUFS), peak))
}

pub struct Measurement {
    pub lufs: f64,
    pub peak_db: f64,
}
pub fn measure(path: &Path, duration: f64) -> Result<Measurement, String> {
    let mut source =
        crate::audio::open(path, Some(Duration::from_secs_f64(duration.max(0.0))), None)?;
    let channels = source.channels().max(1) as u32;
    let rate = source.sample_rate().max(1);
    if channels > 2 {
        return Err("Поддерживаются моно- и стереозаписи.".into());
    }
    let mut meter = EbuR128::new(channels, rate, Modes::I | Modes::TRUE_PEAK)
        .map_err(|error| error.to_string())?;
    let mut buffer = Vec::with_capacity(FRAMES_PER_CHUNK * channels as usize);
    for sample in source.by_ref() {
        buffer.push(sample);
        if buffer.len() >= FRAMES_PER_CHUNK * channels as usize {
            meter.add_frames_f32(&buffer).map_err(|e| e.to_string())?;
            buffer.clear();
        }
    }
    if !buffer.is_empty() {
        let whole = buffer.len() / channels as usize * channels as usize;
        meter
            .add_frames_f32(&buffer[..whole])
            .map_err(|e| e.to_string())?;
    }
    let lufs = meter.loudness_global().map_err(|e| e.to_string())?;
    let mut peak = 0_f64;
    for channel in 0..channels {
        peak = peak.max(meter.true_peak(channel).map_err(|e| e.to_string())?);
    }
    Ok(Measurement {
        lufs,
        peak_db: if peak > 0.0 {
            20.0 * peak.log10()
        } else {
            f64::NEG_INFINITY
        },
    })
}

/// Background pass over the library. New and changed files are measured once;
/// the result is stored and picked up by the player on the next start.
pub struct Analyzer {
    stop: Arc<AtomicBool>,
    thread: Mutex<Option<JoinHandle<()>>>,
}
impl Analyzer {
    pub fn start(state: Arc<AppState>) -> Self {
        let stop = Arc::new(AtomicBool::new(false));
        let flag = stop.clone();
        let thread = std::thread::Builder::new()
            .name("sonotune-loudness".into())
            .spawn(move || {
                let started = crate::model::now();
                while !flag.load(Ordering::Acquire) && !state.closing.load(Ordering::Acquire) {
                    // Leveling of the playing queue is the urgent case. With the
                    // feature off only files imported in this session are measured,
                    // so an existing library is not decoded for hours unasked.
                    let background = !matches!(
                        state.db.state::<Mode>("normalization").ok().flatten(),
                        Some(Mode::Track) | Some(Mode::Album)
                    );
                    let since = if background { started } else { 0 };
                    let pending = state.db.pending_loudness(8, since).unwrap_or_default();
                    let ready: Vec<_> = pending
                        .into_iter()
                        .filter(|track| Path::new(&track.path).is_file())
                        .collect();
                    if ready.is_empty() {
                        std::thread::sleep(Duration::from_secs(2));
                        continue;
                    }
                    for track in ready {
                        if flag.load(Ordering::Acquire) || state.closing.load(Ordering::Acquire) {
                            return;
                        }
                        // Keep the decoder away from tag writes and scans of the same file.
                        let row = {
                            let Ok(_files) = state.file_work.lock() else {
                                continue;
                            };
                            match measure(Path::new(&track.path), track.duration) {
                                Ok(value) => Row::measured(&track, value.lufs, value.peak_db),
                                Err(_) => Row::unmeasurable(&track),
                            }
                        };
                        if state.db.save_loudness(&track.id, &row).is_ok() {
                            let _ = state.engine.command(PlayerCommand::RefreshGain);
                        }
                        std::thread::sleep(Duration::from_millis(if background {
                            1500
                        } else {
                            120
                        }));
                    }
                }
            })
            .expect("Could not start loudness analyzer");
        Self {
            stop,
            thread: Mutex::new(Some(thread)),
        }
    }
    pub fn shutdown(&self) {
        self.stop.store(true, Ordering::Release);
        if let Ok(mut thread) = self.thread.lock() {
            if let Some(thread) = thread.take() {
                let _ = thread.join();
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    fn track(album: &str, duration: f64) -> Track {
        Track {
            id: "id".into(),
            path: "song.wav".into(),
            title: "Song".into(),
            artists: vec!["Artist".into()],
            album: album.into(),
            year: None,
            genres: vec![],
            duration,
            artwork: None,
            format: "WAV".into(),
            size: 1,
            modified: 1,
            added_at: 1,
            favorite: false,
            available: true,
            demo: false,
        }
    }
    fn wav(path: &Path, amplitude: f32, seconds: f64) {
        let rate = 48_000_u32;
        let frames = (rate as f64 * seconds) as u32;
        let mut file = std::fs::File::create(path).unwrap();
        let data = frames * 4;
        file.write_all(b"RIFF").unwrap();
        file.write_all(&(36 + data).to_le_bytes()).unwrap();
        file.write_all(b"WAVEfmt ").unwrap();
        file.write_all(&16_u32.to_le_bytes()).unwrap();
        file.write_all(&1_u16.to_le_bytes()).unwrap();
        file.write_all(&2_u16.to_le_bytes()).unwrap();
        file.write_all(&rate.to_le_bytes()).unwrap();
        file.write_all(&(rate * 4).to_le_bytes()).unwrap();
        file.write_all(&4_u16.to_le_bytes()).unwrap();
        file.write_all(&16_u16.to_le_bytes()).unwrap();
        file.write_all(b"data").unwrap();
        file.write_all(&data.to_le_bytes()).unwrap();
        for i in 0..frames {
            let value = amplitude * (std::f32::consts::TAU * 997.0 * i as f32 / rate as f32).sin();
            let sample = (value * 32767.0) as i16;
            file.write_all(&sample.to_le_bytes()).unwrap();
            file.write_all(&sample.to_le_bytes()).unwrap();
        }
    }
    #[test]
    fn measures_reference_levels_and_caps_gain_by_peak() {
        let directory = tempfile::tempdir().unwrap();
        let quiet = directory.path().join("quiet.wav");
        wav(&quiet, 0.1, 2.0);
        let measured = measure(&quiet, 2.0).unwrap();
        assert!(
            (measured.lufs + 20.0).abs() < 0.7,
            "integrated {}",
            measured.lufs
        );
        assert!((measured.peak_db + 20.0).abs() < 0.5);
        let gain = track_gain(measured.lufs, measured.peak_db);
        assert!(gain > 0.0 && gain < 3.0);

        let loud = directory.path().join("loud.wav");
        wav(&loud, 0.9, 1.0);
        let measured = measure(&loud, 1.0).unwrap();
        let gain = track_gain(measured.lufs, measured.peak_db);
        // The peak cap keeps the output under the ceiling instead of reaching -18 LUFS.
        assert!(measured.peak_db + gain <= CEILING_DB + 1e-6);
        assert!(gain < 0.0);
    }
    #[test]
    fn silent_and_broken_files_become_inert_rows() {
        let directory = tempfile::tempdir().unwrap();
        let silent = directory.path().join("silent.wav");
        wav(&silent, 0.0, 1.0);
        let measured = measure(&silent, 1.0).unwrap();
        assert_eq!(track_gain(measured.lufs, measured.peak_db), 0.0);
        assert!(measure(&directory.path().join("missing.wav"), 1.0).is_err());
    }
    #[test]
    fn album_gain_prefers_tags_and_combines_energy_otherwise() {
        let loud = Row::measured(&track("Album", 60.0), -10.0, -2.0);
        let quiet = Row::measured(&track("Album", 120.0), -20.0, -12.0);
        let combined = album_gain(&[loud.clone(), quiet.clone()]).unwrap();
        let album_lufs =
            -0.691 + 10.0 * ((energy(-10.0) * 60.0 + energy(-20.0) * 120.0) / 180.0).log10();
        let expected = track_gain(album_lufs, -2.0);
        assert!((combined - expected).abs() < 0.1, "combined {combined}");
        let mut tagged = quiet.clone();
        tagged.album_gain_db = Some(-3.5);
        let tagged_gain = album_gain(&[loud, tagged]).unwrap();
        assert!((tagged_gain + 3.5).abs() < 1e-6);
    }
    #[test]
    fn tag_rows_reconstruct_the_measured_level() {
        let tags = Tags {
            track_gain_db: Some(-6.5),
            track_peak_db: Some(-0.2),
            album_gain_db: Some(-5.0),
            album_peak_db: None,
        };
        let row = Row::from_tags(&track("Album", 180.0), &tags).unwrap();
        assert!((row.lufs - (TARGET_LUFS + 6.5)).abs() < 1e-6);
        assert!((row.energy - energy(row.lufs)).abs() < 1e-9);
        assert_eq!(row.album_gain_db, Some(-5.0));
        assert_eq!(row.source, "tag");
        assert!(Row::from_tags(
            &track("Album", 1.0),
            &Tags {
                track_gain_db: None,
                track_peak_db: None,
                album_gain_db: None,
                album_peak_db: None,
            }
        )
        .is_none());
    }
}
