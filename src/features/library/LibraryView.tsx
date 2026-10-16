import { t, useLanguage } from '../../shared/i18n';
import { memo, useEffect, useRef } from 'react';
import type { MouseEvent } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  ArrowUpDown,
  Clock3,
  Heart,
  MoreHorizontal,
  Music2,
  Pause,
  Play,
  FolderPlus,
  SearchX,
} from 'lucide-react';
import { useStore, run } from '../../app/store';
import { api } from '../../shared/api';
import { Artwork, Flower, IconButton } from '../../shared/ui';
import type { Track } from '../../shared/types';
import {
  albumKey,
  albumName,
  artistName,
  formatTime,
  groupName,
  plural,
  trackHue,
  UNKNOWN_ARTIST,
  UNKNOWN_GENRE,
} from '../../shared/utils';
import { useColumns } from '../../shared/useColumns';

interface Props {
  tracks: Track[];
  onMenu(event: MouseEvent, track: Track): void;
  onEdit(track: Track): void;
}
export const TrackRow = memo(function TrackRow({
  track,
  index,
  queue,
  onMenu,
  onEdit,
}: {
  track: Track;
  index: number;
  queue: string[];
  onMenu: Props['onMenu'];
  onEdit: Props['onEdit'];
}) {
  useLanguage();
  const current = useStore((s) => s.playback.trackId === track.id);
  const playing = useStore((s) => s.playback.trackId === track.id && s.playback.playing);
  const play = () =>
    void run(async () => {
      const service = await api;
      if (current) await service.toggle();
      else await service.play(track.id, queue);
    });
  return (
    <div
      role="row"
      data-track-id={track.id}
      className={`track-row ${current ? 'current-track' : ''} ${!track.available ? 'unavailable' : ''}`}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('application/x-sonotune-track', track.id);
        e.dataTransfer.effectAllowed = 'copy';
      }}
      onContextMenu={(e) => onMenu(e, track)}
      onDoubleClick={play}
    >
      <div role="cell" className="track-number">
        <span>
          {current && playing ? (
            <span className="equalizer">
              <i />
              <i />
              <i />
            </span>
          ) : (
            String(index + 1).padStart(2, '0')
          )}
        </span>
        <IconButton
          label={
            playing
              ? t('Пауза: {title}', { title: track.title })
              : t('Слушать {title}', { title: track.title })
          }
          onClick={play}
        >
          {playing ? (
            <Pause size={16} fill="currentColor" />
          ) : (
            <Play size={16} fill="currentColor" />
          )}
        </IconButton>
      </div>
      <div role="cell" className="track-name">
        <Artwork track={track} />
        <div>
          <button className="text-button track-title" onClick={play}>
            {track.title}
          </button>
          <span>
            {artistName(track)}
            {!track.available && t(' · файл недоступен')}
          </span>
        </div>
        {track.demo && <span className="demo-tag">{t('демо')}</span>}
      </div>
      <div role="cell" className="track-album">
        {albumName(track)}
      </div>
      <div role="cell" className="track-format">
        {track.format}
      </div>
      <div role="cell">
        <IconButton
          label={
            track.favorite
              ? t('Убрать {title} из избранного', { title: track.title })
              : t('Добавить {title} в избранное', { title: track.title })
          }
          className={track.favorite ? 'is-active' : 'track-heart'}
          onClick={() => void run(() => useStore.getState().favorite(track))}
        >
          <Heart size={16} fill={track.favorite ? 'currentColor' : 'none'} />
        </IconButton>
      </div>
      <div role="cell" className="track-duration">
        {track.duration ? formatTime(track.duration) : '—'}
      </div>
      <div role="cell">
        <IconButton
          label={t('Действия: {title}', { title: track.title })}
          onClick={(e) => onMenu(e, track)}
          onKeyDown={(e) => {
            if (e.key === 'F2') {
              e.preventDefault();
              onEdit(track);
            }
          }}
        >
          <MoreHorizontal size={20} />
        </IconButton>
      </div>
    </div>
  );
});

