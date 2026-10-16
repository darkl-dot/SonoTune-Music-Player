import type { Track, RepeatMode } from './types';
import { locale, t, useLanguageStore } from './i18n';

export const UNKNOWN_ARTIST = '\u0001artist';
export const UNKNOWN_GENRE = '\u0001genre';
export const artistName = (track: Track) =>
  track.artists.join(', ') || t('Неизвестный исполнитель');
export const albumName = (track: Track) =>
  !track.album || track.album === 'Без альбома' ? t('Без альбома') : track.album;
export const albumKey = (track: Pick<Track, 'artists' | 'album'>) =>
  `${track.artists.join(', ')}\u0000${track.album}`;
export function groupName(key: string) {
  if (key === UNKNOWN_ARTIST) return t('Неизвестный исполнитель');
  if (key === UNKNOWN_GENRE) return t('Без жанра');
  if (key.includes('\u0000')) {
    const album = key.split('\u0000').at(-1);
    return !album || album === 'Без альбома' ? t('Без альбома') : album;
  }
  return key;
}
export function formatDuration(seconds: number) {
  const minutes = Math.floor((seconds % 3600) / 60);
  return seconds >= 3600
    ? t('{hours} ч {minutes} мин', { hours: Math.floor(seconds / 3600), minutes })
    : t('{minutes} мин', { minutes });
}
export const formatTime = (seconds: number) => {
  const value = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
};
export const plural = (
  n: number,
  forms = ['трек', 'трека', 'треков'],
  englishForms = ['track', 'tracks'],
) => {
  if (useLanguageStore.getState().language === 'en')
    return `${n.toLocaleString(locale())} ${englishForms[n === 1 ? 0 : 1]}`;
  const v = Math.abs(n) % 100;
  return `${n.toLocaleString('ru-RU')} ${forms[v > 10 && v < 20 ? 2 : v % 10 === 1 ? 0 : v % 10 >= 2 && v % 10 <= 4 ? 1 : 2]}`;
};
export function filterTracks(tracks: Track[], query: string) {
  const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return words.length
    ? tracks.filter((t) => {
        const text = `${t.title} ${t.artists.join(' ')} ${t.album}`.toLocaleLowerCase();
        return words.every((word) => text.includes(word));
      })
    : tracks;
}
export function nextIndex(
  queue: string[],
  current: string | null,
  direction: 1 | -1,
  shuffle: boolean,
  repeat: RepeatMode,
  ended = false,
  random = Math.random,
): number | null {
  if (!queue.length) return null;
  const index = queue.indexOf(current ?? '');
  if (ended && repeat === 'single') return null;
  if (ended && repeat === 'one' && index >= 0) return index;
  if (shuffle && queue.length > 1) {
    // Pick from the other N-1 entries, with no retry loop or same-track repeat.
    const candidate = Math.floor(random() * (queue.length - 1));
    return candidate >= index && index >= 0 ? candidate + 1 : candidate;
  }
  const next = index < 0 ? 0 : index + direction;
  if (next >= 0 && next < queue.length) return next;
  return repeat === 'all' ? (next + queue.length) % queue.length : null;
}
export function playbackOrder(
  queue: string[],
  current: string | null,
  shuffle: boolean,
  random = Math.random,
): string[] {
  const values = [...new Set(queue)];
  if (!shuffle) return values;
  const rest = values.filter((id) => id !== current);
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  return current && values.includes(current) ? [current, ...rest] : rest;
}
export const trackHue = (track?: Track | null) => {
  const name = track ? `${track.artists.join()}${track.album}` : 'SonoTune';
  let hash = 0;
  for (const c of name) hash = (hash * 31 + c.charCodeAt(0)) | 0;
  return [270, 148, 25, 210, 320, 75][Math.abs(hash) % 6];
};
