use crate::model::{Library, ListeningStats, PinnedTrack, Playlist, Track};
use rusqlite::{params, Connection};
use std::{path::Path, sync::Mutex};

pub struct Database(pub Mutex<Connection>);
#[cfg(test)]
mod tests {
    use super::*;
    use base64::Engine;
    #[test]
    fn pins_and_scheduler_settings_survive_reopen_and_track_removal() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("pins.sqlite");
        let db = Database::open(&path).unwrap();
        let source = Path::new(env!("CARGO_MANIFEST_DIR")).join("../tests/fixtures/tone.flac");
        let track = crate::metadata::read_track(&source, None, directory.path(), false).unwrap();
        db.upsert_batch(std::slice::from_ref(&track)).unwrap();
        assert!(db.save_pin("missing", "").is_err());
        assert!(db.save_pin(&track.id, &"я".repeat(101)).is_err());
        db.save_pin(&track.id, " Под игру ").unwrap();
        db.save_state("scan-interval", &Some(12_u32)).unwrap();
        drop(db);
        let db = Database::open(&path).unwrap();
        assert_eq!(
            db.state::<Option<u32>>("scan-interval").unwrap(),
            Some(Some(12))
        );
        assert_eq!(db.load().unwrap().pins[0].label, "Под игру");
        db.save_pin(&track.id, "").unwrap();
        assert_eq!(db.load().unwrap().pins.len(), 1);
        assert_eq!(db.load().unwrap().pins[0].label, "");
        db.delete_pin(&track.id).unwrap();
        assert!(db.load().unwrap().pins.is_empty());
        db.save_pin(&track.id, "again").unwrap();
        db.remove_track(&track.id).unwrap();
        assert!(db.load().unwrap().pins.is_empty());
        assert!(source.exists());
    }
    #[test]
    fn legacy_library_migrates_and_playlist_artwork_survives_rename_and_removal() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("legacy.sqlite");
        let legacy = Connection::open(&path).unwrap();
        legacy.execute_batch("CREATE TABLE tracks (id TEXT PRIMARY KEY, path TEXT UNIQUE NOT NULL, data TEXT NOT NULL);
            CREATE TABLE playlists (id TEXT PRIMARY KEY, data TEXT NOT NULL);
            CREATE TABLE folders (path TEXT PRIMARY KEY);
            INSERT INTO playlists VALUES ('old', '{\"id\":\"old\",\"name\":\"Legacy\",\"trackIds\":[],\"createdAt\":1}');
            PRAGMA user_version=1;").unwrap();
        drop(legacy);
        let db = Database::open(&path).unwrap();
        let mut playlist = db.load().unwrap().playlists.remove(0);
        assert!(playlist.artwork.is_none());
        assert!(db.load().unwrap().listening.is_empty());
        let mut png = std::io::Cursor::new(Vec::new());
        image::DynamicImage::new_rgb8(2, 2)
            .write_to(&mut png, image::ImageFormat::Png)
            .unwrap();
        let artwork = format!(
            "data:image/png;base64,{}",
            base64::prelude::BASE64_STANDARD.encode(png.into_inner())
        );
        playlist.artwork = Some(artwork.clone());
        db.save_playlist(&playlist).unwrap();
        drop(db);
        let db = Database::open(&path).unwrap();
        let mut playlist = db.load().unwrap().playlists.remove(0);
        assert_eq!(playlist.artwork.as_deref(), Some(artwork.as_str()));
        playlist.name = "Renamed".into();
        db.save_playlist(&playlist).unwrap();
        playlist.artwork = Some("https://example.com/cover.png".into());
        assert!(db.save_playlist(&playlist).is_err());
        assert_eq!(
            db.load().unwrap().playlists[0].artwork.as_deref(),
            Some(artwork.as_str())
        );
        playlist.artwork = None;
        db.save_playlist(&playlist).unwrap();
        assert!(db.load().unwrap().playlists[0].artwork.is_none());
    }
    #[test]
    fn listening_persists_across_reopen_and_rescan_and_is_removed_with_a_track() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("listening.sqlite");
        let db = Database::open(&path).unwrap();
        let source = Path::new(env!("CARGO_MANIFEST_DIR")).join("../tests/fixtures/tone.flac");
        let track = crate::metadata::read_track(&source, None, directory.path(), false).unwrap();
        db.upsert_batch(std::slice::from_ref(&track)).unwrap();
        let started = db.record_listening(&track.id, false).unwrap();
        assert!(started.last_played > 0);
        assert_eq!(started.play_count, 0);
        let counted = db.record_listening(&track.id, true).unwrap();
        assert_eq!(counted.last_played, started.last_played);
        assert_eq!(counted.play_count, 1);
        db.upsert_batch(std::slice::from_ref(&track)).unwrap();
        drop(db);
        let db = Database::open(&path).unwrap();
        assert_eq!(db.load().unwrap().listening[&track.id].play_count, 1);
        db.remove_track(&track.id).unwrap();
        assert!(db.load().unwrap().listening.is_empty());
        assert!(db.record_listening(&track.id, false).is_err());
        assert!(source.exists());
    }
    #[test]
    fn playlists_persist_and_removing_a_track_cleans_up_references() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("test.sqlite");
        let db = Database::open(&path).unwrap();
        let source = Path::new(env!("CARGO_MANIFEST_DIR")).join("../tests/fixtures/tone.flac");
        let track = crate::metadata::read_track(&source, None, directory.path(), false).unwrap();
        db.upsert_batch(std::slice::from_ref(&track)).unwrap();
        db.save_playlist(&Playlist {
            id: "p".into(),
            name: "Без спешки".into(),
            track_ids: vec![track.id.clone(), track.id.clone(), "missing".into()],
            created_at: 1,
            artwork: None,
        })
        .unwrap();
        assert_eq!(db.load().unwrap().playlists[0].track_ids.len(), 1);
        db.set_favorite(&track.id, true).unwrap();
        db.upsert_batch(std::slice::from_ref(&track)).unwrap();
        assert!(db.track(&track.id).unwrap().favorite);
        drop(db);
        let db = Database::open(&path).unwrap();
        assert_eq!(db.load().unwrap().playlists[0].name, "Без спешки");
        db.remove_track(&track.id).unwrap();
        assert!(db.load().unwrap().playlists[0].track_ids.is_empty());
        assert!(source.exists());
    }
}
impl Database {
    pub fn open(path: &Path) -> Result<Self, String> {
        let connection = Connection::open(path).map_err(|e| e.to_string())?;
        connection.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
            CREATE TABLE IF NOT EXISTS tracks (id TEXT PRIMARY KEY, path TEXT UNIQUE NOT NULL, data TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS playlists (id TEXT PRIMARY KEY, data TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS folders (path TEXT PRIMARY KEY);
            CREATE TABLE IF NOT EXISTS listening_stats (
                track_id TEXT PRIMARY KEY REFERENCES tracks(id) ON DELETE CASCADE,
                last_played INTEGER NOT NULL,
                play_count INTEGER NOT NULL DEFAULT 0
            );
            CREATE TABLE IF NOT EXISTS app_state (name TEXT PRIMARY KEY, data TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS pinned_tracks (
                track_id TEXT PRIMARY KEY REFERENCES tracks(id) ON DELETE CASCADE,
                label TEXT NOT NULL DEFAULT ''
            );
            PRAGMA user_version=3;").map_err(|e| e.to_string())?;
        Ok(Self(Mutex::new(connection)))
    }
    pub fn load(&self) -> Result<Library, String> {
        let db = self.0.lock().map_err(|e| e.to_string())?;
        let mut statement = db
            .prepare("SELECT data FROM tracks ORDER BY rowid")
            .map_err(|e| e.to_string())?;
        let values = statement
            .query_map([], |row| row.get::<_, String>(0))
            .map_err(|e| e.to_string())?;
        let mut tracks = Vec::new();
        for value in values {
            tracks.push(
                serde_json::from_str::<Track>(&value.map_err(|e| e.to_string())?)
                    .map_err(|e| e.to_string())?,
            );
        }
        let mut statement = db
            .prepare("SELECT data FROM playlists ORDER BY rowid")
            .map_err(|e| e.to_string())?;
        let values = statement
            .query_map([], |row| row.get::<_, String>(0))
            .map_err(|e| e.to_string())?;
        let mut playlists = Vec::new();
        for value in values {
            playlists.push(
                serde_json::from_str::<Playlist>(&value.map_err(|e| e.to_string())?)
                    .map_err(|e| e.to_string())?,
            );
        }
        let mut statement = db
            .prepare("SELECT path FROM folders ORDER BY rowid")
            .map_err(|e| e.to_string())?;
        let folders = statement
            .query_map([], |row| row.get::<_, String>(0))
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        let mut statement = db
            .prepare("SELECT track_id,last_played,play_count FROM listening_stats")
            .map_err(|e| e.to_string())?;
        let listening = statement
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    ListeningStats {
                        last_played: row.get(1)?,
                        play_count: row.get(2)?,
                    },
                ))
            })
            .map_err(|e| e.to_string())?
            .collect::<Result<std::collections::HashMap<_, _>, _>>()
            .map_err(|e| e.to_string())?;
        let mut statement = db
            .prepare("SELECT track_id,label FROM pinned_tracks ORDER BY rowid")
            .map_err(|e| e.to_string())?;
        let pins = statement
            .query_map([], |row| {
                Ok(PinnedTrack {
                    track_id: row.get(0)?,
                    label: row.get(1)?,
                })
            })
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        Ok(Library {
            tracks,
            playlists,
            folders,
            listening,
            pins,
        })
    }
    pub fn state<T: serde::de::DeserializeOwned>(&self, name: &str) -> Result<Option<T>, String> {
        use rusqlite::OptionalExtension;
        let value: Option<String> = self
            .0
            .lock()
            .map_err(|e| e.to_string())?
            .query_row("SELECT data FROM app_state WHERE name=?1", [name], |row| {
                row.get(0)
            })
            .optional()
            .map_err(|e| e.to_string())?;
        value
            .map(|json| serde_json::from_str(&json).map_err(|e| e.to_string()))
            .transpose()
    }
    pub fn save_state(&self, name: &str, value: &impl serde::Serialize) -> Result<(), String> {
        let json = serde_json::to_string(value).map_err(|e| e.to_string())?;
        self.0.lock().map_err(|e| e.to_string())?
            .execute("INSERT INTO app_state(name,data) VALUES(?1,?2) ON CONFLICT(name) DO UPDATE SET data=excluded.data", params![name, json])
            .map_err(|e| e.to_string())?;
        Ok(())
    }
    pub fn save_pin(&self, id: &str, label: &str) -> Result<(), String> {
        if label.chars().count() > 100 {
            return Err("Подпись должна быть не длиннее 100 символов.".into());
        }
        self.track(id)?;
        self.0.lock().map_err(|e| e.to_string())?
            .execute("INSERT INTO pinned_tracks(track_id,label) VALUES(?1,?2) ON CONFLICT(track_id) DO UPDATE SET label=excluded.label", params![id, label.trim()])
            .map_err(|e| e.to_string())?;
        Ok(())
    }
    pub fn delete_pin(&self, id: &str) -> Result<(), String> {
        self.0
            .lock()
            .map_err(|e| e.to_string())?
            .execute("DELETE FROM pinned_tracks WHERE track_id=?1", [id])
            .map_err(|e| e.to_string())?;
        Ok(())
    }
    pub fn track(&self, id: &str) -> Result<Track, String> {
        let db = self.0.lock().map_err(|e| e.to_string())?;
        let value: String = db
            .query_row("SELECT data FROM tracks WHERE id=?1", [id], |row| {
                row.get(0)
            })
            .map_err(|_| "Трек больше не находится в библиотеке.".to_string())?;
        serde_json::from_str(&value).map_err(|e| e.to_string())
    }
    pub fn upsert_batch(&self, tracks: &[Track]) -> Result<(), String> {
        let mut db = self.0.lock().map_err(|e| e.to_string())?;
        let transaction = db.transaction().map_err(|e| e.to_string())?;
        for track in tracks {
            let mut track = track.clone();
            if let Ok(value) =
                transaction.query_row("SELECT data FROM tracks WHERE id=?1", [&track.id], |row| {
                    row.get::<_, String>(0)
                })
            {
                if let Ok(existing) = serde_json::from_str::<Track>(&value) {
                    track.favorite = existing.favorite;
                    track.added_at = existing.added_at;
                }
            }
            transaction.execute("INSERT INTO tracks(id,path,data) VALUES (?1,?2,?3) ON CONFLICT(id) DO UPDATE SET path=excluded.path,data=excluded.data", params![track.id, track.path, serde_json::to_string(&track).map_err(|e| e.to_string())?]).map_err(|e| e.to_string())?;
        }
        transaction.commit().map_err(|e| e.to_string())
    }
    pub fn save_playlist(&self, playlist: &Playlist) -> Result<(), String> {
        if playlist.name.trim().is_empty() || playlist.name.len() > 400 {
            return Err("Укажите название плейлиста до 100 символов.".into());
        }
        if let Some(artwork) = &playlist.artwork {
            if artwork.len() > 2 * 1024 * 1024 {
                return Err(
                    "Обложка плейлиста слишком большая. Выберите изображение заново.".into(),
                );
            }
            crate::metadata::decode_artwork(artwork)?;
        }
        let mut seen = std::collections::HashSet::new();
        let mut value = playlist.clone();
        value
            .track_ids
            .retain(|id| seen.insert(id.clone()) && self.track(id).is_ok());
        self.0.lock().map_err(|e| e.to_string())?.execute("INSERT INTO playlists(id,data) VALUES (?1,?2) ON CONFLICT(id) DO UPDATE SET data=excluded.data", params![value.id, serde_json::to_string(&value).map_err(|e| e.to_string())?]).map_err(|e| e.to_string())?;
        Ok(())
    }
    pub fn set_favorite(&self, id: &str, value: bool) -> Result<(), String> {
        let db = self.0.lock().map_err(|e| e.to_string())?;
        let data: String = db
            .query_row("SELECT data FROM tracks WHERE id=?1", [id], |row| {
                row.get(0)
            })
            .map_err(|e| e.to_string())?;
        let mut track: Track = serde_json::from_str(&data).map_err(|e| e.to_string())?;
        track.favorite = value;
        db.execute(
            "UPDATE tracks SET data=?1 WHERE id=?2",
            params![
                serde_json::to_string(&track).map_err(|e| e.to_string())?,
                id
            ],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }
    pub fn record_listening(&self, id: &str, counted: bool) -> Result<ListeningStats, String> {
        let db = self.0.lock().map_err(|e| e.to_string())?;
        let now = crate::model::now();
        db.execute("INSERT INTO listening_stats(track_id,last_played,play_count) VALUES (?1,?2,?3)
            ON CONFLICT(track_id) DO UPDATE SET
            last_played=CASE WHEN ?3=0 THEN MAX(listening_stats.last_played,excluded.last_played) ELSE listening_stats.last_played END,
            play_count=listening_stats.play_count+excluded.play_count", params![id, now, u64::from(counted)])
            .map_err(|e| e.to_string())?;
        db.query_row(
            "SELECT last_played,play_count FROM listening_stats WHERE track_id=?1",
            [id],
            |row| {
                Ok(ListeningStats {
                    last_played: row.get(0)?,
                    play_count: row.get(1)?,
                })
            },
        )
        .map_err(|e| e.to_string())
    }
    pub fn delete_playlist(&self, id: &str) -> Result<(), String> {
        self.0
            .lock()
            .map_err(|e| e.to_string())?
            .execute("DELETE FROM playlists WHERE id=?1", [id])
            .map_err(|e| e.to_string())?;
        Ok(())
    }
    pub fn remove_track(&self, id: &str) -> Result<(), String> {
        let library = self.load()?;
        let mut db = self.0.lock().map_err(|e| e.to_string())?;
        let transaction = db.transaction().map_err(|e| e.to_string())?;
        transaction
            .execute("DELETE FROM tracks WHERE id=?1", [id])
            .map_err(|e| e.to_string())?;
        for mut playlist in library.playlists {
            playlist.track_ids.retain(|value| value != id);
            transaction
                .execute(
                    "UPDATE playlists SET data=?1 WHERE id=?2",
                    params![
                        serde_json::to_string(&playlist).map_err(|e| e.to_string())?,
                        playlist.id
                    ],
                )
                .map_err(|e| e.to_string())?;
        }
        transaction.commit().map_err(|e| e.to_string())
    }
    pub fn add_folder(&self, path: &str) -> Result<(), String> {
        self.0
            .lock()
            .map_err(|e| e.to_string())?
            .execute("INSERT OR IGNORE INTO folders(path) VALUES (?1)", [path])
            .map_err(|e| e.to_string())?;
        Ok(())
    }
}
