use crate::model::{now, TagDraft, TagSaveResult, Track};
use base64::{engine::general_purpose::STANDARD, Engine};
use lofty::{
    config::WriteOptions,
    file::{AudioFile, TaggedFileExt},
    picture::{Picture, PictureType},
    prelude::{Accessor, ItemKey, TagExt},
    probe::Probe,
    tag::{items::Timestamp, ItemValue, Tag, TagItem},
};
use std::{
    collections::hash_map::DefaultHasher,
    fs,
    hash::Hasher,
    io::{Cursor, Read, Write},
    path::{Path, PathBuf},
};
use symphonia::core::{
    errors::Error as AudioError, formats::FormatOptions, io::MediaSourceStream,
    meta::MetadataOptions, probe::Hint,
};

// Compare encoded audio packets, not file bytes: tags and container headers are
// expected to change. Packet iteration streams the file with bounded memory.
fn audio_fingerprint(path: &Path, format: &str) -> Result<(u64, u64), String> {
    let file = fs::File::open(path).map_err(|e| e.to_string())?;
    let stream = MediaSourceStream::new(Box::new(file), Default::default());
    let mut hint = Hint::new();
    hint.with_extension(&format.to_lowercase());
    let mut reader = symphonia::default::get_probe()
        .format(
            &hint,
            stream,
            &FormatOptions::default(),
            &MetadataOptions::default(),
        )
        .map_err(|e| format!("Не удалось проверить аудиодорожку: {e}"))?
        .format;
    let id = reader.default_track().ok_or("Аудиодорожка не найдена")?.id;
    let mut hasher = DefaultHasher::new();
    let mut bytes = 0_u64;
    loop {
        match reader.next_packet() {
            Ok(packet) if packet.track_id() == id => {
                hasher.write(&packet.data);
                bytes += packet.data.len() as u64;
            }
            Ok(_) => {}
            Err(AudioError::IoError(error))
                if error.kind() == std::io::ErrorKind::UnexpectedEof =>
            {
                break
            }
            Err(error) => return Err(format!("Не удалось проверить аудиодорожку: {error}")),
        }
    }
    if bytes == 0 {
        return Err("Аудиодорожка пуста. Используйте sidecar-файл.".into());
    }
    Ok((bytes, hasher.finish()))
}

fn sidecar_path(path: &Path) -> PathBuf {
    PathBuf::from(format!("{}.sonotune.json", path.display()))
}
fn read_sidecar(path: &Path) -> Option<TagDraft> {
    let file = fs::File::open(sidecar_path(path)).ok()?;
    let mut bytes = Vec::new();
    file.take(13 * 1024 * 1024 + 1)
        .read_to_end(&mut bytes)
        .ok()?;
    if bytes.len() > 13 * 1024 * 1024 {
        return None;
    }
    let draft: TagDraft = serde_json::from_slice(&bytes).ok()?;
    draft.validate().ok()?;
    Some(draft)
}

pub fn decode_artwork(value: &str) -> Result<Vec<u8>, String> {
    if value.len() > 12 * 1024 * 1024 {
        return Err("Обложка слишком большая. Максимум — 8 МБ.".into());
    }
    let (prefix, body) = value.split_once(',').ok_or("Некорректная обложка")?;
    if ![
        "data:image/jpeg;base64",
        "data:image/png;base64",
        "data:image/webp;base64",
    ]
    .contains(&prefix)
    {
        return Err("Поддерживаются JPG, PNG и WebP.".into());
    }
    let bytes = STANDARD
        .decode(body)
        .map_err(|_| "Не удалось прочитать обложку")?;
    if bytes.len() > 8 * 1024 * 1024 {
        return Err("Обложка больше 8 МБ.".into());
    }
    validate_image(&bytes)?;
    Ok(bytes)
}

