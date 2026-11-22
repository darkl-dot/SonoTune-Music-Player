//! Keeps the library current: one pass at startup, then a recursive
//! file-system watcher that rescans only the folders that changed.
use crate::commands::{self, AppState};
use notify::{Event, RecommendedWatcher, RecursiveMode, Watcher};
use std::{
    collections::HashSet,
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, Ordering},
        mpsc, Arc, Mutex,
    },
    thread::JoinHandle,
    time::{Duration, Instant},
};
use tauri::{AppHandle, Emitter};

/// Wait for the file system to settle after the last change.
const QUIET: Duration = Duration::from_millis(1200);
/// Pick up added or removed library roots without restarting the app.
const ROOT_REFRESH: Duration = Duration::from_secs(5);

pub struct FolderWatcher {
    stop: Arc<AtomicBool>,
    thread: Mutex<Option<JoinHandle<()>>>,
}
impl FolderWatcher {
    pub fn start(app: AppHandle, state: Arc<AppState>) -> Self {
        let stop = Arc::new(AtomicBool::new(false));
        let flag = stop.clone();
        let thread = std::thread::Builder::new()
            .name("sonotune-watch".into())
            .spawn(move || {
                std::thread::sleep(Duration::from_millis(350));
                if flag.load(Ordering::Acquire) || state.closing.load(Ordering::Acquire) {
                    return;
                }
                rescan(&app, &state, None);
                let (send, receive) = mpsc::channel::<notify::Result<Event>>();
                let mut watcher = match notify::recommended_watcher(move |event| {
                    let _ = send.send(event);
                }) {
                    Ok(watcher) => watcher,
                    Err(error) => {
                        let _ = app.emit(
                            "playback-error",
                            format!("Слежение за папками недоступно: {error}"),
                        );
                        return;
                    }
                };
                let mut watched: HashSet<PathBuf> = HashSet::new();
                let mut pending: HashSet<PathBuf> = HashSet::new();
                let mut last_event = Instant::now();
                let mut roots_at = Instant::now() - ROOT_REFRESH;
                loop {
                    if flag.load(Ordering::Acquire) || state.closing.load(Ordering::Acquire) {
                        break;
                    }
                    if roots_at.elapsed() >= ROOT_REFRESH {
                        roots_at = Instant::now();
                        sync_roots(&mut watcher, &mut watched, &state);
                    }
                    match receive.recv_timeout(Duration::from_millis(250)) {
                        Ok(Ok(event)) => {
                            if event.kind.is_access() {
                                continue;
                            }
                            for path in event.paths {
                                queue(&mut pending, &path);
                            }
                            last_event = Instant::now();
                        }
                        Ok(Err(_)) => {}
                        Err(mpsc::RecvTimeoutError::Timeout) => {}
                        Err(mpsc::RecvTimeoutError::Disconnected) => break,
                    }
                    if !pending.is_empty() && last_event.elapsed() >= QUIET {
                        let folders = collapse(pending.drain().collect());
                        if !folders.is_empty() {
                            rescan(&app, &state, Some(&folders));
                        }
                    }
                }
            })
            .expect("Could not start folder watcher");
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

fn sync_roots(watcher: &mut RecommendedWatcher, watched: &mut HashSet<PathBuf>, state: &AppState) {
    let roots: HashSet<PathBuf> = state
        .db
        .folders()
        .unwrap_or_default()
        .into_iter()
        .map(PathBuf::from)
        .filter(|path| path.is_dir())
        .collect();
    let added: Vec<PathBuf> = roots.difference(watched).cloned().collect();
    for root in added {
        if watcher.watch(&root, RecursiveMode::Recursive).is_ok() {
            watched.insert(root);
        }
    }
    let removed: Vec<PathBuf> = watched.difference(&roots).cloned().collect();
    for root in removed {
        let _ = watcher.unwatch(&root);
        watched.remove(&root);
    }
}

/// Queue the closest existing folder that contains the changed path.
fn queue(pending: &mut HashSet<PathBuf>, path: &PathBuf) {
    let folder = if path.is_dir() {
        path.clone()
    } else {
        match path.parent() {
            Some(parent) => parent.to_path_buf(),
            None => return,
        }
    };
    if folder.is_dir() {
        pending.insert(folder);
    }
}

/// A nested folder is already covered by its parent.
fn collapse(mut folders: Vec<PathBuf>) -> Vec<PathBuf> {
    folders.sort();
    let mut out: Vec<PathBuf> = Vec::new();
    for folder in folders {
        if out.last().is_none_or(|last| !folder.starts_with(last)) {
            out.push(folder);
        }
    }
    out
}

fn rescan(app: &AppHandle, state: &AppState, folders: Option<&[PathBuf]>) {
    let roots = match folders {
        Some(folders) => folders.to_vec(),
        None => state
            .db
            .folders()
            .unwrap_or_default()
            .into_iter()
            .map(PathBuf::from)
            .collect(),
    };
    for attempt in 0..5 {
        match commands::scan_paths(state, &roots, None) {
            Ok(library) => {
                let _ = app.emit("library-updated", &library);
                return;
            }
            Err(error) if error == "Сканирование уже выполняется." => {
                std::thread::sleep(Duration::from_millis(500 * (attempt + 1)));
            }
            Err(error) => {
                let _ = app.emit("playback-error", error);
                return;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;
    #[test]
    fn collapses_nested_folders() {
        let folders = collapse(vec![
            PathBuf::from("/music/album"),
            PathBuf::from("/music"),
            PathBuf::from("/other"),
        ]);
        assert_eq!(
            folders,
            vec![PathBuf::from("/music"), PathBuf::from("/other")]
        );
        assert_eq!(Path::new("/music"), Path::new("/music"));
    }
    #[test]
    fn queues_the_parent_of_a_changed_file() {
        let directory = tempfile::tempdir().unwrap();
        let file = directory.path().join("song.flac");
        std::fs::write(&file, b"x").unwrap();
        let mut pending = HashSet::new();
        queue(&mut pending, &file);
        queue(&mut pending, &directory.path().to_path_buf());
        assert_eq!(pending.len(), 1);
        assert!(pending.contains(&directory.path().to_path_buf()));
    }
}
