import type { Playlist, Track } from '../shared/types';

export type Dialog =
  | { kind: 'tags'; track: Track }
  | { kind: 'playlist'; playlist?: Playlist; track?: Track }
  | { kind: 'settings' }
  | { kind: 'pin'; track?: Track }
  | { kind: 'add'; track: Track }
  | null;
