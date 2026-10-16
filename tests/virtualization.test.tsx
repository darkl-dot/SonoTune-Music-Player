// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { TrackList } from '../src/features/library/LibraryView';
import type { Track } from '../src/shared/types';

vi.mock('../src/shared/api', () => ({
  api: Promise.resolve({}),
  initialPlayback: {
    trackId: null,
    playing: false,
    queue: [],
    position: 0,
    duration: 0,
    volume: 0.7,
    shuffle: false,
    repeat: 'none',
  },
}));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it('renders a viewport of a 10,000-track library instead of all rows', async () => {
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(400);
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(900);
  const tracks: Track[] = Array.from({ length: 10_000 }, (_, i) => ({
    id: `${i}`,
    path: `${i}.flac`,
    title: `Track ${i}`,
    artists: ['Artist'],
    album: 'Album',
    year: 2026,
    genres: ['Ambient'],
    duration: 100,
    artwork: null,
    format: 'FLAC',
    size: 1000,
    modified: 1,
    addedAt: 1,
    favorite: false,
    available: true,
    demo: false,
  }));
  render(<TrackList tracks={tracks} onMenu={() => {}} onEdit={() => {}} />);
  await waitFor(() => expect(screen.getAllByRole('row').length).toBeGreaterThan(2));
  expect(screen.getAllByRole('row').length).toBeLessThan(40);
  expect(screen.getByRole('table').getAttribute('aria-rowcount')).toBe('10001');
  expect(screen.queryByText('Track 9999')).toBeNull();
});
