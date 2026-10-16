// @vitest-environment happy-dom
import { beforeEach, expect, it, vi } from 'vitest';
import type { Library, Playback } from '../src/shared/types';

const service = vi.hoisted(() => ({
  subscribe: vi.fn(),
  load: vi.fn(),
  volume: vi.fn(async () => {}),
  configureScan: vi.fn(async () => {}),
  configureGapless: vi.fn(async () => {}),
}));
vi.mock('../src/shared/api', () => ({
  api: Promise.resolve(service),
  initialPlayback: {
    trackId: null,
    queue: [],
    playing: false,
    position: 0,
    duration: 0,
    volume: 0.7,
    shuffle: false,
    repeat: 'none',
  },
}));
const empty: Library = { tracks: [], folders: [], playlists: [] };
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  localStorage.clear();
});
it('waits for the restored playback and preserves a newer background library update over an older initial load', async () => {
  localStorage.setItem(
    'sonotune-settings',
    JSON.stringify({ startupPage: 'playlist:mix', scanIntervalMinutes: 17 }),
  );
  localStorage.setItem('sonotune-volume', '0.9');
  const restored: Playback = {
    trackId: 'song',
    queue: ['song'],
    playing: false,
    position: 42,
    duration: 180,
    volume: 0.3,
    shuffle: true,
    repeat: 'all',
  };
  let updated!: (library: Library) => void;
  service.subscribe.mockImplementation(async (playback, _error, _stats, library) => {
    playback(restored);
    updated = library;
    return () => {};
  });
  let complete!: (library: Library) => void;
  service.load.mockImplementation(
    () =>
      new Promise<Library>((resolve) => {
        complete = resolve;
      }),
  );
  const { initialize, useStore } = await import('../src/app/store');
  const opening = initialize();
  await vi.waitFor(() => expect(service.load).toHaveBeenCalledOnce());
  const fresh = {
    ...empty,
    playlists: [{ id: 'mix', name: 'My mix', trackIds: [], createdAt: 1 }],
  };
  updated(fresh);
  complete(empty);
  await opening;
  expect(useStore.getState()).toMatchObject({
    loaded: true,
    section: 'playlist:mix',
    library: fresh,
    playback: restored,
  });
  expect(service.volume).not.toHaveBeenCalled();
  expect(service.configureScan).toHaveBeenCalledWith(17);
});
it('uses the saved last page and volume for a first session with no restored track', async () => {
  localStorage.setItem('sonotune-settings', JSON.stringify({ startupPage: 'last' }));
  localStorage.setItem('sonotune-last-section', 'favorites');
  localStorage.setItem('sonotune-volume', '0.6');
  service.subscribe.mockImplementation(async () => () => {});
  service.load.mockResolvedValue(empty);
  const { initialize, useStore } = await import('../src/app/store');
  await initialize();
  expect(useStore.getState().section).toBe('favorites');
  expect(service.volume).toHaveBeenCalledWith(0.6);
  expect(service.configureScan).toHaveBeenCalledWith(null);
  expect(service.configureGapless).toHaveBeenCalledWith(true);
});
