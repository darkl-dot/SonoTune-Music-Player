//! Streaming source selection. Rodio handles the existing formats; Ogg Opus
//! uses libopus without decoding the entire recording into memory.
use rodio::{source::SeekError, Decoder, Source};
use std::{
    fs::File,
    io::{Read, Seek},
    path::Path,
    time::Duration,
};
use symphonia::core::{
    audio::SampleBuffer,
    codecs::{
        CodecParameters, CodecRegistry, Decoder as CodecDecoder, DecoderOptions, CODEC_TYPE_OPUS,
    },
    errors::Error,
    formats::{FormatOptions, FormatReader, SeekMode, SeekTo},
    io::MediaSourceStream,
    meta::MetadataOptions,
    probe::Hint,
};
use symphonia_adapter_libopus::OpusDecoder;

pub type ErrorHandler = Box<dyn Fn(String) + Send>;
pub type AudioSource = Box<dyn Source<Item = f32> + Send>;

pub fn open(
    path: &Path,
    duration: Option<Duration>,
    on_error: Option<ErrorHandler>,
) -> Result<AudioSource, String> {
    let mut file = File::open(path).map_err(|e| format!("Файл недоступен: {e}"))?;
    let mut magic = [0; 4];
    let length = file.read(&mut magic).map_err(|e| e.to_string())?;
    file.rewind().map_err(|e| e.to_string())?;
    if length == 4 && &magic == b"OggS" {
        let stream = MediaSourceStream::new(Box::new(file), Default::default());
        let mut hint = Hint::new();
        hint.with_extension("ogg");
        // Opus pre-skip and end trimming are applied below exactly once. The
        // generic Ogg gapless rules are designed primarily for Vorbis.
        let format = symphonia::default::get_probe()
            .format(
                &hint,
                stream,
                &FormatOptions::default(),
                &MetadataOptions::default(),
            )
            .map_err(|e| e.to_string())?
            .format;
        if let Some(track) = format
            .default_track()
            .filter(|track| track.codec_params.codec == CODEC_TYPE_OPUS)
        {
            let id = track.id;
            let params = track.codec_params.clone();
            let duration = duration
                .filter(|value| !value.is_zero())
                .or_else(|| opus_duration(path).ok())
                .ok_or("Не удалось определить длительность Opus")?;
            return Ok(Box::new(OpusSource::new(
                format, params, id, duration, on_error,
            )?));
        }
        file = File::open(path).map_err(|e| e.to_string())?;
    }
    Decoder::try_from(file)
        .map(|source| Box::new(source) as AudioSource)
        .map_err(|e| e.to_string())
}

fn opus_duration(path: &Path) -> Result<Duration, String> {
    use lofty::{config::ParseOptions, file::AudioFile, probe::Probe};
    let file = Probe::open(path)
        .map_err(|e| e.to_string())?
        .guess_file_type()
        .map_err(|e| e.to_string())?
        .options(ParseOptions::new().read_tags(false))
        .read()
        .map_err(|e| e.to_string())?;
    Ok(file.properties().duration())
}

struct OpusSource {
    format: Box<dyn FormatReader>,
    decoder: Box<dyn CodecDecoder>,
    track_id: u32,
    samples: SampleBuffer<f32>,
    offset: usize,
    packet_ts: u64,
    channels: u16,
    duration: Duration,
    origin_ts: u64,
    pre_skip: u64,
    remaining: u64,
    gain: f32,
    on_error: Option<ErrorHandler>,
}

impl OpusSource {
    fn new(
        format: Box<dyn FormatReader>,
        mut params: CodecParameters,
        track_id: u32,
        duration: Duration,
        on_error: Option<ErrorHandler>,
    ) -> Result<Self, String> {
        let header = params
            .extra_data
            .as_deref()
            .ok_or("Отсутствует заголовок Opus")?;
        if header.len() < 19 || &header[..8] != b"OpusHead" {
            return Err("Повреждён заголовок Opus".into());
        }
        let channels = u16::from(header[9]);
        if !(1..=2).contains(&channels) {
            return Err("Поддерживаются моно- и стереозаписи Opus.".into());
        }
        let pre_skip = u16::from_le_bytes([header[10], header[11]]) as u64;
        let gain_db = i16::from_le_bytes([header[16], header[17]]) as f32 / 256.0;
        let origin_ts = params.start_ts;
        let mut header = header.to_vec();
        header[10] = 0;
        header[11] = 0;
        params.extra_data = Some(header.into_boxed_slice());
        let mut registry = CodecRegistry::new();
        registry.register_all::<OpusDecoder>();
        let decoder = registry
            .make(&params, &DecoderOptions::default())
            .map_err(|e| e.to_string())?;
        let spec = symphonia::core::audio::SignalSpec::new(
            48_000,
            params.channels.ok_or("Не указаны каналы Opus")?,
        );
        let mut source = Self {
            format,
            decoder,
            track_id,
            samples: SampleBuffer::new(5760, spec),
            offset: 0,
            packet_ts: 0,
            channels,
            duration,
            origin_ts,
            pre_skip,
            remaining: (duration.as_secs_f64() * 48_000.0).round() as u64 * u64::from(channels),
            gain: 10_f32.powf(gain_db / 20.0),
            on_error,
        };
        source
            .discard_until(origin_ts + pre_skip)
            .map_err(|e| e.to_string())?;
        Ok(source)
    }

