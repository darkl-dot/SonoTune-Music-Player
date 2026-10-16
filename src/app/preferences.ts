import type { Library, Section, Settings } from '../shared/types';

export const pages = [
  'home',
  'tracks',
  'artists',
  'albums',
  'genres',
  'favorites',
  'playlists',
] as const;
export function isSection(value: unknown): value is Section {
  return (
    typeof value === 'string' &&
    (pages.includes(value as (typeof pages)[number]) || /^playlist:.+/.test(value))
  );
}
export function normalizeSettings(value: Partial<Settings>): Settings {
  return {
    appearance: ['light', 'dark', 'system'].includes(value.appearance ?? '')
      ? value.appearance!
      : 'light',
    palette: ['adaptive', 'lilac', 'sage', 'peach'].includes(value.palette ?? '')
      ? value.palette!
      : 'adaptive',
    startupPage:
      value.startupPage === 'last' || isSection(value.startupPage) ? value.startupPage : 'home',
    scanIntervalMinutes:
      Number.isInteger(value.scanIntervalMinutes) &&
      value.scanIntervalMinutes! >= 1 &&
      value.scanIntervalMinutes! <= 10080
        ? value.scanIntervalMinutes
        : null,
    showHomeBanner: value.showHomeBanner !== false,
  };
}
export function startupSection(settings: Settings, library: Library, last: string | null): Section {
  const requested = settings.startupPage === 'last' ? last : settings.startupPage;
  if (!isSection(requested)) return 'home';
  return requested.startsWith('playlist:') &&
    !library.playlists.some((p) => `playlist:${p.id}` === requested)
    ? 'home'
    : requested;
}
