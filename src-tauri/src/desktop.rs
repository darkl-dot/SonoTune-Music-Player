use crate::commands::AppState;
use serde::{Deserialize, Serialize};
use std::{
    collections::VecDeque,
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
};
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, State,
};

pub struct DesktopState {
    pub close_to_tray: AtomicBool,
    pub tray_ready: AtomicBool,
    pub quitting: AtomicBool,
    pub ready: AtomicBool,
    pub opening: AtomicBool,
    pub pending_files: Mutex<Vec<PathBuf>>,
    pub last_external: Mutex<Option<String>>,
    language: Mutex<String>,
    errors: Mutex<VecDeque<String>>,
}
impl Default for DesktopState {
    fn default() -> Self {
        Self {
            close_to_tray: AtomicBool::new(true),
            tray_ready: AtomicBool::new(false),
            quitting: AtomicBool::new(false),
            ready: AtomicBool::new(false),
            opening: AtomicBool::new(false),
            pending_files: Mutex::new(vec![]),
            last_external: Mutex::new(None),
            language: Mutex::new("ru".into()),
            errors: Mutex::new(VecDeque::new()),
        }
    }
}
impl DesktopState {
    pub fn should_hide(&self) -> bool {
        self.close_to_tray.load(Ordering::Acquire)
            && self.tray_ready.load(Ordering::Acquire)
            && !self.quitting.load(Ordering::Acquire)
    }
    pub fn record(&self, message: &str) {
        let mut errors = self.errors.lock().unwrap();
        if errors.len() >= 30 {
            errors.pop_front();
        }
        let mut message = message.chars().take(1500).collect::<String>();
        if let Some(home) = std::env::var_os("USERPROFILE") {
            message = message.replace(home.to_string_lossy().as_ref(), "~");
        }
        errors.push_back(message);
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn closing_requires_a_working_tray_and_never_intercepts_quit() {
        let state = DesktopState::default();
        assert!(!state.should_hide());
        state.tray_ready.store(true, Ordering::Release);
        assert!(state.should_hide());
        state.close_to_tray.store(false, Ordering::Release);
        assert!(!state.should_hide());
        state.close_to_tray.store(true, Ordering::Release);
        state.quitting.store(true, Ordering::Release);
        assert!(!state.should_hide());
    }
    #[test]
    fn diagnostic_history_is_bounded_and_settings_reject_unknown_fields() {
        let state = DesktopState::default();
        for i in 0..40 {
            state.record(&format!("error {i}"));
        }
        let errors = state.errors.lock().unwrap();
        assert_eq!(errors.len(), 30);
        assert_eq!(errors.front().unwrap(), "error 10");
        assert!(serde_json::from_str::<Patch>(r#"{"autostart":"yes"}"#).is_err());
        assert!(serde_json::from_str::<Patch>(r#"{"arbitraryPath":"C:"}"#).is_err());
    }
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Preferences {
    close_to_tray: bool,
    autostart: bool,
    associations_registered: bool,
    tray_available: bool,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Patch {
    close_to_tray: Option<bool>,
    autostart: Option<bool>,
    language: Option<String>,
}
pub fn show(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}
pub fn report(app: &AppHandle, error: String) {
    if let Some(state) = app.try_state::<DesktopState>() {
        state.record(&error);
    }
    let _ = app.emit("playback-error", error);
}
fn menu(app: &AppHandle, language: &str) -> tauri::Result<Menu<tauri::Wry>> {
    let en = language == "en";
    let open = MenuItem::with_id(
        app,
        "open",
        if en {
            "Open SonoTune"
        } else {
            "Открыть SonoTune"
        },
        true,
        None::<&str>,
    )?;
    let play = MenuItem::with_id(
        app,
        "toggle",
        if en {
            "Play / Pause"
        } else {
            "Играть / Пауза"
        },
        true,
        None::<&str>,
    )?;
    let quit = MenuItem::with_id(
        app,
        "quit",
        if en {
            "Quit SonoTune"
        } else {
            "Выйти из SonoTune"
        },
        true,
        None::<&str>,
    )?;
    let separator = PredefinedMenuItem::separator(app)?;
    Menu::with_items(app, &[&open, &play, &separator, &quit])
}
pub fn setup(app: &AppHandle) -> Result<(), String> {
    let state = app.state::<Arc<AppState>>();
    let desktop = app.state::<DesktopState>();
    desktop.close_to_tray.store(
        state.db.state::<bool>("close-to-tray")?.unwrap_or(true),
        Ordering::Release,
    );
    let language = state
        .db
        .state::<String>("desktop-language")?
        .filter(|l| l == "ru" || l == "en")
        .unwrap_or("ru".into());
    *desktop.language.lock().unwrap() = language.clone();
    let icon = app
        .default_window_icon()
        .cloned()
        .ok_or("Tray icon is unavailable")?;
    TrayIconBuilder::with_id("sonotune")
        .icon(icon)
        .tooltip("SonoTune")
        .menu(&menu(app, &language).map_err(|e| e.to_string())?)
        .show_menu_on_left_click(false)
        .on_tray_icon_event(|tray, event| {
            if matches!(
                event,
                TrayIconEvent::Click {
                    button: MouseButton::Left,
                    button_state: MouseButtonState::Up,
                    ..
                }
            ) {
                show(tray.app_handle());
            }
        })
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => show(app),
            "toggle" => {
                let app = app.clone();
                tauri::async_runtime::spawn_blocking(move || {
                    if let Err(e) = app
                        .state::<Arc<AppState>>()
                        .engine
                        .command(crate::model::PlayerCommand::Toggle)
                    {
                        report(&app, e);
                    }
                });
            }
            "quit" => {
                app.state::<DesktopState>()
                    .quitting
                    .store(true, Ordering::Release);
                app.exit(0);
            }
            _ => {}
        })
        .build(app)
        .map_err(|e| e.to_string())?;
    desktop.tray_ready.store(true, Ordering::Release);
    Ok(())
}
#[tauri::command]
pub fn desktop_preferences(app: AppHandle) -> Result<Preferences, String> {
    let state = app.state::<DesktopState>();
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    #[cfg(windows)]
    let (autostart, associations_registered) = (
        crate::desktop_windows::autostart(&exe)?,
        crate::desktop_windows::associations(&exe)?,
    );
    #[cfg(not(windows))]
    let (autostart, associations_registered) = (false, false);
    Ok(Preferences {
        close_to_tray: state.close_to_tray.load(Ordering::Acquire),
        autostart,
        associations_registered,
        tray_available: state.tray_ready.load(Ordering::Acquire),
    })
}
#[tauri::command]
pub fn configure_desktop(app: AppHandle, patch: Patch) -> Result<Preferences, String> {
    let desktop = app.state::<DesktopState>();
    let state = app.state::<Arc<AppState>>();
    if patch
        .language
        .as_ref()
        .is_some_and(|l| l != "ru" && l != "en")
    {
        return Err("Unsupported interface language".into());
    }
    if let Some(value) = patch.autostart {
        #[cfg(windows)]
        crate::desktop_windows::set_autostart(
            &std::env::current_exe().map_err(|e| e.to_string())?,
            value,
        )?;
        #[cfg(not(windows))]
        return Err("Autostart is available on Windows".into());
    }
    if let Some(value) = patch.close_to_tray {
        state.db.save_state("close-to-tray", &value)?;
        desktop.close_to_tray.store(value, Ordering::Release);
    }
    if let Some(language) = patch.language {
        if *desktop.language.lock().unwrap() != language {
            if let Some(tray) = app.tray_by_id("sonotune") {
                tray.set_menu(Some(menu(&app, &language).map_err(|e| e.to_string())?))
                    .map_err(|e| e.to_string())?;
            }
            state.db.save_state("desktop-language", &language)?;
            *desktop.language.lock().unwrap() = language;
        }
    }
    desktop_preferences(app)
}
#[tauri::command]
pub fn register_open_with(app: AppHandle) -> Result<Preferences, String> {
    #[cfg(windows)]
    crate::desktop_windows::register_associations(
        &std::env::current_exe().map_err(|e| e.to_string())?,
    )?;
    desktop_preferences(app)
}
#[tauri::command]
pub fn open_data_folder(state: State<'_, Arc<AppState>>) -> Result<(), String> {
    #[cfg(windows)]
    {
        std::process::Command::new("explorer.exe")
            .arg(&state.data_dir)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}
#[tauri::command]
pub fn pending_external(app: AppHandle) -> Option<String> {
    app.state::<DesktopState>()
        .last_external
        .lock()
        .unwrap()
        .take()
}
#[tauri::command]
pub async fn diagnostics(app: AppHandle) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<Arc<AppState>>();
        let desktop = app.state::<DesktopState>();
        let playback = match state.engine.snapshot() {
            Ok(value) => format!("Track selected: {}\nPlaying: {}\nPosition: {:.2}s\nQueue: {} tracks\nMode: {:?}", value.track_id.is_some(), value.playing, value.position, value.queue.len(), value.repeat),
            Err(error) => format!("Audio controller unavailable: {error}"),
        };
        let preferences = match desktop_preferences(app.clone()) {
            Ok(value) => format!("Close to tray: {}\nAutostart registration: {}\nTray available: {}", value.close_to_tray, value.autostart, value.tray_available),
            Err(error) => format!("Desktop settings unavailable: {error}"),
        };
        let errors = desktop.errors.lock().unwrap().iter().cloned().collect::<Vec<_>>().join("\n");
        Ok(format!("SonoTune v{}\nPlatform: {} / {}\nNative engine: Rodio + Symphonia + libopus\n{playback}\n{preferences}\nRecent errors (session only):\n{}", env!("CARGO_PKG_VERSION"), std::env::consts::OS, std::env::consts::ARCH, if errors.is_empty(){"None"}else{&errors}))
    }).await.map_err(|e| e.to_string())?
}
