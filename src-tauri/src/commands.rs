use crate::{
    library,
    model::{Library, PlayerCommand, Playlist, ScanProgress, TagDraft, TagSaveResult},
    playback::AudioEngine,
    storage::Database,
};
use std::{
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
};
use tauri::{ipc::Channel, AppHandle, Emitter, Manager, State};
use tauri_plugin_dialog::DialogExt;

pub struct AppState {
    pub db: Arc<Database>,
    pub engine: AudioEngine,
    pub data_dir: PathBuf,
    pub cancel: AtomicBool,
    pub scanning: AtomicBool,
    pub closing: AtomicBool,
    pub file_work: Mutex<()>,
}
async fn blocking<T: Send + 'static>(
    task: impl FnOnce() -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(task)
        .await
        .map_err(|e| e.to_string())?
}
struct ScanGuard<'a>(&'a AtomicBool);
impl Drop for ScanGuard<'_> {
    fn drop(&mut self) {
        self.0.store(false, Ordering::Relaxed);
    }
}

#[tauri::command]
pub async fn load_library(state: State<'_, Arc<AppState>>) -> Result<Library, String> {
    let state = state.inner().clone();
    blocking(move || state.db.load()).await
}
#[tauri::command]
pub async fn import_folder(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
    on_progress: Channel<ScanProgress>,
    title: Option<String>,
) -> Result<Option<Library>, String> {
    let state = state.inner().clone();
    blocking(move || {
        if state.scanning.swap(true, Ordering::AcqRel) {
            return Err("Сканирование уже выполняется.".into());
        }
        let _guard = ScanGuard(&state.scanning);
        state.cancel.store(false, Ordering::Relaxed);
        let selection = app
            .dialog()
            .file()
            .set_title(title.as_deref().unwrap_or("Выберите папку с музыкой"))
            .blocking_pick_folder();
        let Some(selection) = selection else {
            return Ok(None);
        };
        let root = dunce::canonicalize(selection.into_path().map_err(|e| e.to_string())?)
            .map_err(|e| e.to_string())?;
        if !root.is_dir() {
            return Err("Выбранный путь не является папкой.".into());
        }
        let _files = state.file_work.lock().map_err(|e| e.to_string())?;
        state.db.add_folder(&root.to_string_lossy())?;
        library::scan(
            &state.db,
            &[root],
            &state.data_dir,
            &state.cancel,
            Some(&on_progress),
            false,
        )
        .map(Some)
    })
    .await
}
#[tauri::command]
pub async fn rescan_library(
    state: State<'_, Arc<AppState>>,
    on_progress: Channel<ScanProgress>,
) -> Result<Library, String> {
    let state = state.inner().clone();
    blocking(move || scan_folders(&state, Some(&on_progress))).await
}
pub fn scan_folders(
    state: &AppState,
    progress: Option<&Channel<ScanProgress>>,
) -> Result<Library, String> {
    let roots = state
        .db
        .folders()?
        .into_iter()
        .map(PathBuf::from)
        .collect::<Vec<_>>();
    scan_paths(state, &roots, progress)
}
/// Scan the given roots only. The watcher uses this to refresh just the folder
/// that changed, while the manual rescan passes every known root.
pub fn scan_paths(
    state: &AppState,
    roots: &[PathBuf],
    progress: Option<&Channel<ScanProgress>>,
) -> Result<Library, String> {
    if state.scanning.swap(true, Ordering::AcqRel) {
        return Err("Сканирование уже выполняется.".into());
    }
    let _guard = ScanGuard(&state.scanning);
    state.cancel.store(false, Ordering::Relaxed);
    if state.closing.load(Ordering::Acquire) {
        state.cancel.store(true, Ordering::Release);
        return state.db.load();
    }
    let _files = state.file_work.lock().map_err(|e| e.to_string())?;
    let library = library::scan(
        &state.db,
        roots,
        &state.data_dir,
        &state.cancel,
        progress,
        false,
    )?;
    state.engine.command(PlayerCommand::RefreshMetadata)?;
    Ok(library)
}
#[tauri::command]
pub async fn save_pin(
    state: State<'_, Arc<AppState>>,
    id: String,
    label: String,
) -> Result<(), String> {
    let state = state.inner().clone();
    blocking(move || state.db.save_pin(&id, &label)).await
}
#[tauri::command]
pub async fn delete_pin(state: State<'_, Arc<AppState>>, id: String) -> Result<(), String> {
    let state = state.inner().clone();
    blocking(move || state.db.delete_pin(&id)).await
}
#[tauri::command]
pub async fn loudness_stats(state: State<'_, Arc<AppState>>) -> Result<(i64, i64), String> {
    let state = state.inner().clone();
    blocking(move || state.db.loudness_stats()).await
}

#[tauri::command]
pub async fn recompute_loudness(state: State<'_, Arc<AppState>>) -> Result<(), String> {
    let state = state.inner().clone();
    blocking(move || {
        state.db.clear_loudness()?;
        let _ = state.engine.command(PlayerCommand::RefreshGain);
        Ok(())
    })
    .await
}

