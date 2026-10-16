import { t, useLanguage } from '../shared/i18n';
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import type { MouseEvent } from 'react';
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Heart,
  ImagePlus,
  LayoutGrid,
  List,
  ListMusic,
  LoaderCircle,
  MoreHorizontal,
  Music2,
  Pencil,
  Pin,
  Play,
  Plus,
  Shuffle,
  Trash2,
  X,
} from 'lucide-react';
import { initialize, run, useStore } from './store';
import { api, desktop } from '../shared/api';
import type { Track } from '../shared/types';
import {
  albumKey,
  artistName,
  filterTracks,
  formatDuration,
  groupName,
  plural,
  UNKNOWN_ARTIST,
  UNKNOWN_GENRE,
} from '../shared/utils';
import { IconButton, Menu, Modal } from '../shared/ui';
import type { MenuItem } from '../shared/ui';
import { EmptyLibrary, GroupGrid, TrackGrid, TrackList } from '../features/library/LibraryView';
import { Player } from '../features/player/Player';
import { TagEditor } from '../features/tag-editor/TagEditor';
import { PlaylistDialog } from '../features/playlists/PlaylistDialog';
import { SettingsDialog } from './SettingsDialog';
import { useTheme } from './useTheme';
import styles from './App.module.css';

import type { Dialog } from './dialogs';
import { navigation, Sidebar, Topbar } from './Shell';
import { Queue } from '../features/player/Queue';
import { PlaylistOverview } from '../features/playlists/PlaylistOverview';
import { Select } from '../shared/Select';
import { LanguageDialog } from './LanguageDialog';
import { HomeView } from '../features/home/HomeView';
import { PlaylistArtwork } from '../features/playlists/PlaylistArtwork';
import { TitleBar } from './TitleBar';
import { PinDialog } from '../features/home/PinDialog';

