import type { ListeningStats, Track } from '../../shared/types';

export function listeningHighlights(tracks: Track[], stats: Record<string, ListeningStats> = {}) {
  let recent: Track | undefined, frequent: Track | undefined;
  for (const track of tracks) {
    if (!track.available) continue;
    const entry = stats[track.id];
    if (!entry) continue;
    if (entry.lastPlayed > 0 && (!recent || entry.lastPlayed > stats[recent.id].lastPlayed))
      recent = track;
    if (
      entry.playCount > 0 &&
      (!frequent ||
        entry.playCount > stats[frequent.id].playCount ||
        (entry.playCount === stats[frequent.id].playCount &&
          entry.lastPlayed > stats[frequent.id].lastPlayed))
    )
      frequent = track;
  }
  return { recent, frequent };
}
export function randomSuggestion(
  tracks: Track[],
  exclude: string[] = [],
  random = Math.random,
): Track | undefined {
  const available = tracks.filter((t) => t.available);
  const distinct = available.filter((t) => !exclude.includes(t.id));
  const pool = distinct.length ? distinct : available;
  return pool[Math.min(pool.length - 1, Math.floor(Math.max(0, random()) * pool.length))];
}