#[tauri::command]
pub fn cancel_scan(state: State<'_, Arc<AppState>>) {
    state.cancel.store(true, Ordering::Relaxed);
}

#[tauri::command]
pub async fn load_demo(app: AppHandle, state: State<'_, Arc<AppState>>) -> Result<Library, String> {
    let state = state.inner().clone();
    blocking(move || {
        if state.scanning.swap(true, Ordering::AcqRel) {
            return Err("Дождитесь завершения сканирования.".into());
        }
        let _guard = ScanGuard(&state.scanning);
        state.cancel.store(false, Ordering::Relaxed);
        let _files = state.file_work.lock().map_err(|e| e.to_string())?;
        let source = app
            .path()
            .resource_dir()
            .map_err(|e| e.to_string())?
            .join("demo");
        let source = if source.is_dir() {
            source
        } else {
            PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../public/demo")
        };
        let target = state.data_dir.join("demo");
        std::fs::create_dir_all(&target).map_err(|e| e.to_string())?;
        for entry in std::fs::read_dir(&source).map_err(|e| format!("Не найдены демотреки: {e}"))?
        {
            let entry = entry.map_err(|e| e.to_string())?;
            if library::supported(&entry.path()) && !target.join(entry.file_name()).exists() {
                std::fs::copy(entry.path(), target.join(entry.file_name()))
                    .map_err(|e| e.to_string())?;
            }
        }
        library::scan(
            &state.db,
            &[dunce::canonicalize(target).map_err(|e| e.to_string())?],
            &state.data_dir,
            &state.cancel,
            None,
            true,
        )
    })
    .await
}
#[tauri::command]
pub async fn save_playlist(
    state: State<'_, Arc<AppState>>,
    playlist: Playlist,
) -> Result<(), String> {
    let state = state.inner().clone();
    blocking(move || state.db.save_playlist(&playlist)).await
}
#[tauri::command]
pub async fn delete_playlist(state: State<'_, Arc<AppState>>, id: String) -> Result<(), String> {
    let state = state.inner().clone();
    blocking(move || state.db.delete_playlist(&id)).await
}
#[tauri::command]
pub async fn remove_folder(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
    path: String,
) -> Result<Library, String> {
    let state = state.inner().clone();
    blocking(move || {
        let _files = state.file_work.lock().map_err(|e| e.to_string())?;
        let (library, removed) = state.db.remove_folder(&path)?;
        if !removed.is_empty() {
            state
                .engine
                .command(PlayerCommand::Forget { ids: removed })?;
        }
        let _ = app.emit("library-updated", &library);
        Ok(library)
    })
    .await
}
#[tauri::command]
pub async fn set_favorite(
    state: State<'_, Arc<AppState>>,
    id: String,
    value: bool,
) -> Result<(), String> {
    let state = state.inner().clone();
    blocking(move || state.db.set_favorite(&id, value)).await
}
#[tauri::command]
pub async fn remove_track(state: State<'_, Arc<AppState>>, id: String) -> Result<(), String> {
    let state = state.inner().clone();
    blocking(move || {
        state
            .engine
            .command(PlayerCommand::Remove { id: id.clone() })?;
        state.db.remove_track(&id)
    })
    .await
}
#[tauri::command]
pub async fn remove_tracks(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
    ids: Vec<String>,
) -> Result<Library, String> {
    let state = state.inner().clone();
    blocking(move || {
        let _files = state.file_work.lock().map_err(|e| e.to_string())?;
        if !ids.is_empty() {
            state
                .engine
                .command(PlayerCommand::Forget { ids: ids.clone() })?;
        }
        let library = state.db.remove_tracks(&ids)?;
        let _ = app.emit("library-updated", &library);
        Ok(library)
    })
    .await
}
#[tauri::command]
pub async fn reveal_track(state: State<'_, Arc<AppState>>, id: String) -> Result<(), String> {
    let state = state.inner().clone();
    blocking(move || {
        let track = state.db.track(&id)?;
        let path = PathBuf::from(&track.path);
        if !path.exists() {
            return Err("Файл не найден на диске.".into());
        }
        #[cfg(windows)]
        {
            std::process::Command::new("explorer.exe")
                .args(["/select,", &path.to_string_lossy()])
                .spawn()
                .map_err(|e| e.to_string())?;
        }
        Ok(())
    })
    .await
}
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportPlaylistResult {
    pub library: Library,
    pub playlist: Playlist,
    pub skipped: usize,
}
#[tauri::command]
pub async fn export_playlist(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
    id: String,
    title: Option<String>,
) -> Result<bool, String> {
    let state = state.inner().clone();
    blocking(move || {
        let library = state.db.load()?;
        let playlist = library
            .playlists
            .iter()
            .find(|p| p.id == id)
            .ok_or_else(|| "Плейлист не найден.".to_string())?;
        let safe_name: String = playlist
            .name
            .chars()
            .map(|c| {
                if matches!(c, '\\' | '/' | ':' | '*' | '?' | '"' | '<' | '>' | '|') {
                    '_'
                } else {
                    c
                }
            })
            .collect();
        let file_name = if safe_name.trim().is_empty() {
            "playlist.m3u8".to_owned()
        } else {
            format!("{}.m3u8", safe_name.trim())
        };
        let target = app
            .dialog()
            .file()
            .set_title(title.as_deref().unwrap_or("Экспорт плейлиста"))
            .set_file_name(&file_name)
            .add_filter("M3U8 Playlist", &["m3u8", "m3u"])
            .blocking_save_file();
        let Some(target) = target else {
            return Ok(false);
        };
        let path = target.into_path().map_err(|e| e.to_string())?;
        let by_id: std::collections::HashMap<_, _> = library
            .tracks
            .iter()
            .map(|track| (track.id.as_str(), track))
            .collect();
        let content = crate::playlists::format_m3u8(playlist, &by_id);
        std::fs::write(&path, content).map_err(|e| e.to_string())?;
        Ok(true)
    })
    .await
}
#[tauri::command]
pub async fn import_playlist(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
    title: Option<String>,
) -> Result<Option<ImportPlaylistResult>, String> {
    let state = state.inner().clone();
    blocking(move || {
        let selection = app
            .dialog()
            .file()
            .set_title(title.as_deref().unwrap_or("Импорт плейлиста"))
            .add_filter("M3U Playlist", &["m3u8", "m3u"])
            .blocking_pick_file();
        let Some(selection) = selection else {
            return Ok(None);
        };
        let path = selection.into_path().map_err(|e| e.to_string())?;
        let content = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
        let base_dir = path.parent().unwrap_or_else(|| std::path::Path::new("."));
        let (parsed_name, entries) = crate::playlists::parse_m3u(&content, base_dir);
        let fallback_name = path
            .file_stem()
            .unwrap_or_default()
            .to_string_lossy()
            .trim()
            .chars()
            .take(100)
            .collect::<String>();
        let name = parsed_name
            .filter(|v| !v.is_empty())
            .or_else(|| (!fallback_name.is_empty()).then_some(fallback_name))
            .unwrap_or_else(|| "Импортированный плейлист".into());
        let _files = state.file_work.lock().map_err(|e| e.to_string())?;
        let before = state.db.load()?;
        let existing: std::collections::HashMap<_, _> = before
            .tracks
            .iter()
            .map(|t| (t.path.to_lowercase(), t))
            .collect();
        let mut track_ids = Vec::new();
        let mut new_tracks = Vec::new();
        let mut gain_rows = Vec::new();
        let mut seen = std::collections::HashSet::new();
        let mut skipped = 0usize;
        for entry in entries.into_iter().take(10_000) {
            let Ok(canonical) = dunce::canonicalize(&entry) else {
                skipped += 1;
                continue;
            };
            if !canonical.is_file() || !library::supported(&canonical) {
                skipped += 1;
                continue;
            }
            let key = canonical.to_string_lossy().to_lowercase();
            if let Some(track) = existing.get(&key) {
                if seen.insert(track.id.clone()) {
                    track_ids.push(track.id.clone());
                }
                continue;
            }
            match crate::metadata::read_track_with_gain(&canonical, None, &state.data_dir, false) {
                Ok((track, tags)) => {
                    if let Some(row) = crate::loudness::Row::from_tags(&track, &tags) {
                        gain_rows.push((track.id.clone(), row));
                    }
                    if seen.insert(track.id.clone()) {
                        track_ids.push(track.id.clone());
                        new_tracks.push(track);
                    }
                }
                Err(_) => skipped += 1,
            }
        }
        if !new_tracks.is_empty() {
            state.db.upsert_batch(&new_tracks)?;
            for (id, row) in gain_rows {
                let _ = state.db.save_loudness(&id, &row);
            }
        }
        let playlist = Playlist {
            id: uuid::Uuid::new_v4().to_string(),
            name,
            track_ids,
            created_at: crate::model::now(),
            artwork: None,
        };
        state.db.save_playlist(&playlist)?;
        let library = state.db.load()?;
        let _ = app.emit("library-updated", &library);
        Ok(Some(ImportPlaylistResult {
            library,
            playlist,
            skipped,
        }))
    })
    .await
}
#[tauri::command]
pub fn audio_spectrum(state: State<'_, Arc<AppState>>) -> Vec<f32> {
    state.engine.spectrum().to_vec()
}
#[tauri::command]
pub async fn save_tags(
    state: State<'_, Arc<AppState>>,
    id: String,
    draft: TagDraft,
    sidecar: bool,
) -> Result<TagSaveResult, String> {
    let state = state.inner().clone();
    blocking(move || {
        let _files = state.file_work.lock().map_err(|e| e.to_string())?;
        let track = state.db.track(&id)?;
        state.engine.save(track, draft, sidecar)
    })
    .await
}
#[tauri::command]
pub async fn player_command(
    state: State<'_, Arc<AppState>>,
    command: PlayerCommand,
) -> Result<(), String> {
    let state = state.inner().clone();
    blocking(move || state.engine.command(command)).await
}
