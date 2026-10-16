import { t, useLanguage } from '../../shared/i18n';
import { useRef, useState } from 'react';
import { ImagePlus, Save, ShieldCheck, Trash2 } from 'lucide-react';
import type { TagDraft, Track } from '../../shared/types';
import { Artwork, Modal } from '../../shared/ui';
import { desktop } from '../../shared/api';
import { useStore } from '../../app/store';

export function TagEditor({ track, onClose }: { track: Track; onClose(): void }) {
  useLanguage();
  const [draft, setDraft] = useState<TagDraft>({
    title: track.title,
    artists: track.artists,
    album: track.album,
    year: track.year,
    genres: track.genres,
    artwork: track.artwork,
    artworkChanged: false,
  });
  const [artists, setArtists] = useState(track.artists.join('; '));
  const [genres, setGenres] = useState(track.genres.join('; '));
  const [year, setYear] = useState(track.year?.toString() ?? '');
  const [sidecar, setSidecar] = useState(!desktop);
  const [saving, setSaving] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const patch = (values: Partial<TagDraft>) => setDraft((previous) => ({ ...previous, ...values }));
  const upload = async (file: File | undefined) => {
    if (!file) return;
    if (
      !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
      file.size > 8 * 1024 * 1024
    ) {
      useStore.getState().notify(t('Выберите JPG, PNG или WebP размером до 8 МБ.'), true);
      return;
    }
    const url = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    patch({ artwork: url, artworkChanged: true });
  };
  const validYear = !year || (/^\d{1,4}$/.test(year) && Number(year) > 0);
  return (
    <Modal title={t('Редактировать теги')} onClose={onClose} className="tag-modal">
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!validYear || saving) return;
          setSaving(true);
          const success = await useStore.getState().saveTags(
            track.id,
            {
              ...draft,
              title: draft.title.trim(),
              album: draft.album.trim(),
              artists: artists
                .split(';')
                .map((v) => v.trim())
                .filter(Boolean),
              genres: genres
                .split(';')
                .map((v) => v.trim())
                .filter(Boolean),
              year: year ? Number(year) : null,
            },
            sidecar,
          );
          setSaving(false);
          if (success) onClose();
        }}
      >
        <div className="tag-top">
          <Artwork track={{ ...track, artwork: draft.artwork }} />
          <div>
            <span className="eyebrow">{t('ОБЛОЖКА АЛЬБОМА')}</span>
            <p>{t('Немного характера для вашей музыки.')}</p>
            <div className="inline-actions">
              <button
                type="button"
                className="button tonal small"
                onClick={() => input.current?.click()}
              >
                <ImagePlus size={16} />
                {t('Выбрать')}
              </button>
              <button
                type="button"
                className="icon-button"
                title={t('Убрать обложку')}
                aria-label={t('Убрать обложку')}
                onClick={() => patch({ artwork: null, artworkChanged: true })}
              >
                <Trash2 size={17} />
              </button>
            </div>
            <span className="field-hint">{t('JPG, PNG, WebP · до 8 МБ')}</span>
          </div>
          <input
            ref={input}
            type="file"
            hidden
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => {
              void upload(e.target.files?.[0]).catch(() =>
                useStore.getState().notify(t('Не удалось прочитать обложку'), true),
              );
            }}
          />
        </div>
        <div className="form-fields">
          <label>
            {t('Название')}
            <input
              data-autofocus
              required
              maxLength={500}
              value={draft.title}
              onChange={(e) => patch({ title: e.target.value })}
            />
          </label>
          <label>
            {t('Исполнитель')}
            <input
              maxLength={1000}
              value={artists}
              onChange={(e) => setArtists(e.target.value)}
              placeholder={t('Несколько исполнителей — через ;')}
            />
          </label>
          <label>
            {t('Альбом')}
            <input
              maxLength={500}
              value={draft.album}
              onChange={(e) => patch({ album: e.target.value })}
            />
          </label>
          <div className="form-two">
            <label>
              {t('Год')}
              <input
                inputMode="numeric"
                maxLength={4}
                value={year}
                onChange={(e) => setYear(e.target.value)}
                aria-invalid={!validYear}
                placeholder={t('Не указан')}
              />
            </label>
            <label>
              {t('Жанр')}
              <input
                maxLength={1000}
                value={genres}
                onChange={(e) => setGenres(e.target.value)}
                placeholder="Ambient; Electronic"
              />
            </label>
          </div>
        </div>
        <div className="save-notice">
          <ShieldCheck size={22} />
          <div>
            <strong>
              {sidecar ? t('Сохранение рядом с оригиналом') : t('Оригинал под защитой')}
            </strong>
            <p>
              {!desktop
                ? t(
                    'Браузер сохранит изменения в библиотеку и скачает JSON. Запись в аудиофайл доступна в десктопном приложении.',
                  )
                : sidecar
                  ? t(
                      'Теги будут записаны в .sonotune.json рядом с треком. SonoTune учитывает их при сканировании.',
                    )
                  : t(
                      'Перед записью в аудиофайл создаётся резервная копия в папке backups приложения.',
                    )}
            </p>
          </div>
        </div>
        {desktop && (
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={sidecar}
              onChange={(e) => setSidecar(e.target.checked)}
            />
            {t('Сохранить только в sidecar-файл')}
          </label>
        )}
        <div className="file-path" title={track.path}>
          {track.path}
        </div>
        <div className="modal-footer">
          <button type="button" className="button ghost" disabled={saving} onClick={onClose}>
            {t('Отмена')}
          </button>
          <button className="button primary" disabled={saving || !draft.title.trim() || !validYear}>
            <Save size={17} />
            {saving ? t('Сохранение…') : t('Сохранить')}
          </button>
        </div>
      </form>
    </Modal>
  );
}
