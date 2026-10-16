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
use tauri::{ipc::Channel, AppHandle, Manager, State};
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
    let roots = state
        .db
        .load()?
        .folders
        .into_iter()
        .map(PathBuf::from)
        .collect::<Vec<_>>();
    let library = library::scan(
        &state.db,
        &roots,
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
pub fn configure_scan(
    scanner: State<'_, crate::scanning::BackgroundScanner>,
    minutes: Option<u32>,
) -> Result<(), String> {
    scanner.configure(minutes)
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