    fn fill(&mut self) -> Result<bool, Error> {
        loop {
            let packet = match self.format.next_packet() {
                Ok(packet) => packet,
                Err(Error::IoError(error)) if error.kind() == std::io::ErrorKind::UnexpectedEof => {
                    return Ok(false)
                }
                Err(error) => return Err(error),
            };
            if packet.track_id() != self.track_id {
                continue;
            }
            let decoded = self.decoder.decode(&packet)?;
            if decoded.spec().rate != 48_000
                || decoded.spec().channels.count() != usize::from(self.channels)
            {
                return Err(Error::Unsupported("Opus channel layout changed"));
            }
            self.samples.copy_interleaved_ref(decoded);
            self.offset = 0;
            self.packet_ts = packet.ts;
            if !self.samples.is_empty() {
                return Ok(true);
            }
        }
    }

    fn discard_until(&mut self, target: u64) -> Result<(), Error> {
        loop {
            if !self.fill()? {
                return Err(Error::DecodeError(
                    "Opus ended before the requested position",
                ));
            }
            let frames = self.samples.len() as u64 / u64::from(self.channels);
            if self.packet_ts > target {
                return Err(Error::DecodeError(
                    "Opus seek skipped the requested position",
                ));
            }
            if self.packet_ts.saturating_add(frames) > target {
                self.offset = (target - self.packet_ts) as usize * usize::from(self.channels);
                return Ok(());
            }
        }
    }
    fn fail(&mut self, error: impl std::fmt::Display) {
        self.remaining = 0;
        if let Some(report) = self.on_error.take() {
            report(format!("Не удалось прочитать Opus: {error}"));
        }
    }
}