export function App() {
  const language = useLanguage();
  const library = useStore((s) => s.library);
  const section = useStore((s) => s.section);
  const group = useStore((s) => s.group);
  const query = useStore((s) => s.query);
  const view = useStore((s) => s.view);
  const loaded = useStore((s) => s.loaded);
  const busy = useStore((s) => s.busy);
  const scan = useStore((s) => s.scan);
  const toasts = useStore((s) => s.toasts);
  const [sort, setSort] = useState('added');
  const [dialog, setDialog] = useState<Dialog>(null);
  const [queueOpen, setQueueOpen] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number; track: Track } | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const search = useRef<HTMLInputElement>(null);
  const closeDialog = useCallback(() => setDialog(null), []);
  const closeMenu = useCallback(() => setMenu(null), []);
  const openEdit = useCallback((track: Track) => setDialog({ kind: 'tags', track }), []);
  const openMenu = useCallback((event: MouseEvent, track: Track) => {
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    setMenu({ x: event.clientX || rect.right - 230, y: event.clientY || rect.bottom, track });
  }, []);
  useTheme();
  useEffect(() => {
    void initialize();
  }, []);
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        if (document.querySelector('[role="dialog"]')) return;
        e.preventDefault();
        search.current?.focus();
      }
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, []);
  const deferredQuery = useDeferredValue(query);
  const playlist = section.startsWith('playlist:')
    ? library.playlists.find((p) => p.id === section.slice(9))
    : undefined;
  const tracks = useMemo(() => {
    let values = library.tracks;
    if (section === 'favorites') values = values.filter((t) => t.favorite);
    if (playlist) {
      const byId = new Map(values.map((t) => [t.id, t]));
      values = playlist.trackIds.map((id) => byId.get(id)).filter((t): t is Track => !!t);
    }
    if (group)
      values = values.filter((t) =>
        section === 'artists'
          ? t.artists.length
            ? t.artists.includes(group)
            : group === UNKNOWN_ARTIST
          : section === 'genres'
            ? t.genres.length
              ? t.genres.includes(group)
              : group === UNKNOWN_GENRE
            : albumKey(t) === group,
      );
    values = filterTracks(values, deferredQuery);
    if (sort === 'title')
      return [...values].sort((a, b) => a.title.localeCompare(b.title, language));
    if (sort === 'artist')
      return [...values].sort((a, b) => artistName(a).localeCompare(artistName(b), language));
    if (sort === 'duration') return [...values].sort((a, b) => b.duration - a.duration);
    return playlist
      ? values
      : [...values].sort((a, b) => b.addedAt - a.addedAt || a.path.localeCompare(b.path));
  }, [library.tracks, playlist, section, group, deferredQuery, sort, language]);
  const grouped = !group && ['artists', 'albums', 'genres'].includes(section);
  const title = group
    ? groupName(group)
    : (playlist?.name ??
      (section === 'home'
        ? t('Результаты поиска')
        : section === 'playlists'
          ? t('Плейлисты')
          : section === 'favorites'
            ? t('Любимые треки')
            : t(navigation.find((n) => n.id === section)?.label ?? 'Все треки')));
  const hero = section === 'home' && !query.trim();
  const totalDuration = tracks.reduce((sum, t) => sum + t.duration, 0);
  const playAll = (shuffle = false) =>
    void run(async () => {
      if (!tracks.length) return;
      const service = await api;
      await service.mode(shuffle, useStore.getState().playback.repeat);
      await service.play(
        tracks[shuffle ? Math.floor(Math.random() * tracks.length) : 0].id,
        tracks.map((t) => t.id),
      );
    });
  const menuItems: MenuItem[] = menu
    ? [
        {
          label: t('Воспроизвести'),
          icon: <Play size={17} />,
          action: () =>
            void run(async () => {
              await (
                await api
              ).play(
                menu.track.id,
                tracks.map((t) => t.id),
              );
            }),
        },
        {
          label: t('Слушать следующим'),
          icon: <ListMusic size={17} />,
          action: () =>
            void run(async () => {
              await (await api).enqueue(menu.track.id);
              useStore.getState().notify(t('Трек будет следующим в очереди'));
            }),
        },
        {
          label: t('Добавить в плейлист'),
          icon: <Plus size={17} />,
          action: () => setDialog({ kind: 'add', track: menu.track }),
        },
        {
          label: menu.track.favorite ? t('Убрать из избранного') : t('В избранное'),
          icon: <Heart size={17} />,
          action: () => void run(() => useStore.getState().favorite(menu.track)),
        },
        {
          label: t('Редактировать теги'),
          icon: <Pencil size={17} />,
          action: () => setDialog({ kind: 'tags', track: menu.track }),
          separator: true,
        },
        {
          label: library.pins?.some((p) => p.trackId === menu.track.id)
            ? t('Изменить закрепление')
            : t('Закрепить на главной'),
          icon: <Pin size={17} />,
          action: () => setDialog({ kind: 'pin', track: menu.track }),
        },
        ...(playlist
          ? [
              {
                label: t('Убрать из плейлиста'),
                icon: <X size={17} />,
                action: () =>
                  void run(() =>
                    useStore.getState().removeFromPlaylist(playlist.id, menu.track.id),
                  ),
              },
            ]
          : []),
        {
          label: t('Убрать из библиотеки'),
          icon: <Trash2 size={17} />,
          danger: true,
          action: () => void run(() => useStore.getState().removeTrack(menu.track.id)),
        },
      ]
    : [];
  const drop = (event: React.DragEvent, playlistId: string) => {
    event.preventDefault();
    setDropTarget(null);
    const id = event.dataTransfer.getData('application/x-sonotune-track');
    if (library.tracks.some((t) => t.id === id))
      void run(() => useStore.getState().addToPlaylist(playlistId, id));
  };
  return (
    <div className={`${styles.app} ${desktop ? styles.desktop : ''}`}>
      <TitleBar />
      <div className={styles.workspace}>
        <Sidebar
          setDialog={setDialog}
          dropTarget={dropTarget}
          setDropTarget={setDropTarget}
          drop={drop}
        />
        <main className={styles.main}>
          <Topbar setDialog={setDialog} search={search} />
          {hero ? (
            <HomeView onPin={(track) => setDialog({ kind: 'pin', track })} />
          ) : (
            <section
              className={`${styles.library} ${dropTarget === playlist?.id ? 'content-drop' : ''}`}
              aria-label={title}
              onDragOver={(e) => {
                if (playlist && e.dataTransfer.types.includes('application/x-sonotune-track')) {
                  e.preventDefault();
                  setDropTarget(playlist.id);
                }
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropTarget(null);
              }}
              onDrop={(e) => playlist && drop(e, playlist.id)}
            >
              <div className="library-heading">
                <div className="library-title">
                  {playlist && (
                    <button
                      className="playlist-heading-cover"
                      aria-label={t('Изменить обложку плейлиста')}
                      title={t('Изменить обложку плейлиста')}
                      onClick={() => setDialog({ kind: 'playlist', playlist })}
                    >
                      <PlaylistArtwork playlist={playlist} track={tracks[0]} />
                      <span>
                        <ImagePlus size={18} />
                      </span>
                    </button>
                  )}
                  {group && (
                    <IconButton
                      label={t('Назад к группам')}
                      onClick={() => useStore.getState().setGroup(null)}
                    >
                      <ArrowLeft size={21} />
                    </IconButton>
                  )}
                  <div>
                    <h2>{title}</h2>
                    <span>
                      {section === 'playlists'
                        ? plural(
                            library.playlists.length,
                            ['плейлист', 'плейлиста', 'плейлистов'],
                            ['playlist', 'playlists'],
                          )
                        : plural(tracks.length)}
                      {section !== 'playlists' &&
                        totalDuration > 0 &&
                        ` · ${formatDuration(totalDuration)}`}
                      {library.tracks.length > 0 &&
                        library.tracks.every((t) => t.demo) &&
                        t(' · демо-библиотека')}
                    </span>
                  </div>
                </div>
                <div className="library-actions">
                  {section === 'playlists' && (
                    <button
                      className="button tonal small"
                      onClick={() => setDialog({ kind: 'playlist' })}
                    >
                      <Plus size={17} />
                      {t('Создать плейлист')}
                    </button>
                  )}
                  {playlist && (
                    <IconButton
                      label={t('Переименовать или удалить плейлист')}
                      onClick={() => setDialog({ kind: 'playlist', playlist })}
                    >
                      <MoreHorizontal size={22} />
                    </IconButton>
                  )}
                  {tracks.length > 0 && section !== 'playlists' && (
                    <>
                      <IconButton label={t('Перемешать и слушать')} onClick={() => playAll(true)}>
                        <Shuffle size={18} />
                      </IconButton>
                      <button className="button tonal small play-library" onClick={() => playAll()}>
                        <Play size={15} fill="currentColor" />
                        {t('Слушать')}
                      </button>
                    </>
                  )}
                </div>
              </div>
              {tracks.length > 0 && !grouped && section !== 'playlists' && (
                <div className="library-toolbar">
                  <Select
                    label={t('Сортировка треков')}
                    value={sort}
                    onChange={setSort}
                    options={[
                      {
                        value: 'added',
                        label: playlist ? t('Порядок плейлиста') : t('Недавно добавленные'),
                      },
                      { value: 'title', label: t('По названию') },
                      { value: 'artist', label: t('По исполнителю') },
                      { value: 'duration', label: t('По длительности') },
                    ]}
                  />
                  <div className="view-toggle" aria-label={t('Вид библиотеки')}>
                    <IconButton
                      label={t('Список')}
                      aria-pressed={view === 'list'}
                      className={view === 'list' ? 'selected' : ''}
                      onClick={() => useStore.getState().setView('list')}
                    >
                      <List size={17} />
                    </IconButton>
                    <IconButton
                      label={t('Сетка')}
                      aria-pressed={view === 'grid'}
                      className={view === 'grid' ? 'selected' : ''}
                      onClick={() => useStore.getState().setView('grid')}
                    >
                      <LayoutGrid size={16} />
                    </IconButton>
                  </div>
                </div>
              )}
              {!loaded ? (
                <div className="loading-library">
                  <LoaderCircle className="spin" />
                  {t('Открываем библиотеку…')}
                </div>
              ) : section === 'playlists' ? (
                <PlaylistOverview
                  onCreate={() => setDialog({ kind: 'playlist' })}
                  onEdit={(playlist) => setDialog({ kind: 'playlist', playlist })}
                />
              ) : !tracks.length ? (
                <EmptyLibrary
                  searching={!!query}
                  playlist={!!playlist}
                  favorites={section === 'favorites'}
                />
              ) : grouped ? (
                <GroupGrid
                  key={section + deferredQuery}
                  tracks={tracks}
                  kind={section as 'artists' | 'albums' | 'genres'}
                  onSelect={(value) => useStore.getState().setGroup(value)}
                />
              ) : view === 'list' ? (
                <TrackList
                  key={section + group}
                  tracks={tracks}
                  onMenu={openMenu}
                  onEdit={openEdit}
                />
              ) : (
                <TrackGrid
                  key={section + group}
                  tracks={tracks}
                  onMenu={openMenu}
                  onEdit={openEdit}
                />
              )}
              <div className="library-bottom">
                <span>
                  <span className="status-dot" />
                  {busy ? t('Обновляем библиотеку') : t('Всё на вашем устройстве')}
                </span>
                <span>{desktop ? t('Локальная библиотека') : t('Браузерный режим')}</span>
              </div>
            </section>
          )}
        </main>
        {queueOpen && <Queue onClose={() => setQueueOpen(false)} />}
      </div>
      <Player queueOpen={queueOpen} onQueue={() => setQueueOpen((value) => !value)} />
      {busy && (
        <div className="scan-indicator" role="status">
          <LoaderCircle className="spin" size={18} />
          <span>
            {scan
              ? scan.scanned
                ? t('Читаем музыку · {count} файлов', { count: scan.scanned })
                : t('Читаем музыку…')
              : t('Добавляем демотреки…')}
          </span>
          {scan && (
            <IconButton
              label={t('Остановить сканирование')}
              onClick={() =>
                void run(async () => {
                  await (await api).cancelScan();
                })
              }
            >
              <X size={17} />
            </IconButton>
          )}
        </div>
      )}
      <div className="toast-stack" aria-live="polite">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`toast ${toast.error ? 'error-toast' : ''}`}
            role={toast.error ? 'alert' : 'status'}
          >
            {toast.error ? <Music2 size={18} /> : <Check size={18} />}
            <span>{toast.message}</span>
            <IconButton
              label={t('Закрыть уведомление')}
              onClick={() => useStore.getState().dismiss(toast.id)}
            >
              <X size={15} />
            </IconButton>
          </div>
        ))}
      </div>
      {menu && <Menu x={menu.x} y={menu.y} items={menuItems} onClose={closeMenu} />}
      {dialog?.kind === 'tags' && <TagEditor track={dialog.track} onClose={closeDialog} />}
      {dialog?.kind === 'playlist' && (
        <PlaylistDialog playlist={dialog.playlist} track={dialog.track} onClose={closeDialog} />
      )}
      {dialog?.kind === 'settings' && <SettingsDialog onClose={closeDialog} />}
      {dialog?.kind === 'pin' && <PinDialog track={dialog.track} onClose={closeDialog} />}
      {dialog?.kind === 'add' && (
        <Modal title={t('Добавить в плейлист')} onClose={closeDialog}>
          <p className="dialog-description">
            {dialog.track.title} · {artistName(dialog.track)}
          </p>
          <div className="playlist-picker">
            {library.playlists.map((item) => (
              <button
                key={item.id}
                disabled={item.trackIds.includes(dialog.track.id)}
                onClick={() =>
                  void run(async () => {
                    await useStore.getState().addToPlaylist(item.id, dialog.track.id);
                    closeDialog();
                  })
                }
              >
                <span className="playlist-mini-cover">
                  <PlaylistArtwork playlist={item} />
                </span>
                <span>
                  {item.name}
                  <small>{plural(item.trackIds.length)}</small>
                </span>
                {item.trackIds.includes(dialog.track.id) ? (
                  <Check size={18} />
                ) : (
                  <ChevronRight size={18} />
                )}
              </button>
            ))}
          </div>
          <button
            className="button tonal"
            onClick={() => setDialog({ kind: 'playlist', track: dialog.track })}
          >
            <Plus size={18} />
            {t('Создать плейлист')}
          </button>
        </Modal>
      )}
      <LanguageDialog />
    </div>
  );
}
