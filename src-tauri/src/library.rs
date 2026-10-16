use crate::{
    metadata,
    model::{now, Library, ScanProgress, Track},
    storage::Database,
};
use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    sync::atomic::{AtomicBool, Ordering},
};
use tauri::ipc::Channel;
use walkdir::WalkDir;

pub fn supported(path: &Path) -> bool {
    path.extension().is_some_and(|extension| {
        matches!(
            extension.to_string_lossy().to_lowercase().as_str(),
            "mp3" | "flac" | "wav" | "ogg" | "opus" | "m4a" | "aac"
        )
    })
}
pub fn scan(
    db: &Database,
    roots: &[PathBuf],
    data_dir: &Path,
    cancel: &AtomicBool,
    progress: Option<&Channel<ScanProgress>>,
    demo: bool,
) -> Result<Library, String> {
    let before = db.load()?;
    let existing: HashMap<_, _> = before.tracks.iter().map(|t| (t.path.as_str(), t)).collect();
    let mut status = ScanProgress {
        scanned: 0,
        imported: 0,
        errors: 0,
        done: false,
        cancelled: false,
    };
    let mut batch = Vec::with_capacity(32);
    let mut seen = std::collections::HashSet::new();
    for root in roots {
        if cancel.load(Ordering::Relaxed) {
            break;
        }
        // Do not mark tracks missing when a whole volume is unavailable.
        if !root.is_dir() {
            status.errors += 1;
            continue;
        }
        for entry in WalkDir::new(root).follow_links(false) {
            if cancel.load(Ordering::Relaxed) {
                status.cancelled = true;
                break;
            }
            let entry = match entry {
                Ok(v) => v,
                Err(_) => {
                    status.errors += 1;
                    continue;
                }
            };
            if !entry.file_type().is_file() || !supported(entry.path()) {
                continue;
            }
            let path = match dunce::canonicalize(entry.path()) {
                Ok(v) => v,
                Err(_) => {
                    status.errors += 1;
                    continue;
                }
            };
            let key = path.to_string_lossy().into_owned();
            if !seen.insert(key.clone()) {
                continue;
            }
            status.scanned += 1;
            let previous = existing.get(key.as_str()).copied();
            let stamp = metadata::file_stamp(&path);
            if let (Some(old), Ok((size, modified))) = (previous, &stamp) {
                if old.size == *size
                    && old.modified == *modified
                    && old.available
                    && !PathBuf::from(format!("{}.sonotune.json", path.display())).exists()
                {
                    continue;
                }
            }
            let track = match metadata::read_track(&path, previous, data_dir, demo) {
                Ok(track) => track,
                Err(_) => {
                    status.errors += 1;
                    let (size, modified) = stamp.unwrap_or_default();
                    previous
                        .cloned()
                        .map(|mut t| {
                            t.available = true;
                            t
                        })
                        .unwrap_or_else(|| Track {
                            id: uuid::Uuid::new_v4().to_string(),
                            path: key,
                            title: path
                                .file_stem()
                                .unwrap_or_default()
                                .to_string_lossy()
                                .into_owned(),
                            artists: vec![],
                            album: "Без альбома".into(),
                            year: None,
                            genres: vec![],
                            duration: 0.0,
                            artwork: None,
                            format: path
                                .extension()
                                .unwrap_or_default()
                                .to_string_lossy()
                                .to_uppercase(),
                            size,
                            modified,
                            added_at: now(),
                            favorite: false,
                            available: true,
                            demo,
                        })
                }
            };
            batch.push(track);
            status.imported += 1;
            if batch.len() >= 32 {
                db.upsert_batch(&batch)?;
                batch.clear();
            }
            if status.scanned % 8 == 0 {
                if let Some(channel) = progress {
                    let _ = channel.send(status.clone());
                }
            }
        }
    }
    db.upsert_batch(&batch)?;
    // Missing files remain in playlists and can become available again later.
    if !status.cancelled {
        let missing: Vec<_> = before
            .tracks
            .iter()
            .filter(|track| {
                roots
                    .iter()
                    .any(|root| Path::new(&track.path).starts_with(root) && root.is_dir())
                    && !Path::new(&track.path).is_file()
            })
            .cloned()
            .map(|mut track| {
                track.available = false;
                track
            })
            .collect();
        db.upsert_batch(&missing)?;
    }
    status.cancelled |= cancel.load(Ordering::Relaxed);
    status.done = true;
    if let Some(channel) = progress {
        let _ = channel.send(status);
    }
    db.load()
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn extensions_are_case_insensitive() {
        assert!(supported(Path::new("song.FLAC")));
        assert!(supported(Path::new("song.ogg")));
        assert!(supported(Path::new("song.OPUS")));
        assert!(supported(Path::new("song.M4A")));
        assert!(supported(Path::new("song.AAC")));
        assert!(!supported(Path::new("song.mp3.exe")));
        assert!(!supported(Path::new("folder")));
    }
    #[test]
    fn incremental_rescan_finds_additions_and_missing_files_without_reparsing_unchanged_audio() {
        let directory = tempfile::tempdir().unwrap();
        let music = directory.path().join("music");
        std::fs::create_dir(&music).unwrap();
        let source = Path::new(env!("CARGO_MANIFEST_DIR")).join("../tests/fixtures/tone.flac");
        let a = music.join("a.flac");
        std::fs::copy(&source, &a).unwrap();
        let db = Database::open(&directory.path().join("test.sqlite")).unwrap();
        let cancel = AtomicBool::new(false);
        let scan_now = || {
            scan(
                &db,
                std::slice::from_ref(&music),
                directory.path(),
                &cancel,
                None,
                false,
            )
            .unwrap()
        };
        let track = scan_now().tracks.remove(0);
        // A cached-only title would be replaced by the file title if parsed again.
        let mut cached = track.clone();
        cached.title = "keep cached metadata".into();
        db.upsert_batch(&[cached]).unwrap();
        db.set_favorite(&track.id, true).unwrap();
        assert_eq!(scan_now().tracks[0].title, "keep cached metadata");
        std::fs::copy(&source, music.join("b.flac")).unwrap();
        std::fs::remove_file(a).unwrap();
        let library = scan_now();
        assert_eq!(library.tracks.len(), 2);
        let old = library.tracks.iter().find(|t| t.id == track.id).unwrap();
        assert!(!old.available);
        assert!(old.favorite);
        assert!(library
            .tracks
            .iter()
            .any(|t| t.id != track.id && t.available));
        std::fs::rename(&music, directory.path().join("offline")).unwrap();
        let library = scan_now();
        assert!(library.tracks.iter().any(|t| t.available));
    }
    #[test]
    fn scanner_handles_nested_folders_broken_files_and_cancellation() {
        let directory = tempfile::tempdir().unwrap();
        let music = directory.path().join("music");
        std::fs::create_dir_all(music.join("nested")).unwrap();
        let fixtures = Path::new(env!("CARGO_MANIFEST_DIR")).join("../tests/fixtures");
        std::fs::copy(fixtures.join("tone.flac"), music.join("nested/song.FLAC")).unwrap();
        std::fs::copy(fixtures.join("tone.opus"), music.join("nested/song.OPUS")).unwrap();
        std::fs::write(music.join("broken.mp3"), b"not an audio file").unwrap();
        std::fs::write(music.join("ignore.txt"), b"text").unwrap();
        let db = Database::open(&directory.path().join("test.sqlite")).unwrap();
        let cancel = AtomicBool::new(true);
        assert!(scan(
            &db,
            &[music.clone()],
            directory.path(),
            &cancel,
            None,
            false
        )
        .unwrap()
        .tracks
        .is_empty());
        cancel.store(false, Ordering::Relaxed);
        let first = scan(
            &db,
            &[music.clone()],
            directory.path(),
            &cancel,
            None,
            false,
        )
        .unwrap();
        assert_eq!(first.tracks.len(), 3);
        let second = scan(&db, &[music], directory.path(), &cancel, None, false).unwrap();
        assert_eq!(second.tracks.len(), 3);
        assert_eq!(first.tracks[0].id, second.tracks[0].id);
    }
}
