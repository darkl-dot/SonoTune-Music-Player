import { describe, expect, it } from 'vitest';
import { filterTracks, formatTime, nextIndex, playbackOrder, plural } from '../src/shared/utils';
import type { Track } from '../src/shared/types';

export const fixture: Track = {
  id: 'one',
  path: 'music/one.flac',
  title: 'Тёплый свет',
  artists: ['Dayroom', 'Гость'],
  album: 'Warm Light',
  year: 2026,
  genres: ['Ambient'],
  duration: 185.8,
  artwork: null,
  format: 'FLAC',
  size: 1000,
  modified: 1,
  addedAt: 1,
  favorite: false,
  available: true,
  demo: false,
};
describe('library search', () => {
  it('matches across title, multiple artists and album, ignoring case and extra whitespace', () => {
    expect(filterTracks([fixture], '  тЁПлый   гость LIGHT ')).toEqual([fixture]);
    expect(filterTracks([fixture], 'неизвестный')).toEqual([]);
    expect(filterTracks([fixture], ' ')).toEqual([fixture]);
  });
  it('finds a track in a 10,000-track library', () => {
    const tracks = Array.from({ length: 10_000 }, (_, i) => ({
      ...fixture,
      id: `${i}`,
      title: `Запись ${i}`,
    }));
    expect(filterTracks(tracks, '9999')).toHaveLength(1);
  });
});
describe('playback queue', () => {
  const queue = ['a', 'b', 'c'];
  it('stops at the end without repeat and wraps in both directions with repeat all', () => {
    expect(nextIndex(queue, 'c', 1, false, 'none', true)).toBeNull();
    expect(nextIndex(queue, 'c', 1, false, 'all', true)).toBe(0);
    expect(nextIndex(queue, 'a', -1, false, 'all')).toBe(2);
  });
  it('repeat one applies to track end, while next still advances', () => {
    expect(nextIndex(queue, 'b', 1, false, 'one', true)).toBe(1);
    expect(nextIndex(queue, 'b', 1, false, 'one')).toBe(2);
  });
  it('handles an empty queue and does not select current track in shuffle', () => {
    expect(nextIndex([], null, 1, true, 'all')).toBeNull();
    for (const current of queue)
      for (const random of [0, 0.25, 0.5, 0.99])
        expect(nextIndex(queue, current, 1, true, 'none', false, () => random)).not.toBe(
          queue.indexOf(current),
        );
  });
  it('shuffles a finite queue without duplicates and preserves the original when disabled', () => {
    const shuffled = playbackOrder(['a', 'b', 'c', 'b'], 'b', true, () => 0.2);
    expect(shuffled[0]).toBe('b');
    expect(new Set(shuffled).size).toBe(3);
    expect(playbackOrder(queue, 'b', false)).toEqual(queue);
    expect(nextIndex(shuffled, shuffled.at(-1)!, 1, false, 'none', true)).toBeNull();
  });
});
describe('display formatting', () => {
  it('handles nonfinite and negative durations', () => {
    expect(formatTime(Infinity)).toBe('0:00');
    expect(formatTime(-2)).toBe('0:00');
    expect(formatTime(185.8)).toBe('3:05');
  });
  it('uses Russian plural rules', () => {
    expect(plural(1)).toBe('1 трек');
    expect(plural(22)).toBe('22 трека');
    expect(plural(111)).toBe('111 треков');
  });
});
