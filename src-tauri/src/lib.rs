mod audio;
mod commands;
mod library;
mod listening;
mod metadata;
mod model;
mod playback;
mod queue;
mod scanning;
mod storage;
mod system_media;

use std::sync::{atomic::AtomicBool, Arc, Mutex};
use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;
            let db = Arc::new(
                storage::Database::open(&data_dir.join("library.sqlite"))
                    .map_err(std::io::Error::other)?,
            );
            #[cfg(windows)]
            let media_hwnd = app
                .get_webview_window("main")
                .and_then(|w| w.hwnd().ok())
                .map(|hwnd| hwnd.0 as usize);
            #[cfg(not(windows))]
            let media_hwnd = None;
            let engine = playback::AudioEngine::start(
                app.handle().clone(),
                db.clone(),
                data_dir.clone(),
                media_hwnd,
            );
            let state = Arc::new(commands::AppState {
                db,
                engine,
                data_dir,
                cancel: AtomicBool::new(false),
                scanning: AtomicBool::new(false),
                closing: AtomicBool::new(false),
                file_work: Mutex::new(()),
            });
            app.manage(state.clone());
            app.manage(scanning::BackgroundScanner::start(
                app.handle().clone(),
                state,
            ));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::load_library,
            commands::import_folder,
            commands::rescan_library,
            commands::cancel_scan,
            commands::load_demo,
            commands::save_playlist,
            commands::delete_playlist,
            commands::set_favorite,
            commands::remove_track,
            commands::save_tags,
            commands::save_pin,
            commands::delete_pin,
            commands::configure_scan,
            commands::player_command
        ])
        .build(tauri::generate_context!())
        .expect("SonoTune could not start")
        .run(|app, event| {
            if matches!(event, tauri::RunEvent::Exit) {
                if let Some(scanner) = app.try_state::<scanning::BackgroundScanner>() {
                    scanner.shutdown();
                }
                if let Some(state) = app.try_state::<Arc<commands::AppState>>() {
                    state.engine.shutdown();
                }
            }
        });
}
