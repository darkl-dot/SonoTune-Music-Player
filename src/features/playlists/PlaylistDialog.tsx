import { localizeError, t, useLanguage } from '../../shared/i18n';
import { useEffect, useRef, useState } from 'react';
import { ImagePlus, Plus, Trash2 } from 'lucide-react';
import type { Playlist, Track } from '../../shared/types';
import { Modal } from '../../shared/ui';
import { useStore, run } from '../../app/store';
import { PlaylistArtwork } from './PlaylistArtwork';
import { preparePlaylistCover } from '../../shared/playlist-cover';

export function PlaylistDialog({
  playlist,
  track,
  onClose,
}: {
  playlist?: Playlist;
  track?: Track;
  onClose(): void;
}) {
  useLanguage();
  const [name, setName] = useState(playlist?.name ?? '');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const [artwork, setArtwork] = useState(playlist?.artwork ?? null);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const imageRequest = useRef(0);
  const tracks = useStore((s) => s.library.tracks);
  const firstTrack = track ?? tracks.find((item) => playlist?.trackIds.includes(item.id));
  useEffect(
    () => () => {
      imageRequest.current++;
    },
    [],
  );
  const upload = async (file?: File) => {
    if (!file) return;
    const request = ++imageRequest.current;
    setUploading(true);
    setError('');
    try {
      const value = await preparePlaylistCover(file);
      if (request === imageRequest.current) setArtwork(value);
    } catch (value) {
      if (request === imageRequest.current) setError(localizeError(value));
    } finally {
      if (request === imageRequest.current) setUploading(false);
    }
  };
  return (
    <Modal
      title={
        deleting
          ? t('Удалить плейлист?')
          : playlist
            ? t('Настроение меняется')
            : t('Новый плейлист')
      }
      onClose={onClose}
      className="playlist-modal"
    >
      {deleting ? (
        <>
          <p className="dialog-description">
            {t('Плейлист «{name}» будет удалён. Треки останутся в библиотеке.', {
              name: playlist?.name ?? '',
            })}
          </p>
          <div className="modal-footer">
            <button className="button ghost" onClick={() => setDeleting(false)}>
              {t('Назад')}
            </button>
            <button
              className="button danger"
              disabled={saving}
              onClick={() => {
                setSaving(true);
                void run(async () => {
                  try {
                    await useStore.getState().deletePlaylist(playlist!.id);
                    onClose();
                  } finally {
                    setSaving(false);
                  }
                });
              }}
            >
              <Trash2 size={17} />
              {t('Удалить')}
            </button>
          </div>
        </>
      ) : (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!name.trim() || saving || uploading) return;
            setSaving(true);
            setError('');
            try {
              const value: Playlist = {
                id: playlist?.id ?? crypto.randomUUID(),
                name: name.trim(),
                trackIds: playlist?.trackIds ?? (track ? [track.id] : []),
                createdAt: playlist?.createdAt ?? Date.now(),
                artwork,
              };
              await useStore.getState().savePlaylist(value);
              useStore
                .getState()
                .notify(
                  playlist
                    ? t('Плейлист сохранён')
                    : t('Создан плейлист «{name}»', { name: value.name }),
                );
              if (!playlist) useStore.getState().setSection(`playlist:${value.id}`);
              onClose();
            } catch (value) {
              setError(localizeError(value));
            } finally {
              setSaving(false);
            }
          }}
        >
          <div className="playlist-cover-editor">
            <div className="playlist-cover-preview">
              <PlaylistArtwork playlist={{ artwork }} track={firstTrack} />
            </div>
            <div>
              <span className="eyebrow">{t('ОБЛОЖКА ПЛЕЙЛИСТА')}</span>
              <div className="inline-actions">
                <button
                  type="button"
                  className="button tonal small"
                  disabled={uploading}
                  onClick={() => fileInput.current?.click()}
                >
                  <ImagePlus size={16} />
                  {uploading ? t('Читаем обложку…') : t('Выбрать обложку')}
                </button>
                {artwork && (
                  <button
                    type="button"
                    className="icon-button"
                    title={t('Убрать обложку')}
                    aria-label={t('Убрать обложку')}
                    onClick={() => {
                      imageRequest.current++;
                      setArtwork(null);
                      setUploading(false);
                    }}
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
              <span className="field-hint">{t('JPG, PNG, WebP · до 8 МБ')}</span>
            </div>
            <input
              ref={fileInput}
              hidden
              type="file"
              accept="image/jpeg,image/png,image/webp"
              aria-label={t('Файл обложки плейлиста')}
              onChange={(e) => {
                void upload(e.target.files?.[0]);
                e.currentTarget.value = '';
              }}
            />
          </div>
          <p className="dialog-description">
            {playlist
              ? t('Новое имя, новая обложка — ваше настроение.')
              : track
                ? t('«{title}» станет первым треком.', { title: track.title })
                : t('Для долгих прогулок, коротких пауз и всего между ними.')}
          </p>
          <label className="standalone-label">
            {t('Название')}
            <input
              data-autofocus
              placeholder={t('Например, Без спешки')}
              required
              maxLength={100}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          {error && (
            <p role="alert" className="danger-text">
              {error}
            </p>
          )}
          <div className="modal-footer">
            {playlist && (
              <button
                type="button"
                className="button ghost danger-text"
                onClick={() => setDeleting(true)}
              >
                <Trash2 size={17} />
                {t('Удалить')}
              </button>
            )}
            <button type="button" className="button ghost" onClick={onClose}>
              {t('Отмена')}
            </button>
            <button className="button primary" disabled={!name.trim() || saving || uploading}>
              {!playlist && <Plus size={17} />}
              {playlist ? t('Сохранить') : t('Создать')}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
