import type { ExtraTheme } from './themes';

export interface Track {
  id: string;
  path: string;
  title: string;
  artists: string[];
  album: string;
  year: number | null;
  genres: string[];
  duration: number;
  artwork: string | null;
  format: string;
  size: number;
  modified: number;
  addedAt: number;
  favorite: boolean;
  available: boolean;
  demo: boolean;
}

export interface Playlist {
  id: string;
  name: string;
  trackIds: string[];
  createdAt: number;
  artwork?: string | null;
}
export interface ListeningStats {
  lastPlayed: number;
  playCount: number;
}
export interface ListeningUpdate {
  trackId: string;
  stats: ListeningStats;
}
export interface Library {
  tracks: Track[];
  playlists: Playlist[];
  folders: string[];
  listening?: Record<string, ListeningStats>;
  pins?: PinnedTrack[];
}
export interface PinnedTrack {
  trackId: string;
  label: string;
}
export interface TagDraft {
  title: string;
  artists: string[];
  album: string;
  year: number | null;
  genres: string[];
  artwork: string | null;
  artworkChanged: boolean;
}
export type RepeatMode = 'single' | 'none' | 'one' | 'all';
export interface Playback {
  trackId: string | null;
  queue: string[];
  playing: boolean;
  position: number;
  duration: number;
  volume: number;
  shuffle: boolean;
  repeat: RepeatMode;
  sleepRemaining?: number | null;
  sleepAfterTrack?: boolean;
}
export interface ImportPlaylistResult {
  library: Library;
  playlist: Playlist;
  skipped: number;
}
export interface ScanProgress {
  scanned: number;
  imported: number;
  errors: number;
  done: boolean;
  cancelled?: boolean;
}
export interface TagSaveResult {
  track: Track;
  mode: 'file' | 'sidecar';
  backup?: string;
}
export type Section =
  | 'home'
  | 'tracks'
  | 'artists'
  | 'albums'
  | 'equalizer'
  | 'genres'
  | 'favorites'
  | 'playlists'
  | `playlist:${string}`;
export interface Settings {
  appearance: 'light' | 'dark' | 'system' | ExtraTheme;
  palette: 'adaptive' | 'lilac' | 'sage' | 'peach';
  startupPage?: Section | 'last';
  showHomeBanner?: boolean;
  gapless?: boolean;
  crossfade?: number;
  outputDevice?: string | null;
  normalization?: NormalizationMode;
  limiter?: boolean;
  miniAlwaysOnTop?: boolean;
  miniAmbient?: boolean;
  miniAmbientMotion?: boolean;
  miniVisualizer?: VisualizerMode;
}
export type NormalizationMode = 'off' | 'track' | 'album';
export type VisualizerMode = 'off' | 'bars' | 'wave' | 'both';
