// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const fixture = vi.hoisted(() => ({
  stores: new Map<string, Map<string, unknown>>(),
  audios: [] as HTMLAudioElement[],
}));
vi.mock('../src/shared/api', () => ({
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
vi.mock('idb', () => {
  const store = (name: string) => {
    if (!fixture.stores.has(name)) fixture.stores.set(name, new Map());
    return fixture.stores.get(name)!;
  };
  const db = {
    get: async (name: string, key: string) => store(name).get(key),
    put: async (name: string, value: unknown, key?: string) => {
      store(name).set(key ?? (value as { id: string }).id, value);
    },
    getAll: async (name: string) => [...store(name).values()],
    getAllKeys: async (name: string) => [...store(name).keys()],
    transaction: () => ({
      objectStore: (name: string) => ({
        get: (key: string) => db.get(name, key),
        put: (value: unknown, key: string) => db.put(name, value, key),
      }),
      done: Promise.resolve(),
    }),
  };
  return { openDB: async () => db };
});
beforeEach(() => {
  vi.resetModules();
  fixture.stores.clear();
  fixture.audios = [];
  localStorage.clear();
  class FakeAudio extends EventTarget {
    paused = true;
    ended = false;
    currentTime = 0;
    duration = 180;
    volume = 0.7;
    src = '';
    preload = '';
    constructor() {
      super();
      fixture.audios.push(this as unknown as HTMLAudioElement);
    }
    play = vi.fn(async () => {
      this.dispatchEvent(new Event('loadedmetadata'));
      this.paused = false;
      this.dispatchEvent(new Event('play'));
      this.dispatchEvent(new Event('playing'));
    });
    pause() {
      this.paused = true;
      this.dispatchEvent(new Event('pause'));
    }
    removeAttribute() {
      this.src = '';
    }
    load() {}
  }
  vi.stubGlobal('Audio', FakeAudio);
  vi.stubGlobal(
    'URL',
    class extends URL {
      static createObjectURL() {
        return 'blob:test';
      }
      static revokeObjectURL() {}
    },
  );
  fixture.stores.set(
    'tracks',
    new Map(
      ['a', 'b', 'c'].map((id) => [
        id,
        { id, title: id, path: id + '.opus', duration: 180, available: true },
      ]),
    ),
  );
  fixture.stores.set('audio', new Map(['a', 'b', 'c'].map((id) => [id, new Blob(['audio'])])));
});
afterEach(() => {
  vi.unstubAllGlobals();
});
const saved = {
  trackId: 'b',
  queue: ['c', 'b', 'a'],
  originalQueue: ['a', 'b', 'c'],
  position: 42,
  volume: 0.4,
  shuffle: true,
  repeat: 'one',
  savedAt: 10,
};
it('restores the browser session lazily and only plays/seeks after an explicit toggle', async () => {
  fixture.stores.set('settings', new Map([['playback', saved]]));
  const { webApi } = await import('../src/shared/web-api');
  const playback = vi.fn();
  const error = vi.fn();
  await webApi.subscribe(playback, error);
  expect(playback).toHaveBeenLastCalledWith(
    expect.objectContaining({
      trackId: 'b',
      queue: saved.queue,
      position: 42,
      volume: 0.4,
      shuffle: true,
      repeat: 'one',
      playing: false,
    }),
  );
  const audio = fixture.audios[0];
  expect(audio.src).toBe('');
  expect(audio.play).not.toHaveBeenCalled();
  expect(fixture.stores.get('listening')?.size ?? 0).toBe(0);
  await webApi.toggle();
  expect(audio.play).toHaveBeenCalledOnce();
  expect(audio.currentTime).toBe(42);
  expect(playback).toHaveBeenLastCalledWith(
    expect.objectContaining({ trackId: 'b', queue: saved.queue, position: 42, playing: true }),
  );
  expect(error).not.toHaveBeenCalled();
});
it('prefers the final shutdown position, filters stale queue entries and keeps shuffle order stable', async () => {
  fixture.stores.set('settings', new Map([['playback', saved]]));
  localStorage.setItem(
    'sonotune-web-playback',
    JSON.stringify({ ...saved, position: 63, savedAt: 20, queue: ['c', 'gone', 'b', 'b', 'a'] }),
  );
  const { webApi } = await import('../src/shared/web-api');
  const playback = vi.fn();
  await webApi.subscribe(playback, vi.fn());
  expect(playback).toHaveBeenLastCalledWith(
    expect.objectContaining({ position: 63, playing: false, queue: ['c', 'b', 'a'] }),
  );
  await webApi.mode(false, 'all');
  expect(playback).toHaveBeenLastCalledWith(
    expect.objectContaining({ queue: ['a', 'b', 'c'], position: 63, playing: false }),
  );
  expect(fixture.audios[0].play).not.toHaveBeenCalled();
});
it('reorders and clears the browser queue without loading an audio source', async () => {
  fixture.stores.set('settings', new Map([['playback', saved]]));
  const { webApi } = await import('../src/shared/web-api');
  const playback = vi.fn();
  await webApi.subscribe(playback, vi.fn());
  await expect(webApi.reorderQueue(['a', 'a', 'b'])).rejects.toThrow();
  await webApi.reorderQueue(['a', 'b', 'c']);
  await webApi.removeQueue('b');
  await webApi.clearNext();
  expect(playback).toHaveBeenLastCalledWith(
    expect.objectContaining({ trackId: 'b', queue: ['a', 'b'], position: 42, playing: false }),
  );
  expect(fixture.audios[0].src).toBe('');
  expect(fixture.audios[0].play).not.toHaveBeenCalled();
});
