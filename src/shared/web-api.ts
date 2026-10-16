import { openDB } from 'idb';
import type { SonoApi } from './api';
import { initialPlayback } from './api';
import type {
  Library,
  ListeningUpdate,
  ListeningStats,
  Playback,
  ScanProgress,
  Track,
} from './types';
import { nextIndex, playbackOrder } from './utils';
import { t } from './i18n';
import { ListeningSession } from './listening';

const database = openDB('sonotune-preview', 3, {
  upgrade(db, oldVersion) {
    if (oldVersion < 1) {
      db.createObjectStore('tracks', { keyPath: 'id' });
      db.createObjectStore('audio');
      db.createObjectStore('playlists', { keyPath: 'id' });
      db.createObjectStore('settings');
    }
    if (oldVersion < 2) db.createObjectStore('listening');
    if (oldVersion < 3) db.createObjectStore('pins', { keyPath: 'trackId' });
  },
});
const audio = new Audio();
audio.preload = 'metadata';
let state: Playback = { ...initialPlayback };
let onPlayback: (state: Playback) => void = () => {};
let onError: (message: string) => void = () => {};
let onListening: (update: ListeningUpdate) => void = () => {};
let session: ListeningSession | null = null;
let listeningActive = false;
let statsWrites = Promise.resolve();
const recordListening = (counted: boolean) => {
  const id = state.trackId;
  if (!id) return;
  statsWrites = statsWrites
    .then(async () => {
      const db = await database;
      const tx = db.transaction(['tracks', 'listening'], 'readwrite');
      if (!(await tx.objectStore('tracks').get(id))) {
        await tx.done;
        return;
      }
      const previous: ListeningStats | undefined = await tx.objectStore('listening').get(id);
      const stats = {
        lastPlayed: counted && previous ? previous.lastPlayed : Date.now(),
        playCount: (previous?.playCount ?? 0) + Number(counted),
      };
      await tx.objectStore('listening').put(stats, id);
      await tx.done;
      onListening({ trackId: id, stats });
    })
    .catch((error: unknown) => onError(String(error)));
};
const tickListening = () => {
  if (session?.tick(listeningActive)) recordListening(true);
};
let sourceUrl: string | null = null;
let cancelled = false;
let generation = 0;
let originalQueue: string[] = [];
let pendingPosition: number | null = null;
let restored = false;
let lastSave = 0;
type Snapshot = Playback & { originalQueue: string[]; savedAt: number };
const snapshot = (): Snapshot => ({
  ...state,
  position: pendingPosition ?? audio.currentTime ?? 0,
  playing: false,
  originalQueue,
  savedAt: Date.now(),
});
const checkpoint = (force = false) => {
  if (!restored || (!force && Date.now() - lastSave < 5000)) return;
  lastSave = Date.now();
  void database
    .then((db) => db.put('settings', snapshot(), 'playback'))
    .catch((error) => onError(String(error)));
};
window.addEventListener('pagehide', () => {
  try {
    localStorage.setItem('sonotune-web-playback', JSON.stringify(snapshot()));
  } catch {
    /* IDB checkpoint remains available. */
  }
});
const emit = () => {
  onPlayback({
    ...state,
    position: pendingPosition ?? (audio.currentTime || 0),
    playing: !audio.paused && !audio.ended,
  });
  checkpoint();
};
const load = async (): Promise<Library> => {
  await statsWrites;
  const db = await database;
  return {
    tracks: await db.getAll('tracks'),
    playlists: await db.getAll('playlists'),
    folders: (await db.get('settings', 'folders')) ?? [],
    pins: await db.getAll('pins'),
    listening: Object.fromEntries(
      await Promise.all(
        (await db.getAllKeys('listening')).map(async (key) => [
          String(key),
          await db.get('listening', key),
        ]),
      ),
    ),
  };
};
const play = async (id: string, queue: string[], ordered = false, position = 0) => {
  const token = ++generation;
  const db = await database;
  const track: Track | undefined = await db.get('tracks', id);
  const blob: Blob | undefined = await db.get('audio', id);
  if (!track || !blob) throw new Error(t('Файл недоступен. Добавьте его в библиотеку снова.'));
  if (token !== generation) return;
  tickListening();
  listeningActive = false;
  audio.pause();
  if (sourceUrl) URL.revokeObjectURL(sourceUrl);
  sourceUrl = URL.createObjectURL(blob);
  pendingPosition = position;
  audio.src = sourceUrl;
  if (!ordered) originalQueue = [...new Set(queue.includes(id) ? queue : [id, ...queue])];
  state = {
    ...state,
    trackId: id,
    queue: ordered ? queue : playbackOrder(originalQueue, id, state.shuffle),
    duration: track.duration,
    position: 0,
  };
  audio.volume = state.volume;
  session = null;
  emit();
  await audio.play();
  if (token === generation) {
    emit();
    checkpoint(true);
  }
};
const step = async (direction: 1 | -1, ended = false) => {
  if (!ended && direction === -1 && (pendingPosition ?? audio.currentTime) > 3) {
    await seekAudio(0);
    return;
  }
  const index = nextIndex(state.queue, state.trackId, direction, false, state.repeat, ended);
  if (index !== null) await play(state.queue[index], state.queue, true);
  else {
    audio.pause();
    emit();
  }
};
audio.addEventListener('timeupdate', () => {
  tickListening();
  emit();
});
audio.addEventListener('playing', () => {
  if (!state.trackId) return;
  session ??= new ListeningSession(state.duration);
  session.seek(audio.currentTime || 0, state.duration);
  if (!session.started) {
    session.started = true;
    recordListening(false);
  }
  listeningActive = true;
});
for (const event of ['pause', 'waiting', 'stalled', 'error'])
  audio.addEventListener(event, () => {
    tickListening();
    listeningActive = false;
  });
