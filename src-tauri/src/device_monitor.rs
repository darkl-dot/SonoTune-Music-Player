//! Event-driven default endpoint changes; no device polling loop.
#[cfg(windows)]
pub struct DeviceMonitor(i64);
#[cfg(windows)]
impl DeviceMonitor {
    pub fn start(send: std::sync::mpsc::Sender<crate::playback::Message>) -> Result<Self, String> {
        use windows::{
            Foundation::TypedEventHandler,
            Media::Devices::{
                AudioDeviceRole, DefaultAudioRenderDeviceChangedEventArgs, MediaDevice,
            },
        };
        let handler = TypedEventHandler::<
            windows::core::IInspectable,
            DefaultAudioRenderDeviceChangedEventArgs,
        >::new(move |_, args| {
            if args
                .as_ref()
                .is_some_and(|args| args.Role().ok() == Some(AudioDeviceRole::Default))
            {
                let _ = send.send(crate::playback::Message::DeviceLost {
                    generation: None,
                    message: "Default output changed".into(),
                });
            }
            Ok(())
        });
        MediaDevice::DefaultAudioRenderDeviceChanged(&handler)
            .map(Self)
            .map_err(|e| e.to_string())
    }
}
#[cfg(all(test, windows))]
mod tests {
    #[test]
    #[ignore = "registers a real Windows audio endpoint notification; run explicitly"]
    fn native_device_monitor_registers_and_releases_without_changing_devices() {
        unsafe {
            windows::Win32::System::WinRT::RoInitialize(
                windows::Win32::System::WinRT::RO_INIT_MULTITHREADED,
            )
            .unwrap();
        }
        let (send, _receive) = std::sync::mpsc::channel();
        let monitor = super::DeviceMonitor::start(send).unwrap();
        drop(monitor);
        unsafe {
            windows::Win32::System::WinRT::RoUninitialize();
        }
    }
}
#[cfg(windows)]
impl Drop for DeviceMonitor {
    fn drop(&mut self) {
        let _ = windows::Media::Devices::MediaDevice::RemoveDefaultAudioRenderDeviceChanged(self.0);
    }
}
#[cfg(not(windows))]
pub struct DeviceMonitor;
#[cfg(not(windows))]
impl DeviceMonitor {
    pub fn start(_: std::sync::mpsc::Sender<crate::playback::Message>) -> Result<Self, String> {
        Ok(Self)
    }
}
