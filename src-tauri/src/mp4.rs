//! Read encoder trim instructions without reading the mdat/audio payload.
//! Only a single normal-speed audio edit is supported; complex edits are left
//! untouched rather than guessing and discarding intentional audio.
use std::{
    fs::File,
    io::{Read, Seek, SeekFrom},
    path::Path,
};
#[derive(Clone, Copy, Debug)]
pub struct Trim {
    pub start: u64,
    pub frames: u64,
}
fn u32be(b: &[u8], p: usize) -> Option<u32> {
    Some(u32::from_be_bytes(b.get(p..p + 4)?.try_into().ok()?))
}
fn u64be(b: &[u8], p: usize) -> Option<u64> {
    Some(u64::from_be_bytes(b.get(p..p + 8)?.try_into().ok()?))
}
fn atoms(mut b: &[u8]) -> impl Iterator<Item = ([u8; 4], &[u8])> {
    std::iter::from_fn(move || {
        if b.len() < 8 {
            return None;
        }
        let kind = b[4..8].try_into().ok()?;
        let (size, header) = match u32be(b, 0)? {
            0 => (b.len(), 8),
            1 => (usize::try_from(u64be(b, 8)?).ok()?, 16),
            n => (n as usize, 8),
        };
        if size < header || size > b.len() {
            b = &[];
            return None;
        }
        let data = &b[header..size];
        b = &b[size..];
        Some((kind, data))
    })
}
fn child<'a>(b: &'a [u8], name: &[u8; 4]) -> Option<&'a [u8]> {
    atoms(b).find(|(k, _)| k == name).map(|(_, v)| v)
}
fn clock(b: &[u8]) -> Option<(u64, u64)> {
    match *b.first()? {
        0 => Some((u32be(b, 12)? as u64, u32be(b, 16)? as u64)),
        1 => Some((u32be(b, 20)? as u64, u64be(b, 24)?)),
        _ => None,
    }
}
fn smpb(b: &[u8]) -> Option<Trim> {
    let ilst = child(child(child(b, b"udta")?, b"meta")?.get(4..)?, b"ilst")?;
    for (_, item) in atoms(ilst).filter(|(k, _)| k == b"----") {
        if child(item, b"name").and_then(|v| v.get(4..)) != Some(b"iTunSMPB".as_slice())
            || child(item, b"mean").and_then(|v| v.get(4..)) != Some(b"com.apple.iTunes".as_slice())
        {
            continue;
        }
        let text = std::str::from_utf8(child(item, b"data")?.get(8..)?).ok()?;
        let values: Vec<_> = text
            .split_whitespace()
            .take(4)
            .map(|s| u64::from_str_radix(s, 16))
            .collect();
        if values.len() == 4 {
            return Some(Trim {
                start: *values[1].as_ref().ok()?,
                frames: *values[3].as_ref().ok()?,
            });
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn malformed_and_oversized_atoms_do_not_allocate_or_panic() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("test.m4a");
        for data in [
            b"\0\0\0\x01moov".as_slice(),
            b"\0\0\0\x04moov",
            b"\xff\xff\xff\xffmoov",
            b"\0\0\0\x08moov",
        ] {
            std::fs::write(&path, data).unwrap();
            assert!(trim(&path, 44100).is_none());
        }
    }
}
pub fn trim(path: &Path, sample_rate: u32) -> Option<Trim> {
    let mut f = File::open(path).ok()?;
    let length = f.metadata().ok()?.len();
    while f.stream_position().ok()? + 8 <= length {
        let start = f.stream_position().ok()?;
        let mut header = [0; 8];
        f.read_exact(&mut header).ok()?;
        let size = u32be(&header, 0)?;
        let (size, head) = match size {
            0 => (length - start, 8),
            1 => {
                let mut large = [0; 8];
                f.read_exact(&mut large).ok()?;
                (u64::from_be_bytes(large), 16)
            }
            n => (n as u64, 8),
        };
        if size < head || size > length - start {
            return None;
        }
        if &header[4..] == b"moov" {
            if size - head > 16 * 1024 * 1024 {
                return None;
            }
            let mut b = vec![0; (size - head) as usize];
            f.read_exact(&mut b).ok()?;
            if let Some(trim) = smpb(&b).filter(|t| t.frames > 0) {
                return Some(trim);
            }
            let (movie_scale, _) = clock(child(&b, b"mvhd")?)?;
            if movie_scale == 0 {
                return None;
            }
            for (_, track) in atoms(&b).filter(|(k, _)| k == b"trak") {
                let Some(mdia) = child(track, b"mdia") else {
                    continue;
                };
                if child(mdia, b"hdlr").and_then(|h| h.get(8..12)) != Some(b"soun".as_slice()) {
                    continue;
                }
                let (scale, total) = clock(child(mdia, b"mdhd")?)?;
                if scale == 0 {
                    return None;
                }
                let edit = child(child(track, b"edts")?, b"elst")?;
                if u32be(edit, 4)? != 1 {
                    return None;
                }
                let (duration, start, rate) = match edit[0] {
                    0 => (u32be(edit, 8)? as u64, u32be(edit, 12)? as u64, 16),
                    1 => (u64be(edit, 8)?, u64be(edit, 16)?, 24),
                    _ => return None,
                };
                if u32be(edit, rate)? != 0x00010000 || start >= total {
                    return None;
                }
                let edit_frames = duration.checked_mul(scale)? / movie_scale;
                let remaining = total - start;
                // Movie clocks commonly round to milliseconds. Prefer the
                // exact media clock when it differs by at most one movie tick.
                let audible = if remaining.abs_diff(edit_frames) <= scale.div_ceil(movie_scale) {
                    remaining
                } else {
                    remaining.min(edit_frames)
                };
                return Some(Trim {
                    start: start.checked_mul(sample_rate as u64)? / scale,
                    frames: audible.checked_mul(sample_rate as u64)? / scale,
                });
            }
            return None;
        }
        f.seek(SeekFrom::Start(start + size)).ok()?;
    }
    None
}
