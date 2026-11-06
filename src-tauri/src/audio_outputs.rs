use rodio::{
    cpal::{
        self,
        traits::{DeviceTrait, HostTrait},
    },
    OutputStreamBuilder,
};
#[derive(serde::Serialize)]
pub struct Output {
    pub id: String,
    pub name: String,
}
pub fn devices() -> Result<Vec<(String, String, cpal::Device)>, String> {
    let host = cpal::default_host();
    let mut counts = std::collections::HashMap::new();
    host.output_devices()
        .map_err(|e| e.to_string())?
        .map(|device| {
            let name = device.name().map_err(|e| e.to_string())?;
            let count = counts.entry(name.clone()).or_insert(0usize);
            let id = format!("{}:{}", name, count);
            *count += 1;
            Ok((id, name, device))
        })
        .collect()
}
pub fn builder(id: Option<&str>) -> Result<OutputStreamBuilder, String> {
    match id {
        None => OutputStreamBuilder::from_default_device().map_err(|e| e.to_string()),
        Some(id) => {
            let (_, _, device) = devices()?
                .into_iter()
                .find(|(key, _, _)| key == id)
                .ok_or_else(|| {
                    "Выбранное звуковое устройство недоступно. Выберите другой выход в настройках."
                        .to_string()
                })?;
            OutputStreamBuilder::from_device(device).map_err(|e| e.to_string())
        }
    }
}
#[tauri::command]
pub fn audio_outputs() -> Result<Vec<Output>, String> {
    Ok(devices()?
        .into_iter()
        .map(|(id, name, _)| Output { id, name })
        .collect())
}
