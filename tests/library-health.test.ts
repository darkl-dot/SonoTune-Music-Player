import { expect, it } from 'vitest';
import { analyzeLibrary } from '../src/shared/library-health';
import type { Track } from '../src/shared/types';

const base = (overrides: Partial<Track>): Track => ({
  id: 'id',
  path: 'C:\\Music\\track.mp3',
  title: 'Night Drive',
  artists: ['Artist'],
  album: 'Album',
  year: 2024,
  genres: [],
  duration: 210,
  artwork: null,
  format: 'MP3',
  size: 5_000_000,
  modified: 1,
  addedAt: 100,
  favorite: false,
  available: true,
  demo: false,
  ...overrides,
});

it('finds unavailable tracks and ranks duplicates by favorite, format quality, and size', () => {
  const tracks = [
    base({ id: 'missing', available: false, path: 'C:\\Music\\missing.mp3' }),
    base({ id: 'mp3', format: 'MP3', size: 4_000_000, addedAt: 10 }),
    base({ id: 'flac', format: 'FLAC', size: 28_000_000, addedAt: 20 }),
    base({ id: 'fav-mp3', title: 'Fav Song', format: 'MP3', favorite: true, addedAt: 30 }),
    base({ id: 'other-flac', title: 'Fav Song', format: 'FLAC', favorite: false, addedAt: 10 }),
  ];
  const result = analyzeLibrary(tracks);
  expect(result.unavailable.map((t) => t.id)).toEqual(['missing']);
  expect(result.duplicateGroups).toHaveLength(2);
  const nightGroup = result.duplicateGroups.find((g) => g.keep.title === 'Night Drive')!;
  expect(nightGroup.keep.id).toBe('flac');
  expect(nightGroup.duplicates.map((t) => t.id)).toEqual(['mp3']);
  const favGroup = result.duplicateGroups.find((g) => g.keep.title === 'Fav Song')!;
  expect(favGroup.keep.id).toBe('fav-mp3');
  expect(favGroup.duplicates.map((t) => t.id)).toEqual(['other-flac']);
  expect(result.duplicateTrackIds).toEqual(expect.arrayContaining(['mp3', 'other-flac']));
});
