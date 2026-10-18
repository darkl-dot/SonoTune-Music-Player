use crate::{commands::AppState, desktop::DesktopState, library, metadata, model::PlayerCommand};
use std::{
    collections::HashSet,
    path::{Path, PathBuf},
    sync::{atomic::Ordering, Arc},
};
use tauri::{AppHandle, Emitter, Manager};

pub fn paths(args: &[String], cwd: &Path) -> Vec<PathBuf> {
    let mut seen = HashSet::new();
    args.iter()
        .skip(1)
        .filter(|arg| !arg.starts_with("--"))
        .filter_map(|arg| {
            let path = Path::new(arg);
            let path = if path.is_absolute() {
                path.to_owned()
            } else {
                cwd.join(path)
            };
            if !library::supported(&path) || !path.is_file() {
                return None;
            }
            let path = dunce::canonicalize(path).ok()?;
            seen.insert(path.to_string_lossy().to_lowercase())
                .then_some(path)
        })
        .take(512)
        .collect()
}
pub fn submit(app: &AppHandle, args: &[String], cwd: &Path) {
    let paths = paths(args, cwd);
    let desktop = app.state::<DesktopState>();
    if let Ok(mut pending) = desktop.pending_files.lock() {
        let remaining = 512_usize.saturating_sub(pending.len());
        pending.extend(paths.into_iter().take(remaining));
    }
    if !desktop.ready.load(Ordering::Acquire) || desktop.opening.swap(true, Ordering::AcqRel) {
        return;
    }
    let app = app.clone();
    tauri::async_runtime::spawn_blocking(move || loop {
        let desktop = app.state::<DesktopState>();
        let paths = {
            let mut pending = desktop.pending_files.lock().unwrap();
            if pending.is_empty() {
                desktop.opening.store(false, Ordering::Release);
                break;
            }
            std::mem::take(&mut *pending)
        };
        let state = app.state::<Arc<AppState>>();
        if state.closing.load(Ordering::Acquire) {
            break;
        }
        match import(&state, &paths) {
            Ok(ids) if !ids.is_empty() => {
                match state.db.load() {
                    Ok(library) => {
                        let _ = app.emit("library-updated", library);
                    }
                    Err(e) => crate::desktop::report(&app, e),
                }
                if let Err(e) = state.engine.command(PlayerCommand::Play {
                    id: ids[0].clone(),
                    queue: ids.clone(),
                }) {
                    crate::desktop::report(&app, e);
                    continue;
                }
                *desktop.last_external.lock().unwrap() = Some(ids[0].clone());
                let _ = app.emit("external-opened", &ids[0]);
            }
            Ok(_) => {}
            Err(e) => crate::desktop::report(&app, e),
        }
    });
}
fn import(state: &AppState, paths: &[PathBuf]) -> Result<Vec<String>, String> {
    let _files = state.file_work.lock().map_err(|e| e.to_string())?;
    import_into(&state.db, &state.data_dir, paths)
}
fn import_into(
    db: &crate::storage::Database,
    data_dir: &Path,
    paths: &[PathBuf],
) -> Result<Vec<String>, String> {
    let library = db.load()?;
    let mut ids = Vec::new();
    let mut tracks = Vec::new();
    let mut failures = Vec::new();
    for path in paths {
        let previous = library.tracks.iter().find(|t| Path::new(&t.path) == path);
        match metadata::read_track(path, previous, data_dir, false) {
            Ok(track) => {
                if !ids.contains(&track.id) {
                    ids.push(track.id.clone());
                    tracks.push(track);
                }
            }
            Err(e) => failures.push(e),
        }
    }
    db.upsert_batch(&tracks)?;
    if ids.is_empty() && !failures.is_empty() {
        return Err(format!(
            "Не удалось открыть аудиофайлы: {}",
            failures.join("; ")
        ));
    }
    Ok(ids)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn external_files_are_validated_deduplicated_and_reuse_existing_tracks() {
        let directory = tempfile::tempdir().unwrap();
        let file = directory.path().join("тест с пробелом.wav");
        std::fs::copy(
            Path::new(env!("CARGO_MANIFEST_DIR")).join("../tests/fixtures/tone.wav"),
            &file,
        )
        .unwrap();
        let args = vec![
            "SonoTune.exe".into(),
            "--autostart".into(),
            file.to_string_lossy().into_owned(),
            file.to_string_lossy().into_owned(),
            "bad.exe".into(),
        ];
        let paths = paths(&args, directory.path());
        assert_eq!(paths.len(), 1);
        let db = crate::storage::Database::open(&directory.path().join("test.sqlite")).unwrap();
        let ids = import_into(&db, directory.path(), &paths).unwrap();
        assert_eq!(import_into(&db, directory.path(), &paths).unwrap(), ids);
        assert_eq!(db.load().unwrap().tracks.len(), 1);
        assert!(db.load().unwrap().folders.is_empty());
    }
}
