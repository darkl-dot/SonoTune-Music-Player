//! Per-user registration only. Never write a file type's default or UserChoice.
use std::path::Path;
use winreg::{enums::HKEY_CURRENT_USER, RegKey};
const RUN: &str = r"Software\Microsoft\Windows\CurrentVersion\Run";
pub const EXTENSIONS: [&str; 7] = ["mp3", "flac", "wav", "ogg", "opus", "m4a", "aac"];
pub fn launch_command(exe: &Path, argument: &str) -> String {
    format!("\"{}\" {argument}", exe.display())
}
pub fn autostart(exe: &Path) -> Result<bool, String> {
    let root = RegKey::predef(HKEY_CURRENT_USER);
    match root.open_subkey(RUN) {
        Ok(key) => read_startup(&key, exe),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(false),
        Err(e) => Err(e.to_string()),
    }
}
pub fn set_autostart(exe: &Path, enabled: bool) -> Result<(), String> {
    let (key, _) = RegKey::predef(HKEY_CURRENT_USER)
        .create_subkey(RUN)
        .map_err(|e| e.to_string())?;
    write_startup(&key, exe, enabled)
}
fn read_startup(key: &RegKey, exe: &Path) -> Result<bool, String> {
    match key.get_value::<String, _>("SonoTune") {
        Ok(value) => Ok(value == launch_command(exe, "--autostart")),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(false),
        Err(error) => Err(error.to_string()),
    }
}
fn write_startup(key: &RegKey, exe: &Path, enabled: bool) -> Result<(), String> {
    if enabled {
        if launch_command(exe, "--autostart").encode_utf16().count() > 260 {
            return Err("Путь к SonoTune слишком длинный для автозапуска Windows. Переместите папку плеера ближе к корню диска.".into());
        }
        key.set_value("SonoTune", &launch_command(exe, "--autostart"))
            .map_err(|e| e.to_string())
    } else {
        match key.delete_value("SonoTune") {
            Ok(()) => Ok(()),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(e) => Err(e.to_string()),
        }
    }
}
pub fn associations(exe: &Path) -> Result<bool, String> {
    let root = RegKey::predef(HKEY_CURRENT_USER);
    let Ok(key) = root.open_subkey(r"Software\Classes\SonoTune.Audio\shell\open\command") else {
        return Ok(false);
    };
    Ok(key.get_value::<String, _>("").map_err(|e| e.to_string())? == launch_command(exe, "\"%1\""))
}
pub fn register_associations(exe: &Path) -> Result<(), String> {
    let classes = RegKey::predef(HKEY_CURRENT_USER)
        .create_subkey(r"Software\Classes")
        .map_err(|e| e.to_string())?
        .0;
    write_associations(&classes, exe)?;
    unsafe {
        windows::Win32::UI::Shell::SHChangeNotify(
            windows::Win32::UI::Shell::SHCNE_ASSOCCHANGED,
            windows::Win32::UI::Shell::SHCNF_IDLIST,
            None,
            None,
        );
    }
    Ok(())
}
fn write_associations(classes: &RegKey, exe: &Path) -> Result<(), String> {
    let set = |path: &str, name: &str, value: &str| -> Result<(), String> {
        classes
            .create_subkey(path)
            .and_then(|(key, _)| key.set_value(name, &value))
            .map_err(|e| e.to_string())
    };
    set("SonoTune.Audio", "", "SonoTune audio")?;
    set(
        r"SonoTune.Audio\DefaultIcon",
        "",
        &format!("\"{}\",0", exe.display()),
    )?;
    set(
        r"SonoTune.Audio\shell\open\command",
        "",
        &launch_command(exe, "\"%1\""),
    )?;
    let app = exe
        .file_name()
        .ok_or("Executable name is missing")?
        .to_string_lossy();
    let application = format!(r"Applications\{app}");
    set(&application, "FriendlyAppName", "SonoTune")?;
    set(
        &format!(r"{application}\shell\open\command"),
        "",
        &launch_command(exe, "\"%1\""),
    )?;
    for extension in EXTENSIONS {
        set(
            &format!(r"{application}\SupportedTypes"),
            &format!(".{extension}"),
            "",
        )?;
        set(
            &format!(r".{extension}\OpenWithProgids"),
            "SonoTune.Audio",
            "",
        )?;
    }
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn startup_round_trip_is_opt_in_updates_moved_paths_and_removes_only_its_entry() {
        let root = RegKey::predef(HKEY_CURRENT_USER);
        let path = format!(r"Software\SonoTuneTests\{}", uuid::Uuid::new_v4());
        let key = root.create_subkey(&path).unwrap().0;
        key.set_value("OtherApp", &"untouched").unwrap();
        let exe = Path::new(r"C:\Музыка и софт\SonoTune.exe");
        assert!(!read_startup(&key, exe).unwrap());
        write_startup(&key, exe, true).unwrap();
        assert!(read_startup(&key, exe).unwrap());
        assert!(!read_startup(&key, Path::new(r"D:\Moved\SonoTune.exe")).unwrap());
        write_startup(&key, exe, false).unwrap();
        write_startup(&key, exe, false).unwrap();
        assert!(!read_startup(&key, exe).unwrap());
        assert_eq!(key.get_value::<String, _>("OtherApp").unwrap(), "untouched");
        drop(key);
        root.delete_subkey_all(path).unwrap();
    }
    #[test]
    fn registration_quotes_unicode_paths_and_preserves_user_defaults() {
        let root = RegKey::predef(HKEY_CURRENT_USER);
        let path = format!(r"Software\SonoTuneTests\{}", uuid::Uuid::new_v4());
        let key = root.create_subkey(&path).unwrap().0;
        key.create_subkey(".mp3")
            .unwrap()
            .0
            .set_value("", &"Another.Player")
            .unwrap();
        let exe = Path::new(r"C:\Музыка и софт\SonoTune.exe");
        write_associations(&key, exe).unwrap();
        let default: String = key.open_subkey(".mp3").unwrap().get_value("").unwrap();
        assert_eq!(default, "Another.Player");
        let command: String = key
            .open_subkey(r"SonoTune.Audio\shell\open\command")
            .unwrap()
            .get_value("")
            .unwrap();
        assert_eq!(command, "\"C:\\Музыка и софт\\SonoTune.exe\" \"%1\"");
        for ext in EXTENSIONS {
            assert!(key
                .open_subkey(format!(r".{ext}\OpenWithProgids"))
                .unwrap()
                .get_value::<String, _>("SonoTune.Audio")
                .is_ok());
        }
        drop(key);
        root.delete_subkey_all(path).unwrap();
    }
}