export function TrackList({ tracks, onMenu, onEdit }: Props) {
  useLanguage();
  const parent = useRef<HTMLDivElement>(null);
  const reveal = useStore((s) => s.reveal);
  const virtual = useVirtualizer({
    count: tracks.length,
    getScrollElement: () => parent.current,
    estimateSize: () => 68,
    overscan: 8,
  });
  useEffect(() => {
    if (!reveal) return;
    const index = tracks.findIndex((track) => track.id === reveal.id);
    if (index < 0) return;
    virtual.scrollToIndex(index, { align: 'center', behavior: 'auto' });
    // Wait for the virtual row to mount before moving keyboard focus.
    let frame = 0,
      attempts = 0;
    const focus = () => {
      const row = Array.from(
        parent.current?.querySelectorAll<HTMLElement>('[data-track-id]') ?? [],
      ).find((el) => el.dataset.trackId === reveal.id);
      if (row) {
        row.querySelector<HTMLButtonElement>('.track-title')?.focus({ preventScroll: true });
        row.classList.remove('revealed-track');
        void row.offsetWidth;
        row.classList.add('revealed-track');
      } else if (++attempts < 15) frame = requestAnimationFrame(focus);
    };
    frame = requestAnimationFrame(focus);
    return () => cancelAnimationFrame(frame);
  }, [reveal, tracks, virtual]);
  const queue = useRef<string[]>([]);
  // Stable queue reference keeps playback ticks from re-rendering every row.
  if (queue.current.length !== tracks.length || queue.current.some((id, i) => id !== tracks[i].id))
    queue.current = tracks.map((t) => t.id);
  return (
    <div
      className="track-table"
      role="table"
      aria-label={t('Список треков')}
      aria-rowcount={tracks.length + 1}
    >
      <div className="track-table-head track-row" role="row">
        <span role="columnheader">#</span>
        <span role="columnheader">
          {t('Название')}
          <ArrowUpDown size={12} />
        </span>
        <span role="columnheader" className="track-album">
          {t('Альбом')}
        </span>
        <span role="columnheader" className="track-format">
          {t('Формат')}
        </span>
        <span role="columnheader" />
        <span role="columnheader" className="track-duration">
          <Clock3 size={14} aria-label={t('Длительность')} />
        </span>
        <span role="columnheader" />
      </div>
      <div className="track-scroll" ref={parent}>
        <div style={{ height: virtual.getTotalSize(), position: 'relative', width: '100%' }}>
          {virtual.getVirtualItems().map((row) => (
            <div
              key={tracks[row.index].id}
              role="rowgroup"
              aria-rowindex={row.index + 2}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: 68,
                transform: `translateY(${row.start}px)`,
              }}
            >
              <TrackRow
                track={tracks[row.index]}
                index={row.index}
                queue={queue.current}
                onMenu={onMenu}
                onEdit={onEdit}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
export function TrackGrid({ tracks, onMenu }: Props) {
  useLanguage();
  const parent = useRef<HTMLDivElement>(null);
  const columns = useColumns(parent);
  const virtual = useVirtualizer({
    count: Math.ceil(tracks.length / columns),
    getScrollElement: () => parent.current,
    estimateSize: () => 250,
    overscan: 2,
  });
  return (
    <div
      className="grid-scroll"
      ref={parent}
      style={{ '--columns': columns } as React.CSSProperties}
    >
      <div style={{ height: virtual.getTotalSize(), position: 'relative' }}>
        {virtual.getVirtualItems().map((row) => (
          <div
            key={row.key}
            className="track-grid-row"
            style={{ transform: `translateY(${row.start}px)` }}
          >
            {tracks.slice(row.index * columns, row.index * columns + columns).map((track) => (
              <div
                className="track-card"
                key={track.id}
                onContextMenu={(e) => onMenu(e, track)}
                draggable
                onDragStart={(e) =>
                  e.dataTransfer.setData('application/x-sonotune-track', track.id)
                }
              >
                <button
                  className="track-card-cover"
                  aria-label={t('Слушать {title}', { title: track.title })}
                  onClick={() =>
                    void run(async () => {
                      await (
                        await api
                      ).play(
                        track.id,
                        tracks.map((t) => t.id),
                      );
                    })
                  }
                >
                  <Artwork track={track} />
                  <span className="card-play">
                    <Play fill="currentColor" size={23} />
                  </span>
                </button>
                <div>
                  <strong>{track.title}</strong>
                  <IconButton
                    label={t('Действия: {title}', { title: track.title })}
                    onClick={(e) => onMenu(e, track)}
                  >
                    <MoreHorizontal size={18} />
                  </IconButton>
                </div>
                <span>{artistName(track)}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function GroupGrid({
  tracks,
  kind,
  onSelect,
}: {
  tracks: Track[];
  kind: 'artists' | 'albums' | 'genres';
  onSelect(key: string): void;
}) {
  useLanguage();
  const groups = new Map<string, { name: string; subtitle: string; tracks: Track[] }>();
  for (const track of tracks) {
    const keys =
      kind === 'artists'
        ? track.artists.length
          ? track.artists
          : [UNKNOWN_ARTIST]
        : kind === 'genres'
          ? track.genres.length
            ? track.genres
            : [UNKNOWN_GENRE]
          : [albumKey(track)];
    for (const key of keys) {
      const group = groups.get(key) ?? {
        name: kind === 'albums' ? albumName(track) : groupName(key),
        subtitle: kind === 'albums' ? artistName(track) : '',
        tracks: [],
      };
      group.tracks.push(track);
      groups.set(key, group);
    }
  }
  const values = Array.from(groups).sort((a, b) =>
    a[1].name.localeCompare(b[1].name, document.documentElement.lang),
  );
  const parent = useRef<HTMLDivElement>(null);
  const columns = useColumns(parent);
  const virtual = useVirtualizer({
    count: Math.ceil(values.length / columns),
    getScrollElement: () => parent.current,
    estimateSize: () => 250,
    overscan: 2,
  });
  return (
    <div
      className="grid-scroll"
      ref={parent}
      style={{ '--columns': columns } as React.CSSProperties}
    >
      <div style={{ height: virtual.getTotalSize(), position: 'relative' }}>
        {virtual.getVirtualItems().map((row) => (
          <div
            className="track-grid-row"
            key={row.key}
            style={{ transform: `translateY(${row.start}px)` }}
          >
            {values
              .slice(row.index * columns, row.index * columns + columns)
              .map(([key, group]) => (
                <button key={key} className={`group-card ${kind}`} onClick={() => onSelect(key)}>
                  <div className="group-art">
                    {kind === 'albums' ? (
                      <Artwork track={group.tracks[0]} />
                    ) : (
                      <>
                        <Flower petals={kind === 'artists' ? 7 : 5} className="group-flower" />
                        <span style={{ color: `hsl(${trackHue(group.tracks[0])} 25% 30%)` }}>
                          {kind === 'artists' ? (
                            group.name.slice(0, 1).toUpperCase()
                          ) : (
                            <Music2 size={40} />
                          )}
                        </span>
                      </>
                    )}
                  </div>
                  <strong>{group.name}</strong>
                  <span>{group.subtitle || plural(group.tracks.length)}</span>
                </button>
              ))}
          </div>
        ))}
      </div>
    </div>
  );
}
export function EmptyLibrary({
  searching,
  playlist,
  favorites,
}: {
  searching?: boolean;
  playlist?: boolean;
  favorites?: boolean;
}) {
  useLanguage();
  const busy = useStore((s) => s.busy);
  return (
    <div className="empty-state">
      <div className="empty-art">
        <Flower petals={7} />
        {searching ? <SearchX size={38} /> : <Music2 size={38} />}
      </div>
      <h2>
        {searching
          ? t('Ничего не нашли')
          : playlist || favorites
            ? t('С чего начнём?')
            : t('Начнём с твоей музыки')}
      </h2>
      <p>
        {searching
          ? t('Попробуй другое название или исполнителя.')
          : favorites
            ? t('Нажми на сердечко, чтобы сохранить песню здесь.')
            : playlist
              ? t('Перетащи сюда треки или добавь их через меню.')
              : t('Добавь папку — найдём в ней треки.')}
      </p>
      {!searching && !playlist && !favorites && (
        <div className="empty-actions">
          <button
            className="button primary"
            disabled={busy}
            onClick={() => void useStore.getState().importFolder()}
          >
            <FolderPlus size={18} />
            {t('Добавить папку')}
          </button>
          <button
            className="button tonal"
            disabled={busy}
            onClick={() => void useStore.getState().demo()}
          >
            <Play size={17} />
            {t('Послушать демо')}
          </button>
        </div>
      )}
      {searching && (
        <button className="button tonal" onClick={() => useStore.getState().setQuery('')}>
          {t('Сбросить поиск')}
        </button>
      )}
      <span className="empty-note">
        {!searching && !playlist && !favorites
          ? t('MP3 · FLAC · WAV · OGG · OPUS · M4A · AAC  /  Всё остаётся на вашем устройстве')
          : ''}
      </span>
    </div>
  );
}