fn validate_image(bytes: &[u8]) -> Result<image::DynamicImage, String> {
    let mut reader = image::ImageReader::new(Cursor::new(bytes))
        .with_guessed_format()
        .map_err(|e| e.to_string())?;
    let mut limits = image::Limits::default();
    limits.max_image_width = Some(8192);
    limits.max_image_height = Some(8192);
    limits.max_alloc = Some(128 * 1024 * 1024);
    reader.limits(limits);
    reader
        .decode()
        .map_err(|_| "Не удалось прочитать изображение или превышен размер 8192×8192.".into())
}
pub fn cache_cover(bytes: &[u8], id: &str, data_dir: &Path) -> Result<String, String> {
    let image = validate_image(bytes)?;
    let directory = data_dir.join("artwork");
    fs::create_dir_all(&directory).map_err(|e| e.to_string())?;
    let path = directory.join(format!("{id}.png"));
    let mut temp = tempfile::NamedTempFile::new_in(&directory).map_err(|e| e.to_string())?;
    image
        .thumbnail(320, 320)
        .write_to(&mut temp, image::ImageFormat::Png)
        .map_err(|e| e.to_string())?;
    temp.as_file().sync_all().map_err(|e| e.to_string())?;
    temp.persist(&path).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().into_owned())
}
fn tag_values(tag: Option<&Tag>, key: ItemKey) -> Vec<String> {
    tag.map(|tag| {
        tag.get_strings(key)
            .flat_map(|value| value.split(';'))
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(str::to_owned)
            .collect()
    })
    .unwrap_or_default()
}
pub fn file_stamp(path: &Path) -> Result<(u64, u64), String> {
    let metadata = fs::metadata(path).map_err(|e| e.to_string())?;
    let modified = metadata
        .modified()
        .ok()
        .and_then(|v| v.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|v| v.as_millis() as u64)
        .unwrap_or(0);
    Ok((metadata.len(), modified))
}
pub fn read_track(
    path: &Path,
    previous: Option<&Track>,
    data_dir: &Path,
    demo: bool,
) -> Result<Track, String> {
    let (size, modified) = file_stamp(path)?;
    let id = previous
        .map(|t| t.id.clone())
        .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    let tagged = Probe::open(path)
        .map_err(|e| e.to_string())?
        .guess_file_type()
        .map_err(|e| e.to_string())?
        .read()
        .map_err(|e| e.to_string())?;
    let tag = tagged.primary_tag().or_else(|| tagged.first_tag());
    let artwork = tag
        .and_then(|tag| tag.pictures().first())
        .and_then(|picture| cache_cover(picture.data(), &id, data_dir).ok());
    let title = tag
        .and_then(Accessor::title)
        .map(|v| v.into_owned())
        .filter(|v| !v.trim().is_empty())
        .unwrap_or_else(|| {
            path.file_stem()
                .unwrap_or_default()
                .to_string_lossy()
                .into_owned()
        });
    let mut track = Track {
        id,
        path: path.to_string_lossy().into_owned(),
        title,
        artists: tag_values(tag, ItemKey::TrackArtist),
        album: tag
            .and_then(Accessor::album)
            .map(|v| v.into_owned())
            .unwrap_or_else(|| "Без альбома".into()),
        year: tag
            .and_then(Accessor::date)
            .map(|date| u32::from(date.year)),
        genres: tag_values(tag, ItemKey::Genre),
        duration: if path
            .extension()
            .is_some_and(|e| e.eq_ignore_ascii_case("m4a"))
        {
            tagged
                .properties()
                .sample_rate()
                .and_then(|rate| {
                    crate::mp4::trim(path, rate).map(|trim| trim.frames as f64 / rate as f64)
                })
                .unwrap_or_else(|| tagged.properties().duration().as_secs_f64())
        } else {
            tagged.properties().duration().as_secs_f64()
        },
        artwork,
        format: path
            .extension()
            .unwrap_or_default()
            .to_string_lossy()
            .to_uppercase(),
        size,
        modified,
        added_at: previous.map(|t| t.added_at).unwrap_or_else(now),
        favorite: previous.is_some_and(|t| t.favorite),
        available: true,
        demo,
    };
    if let Some(draft) = read_sidecar(path) {
        draft.apply(&mut track);
        if draft.artwork_changed {
            track.artwork = draft.artwork.as_deref().and_then(|value| {
                decode_artwork(value)
                    .and_then(|b| cache_cover(&b, &track.id, data_dir))
                    .ok()
            });
        }
    }
    Ok(track)
}

