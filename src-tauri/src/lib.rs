mod audio;
mod commands;
mod desktop;
#[cfg(windows)]
mod desktop_windows;
mod device_monitor;
mod external_files;
mod gapless;
mod library;
mod listening;
mod metadata;
mod model;
mod mp4;
mod playback;
mod queue;
mod scanning;
mod storage;
mod system_media;

use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex,
};
use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        .manage(desktop::DesktopState::default())
        .plugin(tauri_plugin_single_instance::init(|app, args, cwd| {
            desktop::show(app);
            external_files::submit(app, &args, std::path::Path::new(&cwd));
        }))
        .plugin(tauri_plugin_dialog::init())
        .on_window_event(|window, event| {
            if window.label() != "main" {
                return;
            }
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let desktop = window.state::<desktop::DesktopState>();
                if desktop.should_hide() {
                    if window.hide().is_ok() {
                        api.prevent_close();
                    }
                }
            }
        })
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
            if let Err(error) = desktop::setup(app.handle()) {
                desktop::report(app.handle(), format!("Не удалось включить трей: {error}"));
            }
            app.state::<desktop::DesktopState>()
                .ready
                .store(true, Ordering::Release);
            external_files::submit(
                app.handle(),
                &std::env::args().collect::<Vec<_>>(),
                &std::env::current_dir().unwrap_or_default(),
            );
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
            commands::player_command,
            desktop::desktop_preferences,
            desktop::configure_desktop,
            desktop::register_open_with,
            desktop::open_data_folder,
            desktop::pending_external,
            desktop::diagnostics
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
