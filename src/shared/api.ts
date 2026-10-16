import type {
  Library,
  ListeningUpdate,
  Playback,
  Playlist,
  RepeatMode,
  ScanProgress,
  TagDraft,
  TagSaveResult,
  Track,
} from './types';

export interface SonoApi {
  load(): Promise<Library>;
  importFolder(progress: (value: ScanProgress) => void): Promise<Library | null>;
  rescan(progress: (value: ScanProgress) => void): Promise<Library>;
  cancelScan(): Promise<void>;
  loadDemo(): Promise<Library>;
  savePlaylist(playlist: Playlist): Promise<void>;
  deletePlaylist(id: string): Promise<void>;
  savePin(id: string, label: string): Promise<void>;
  deletePin(id: string): Promise<void>;
  configureScan(minutes: number | null): Promise<void>;
  configureGapless(enabled: boolean): Promise<void>;
  favorite(id: string, value: boolean): Promise<void>;
  removeTrack(id: string): Promise<void>;
  saveTags(id: string, draft: TagDraft, sidecar: boolean): Promise<TagSaveResult>;
  play(id: string, queue: string[]): Promise<void>;
  toggle(): Promise<void>;
  stop(): Promise<void>;
  step(direction: 1 | -1): Promise<void>;
  seek(seconds: number): Promise<void>;
  volume(value: number): Promise<void>;
  mode(shuffle: boolean, repeat: RepeatMode): Promise<void>;
  enqueue(id: string): Promise<void>;
  playQueued(id: string): Promise<void>;
  reorderQueue(ids: string[]): Promise<void>;
  removeQueue(id: string): Promise<void>;
  clearNext(): Promise<void>;
  subscribe(
    playback: (state: Playback) => void,
    error: (message: string) => void,
    listening?: (update: ListeningUpdate) => void,
    library?: (value: Library) => void,
  ): Promise<() => void>;
}

export const desktop = '__TAURI_INTERNALS__' in window;
export const api: Promise<SonoApi> = desktop
  ? import('./native-api').then((module) => module.nativeApi)
  : import('./web-api').then((module) => module.webApi);
export const initialPlayback: Playback = {
  trackId: null,
  queue: [],
  playing: false,
  position: 0,
  duration: 0,
  volume: 0.7,
  shuffle: false,
  repeat: 'none',
};
export function mergeTrack(library: Library, track: Track): Library {
  return { ...library, tracks: library.tracks.map((t) => (t.id === track.id ? track : t)) };
}
