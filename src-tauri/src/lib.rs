mod audio;
mod audio_outputs;
mod commands;
mod desktop;
#[cfg(windows)]
mod desktop_windows;
mod device_monitor;
mod equalizer;
mod external_files;
mod gain;
mod gapless;
mod library;
mod limiter;
mod listening;
mod loudness;
mod metadata;
mod model;
mod mp4;
mod playback;
mod playlists;
mod queue;
mod scanning;
mod spectrum;
mod storage;
mod system_media;

use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex,
};
use tauri::{Emitter, Manager};

pub fn run() {
    tauri::Builder::default()
        .manage(desktop::DesktopState::default())
        .plugin(tauri_plugin_single_instance::init(|app, args, cwd| {
            desktop::show(app);
            external_files::submit(app, &args, std::path::Path::new(&cwd));
        }))
        .plugin(tauri_plugin_dialog::init())
        .on_window_event(|window, event| {
            if window.label() == "mini" {
                if matches!(event, tauri::WindowEvent::Destroyed) {
                    let _ = window.app_handle().emit("mini-state", false);
                }
                return;
            }
            if window.label() != "main" {
                return;
            }
            match event {
                tauri::WindowEvent::CloseRequested { api, .. } => {
                    let desktop = window.state::<desktop::DesktopState>();
                    if desktop.should_hide() {
                        if window.hide().is_ok() {
                            api.prevent_close();
                        }
                    } else if let Some(mini) = window.app_handle().get_webview_window("mini") {
                        let _ = mini.close();
                    }
                }
                tauri::WindowEvent::DragDrop(drop_event) => match drop_event {
                    tauri::DragDropEvent::Enter { .. } => {
                        let _ = window.emit("file-drag-over", true);
                    }
                    tauri::DragDropEvent::Leave => {
                        let _ = window.emit("file-drag-over", false);
                    }
                    tauri::DragDropEvent::Drop { paths, .. } => {
                        let _ = window.emit("file-drag-over", false);
                        external_files::handle_drop(window.app_handle(), paths.clone());
                    }
                    _ => {}
                },
                _ => {}
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
            app.manage(crate::loudness::Analyzer::start(state.clone()));
            app.manage(scanning::FolderWatcher::start(app.handle().clone(), state));
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
            commands::remove_folder,
            commands::set_favorite,
            commands::remove_track,
            commands::remove_tracks,
            commands::reveal_track,
            commands::export_playlist,
            commands::import_playlist,
            commands::audio_spectrum,
            commands::save_tags,
            commands::save_pin,
            commands::delete_pin,
            commands::loudness_stats,
            commands::recompute_loudness,
            commands::player_command,
            audio_outputs::audio_outputs,
            desktop::desktop_preferences,
            desktop::configure_desktop,
            desktop::register_open_with,
            desktop::open_data_folder,
            desktop::pending_external,
            desktop::diagnostics,
            desktop::toggle_mini_player,
            desktop::set_mini_always_on_top,
            desktop::show_main_window
        ])
        .build(tauri::generate_context!())
        .expect("SonoTune could not start")
        .run(|app, event| {
            if matches!(event, tauri::RunEvent::Exit) {
                if let Some(scanner) = app.try_state::<scanning::FolderWatcher>() {
                    scanner.shutdown();
                }
                if let Some(analyzer) = app.try_state::<crate::loudness::Analyzer>() {
                    analyzer.shutdown();
                }
                if let Some(state) = app.try_state::<Arc<commands::AppState>>() {
                    state.engine.shutdown();
                }
            }
        });
}
