import { create } from 'zustand';
import { api, initialPlayback, mergeTrack } from '../shared/api';
import { localizeError, t } from '../shared/i18n';
import { normalizeSettings, startupSection } from './preferences';
import type {
  Library,
  Playback,
  Playlist,
  ScanProgress,
  Section,
  Settings,
  TagDraft,
  Track,
} from '../shared/types';

interface Toast {
  id: string;
  message: string;
  error?: boolean;
}
interface Store {
  library: Library;
  loaded: boolean;
  scan: ScanProgress | null;
  busy: boolean;
  section: Section;
  group: string | null;
  query: string;
  view: 'list' | 'grid';
  playback: Playback;
  settings: Settings;
  reveal: { id: string; nonce: number } | null;
  revealCurrent(): void;
  savePin(id: string, label: string): Promise<void>;
  deletePin(id: string): Promise<void>;
  toasts: Toast[];
  setSection(section: Section): void;
  setGroup(group: string | null): void;
  setQuery(query: string): void;
  setView(view: 'list' | 'grid'): void;
  setSettings(settings: Partial<Settings>): void;
  notify(message: string, error?: boolean): void;
  dismiss(id: string): void;
  importFolder(rescan?: boolean): Promise<void>;
  demo(): Promise<void>;
  savePlaylist(playlist: Playlist): Promise<void>;
  deletePlaylist(id: string): Promise<void>;
  addToPlaylist(id: string, trackId: string): Promise<void>;
  removeFromPlaylist(id: string, trackId: string): Promise<void>;
  favorite(track: Track): Promise<void>;
  removeTrack(id: string): Promise<void>;
  saveTags(id: string, draft: TagDraft, sidecar: boolean): Promise<boolean>;
}
let savedSettings = normalizeSettings({});
try {
  savedSettings = normalizeSettings(
    JSON.parse(localStorage.getItem('sonotune-settings') ?? '{}') ?? {},
  );
} catch {
  /* Ignore invalid preferences. */
}
export const useStore = create<Store>((set, get) => ({
  library: { tracks: [], playlists: [], folders: [] },
  loaded: false,
  scan: null,
  busy: false,
  section: 'home',
  group: null,
  query: '',
  view: 'list',
  playback: initialPlayback,
  settings: savedSettings,
  reveal: null,
  toasts: [],
  setSection: (section) => {
    localStorage.setItem('sonotune-last-section', section);
    set({ section, group: null, query: '', reveal: null });
  },
  revealCurrent: () => {
    const id = get().playback.trackId;
    if (!id) return;
    localStorage.setItem('sonotune-last-section', 'tracks');
    set((s) => ({
      section: 'tracks',
      group: null,
      query: '',
      view: 'list',
      reveal: { id, nonce: (s.reveal?.nonce ?? 0) + 1 },
    }));
  },
  savePin: async (id, label) => {
    await (await api).savePin(id, label);
    set((s) => ({
      library: {
        ...s.library,
        pins: (s.library.pins ?? []).some((p) => p.trackId === id)
          ? s.library.pins!.map((p) =>
              p.trackId === id ? { trackId: id, label: label.trim() } : p,
            )
          : [...(s.library.pins ?? []), { trackId: id, label: label.trim() }],
      },
    }));
  },
  deletePin: async (id) => {
    await (await api).deletePin(id);
    set((s) => ({
      library: { ...s.library, pins: s.library.pins?.filter((p) => p.trackId !== id) },
    }));
  },
  setGroup: (group) => set({ group }),
  setQuery: (query) => set({ query }),
  setView: (view) => set({ view }),
  setSettings: (settings) => {
    const value = normalizeSettings({ ...get().settings, ...settings });
    if ('gapless' in settings)
      void run(async () => (await api).configureGapless(value.gapless !== false));
    if ('scanIntervalMinutes' in settings)
      void run(async () => (await api).configureScan(value.scanIntervalMinutes ?? null));
    localStorage.setItem('sonotune-settings', JSON.stringify(value));
    set({ settings: value });
  },
  notify: (message, error) => {
    const id = crypto.randomUUID();
    set((s) => ({ toasts: [...s.toasts.slice(-2), { id, message, error }] }));
    setTimeout(() => get().dismiss(id), error ? 9500 : 5000);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  importFolder: async (rescan = false) => {
    if (get().busy) return;
    set({ busy: true, scan: { scanned: 0, imported: 0, errors: 0, done: false } });
    try {
      const service = await api;
      const progress = (scan: ScanProgress) => set({ scan });
      const library = await (rescan ? service.rescan(progress) : service.importFolder(progress));
      if (library) {
        set({ library });
        const scan = get().scan;
        get().notify(
          `${t(scan?.cancelled ? 'Сканирование остановлено.' : 'Библиотека обновлена.')}${scan?.errors ? ` ${t('Не удалось прочитать теги: {count}.', { count: scan.errors })}` : ''}`,
        );
      }
    } catch (error) {
      get().notify(cleanError(error), true);
    } finally {
      set({ busy: false, scan: null });
    }
  },
  demo: async () => {
    if (get().busy) return;
    set({ busy: true });
    try {
      set({ library: await (await api).loadDemo(), section: 'tracks', group: null });
      get().notify(t('Добавлено 6 коротких демотреков SonoTune'));
    } catch (error) {
      get().notify(cleanError(error), true);
    } finally {
      set({ busy: false });
    }
  },
  savePlaylist: async (playlist) => {
    await (await api).savePlaylist(playlist);
    set((s) => ({
      library: {
        ...s.library,
        playlists: s.library.playlists.some((p) => p.id === playlist.id)
          ? s.library.playlists.map((p) => (p.id === playlist.id ? playlist : p))
          : [...s.library.playlists, playlist],
      },
    }));
  },
  deletePlaylist: async (id) => {
    await (await api).deletePlaylist(id);
    if (get().settings.startupPage === `playlist:${id}`) get().setSettings({ startupPage: 'home' });
    set((s) => ({
      library: { ...s.library, playlists: s.library.playlists.filter((p) => p.id !== id) },
      ...(s.section === `playlist:${id}` ? { section: 'tracks' as const, group: null } : {}),
    }));
  },
  addToPlaylist: async (id, trackId) => {
    const playlist = get().library.playlists.find((p) => p.id === id);
    if (!playlist || playlist.trackIds.includes(trackId)) {
      get().notify(t('Трек уже есть в плейлисте'));
      return;
    }
    await get().savePlaylist({ ...playlist, trackIds: [...playlist.trackIds, trackId] });
    get().notify(t('Добавлено в «{name}»', { name: playlist.name }));
  },
  removeFromPlaylist: async (id, trackId) => {
    const playlist = get().library.playlists.find((p) => p.id === id);
    if (playlist)
      await get().savePlaylist({
        ...playlist,
        trackIds: playlist.trackIds.filter((value) => value !== trackId),
      });
  },
  favorite: async (track) => {
    await (await api).favorite(track.id, !track.favorite);
    set((s) => ({ library: mergeTrack(s.library, { ...track, favorite: !track.favorite }) }));
  },
  removeTrack: async (id) => {
    await (await api).removeTrack(id);
    set({ library: await (await api).load() });
  },
  saveTags: async (id, draft, sidecar) => {
    try {
      const result = await (await api).saveTags(id, draft, sidecar);
      set((s) => ({ library: mergeTrack(s.library, result.track) }));
      get().notify(
        result.mode === 'file'
          ? t('Теги сохранены. Резервная копия оригинала создана.')
          : t('Изменения сохранены в sidecar-файл и библиотеку.'),
      );
      return true;
    } catch (error) {
      get().notify(cleanError(error), true);
      return false;
    }
  },
}));
function cleanError(error: unknown) {
  return localizeError(error);
}
export async function run(action: () => Promise<unknown>) {
  try {
    await action();
  } catch (error) {
    useStore.getState().notify(cleanError(error), true);
  }
}
let started = false;
export async function initialize() {
  if (started) return;
  started = true;
  try {
    const service = await api;
    let libraryRevision = 0;
    await service.subscribe(
      (playback) => useStore.setState({ playback }),
      (message) => useStore.getState().notify(localizeError(message), true),
      ({ trackId, stats }) =>
        useStore.setState((s) => ({
          library: { ...s.library, listening: { ...s.library.listening, [trackId]: stats } },
        })),
      (library) => {
        libraryRevision++;
        useStore.setState({ library });
      },
    );
    const revision = libraryRevision;
    const library = await service.load();
    const currentLibrary = revision === libraryRevision ? library : useStore.getState().library;
    useStore.setState({
      library: currentLibrary,
      loaded: true,
      section: startupSection(
        useStore.getState().settings,
        currentLibrary,
        localStorage.getItem('sonotune-last-section'),
      ),
    });
    await service.configureScan(useStore.getState().settings.scanIntervalMinutes ?? null);
    await service.configureGapless(useStore.getState().settings.gapless !== false);
    const savedVolume = Number(localStorage.getItem('sonotune-volume') ?? '0.7');
    if (!useStore.getState().playback.trackId)
      await service.volume(
        Number.isFinite(savedVolume) ? Math.max(0, Math.min(1, savedVolume)) : 0.7,
      );
  } catch (error) {
    useStore.setState({ loaded: true });
    useStore.getState().notify(cleanError(error), true);
  }
}
