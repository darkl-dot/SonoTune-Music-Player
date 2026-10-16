import { expect, it } from 'vitest';
import { ListeningSession } from '../src/shared/listening';
import { listeningHighlights, randomSuggestion } from '../src/features/home/highlights';
import type { Track } from '../src/shared/types';

const track = (id: string, available = true) => ({ id, available }) as Track;
it('counts a session once and excludes pauses, seeking and fast skips', () => {
  const s = new ListeningSession(180, 0);
  s.started = true;
  expect(s.tick(true, 10_000)).toBe(false);
  expect(s.tick(false, 110_000)).toBe(false);
  s.seek(170, 180, 110_000);
  expect(s.tick(true, 120_000)).toBe(false);
  s.seek(0, 180, 120_000);
  expect(s.tick(true, 130_000)).toBe(true);
  expect(s.tick(true, 170_000)).toBe(false);
  const skipped = new ListeningSession(8, 0);
  skipped.started = true;
  skipped.seek(8, 8, 0);
  expect(skipped.tick(true, 1000)).toBe(false);
});
it('counts short recordings after half and does not count a loaded paused source', () => {
  const s = new ListeningSession(0.1, 0);
  expect(s.tick(false, 10_000)).toBe(false);
  s.started = true;
  expect(s.tick(true, 10_250)).toBe(true);
  expect(s.tick(true, 11_000)).toBe(false);
});
it('selects real history and most played, excluding missing and unavailable files', () => {
  const tracks = [track('a'), track('b'), track('c', false)];
  const stats = {
    a: { lastPlayed: 100, playCount: 1 },
    b: { lastPlayed: 90, playCount: 4 },
    c: { lastPlayed: 200, playCount: 50 },
    missing: { lastPlayed: 500, playCount: 90 },
  };
  expect(listeningHighlights(tracks, stats)).toMatchObject({
    recent: { id: 'a' },
    frequent: { id: 'b' },
  });
  expect(listeningHighlights(tracks)).toEqual({ recent: undefined, frequent: undefined });
  expect(
    listeningHighlights(tracks, { a: { lastPlayed: 100, playCount: 0 } }).frequent,
  ).toBeUndefined();
});
it('suggests available tracks, prefers distinct cards and handles a small or empty library', () => {
  const tracks = [track('a'), track('b'), track('c'), track('offline', false)];
  expect(randomSuggestion(tracks, ['a', 'b'], () => 0)?.id).toBe('c');
  expect(randomSuggestion([track('only')], ['only'], () => 0.9)?.id).toBe('only');
  expect(randomSuggestion([])).toBeUndefined();
  expect(randomSuggestion([track('offline', false)])).toBeUndefined();
});
