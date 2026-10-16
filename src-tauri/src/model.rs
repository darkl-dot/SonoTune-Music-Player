use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Track {
    pub id: String,
    pub path: String,
    pub title: String,
    pub artists: Vec<String>,
    pub album: String,
    pub year: Option<u32>,
    pub genres: Vec<String>,
    pub duration: f64,
    pub artwork: Option<String>,
    pub format: String,
    pub size: u64,
    pub modified: u64,
    pub added_at: u64,
    pub favorite: bool,
    pub available: bool,
    pub demo: bool,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Playlist {
    pub id: String,
    pub name: String,
    pub track_ids: Vec<String>,
    pub created_at: u64,
    #[serde(default)]
    pub artwork: Option<String>,
}

#[derive(Clone, Default, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListeningStats {
    pub last_played: u64,
    pub play_count: u64,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ListeningUpdate {
    pub track_id: String,
    pub stats: ListeningStats,
}

#[derive(Clone, Serialize)]
pub struct Library {
    pub tracks: Vec<Track>,
    pub playlists: Vec<Playlist>,
    pub folders: Vec<String>,
    pub listening: std::collections::HashMap<String, ListeningStats>,
    pub pins: Vec<PinnedTrack>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PinnedTrack {
    pub track_id: String,
    pub label: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedPlayback {
    pub track_id: Option<String>,
    pub queue: Vec<String>,
    pub original_queue: Vec<String>,
    pub position: f64,
    pub volume: f32,
    pub shuffle: bool,
    pub repeat: Repeat,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TagDraft {
    pub title: String,
    pub artists: Vec<String>,
    pub album: String,
    pub year: Option<u32>,
    pub genres: Vec<String>,
    pub artwork: Option<String>,
    pub artwork_changed: bool,
}
impl TagDraft {
    pub fn apply(&self, track: &mut Track) {
        track.title = self.title.clone();
        track.artists = self.artists.clone();
        track.album = self.album.clone();
        track.year = self.year;
        track.genres = self.genres.clone();
    }
    pub fn validate(&self) -> Result<(), String> {
        if self.title.trim().is_empty()
            || self.title.len() > 2000
            || self.album.len() > 2000
            || self.artists.iter().map(String::len).sum::<usize>() > 4000
            || self.genres.iter().map(String::len).sum::<usize>() > 4000
            || self.year.is_some_and(|year| year == 0 || year > 9999)
        {
            return Err("Проверьте название, год и длину полей тегов.".into());
        }
        Ok(())
    }
}

#[derive(Clone, Serialize)]
pub struct ScanProgress {
    pub scanned: usize,
    pub imported: usize,
    pub errors: usize,
    pub done: bool,
    pub cancelled: bool,
}

#[derive(Serialize)]
pub struct TagSaveResult {
    pub track: Track,
    pub mode: String,
    pub backup: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Repeat {
    Single,
    None,
    All,
    One,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Playback {
    pub track_id: Option<String>,
    pub queue: Vec<String>,
    pub playing: bool,
    pub position: f64,
    pub duration: f64,
    pub volume: f32,
    pub shuffle: bool,
    pub repeat: Repeat,
}
impl Default for Playback {
    fn default() -> Self {
        Self {
            track_id: None,
            queue: vec![],
            playing: false,
            position: 0.0,
            duration: 0.0,
            volume: 0.7,
            shuffle: false,
            repeat: Repeat::None,
        }
    }
}

#[derive(Deserialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum PlayerCommand {
    Play { id: String, queue: Vec<String> },
    Toggle,
    Resume,
    Pause,
    Stop,
    Step { direction: i8 },
    Seek { seconds: f64 },
    Volume { value: f32 },
    Mode { shuffle: bool, repeat: Repeat },
    Enqueue { id: String },
    Remove { id: String },
    Snapshot,
    RefreshMetadata,
    SelectQueue { id: String },
    ReorderQueue { ids: Vec<String> },
    RemoveQueue { id: String },
    ClearNext,
}

pub fn now() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}
