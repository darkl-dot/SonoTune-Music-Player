import type { Library, Section, Settings } from '../shared/types';
import { isExtraTheme } from '../shared/themes';

export const pages = [
  'home',
  'tracks',
  'artists',
  'albums',
  'genres',
  'equalizer',
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
    appearance:
      ['light', 'dark', 'system'].includes(value.appearance ?? '') || isExtraTheme(value.appearance)
        ? value.appearance!
        : 'light',
    palette: ['adaptive', 'lilac', 'sage', 'peach'].includes(value.palette ?? '')
      ? value.palette!
      : 'adaptive',
    startupPage:
      value.startupPage === 'last' || isSection(value.startupPage) ? value.startupPage : 'home',
    showHomeBanner: value.showHomeBanner !== false,
    gapless: value.gapless !== false,
    crossfade:
      typeof value.crossfade === 'number' && Number.isFinite(value.crossfade)
        ? Math.max(0, Math.min(12, value.crossfade))
        : 0,
    outputDevice: typeof value.outputDevice === 'string' ? value.outputDevice : null,
    normalization: ['track', 'album'].includes(value.normalization ?? '')
      ? value.normalization!
      : 'off',
    limiter: value.limiter !== false,
    miniAlwaysOnTop: value.miniAlwaysOnTop !== false,
    miniAmbient: value.miniAmbient !== false,
    miniAmbientMotion: value.miniAmbientMotion !== false,
    miniVisualizer: ['off', 'bars', 'wave', 'both'].includes(value.miniVisualizer ?? '')
      ? value.miniVisualizer!
      : 'both',
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
