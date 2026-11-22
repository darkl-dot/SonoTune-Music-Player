import type { Track } from './types';

export interface DuplicateGroup {
  key: string;
  keep: Track;
  duplicates: Track[];
}

export interface LibraryHealth {
  unavailable: Track[];
  duplicateGroups: DuplicateGroup[];
  duplicateTrackIds: string[];
}

const FORMAT_RANK: Record<string, number> = {
  FLAC: 7,
  WAV: 6,
  ALAC: 5,
  M4A: 4,
  OPUS: 3,
  OGG: 2,
  MP3: 1,
  AAC: 1,
};

function normalizeText(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, ' ');
}

function scoreTrack(track: Track): [number, number, number, number] {
  const format = FORMAT_RANK[track.format.toUpperCase()] ?? 0;
  return [track.favorite ? 1 : 0, format, track.size, -track.addedAt];
}

function compareBest(a: Track, b: Track): number {
  const sa = scoreTrack(a);
  const sb = scoreTrack(b);
  for (let i = 0; i < sa.length; i++) {
    if (sa[i] !== sb[i]) return sb[i] - sa[i];
  }
  return a.path.localeCompare(b.path);
}

/**
 * Finds unavailable library entries (`available: false`) and likely duplicates
 * among available tracks (matching normalized title, primary artist, and rounded duration).
 */
export function analyzeLibrary(tracks: readonly Track[]): LibraryHealth {
  const unavailable = tracks.filter((track) => !track.available);
  const buckets = new Map<string, Track[]>();
  for (const track of tracks) {
    if (!track.available) continue;
    const title = normalizeText(track.title);
    if (!title) continue;
    const artist = normalizeText(track.artists[0] ?? '');
    const duration = Math.round(track.duration);
    const key = `${title}\u0000${artist}\u0000${duration}`;
    const list = buckets.get(key);
    if (list) list.push(track);
    else buckets.set(key, [track]);
  }
  const duplicateGroups: DuplicateGroup[] = [];
  const duplicateTrackIds: string[] = [];
  for (const [key, group] of buckets) {
    if (group.length < 2) continue;
    const sorted = [...group].sort(compareBest);
    const [keep, ...duplicates] = sorted;
    duplicateGroups.push({ key, keep, duplicates });
    for (const item of duplicates) duplicateTrackIds.push(item.id);
  }
  return { unavailable, duplicateGroups, duplicateTrackIds };
}