audio.addEventListener('seeking', () => {
  listeningActive = false;
  session?.seek(audio.currentTime, state.duration);
});
audio.addEventListener('seeked', () => {
  session?.seek(audio.currentTime, state.duration);
  listeningActive = !audio.paused && !audio.ended;
});
audio.addEventListener('pause', () => {
  emit();
  checkpoint(true);
});
audio.addEventListener('play', emit);
audio.addEventListener('loadedmetadata', () => {
  state.duration = Number.isFinite(audio.duration) ? audio.duration : state.duration;
  if (pendingPosition !== null) {
    audio.currentTime = Math.min(pendingPosition, state.duration);
    pendingPosition = null;
  }
  emit();
});
audio.addEventListener('ended', () => {
  tickListening();
  listeningActive = false;
  session = null;
  void step(1, true).catch((error) => onError(String(error)));
});

async function seekAudio(seconds: number) {
  if (!state.trackId) return;
  tickListening();
  listeningActive = false;
  const position = Math.max(0, Math.min(seconds, state.duration));
  if (!sourceUrl || pendingPosition !== null) pendingPosition = position;
  else audio.currentTime = position;
  session?.seek(audio.currentTime, state.duration);
  emit();
  checkpoint(true);
}
audio.addEventListener('error', () => {
  onError(
    t(
      'Не удалось воспроизвести файл. Возможно, он поврежден или формат не поддерживается браузером.',
    ),
  );
  emit();
});