fn atomic_json(path: &Path, draft: &TagDraft) -> Result<(), String> {
    let mut temp = tempfile::NamedTempFile::new_in(path.parent().ok_or("Не найдена папка файла")?)
        .map_err(|e| e.to_string())?;
    temp.write_all(&serde_json::to_vec_pretty(draft).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    temp.as_file().sync_all().map_err(|e| e.to_string())?;
    temp.persist(path).map_err(|e| e.to_string())?;
    Ok(())
}
pub fn save(
    track: &Track,
    draft: &TagDraft,
    sidecar: bool,
    data_dir: &Path,
) -> Result<TagSaveResult, String> {
    draft.validate()?;
    let path = Path::new(&track.path);
    let mut effective = draft.clone();
    if !effective.artwork_changed {
        if let Some(previous) = read_sidecar(path).filter(|value| value.artwork_changed) {
            effective.artwork = previous.artwork;
            effective.artwork_changed = true;
        }
    }
    let draft = &effective;
    let (size, modified) = file_stamp(path)?;
    if modified != track.modified || size != track.size {
        return Err("Файл изменился вне SonoTune. Пересканируйте библиотеку перед записью.".into());
    }
    let picture_bytes = if draft.artwork_changed {
        draft.artwork.as_deref().map(decode_artwork).transpose()?
    } else {
        None
    };
    if sidecar {
        atomic_json(&sidecar_path(path), draft)?;
        let mut updated = track.clone();
        draft.apply(&mut updated);
        if draft.artwork_changed {
            updated.artwork = picture_bytes
                .as_deref()
                .map(|bytes| cache_cover(bytes, &track.id, data_dir))
                .transpose()?;
        }
        return Ok(TagSaveResult {
            track: updated,
            mode: "sidecar".into(),
            backup: None,
        });
    }
    let directory = data_dir.join("backups");
    fs::create_dir_all(&directory).map_err(|e| e.to_string())?;
    let backup = directory.join(format!(
        "{}-{}.{}",
        track.id,
        now(),
        track.format.to_lowercase()
    ));
    fs::copy(path, &backup).map_err(|e| format!("Не удалось создать резервную копию: {e}"))?;
    let original_audio = audio_fingerprint(&backup, &track.format)?;
    let mut temporary =
        tempfile::NamedTempFile::new_in(path.parent().ok_or("Не найдена папка файла")?)
            .map_err(|e| e.to_string())?;
    std::io::copy(
        &mut fs::File::open(path).map_err(|e| e.to_string())?,
        &mut temporary,
    )
    .map_err(|e| e.to_string())?;
    let mut tagged = Probe::open(temporary.path())
        .map_err(|e| e.to_string())?
        .guess_file_type()
        .map_err(|e| e.to_string())?
        .read()
        .map_err(|e| e.to_string())?;
    let tag_type = tagged.primary_tag_type();
    if tagged.primary_tag().is_none() {
        tagged.insert_tag(Tag::new(tag_type));
    }
    let tag = tagged
        .primary_tag_mut()
        .ok_or("Формат тегов недоступен для записи")?;
    tag.set_title(draft.title.trim().to_owned());
    tag.remove_key(ItemKey::TrackArtist);
    for artist in &draft.artists {
        tag.push(TagItem::new(
            ItemKey::TrackArtist,
            ItemValue::Text(artist.clone()),
        ));
    }
    tag.set_album(draft.album.clone());
    tag.remove_key(ItemKey::Genre);
    for genre in &draft.genres {
        tag.push(TagItem::new(ItemKey::Genre, ItemValue::Text(genre.clone())));
    }
    if let Some(year) = draft.year {
        if !tag.date().is_some_and(|date| u32::from(date.year) == year) {
            tag.set_date(Timestamp {
                year: year as u16,
                ..Default::default()
            });
        }
    } else {
        tag.remove_date();
    }
    if draft.artwork_changed {
        tag.remove_picture_type(PictureType::CoverFront);
        if let Some(bytes) = picture_bytes.as_ref() {
            let mut picture =
                Picture::from_reader(&mut Cursor::new(bytes)).map_err(|e| e.to_string())?;
            picture.set_pic_type(PictureType::CoverFront);
            tag.push_picture(picture);
        }
    }
    tag.save_to_path(temporary.path(), WriteOptions::default())
        .map_err(|e| format!("Не удалось записать теги. Попробуйте sidecar: {e}"))?;
    let verified = Probe::open(temporary.path())
        .map_err(|e| e.to_string())?
        .guess_file_type()
        .map_err(|e| e.to_string())?
        .read()
        .map_err(|e| e.to_string())?;
    if verified.primary_tag().and_then(Accessor::title).as_deref() != Some(draft.title.trim())
        || (verified.properties().duration().as_secs_f64() - track.duration).abs() > 0.5
    {
        return Err("Проверка сохранённого файла не пройдена. Оригинал не изменён.".into());
    }
    if audio_fingerprint(temporary.path(), &track.format)? != original_audio {
        return Err("После записи тегов изменилась аудиодорожка. Оригинал не заменён. Используйте sidecar-файл.".into());
    }
    // Recheck immediately before replacing a file that another app could have changed.
    if file_stamp(path)? != (size, modified) {
        return Err("Файл изменился во время сохранения. Оригинал не заменён.".into());
    }
    temporary.as_file().sync_all().map_err(|e| e.to_string())?;
    temporary
        .persist(path)
        .map_err(|e| format!("Файл занят или недоступен для замены. Попробуйте sidecar: {e}"))?;
    // An existing override must not shadow the newly written tags on the next scan.
    if sidecar_path(path).exists() {
        atomic_json(&sidecar_path(path), draft)?;
    }
    let updated = read_track(path, Some(track), data_dir, track.demo)?;
    Ok(TagSaveResult {
        track: updated,
        mode: "file".into(),
        backup: Some(backup.to_string_lossy().into_owned()),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_external_urls_and_invalid_base64() {
        assert!(decode_artwork("https://example.com/cover.jpg").is_err());
        assert!(decode_artwork("data:image/jpeg;base64,!!").is_err());
    }
    fn fixture(extension: &str, directory: &Path) -> PathBuf {
        let path = directory.join(format!("tone.{extension}"));
        fs::copy(
            Path::new(env!("CARGO_MANIFEST_DIR"))
                .join(format!("../tests/fixtures/tone.{extension}")),
            &path,
        )
        .unwrap();
        path
    }
    fn draft() -> TagDraft {
        TagDraft {
            title: "Тёплый свет".into(),
            artists: vec!["Dayroom".into(), "Гость".into()],
            album: "Своя музыка".into(),
            year: Some(2026),
            genres: vec!["Ambient".into(), "Electronic".into()],
            artwork: None,
            artwork_changed: false,
        }
    }
    fn samples(path: &Path) -> Vec<u32> {
        crate::audio::open(path, None, None)
            .unwrap()
            .map(f32::to_bits)
            .collect()
    }
    #[test]
    fn tag_round_trip_preserves_audio_and_creates_exact_backup_for_all_formats() {
        for extension in ["wav", "flac", "mp3", "ogg", "opus", "m4a", "aac"] {
            let directory = tempfile::tempdir().unwrap();
            let path = fixture(extension, directory.path());
            let original = fs::read(&path).unwrap();
            let audio_before = samples(&path);
            let track = read_track(&path, None, directory.path(), false).unwrap();
            let result = save(&track, &draft(), false, directory.path())
                .unwrap_or_else(|e| panic!("{extension}: {e}"));
            assert_eq!(result.mode, "file");
            assert_eq!(result.track.title, "Тёплый свет", "{extension}");
            assert_eq!(
                result.track.artists,
                vec!["Dayroom", "Гость"],
                "{extension}"
            );
            assert_eq!(result.track.year, Some(2026), "{extension}");
            assert_eq!(
                fs::read(result.backup.unwrap()).unwrap(),
                original,
                "{extension} backup"
            );
            let audio_after = samples(&path);
            assert!(audio_after == audio_before, "{extension} decoded audio differs: before={} samples, after={} samples; first before={:?}, after={:?}", audio_before.len(), audio_after.len(), &audio_before[..8], &audio_after[..8]);
        }
    }
    #[test]
    fn sidecar_overrides_metadata_without_modifying_audio_file() {
        let directory = tempfile::tempdir().unwrap();
        let path = fixture("flac", directory.path());
        let original = fs::read(&path).unwrap();
        let track = read_track(&path, None, directory.path(), false).unwrap();
        let result = save(&track, &draft(), true, directory.path()).unwrap();
        assert_eq!(result.mode, "sidecar");
        assert_eq!(fs::read(&path).unwrap(), original);
        assert_eq!(
            read_track(&path, Some(&track), directory.path(), false)
                .unwrap()
                .title,
            "Тёплый свет"
        );
    }
    #[test]
    fn m4a_itunes_gapless_metadata_and_covers_survive_tag_writes() {
        for name in ["tone.m4a", "smpb.m4a", "tone.aac"] {
            let directory = tempfile::tempdir().unwrap();
            let path = directory.path().join(name);
            fs::copy(
                Path::new(env!("CARGO_MANIFEST_DIR"))
                    .join("../tests/fixtures")
                    .join(name),
                &path,
            )
            .unwrap();
            let before = samples(&path);
            let track = read_track(&path, None, directory.path(), false).unwrap();
            let mut values = draft();
            let mut bytes = Cursor::new(vec![]);
            image::RgbImage::from_pixel(8, 8, image::Rgb([80, 180, 120]))
                .write_to(&mut bytes, image::ImageFormat::Png)
                .unwrap();
            values.artwork_changed = true;
            values.artwork = Some(format!(
                "data:image/png;base64,{}",
                STANDARD.encode(bytes.get_ref())
            ));
            let result = save(&track, &values, false, directory.path()).unwrap();
            assert!(result.track.artwork.is_some(), "{name}");
            assert_eq!(
                before,
                samples(&path),
                "gapless data changed after editing {name}"
            );
        }
    }
    #[test]
    fn refuses_to_replace_a_file_modified_since_scan() {
        let directory = tempfile::tempdir().unwrap();
        let path = fixture("wav", directory.path());
        let mut track = read_track(&path, None, directory.path(), false).unwrap();
        track.modified = 0;
        let original = fs::read(&path).unwrap();
        assert!(save(&track, &draft(), false, directory.path()).is_err());
        assert_eq!(fs::read(path).unwrap(), original);
    }
    #[test]
    fn writes_removes_and_caches_cover_art() {
        let directory = tempfile::tempdir().unwrap();
        let path = fixture("mp3", directory.path());
        let track = read_track(&path, None, directory.path(), false).unwrap();
        let mut bytes = Cursor::new(vec![]);
        image::RgbImage::from_pixel(16, 16, image::Rgb([210, 165, 90]))
            .write_to(&mut bytes, image::ImageFormat::Png)
            .unwrap();
        let mut values = draft();
        values.artwork_changed = true;
        values.artwork = Some(format!(
            "data:image/png;base64,{}",
            STANDARD.encode(bytes.get_ref())
        ));
        let result = save(&track, &values, false, directory.path()).unwrap();
        assert!(Path::new(result.track.artwork.as_ref().unwrap()).is_file());
        values.artwork = None;
        let result = save(&result.track, &values, false, directory.path()).unwrap();
        assert!(result.track.artwork.is_none());
    }
    #[test]
    fn sidecar_cover_survives_a_later_title_edit_and_can_be_committed_to_file() {
        let directory = tempfile::tempdir().unwrap();
        let path = fixture("flac", directory.path());
        let track = read_track(&path, None, directory.path(), false).unwrap();
        let mut bytes = Cursor::new(vec![]);
        image::RgbImage::from_pixel(8, 8, image::Rgb([80, 180, 120]))
            .write_to(&mut bytes, image::ImageFormat::Png)
            .unwrap();
        let mut values = draft();
        values.artwork_changed = true;
        values.artwork = Some(format!(
            "data:image/png;base64,{}",
            STANDARD.encode(bytes.get_ref())
        ));
        let first = save(&track, &values, true, directory.path()).unwrap();
        values.title = "Другой заголовок".into();
        values.artwork_changed = false;
        values.artwork = first.track.artwork.clone();
        let second = save(&first.track, &values, true, directory.path()).unwrap();
        assert!(
            read_track(&path, Some(&second.track), directory.path(), false)
                .unwrap()
                .artwork
                .is_some()
        );
        let third = save(&second.track, &values, false, directory.path()).unwrap();
        fs::remove_file(sidecar_path(&path)).unwrap();
        let embedded = read_track(&path, Some(&third.track), directory.path(), false).unwrap();
        assert!(embedded.artwork.is_some());
        assert_eq!(embedded.title, "Другой заголовок");
    }
}
