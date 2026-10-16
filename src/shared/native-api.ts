import { Channel, convertFileSrc, invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { SonoApi } from './api';
import { t } from './i18n';
import type {
  Library,
  ListeningUpdate,
  ScanProgress,
  TagSaveResult,
  Track,
  Playback,
} from './types';

const image = (track: Track): Track => ({
  ...track,
  artwork: track.artwork ? convertFileSrc(track.artwork) + `?v=${track.modified}` : null,
});
const library = (value: Library): Library => ({ ...value, tracks: value.tracks.map(image) });
const scan = async (command: string, progress: (value: ScanProgress) => void) => {
  const onProgress = new Channel<ScanProgress>();
  onProgress.onmessage = progress;
  const value = await invoke<Library | null>(command, {
    onProgress,
    title: t('Выберите папку с музыкой'),
  });
  return value ? library(value) : null;
};

export const nativeApi: SonoApi = {
  load: async () => library(await invoke('load_library')),
  importFolder: (progress) => scan('import_folder', progress),
  rescan: async (progress) => (await scan('rescan_library', progress))!,
  cancelScan: () => invoke('cancel_scan'),
  loadDemo: async () => library(await invoke('load_demo')),
  savePlaylist: (playlist) => invoke('save_playlist', { playlist }),
  deletePlaylist: (id) => invoke('delete_playlist', { id }),
  savePin: (id, label) => invoke('save_pin', { id, label }),
  deletePin: (id) => invoke('delete_pin', { id }),
  configureScan: (minutes) => invoke('configure_scan', { minutes }),
  configureGapless: (enabled) =>
    invoke('player_command', { command: { kind: 'gapless', enabled } }),
  favorite: (id, value) => invoke('set_favorite', { id, value }),
  removeTrack: (id) => invoke('remove_track', { id }),
  saveTags: async (id, draft, sidecar) => {
    const result = await invoke<TagSaveResult>('save_tags', { id, draft, sidecar });
    return { ...result, track: image(result.track) };
  },
  play: (id, queue) => invoke('player_command', { command: { kind: 'play', id, queue } }),
  toggle: () => invoke('player_command', { command: { kind: 'toggle' } }),
  stop: () => invoke('player_command', { command: { kind: 'stop' } }),
  step: (direction) => invoke('player_command', { command: { kind: 'step', direction } }),
  seek: (seconds) => invoke('player_command', { command: { kind: 'seek', seconds } }),
  volume: (value) => invoke('player_command', { command: { kind: 'volume', value } }),
  mode: (shuffle, repeat) =>
    invoke('player_command', { command: { kind: 'mode', shuffle, repeat } }),
  enqueue: (id) => invoke('player_command', { command: { kind: 'enqueue', id } }),
  playQueued: (id) => invoke('player_command', { command: { kind: 'selectqueue', id } }),
  reorderQueue: (ids) => invoke('player_command', { command: { kind: 'reorderqueue', ids } }),
  removeQueue: (id) => invoke('player_command', { command: { kind: 'removequeue', id } }),
  clearNext: () => invoke('player_command', { command: { kind: 'clearnext' } }),
  subscribe: async (playback, error, listening, updated) => {
    let received!: () => void;
    const initial = new Promise<void>((resolve) => {
      received = resolve;
    });
    const stopPlayback = await listen<Playback>('playback', (e) => {
      playback(e.payload);
      received();
    });
    const stopError = await listen<string>('playback-error', (e) => error(e.payload));
    const stopListening = await listen<ListeningUpdate>('listening', (e) => listening?.(e.payload));
    const stopLibrary = await listen<Library>('library-updated', (e) =>
      updated?.(library(e.payload)),
    );
    await invoke('player_command', { command: { kind: 'snapshot' } });
    await initial;
    return () => {
      stopPlayback();
      stopError();
      stopListening();
      stopLibrary();
    };
  },
};