impl Iterator for OpusSource {
    type Item = f32;
    fn next(&mut self) -> Option<f32> {
        if self.remaining == 0 {
            return None;
        }
        if self.offset >= self.samples.len() {
            match self.fill() {
                Ok(true) => {}
                Ok(false) => {
                    self.fail("файл закончился раньше указанной длительности");
                    return None;
                }
                Err(error) => {
                    self.fail(error);
                    return None;
                }
            }
        }
        let value = self.samples.samples()[self.offset] * self.gain;
        self.offset += 1;
        self.remaining -= 1;
        Some(value)
    }
}
impl Source for OpusSource {
    fn current_span_len(&self) -> Option<usize> {
        Some(self.remaining.min(usize::MAX as u64) as usize)
    }
    fn channels(&self) -> u16 {
        self.channels
    }
    fn sample_rate(&self) -> u32 {
        48_000
    }
    fn total_duration(&self) -> Option<Duration> {
        Some(self.duration)
    }
    fn try_seek(&mut self, position: Duration) -> Result<(), SeekError> {
        let position = position.min(self.duration);
        let frames = (position.as_secs_f64() * 48_000.0).round() as u64;
        if position == self.duration {
            self.remaining = 0;
            return Ok(());
        }
        let raw_target = self.origin_ts + self.pre_skip + frames;
        let preroll = raw_target.saturating_sub(3840).max(self.origin_ts);
        let time = Duration::from_secs_f64(preroll as f64 / 48_000.0);
        self.format
            .seek(
                SeekMode::Accurate,
                SeekTo::Time {
                    time: time.into(),
                    track_id: Some(self.track_id),
                },
            )
            .map_err(|e| SeekError::Other(Box::new(e)))?;
        self.decoder.reset();
        self.discard_until(raw_target)
            .map_err(|e| SeekError::Other(Box::new(e)))?;
        self.remaining = ((self.duration.as_secs_f64() * 48_000.0).round() as u64)
            .saturating_sub(frames)
            * u64::from(self.channels);
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture(name: &str) -> std::path::PathBuf {
        Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../tests/fixtures")
            .join(name)
    }
    #[test]
    fn opus_mono_and_stereo_decode_to_exact_audible_duration() {
        for (name, channels, seconds) in [("tone.opus", 1, 1), ("stereo.opus", 2, 4)] {
            let source = open(&fixture(name), None, None).unwrap();
            assert_eq!(source.channels(), channels);
            assert_eq!(source.sample_rate(), 48_000);
            assert_eq!(source.total_duration(), Some(Duration::from_secs(seconds)));
            let samples: Vec<_> = source.collect();
            assert_eq!(
                samples.len(),
                48_000 * channels as usize * seconds as usize,
                "{name}"
            );
            assert!(samples.iter().all(|v| v.is_finite()));
            assert!(samples.iter().any(|v| v.abs() > 0.01));
        }
    }
    #[test]
    fn opus_seek_forward_backward_and_end_preserve_duration_and_channel_alignment() {
        let baseline: Vec<_> = open(&fixture("stereo.opus"), None, None).unwrap().collect();
        let mut source = open(&fixture("stereo.opus"), None, None).unwrap();
        for seconds in [2.0, 0.0, 3.5, 1.0] {
            source.try_seek(Duration::from_secs_f64(seconds)).unwrap();
            let samples: Vec<_> = source.by_ref().collect();
            assert_eq!(samples.len(), ((4.0 - seconds) * 48_000.0 * 2.0) as usize);
            let expected = &baseline[(seconds * 48_000.0 * 2.0) as usize..];
            let error = samples
                .iter()
                .zip(expected)
                .skip(9600)
                .map(|(a, b)| f64::from(a - b).powi(2))
                .sum::<f64>()
                / (samples.len() - 9600) as f64;
            assert!(
                error.sqrt() < 0.002,
                "seek to {seconds}s selected the wrong audio: RMS error={}",
                error.sqrt()
            );
        }
        source.try_seek(Duration::from_secs(100)).unwrap();
        assert_eq!(source.next(), None);
    }
    #[test]
    fn opus_is_detected_by_content_in_an_ogg_file() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("track.ogg");
        std::fs::copy(fixture("tone.opus"), &path).unwrap();
        assert_eq!(open(&path, None, None).unwrap().count(), 48_000);
    }
    #[test]
    fn malformed_opus_returns_an_error() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("broken.opus");
        std::fs::write(&path, b"OggSbroken").unwrap();
        assert!(open(&path, None, None).is_err());
    }
    #[test]
    fn short_single_page_opus_trims_encoder_delay_and_seeks_to_the_middle() {
        let mut source = open(&fixture("short.opus"), None, None).unwrap();
        assert_eq!(source.by_ref().count(), 4800);
        source.try_seek(Duration::from_millis(50)).unwrap();
        assert_eq!(source.count(), 2400);
    }
    #[test]
    fn opus_header_output_gain_is_applied() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("gain.opus");
        let mut bytes = std::fs::read(fixture("tone.opus")).unwrap();
        let header = bytes
            .windows(8)
            .position(|value| value == b"OpusHead")
            .unwrap();
        bytes[header + 16..header + 18].copy_from_slice(&(6_i16 * 256).to_le_bytes());
        let segments = bytes[26] as usize;
        let page_len = 27
            + segments
            + bytes[27..27 + segments]
                .iter()
                .map(|v| *v as usize)
                .sum::<usize>();
        bytes[22..26].fill(0);
        let mut crc = 0_u32;
        for byte in &bytes[..page_len] {
            crc ^= u32::from(*byte) << 24;
            for _ in 0..8 {
                crc = if crc & 0x8000_0000 != 0 {
                    (crc << 1) ^ 0x04c1_1db7
                } else {
                    crc << 1
                };
            }
        }
        bytes[22..26].copy_from_slice(&crc.to_le_bytes());
        std::fs::write(&path, bytes).unwrap();
        let baseline = open(&fixture("tone.opus"), None, None).unwrap();
        let amplified = open(&path, None, None).unwrap();
        let factor = 10_f32.powf(6.0 / 20.0);
        for (original, adjusted) in baseline.zip(amplified) {
            assert!((adjusted - original * factor).abs() < 0.000001);
        }
    }
}
