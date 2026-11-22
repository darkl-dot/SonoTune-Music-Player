//! M3U / M3U8 playlist import and export helpers.
use crate::model::{Playlist, Track};
use std::{
    collections::HashMap,
    path::{Path, PathBuf},
};

pub fn format_m3u8(playlist: &Playlist, tracks: &HashMap<&str, &Track>) -> String {
    let mut out = String::from("#EXTM3U\n");
    let clean_name = playlist.name.replace(['\r', '\n'], " ");
    out.push_str(&format!("#PLAYLIST:{clean_name}\n"));
    for id in &playlist.track_ids {
        let Some(track) = tracks.get(id.as_str()) else {
            continue;
        };
        let duration = if track.duration.is_finite() && track.duration > 0.0 {
            track.duration.round() as i64
        } else {
            -1
        };
        let artist = if track.artists.is_empty() {
            "Unknown Artist".to_owned()
        } else {
            track.artists.join(", ")
        };
        let title = track.title.replace(['\r', '\n'], " ");
        let artist = artist.replace(['\r', '\n'], " ");
        out.push_str(&format!("#EXTINF:{duration},{artist} - {title}\n"));
        out.push_str(&track.path);
        out.push('\n');
    }
    out
}

pub fn parse_m3u(content: &str, base_dir: &Path) -> (Option<String>, Vec<PathBuf>) {
    let text = content.strip_prefix('\u{feff}').unwrap_or(content);
    let mut name = None;
    let mut paths = Vec::new();
    for raw_line in text.lines() {
        let line = raw_line.trim();
        if line.is_empty() {
            continue;
        }
        if let Some(title) = line.strip_prefix("#PLAYLIST:") {
            let trimmed = title.trim();
            if !trimmed.is_empty() && name.is_none() {
                name = Some(trimmed.chars().take(100).collect());
            }
            continue;
        }
        if line.starts_with('#') {
            continue;
        }
        let candidate = Path::new(line);
        let resolved = if candidate.is_absolute() {
            candidate.to_path_buf()
        } else {
            base_dir.join(candidate)
        };
        paths.push(resolved);
    }
    (name, paths)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn formats_and_parses_m3u8_with_bom_and_relative_paths() {
        let track = Track {
            id: "t1".into(),
            path: "C:\\Music\\Album\\song.flac".into(),
            title: "Morning".into(),
            artists: vec!["Dayroom".into()],
            album: "Test".into(),
            year: None,
            genres: vec![],
            duration: 123.4,
            artwork: None,
            format: "FLAC".into(),
            size: 100,
            modified: 1,
            added_at: 1,
            favorite: false,
            available: true,
            demo: false,
        };
        let playlist = Playlist {
            id: "p1".into(),
            name: "Chill Mix".into(),
            track_ids: vec!["t1".into(), "missing".into()],
            created_at: 1,
            artwork: None,
        };
        let mut by_id = HashMap::new();
        by_id.insert(track.id.as_str(), &track);
        let m3u = format_m3u8(&playlist, &by_id);
        assert!(m3u.starts_with("#EXTM3U\n#PLAYLIST:Chill Mix\n"));
        assert!(m3u.contains("#EXTINF:123,Dayroom - Morning\nC:\\Music\\Album\\song.flac\n"));

        let with_bom = format!(
            "\u{feff}#EXTM3U\n#PLAYLIST:Imported\n#EXTINF:90,A - B\nsub/track.mp3\n\n{}",
            track.path
        );
        let (name, paths) = parse_m3u(&with_bom, Path::new("C:\\Lists"));
        assert_eq!(name.as_deref(), Some("Imported"));
        assert_eq!(paths.len(), 2);
        assert_eq!(paths[0], PathBuf::from("C:\\Lists").join("sub/track.mp3"));
        assert_eq!(paths[1], PathBuf::from(&track.path));
    }
}
