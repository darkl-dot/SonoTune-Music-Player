import { t, useLanguage } from '../shared/i18n';
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import type { MouseEvent } from 'react';
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronRight,
  FolderOpen,
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
  parentFolder,
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
import { DesktopBridge } from './DesktopBridge';
import { PinDialog } from '../features/home/PinDialog';

import { EqualizerBridge, EqualizerView } from '../features/equalizer/EqualizerView';

export function App() {
  const language = useLanguage();
  const audioWarning = useStore((s) => s.audioWarning);
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
  const [selectionMode, setSelectionMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const pendingDialogs = useRef<Dialog[]>([]);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const search = useRef<HTMLInputElement>(null);
  const closeDialog = useCallback(() => setDialog(pendingDialogs.current.shift() ?? null), []);
  const exitSelection = useCallback(() => {
    setSelectionMode(false);
    setSelected(new Set());
  }, []);
  const toggleSelection = useCallback((track: Track) => {
    setSelectionMode(true);
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(track.id)) next.delete(track.id);
      else next.add(track.id);
      return next;
    });
  }, []);
  useEffect(() => {
    exitSelection();
  }, [section, group, exitSelection]);
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
  const visibleSelected = tracks.filter((track) => selected.has(track.id));
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (
        dialog ||
        menu ||
        target?.isContentEditable ||
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName)
      )
        return;
      if (
        event.altKey &&
        !event.ctrlKey &&
        !event.metaKey &&
        event.key.toLowerCase() === 'a' &&
        !(section === 'home' && !query.trim()) &&
        !grouped &&
        section !== 'playlists' &&
        tracks.length
      ) {
        event.preventDefault();
        setSelectionMode(true);
        setSelected(new Set(tracks.map((track) => track.id)));
      } else if (event.key === 'Escape' && selectionMode) {
        event.preventDefault();
        exitSelection();
      }
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, [tracks, selectionMode, grouped, section, query, dialog, menu, exitSelection]);
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
  const selectionMenu = !!menu && selectionMode && selected.has(menu.track.id);
  const menuTracks = menu && selectionMenu ? visibleSelected : menu ? [menu.track] : [];
  const multiple = menuTracks.length > 1;
  const allFavorite = menuTracks.every((track) => track.favorite);
  const openSequence = (kind: 'tags' | 'pin') => {
    const dialogs: Dialog[] = menuTracks.map((track) => ({ kind, track }));
    pendingDialogs.current = dialogs.slice(1);
    setDialog(dialogs[0]);
  };
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
                selectionMenu ? menuTracks[0].id : menu.track.id,
                (selectionMenu ? menuTracks : tracks).map((t) => t.id),
              );
            }),
        },
        {
          label: t('Слушать следующим'),
          icon: <ListMusic size={17} />,
          action: () =>
            void run(async () => {
              const service = await api;
              for (const track of [...menuTracks].reverse()) await service.enqueue(track.id);
              useStore
                .getState()
                .notify(
                  multiple
                    ? t('Выбранные треки добавлены в очередь')
                    : t('Трек будет следующим в очереди'),
                );
            }),
        },
        {
          label: t('Добавить в плейлист'),
          icon: <Plus size={17} />,
          action: () => setDialog({ kind: 'add', tracks: menuTracks }),
        },
        {
          label: allFavorite ? t('Убрать из избранного') : t('В избранное'),
          icon: <Heart size={17} />,
          action: () =>
            void run(async () => {
              for (const track of menuTracks)
                if (track.favorite !== !allFavorite) await useStore.getState().favorite(track);
            }),
        },
        {
          label: t('Редактировать теги'),
          icon: <Pencil size={17} />,
          action: () => openSequence('tags'),
          separator: true,
        },
        {
          label: library.pins?.some((p) => p.trackId === menu.track.id)
            ? t('Изменить закрепление')
            : t('Закрепить на главной'),
          icon: <Pin size={17} />,
          action: () => openSequence('pin'),
        },
        ...(playlist
          ? [
              {
                label: t('Убрать из плейлиста'),
                icon: <X size={17} />,
                action: () =>
                  void run(async () => {
                    const ids = new Set(menuTracks.map((track) => track.id));
                    await useStore.getState().savePlaylist({
                      ...playlist,
                      trackIds: playlist.trackIds.filter((id) => !ids.has(id)),
                    });
                  }),
              },
            ]
          : []),
        {
          label: t('Убрать из библиотеки'),
          icon: <Trash2 size={17} />,
          danger: true,
          action: () =>
            void run(async () => {
              for (const track of menuTracks) await useStore.getState().removeTrack(track.id);
              exitSelection();
            }),
        },
        {
          label: t('Выделить'),
          icon: <CheckCircle2 size={17} />,
          separator: true,
          action: () => {
            setSelectionMode(true);
            setSelected((previous) => new Set([...previous, menu.track.id]));
          },
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
      <DesktopBridge />
      <EqualizerBridge />
      <div className={styles.workspace}>
        <Sidebar
          setDialog={setDialog}
          dropTarget={dropTarget}
          setDropTarget={setDropTarget}
          drop={drop}
        />
        <main className={styles.main}>
          <Topbar
            setDialog={setDialog}
            search={search}
            controls={
              section !== 'equalizer' &&
              !hero &&
              tracks.length > 0 &&
              !grouped &&
              section !== 'playlists' && (
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
              )
            }
          />
          {section === 'equalizer' ? (
            <EqualizerView />
          ) : hero ? (
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
                  {selectionMode && !grouped && section !== 'playlists' && (
                    <>
                      <span className="selection-count">
                        {t('Выбрано: {count}', { count: visibleSelected.length })}
                      </span>
                      <button
                        className="button tonal small"
                        onClick={() => setSelected(new Set(tracks.map((track) => track.id)))}
                      >
                        {t('Выделить все')}
                      </button>
                      <IconButton label={t('Отменить выделение')} onClick={exitSelection}>
                        <X size={18} />
                      </IconButton>
                    </>
                  )}
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
                  selectionMode={selectionMode}
                  selected={selected}
                  onToggle={toggleSelection}
                />
              ) : (
                <TrackGrid
                  key={section + group}
                  tracks={tracks}
                  onMenu={openMenu}
                  onEdit={openEdit}
                  selectionMode={selectionMode}
                  selected={selected}
                  onToggle={toggleSelection}
                />
              )}
            </section>
          )}
        </main>
        {queueOpen && <Queue onClose={() => setQueueOpen(false)} />}
      </div>
      <Player
        queueOpen={queueOpen}
        onQueue={() => setQueueOpen((value) => !value)}
        onPin={(track) => setDialog({ kind: 'pin', track })}
      />
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
      {menu && (
        <Menu
          x={menu.x}
          y={menu.y}
          items={menuItems}
          onClose={closeMenu}
          footer={
            !multiple ? (
              <>
                <span>
                  <FolderOpen size={14} />
                  {t('Папка файла')}
                </span>
                <p dir="ltr" title={parentFolder(menu.track.path) ?? undefined}>
                  {parentFolder(menu.track.path) ?? t('Папка не указана')}
                </p>
              </>
            ) : undefined
          }
        />
      )}
      {dialog?.kind === 'tags' && (
        <TagEditor key={dialog.track.id} track={dialog.track} onClose={closeDialog} />
      )}
      {dialog?.kind === 'playlist' && (
        <PlaylistDialog
          playlist={dialog.playlist}
          track={dialog.track}
          tracks={dialog.tracks}
          onClose={closeDialog}
        />
      )}
      {dialog?.kind === 'settings' && !audioWarning && <SettingsDialog onClose={closeDialog} />}
      {dialog?.kind === 'pin' && (
        <PinDialog key={dialog.track?.id} track={dialog.track} onClose={closeDialog} />
      )}
      {dialog?.kind === 'add' && (
        <Modal title={t('Добавить в плейлист')} onClose={closeDialog}>
          <p className="dialog-description">
            {dialog.tracks.length === 1
              ? `${dialog.tracks[0].title} · ${artistName(dialog.tracks[0])}`
              : plural(dialog.tracks.length)}
          </p>
          <div className="playlist-picker">
            {library.playlists.map((item) => (
              <button
                key={item.id}
                disabled={dialog.tracks.every((track) => item.trackIds.includes(track.id))}
                onClick={() =>
                  void run(async () => {
                    const ids = new Set(item.trackIds);
                    for (const track of dialog.tracks) ids.add(track.id);
                    await useStore.getState().savePlaylist({ ...item, trackIds: [...ids] });
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
                {dialog.tracks.every((track) => item.trackIds.includes(track.id)) ? (
                  <Check size={18} />
                ) : (
                  <ChevronRight size={18} />
                )}
              </button>
            ))}
          </div>
          <button
            className="button tonal"
            onClick={() => setDialog({ kind: 'playlist', tracks: dialog.tracks })}
          >
            <Plus size={18} />
            {t('Создать плейлист')}
          </button>
        </Modal>
      )}
      {audioWarning && (!dialog || dialog.kind === 'settings') && (
        <Modal
          title={t('Звуковое устройство недоступно')}
          onClose={() => useStore.setState({ audioWarning: null })}
        >
          <p className="dialog-description">{audioWarning}</p>
          <div className="modal-footer">
            <button
              className="button ghost"
              onClick={() => useStore.setState({ audioWarning: null })}
            >
              {t('Закрыть')}
            </button>
            <button
              className="button primary"
              onClick={() => {
                useStore.setState({ audioWarning: null });
                setDialog({ kind: 'settings' });
              }}
            >
              {t('Выбрать устройство')}
            </button>
          </div>
        </Modal>
      )}
      <LanguageDialog />
    </div>
  );
}