const supported = /\.(mp3|flac|wav|ogg|opus)$/i;
async function importFiles(files: File[], progress: (value: ScanProgress) => void, demo = false) {
  const { parseBlob } = await import('music-metadata');
  const db = await database;
  cancelled = false;
  let scanned = 0,
    imported = 0,
    errors = 0;
  for (const file of files) {
    if (cancelled) break;
    if (!supported.test(file.name)) continue;
    const path = file.webkitRelativePath || file.name;
    const id = demo ? `demo-${file.name}` : `web-${path}`;
    const previous: Track | undefined = await db.get('tracks', id);
    scanned++;
    try {
      const metadata = await parseBlob(file, { duration: true });
      const picture = metadata.common.picture?.[0];
      const artwork = picture
        ? await blobAsDataUrl(new Blob([new Uint8Array(picture.data)], { type: picture.format }))
        : null;
      const track: Track = {
        id,
        path,
        title: metadata.common.title || file.name.replace(/\.[^.]+$/, ''),
        artists:
          metadata.common.artists ?? (metadata.common.artist ? [metadata.common.artist] : []),
        album: metadata.common.album || 'Без альбома',
        year: metadata.common.year ?? null,
        genres: metadata.common.genre ?? [],
        duration: metadata.format.duration ?? 0,
        artwork,
        format: file.name.split('.').pop()!.toUpperCase(),
        size: file.size,
        modified: file.lastModified,
        addedAt: previous?.addedAt ?? Date.now(),
        favorite: previous?.favorite ?? false,
        available: true,
        demo,
      };
      const tx = db.transaction(['tracks', 'audio'], 'readwrite');
      await tx.objectStore('tracks').put(track);
      await tx.objectStore('audio').put(file, id);
      await tx.done;
      imported++;
    } catch {
      errors++;
      // Keep an unreadable file visible, so it can still be tried or edited.
      const fallback: Track = {
        id,
        path,
        title: file.name.replace(/\.[^.]+$/, ''),
        artists: [],
        album: 'Без альбома',
        year: null,
        genres: [],
        duration: 0,
        artwork: null,
        format: file.name.split('.').pop()!.toUpperCase(),
        size: file.size,
        modified: file.lastModified,
        addedAt: Date.now(),
        favorite: false,
        available: true,
        demo,
      };
      const tx = db.transaction(['tracks', 'audio'], 'readwrite');
      await tx.objectStore('tracks').put(previous ?? fallback);
      await tx.objectStore('audio').put(file, id);
      await tx.done;
      imported++;
    }
    progress({ scanned, imported, errors, done: false });
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  progress({ scanned, imported, errors, done: true, cancelled });
  return load();
}
export function blobAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
function chooseFolder(): Promise<File[] | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.setAttribute('webkitdirectory', '');
    input.addEventListener(
      'change',
      () => {
        resolve(Array.from(input.files ?? []));
        input.remove();
      },
      { once: true },
    );
    input.addEventListener(
      'cancel',
      () => {
        resolve(null);
        input.remove();
      },
      { once: true },
    );
    input.style.display = 'none';
    document.body.append(input);
    input.click();
  });
}
export const webApi: SonoApi = {
  load,
  importFolder: async (progress) => {
    const files = await chooseFolder();
    if (!files?.length) return null;
    const folder = files[0].webkitRelativePath.split('/')[0];
    const db = await database;
    const folders: string[] = (await db.get('settings', 'folders')) ?? [];
    if (folder && !folders.includes(folder))
      await db.put('settings', [...folders, folder], 'folders');
    return importFiles(files, progress);
  },
  rescan: async () => {
    throw new Error(
      t(
        'В браузере выберите папку повторно кнопкой «Добавить папку». Автоматическое сканирование доступно в приложении.',
      ),
    );
  },
  cancelScan: async () => {
    cancelled = true;
  },
  loadDemo: async () => {
    const names = [
      '01-Soft-Orbit',
      '02-Slow-Bloom',
      '03-Daylight',
      '04-Afterglow',
      '05-Still-Water',
      '06-Homeward',
    ];
    const files = await Promise.all(
      names.map(
        async (name) =>
          new File([await (await fetch(`/demo/${name}.wav`)).blob()], `${name}.wav`, {
            type: 'audio/wav',
          }),
      ),
    );
    return importFiles(files, () => {}, true);
  },
  savePlaylist: async (playlist) => {
    await (await database).put('playlists', playlist);
  },
  deletePlaylist: async (id) => {
    await (await database).delete('playlists', id);
  },
  configureScan: async () => {},
  savePin: async (id, label) => {
    const db = await database;
    if (!(await db.get('tracks', id)) || [...label].length > 100)
      throw new Error(t('Не удалось закрепить трек'));
    await db.put('pins', { trackId: id, label: label.trim() });
  },
  deletePin: async (id) => {
    await (await database).delete('pins', id);
  },
  favorite: async (id, value) => {
    const db = await database;
    const track = await db.get('tracks', id);
    if (track) await db.put('tracks', { ...track, favorite: value });
  },
  removeTrack: async (id) => {
    if (state.trackId === id) {
      tickListening();
      listeningActive = false;
      session = null;
      generation++;
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      if (sourceUrl) URL.revokeObjectURL(sourceUrl);
      sourceUrl = null;
      pendingPosition = null;
      state = { ...state, trackId: null, playing: false, position: 0, duration: 0 };
    }
    state.queue = state.queue.filter((value) => value !== id);
    emit();
    originalQueue = originalQueue.filter((value) => value !== id);
    await statsWrites;
    const db = await database;
    const tx = db.transaction(['tracks', 'audio', 'playlists', 'listening', 'pins'], 'readwrite');
    await tx.objectStore('tracks').delete(id);
    await tx.objectStore('audio').delete(id);
    await tx.objectStore('listening').delete(id);
    await tx.objectStore('pins').delete(id);
    for (const playlist of await tx.objectStore('playlists').getAll())
      await tx
        .objectStore('playlists')
        .put({ ...playlist, trackIds: playlist.trackIds.filter((value: string) => value !== id) });
    await tx.done;
  },
  saveTags: async (id, draft) => {
    const db = await database;
    const track: Track = await db.get('tracks', id);
    const { artworkChanged, ...values } = draft;
    const updated = {
      ...track,
      ...values,
      artwork: artworkChanged ? draft.artwork : track.artwork,
    };
    await db.put('tracks', updated);
    const file = new Blob([JSON.stringify({ version: 1, source: track.path, ...draft }, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${track.path.split(/[\\/]/).pop()}.sonotune.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return { track: updated, mode: 'sidecar' };
  },
  play,
  toggle: async () => {
    if (!state.trackId) return;
    if (audio.paused && !sourceUrl)
      await play(state.trackId, state.queue, true, pendingPosition ?? 0);
    else if (audio.paused) await audio.play();
    else audio.pause();
    emit();
    checkpoint(true);
  },
  step,
  stop: async () => {
    tickListening();
    listeningActive = false;
    session = null;
    generation++;
    audio.pause();
    audio.currentTime = 0;
    if (pendingPosition !== null) pendingPosition = 0;
    state = { ...state, position: 0, playing: false };
    emit();
    checkpoint(true);
  },
  seek: seekAudio,
  volume: async (value) => {
    state.volume = value;
    audio.volume = value;
    emit();
  },
  mode: async (shuffle, repeat) => {
    state = {
      ...state,
      queue:
        shuffle === state.shuffle
          ? state.queue
          : playbackOrder(originalQueue, state.trackId, shuffle),
      shuffle,
      repeat,
    };
    emit();
    checkpoint(true);
  },
  enqueue: async (id) => {
    if (id === state.trackId) return;
    const queue = state.queue.filter((value) => value !== id);
    queue.splice(Math.max(0, queue.indexOf(state.trackId ?? '') + 1), 0, id);
    originalQueue = originalQueue.filter((value) => value !== id);
    originalQueue.splice(Math.max(0, originalQueue.indexOf(state.trackId ?? '') + 1), 0, id);
    state.queue = queue;
    emit();
    checkpoint(true);
  },
  playQueued: async (id) => {
    if (state.queue.includes(id)) await play(id, state.queue, true);
  },
  reorderQueue: async (ids) => {
    const expected = new Set(state.queue);
    if (
      ids.length !== state.queue.length ||
      new Set(ids).size !== ids.length ||
      ids.some((id) => !expected.has(id))
    )
      throw new Error(t('Очередь изменилась. Попробуйте ещё раз.'));
    state.queue = [...ids];
    originalQueue = [...ids];
    emit();
    checkpoint(true);
  },
  removeQueue: async (id) => {
    if (id === state.trackId) return;
    state.queue = state.queue.filter((value) => value !== id);
    originalQueue = originalQueue.filter((value) => value !== id);
    emit();
    checkpoint(true);
  },
  clearNext: async () => {
    state.queue = state.queue.slice(0, state.trackId ? state.queue.indexOf(state.trackId) + 1 : 0);
    const keep = new Set(state.queue);
    originalQueue = originalQueue.filter((id) => keep.has(id));
    emit();
    checkpoint(true);
  },
  subscribe: async (playback, error, listening) => {
    onPlayback = playback;
    onError = error;
    onListening = listening ?? (() => {});
    if (!restored) {
      const db = await database;
      let saved = (await db.get('settings', 'playback')) as Snapshot | undefined;
      try {
        const recent = JSON.parse(
          localStorage.getItem('sonotune-web-playback') ?? 'null',
        ) as Snapshot | null;
        if (recent && (!saved || recent.savedAt > saved.savedAt)) saved = recent;
      } catch {
        /* Ignore an invalid shutdown checkpoint. */
      }
      if (
        saved &&
        Array.isArray(saved.queue) &&
        saved.queue.length <= 100000 &&
        (!Array.isArray(saved.originalQueue) || saved.originalQueue.length <= 100000)
      ) {
        const tracks = new Map(
          ((await db.getAll('tracks')) as Track[]).map((track) => [track.id, track]),
        );
        const queue = [...new Set(saved.queue.filter((id) => tracks.has(id)))];
        const queued = new Set(queue);
        const track = tracks.get(saved.trackId ?? '') ?? tracks.get(queue[0]);
        originalQueue = [
          ...new Set([
            ...(Array.isArray(saved.originalQueue) ? saved.originalQueue : queue).filter((id) =>
              queued.has(id),
            ),
            ...queue,
          ]),
        ];
        if (track && !queue.includes(track.id)) {
          queue.unshift(track.id);
          originalQueue.unshift(track.id);
        }
        state = {
          ...initialPlayback,
          trackId: track?.id ?? null,
          queue,
          duration: track?.duration ?? 0,
          volume: Number.isFinite(saved.volume) ? Math.max(0, Math.min(1, saved.volume)) : 0.7,
          shuffle: saved.shuffle === true,
          repeat: ['single', 'none', 'one', 'all'].includes(saved.repeat) ? saved.repeat : 'none',
        };
        pendingPosition = track
          ? Math.max(
              0,
              Math.min(
                track.id === saved.trackId && Number.isFinite(saved.position) ? saved.position : 0,
                track.duration,
              ),
            )
          : null;
      }
      restored = true;
    }
    emit();
    return () => {
      onPlayback = () => {};
      onError = () => {};
      onListening = () => {};
    };
  },
};
