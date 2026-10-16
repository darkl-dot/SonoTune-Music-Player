// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { LibraryPreferences } from '../src/app/LibraryPreferences';
import { normalizeSettings, pages, startupSection } from '../src/app/preferences';
import { useStore } from '../src/app/store';
import { initialPlayback } from '../src/shared/api';
import { setLanguage } from '../src/shared/i18n';
import { HomeView } from '../src/features/home/HomeView';
import { PinDialog } from '../src/features/home/PinDialog';
import { Queue, moveInQueue } from '../src/features/player/Queue';
import { Player } from '../src/features/player/Player';
import { TrackList } from '../src/features/library/LibraryView';
import type { Track } from '../src/shared/types';

const service = vi.hoisted(() => ({
  configureScan: vi.fn(async () => {}),
  savePin: vi.fn(async () => {}),
  deletePin: vi.fn(async () => {}),
  reorderQueue: vi.fn(async () => {}),
  removeQueue: vi.fn(async () => {}),
  clearNext: vi.fn(async () => {}),
  playQueued: vi.fn(async () => {}),
  play: vi.fn(async () => {}),
  toggle: vi.fn(async () => {}),
}));
vi.mock('../src/shared/api', () => ({
  desktop: true,
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
const track = (id: string): Track => ({
  id,
  title: `Song ${id}`,
  path: `${id}.opus`,
  artists: ['Artist'],
  album: 'Album',
  duration: 180,
  artwork: null,
  year: null,
  genres: [],
  format: 'OPUS',
  size: 1,
  modified: 1,
  addedAt: 1,
  favorite: false,
  available: true,
  demo: false,
});
const library = {
  tracks: ['a', 'b', 'c'].map(track),
  playlists: [{ id: 'mix', name: 'Мой микс', trackIds: ['a'], createdAt: 1 }],
  folders: [],
  pins: [],
};
beforeEach(() => {
  vi.clearAllMocks();
  setLanguage('ru');
  localStorage.clear();
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(400);
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(900);
  useStore.setState({
    library,
    settings: normalizeSettings({}),
    section: 'home',
    group: null,
    query: '',
    view: 'list',
    reveal: null,
    loaded: true,
    playback: {
      ...initialPlayback,
      trackId: 'b',
      queue: ['a', 'b', 'c'],
      position: 42,
      duration: 180,
    },
    toasts: [],
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  setLanguage('ru');
});

it('resolves every startup page, a playlist and the last section with a safe missing-playlist fallback', () => {
  for (const page of [...pages, 'playlist:mix'] as const)
    expect(
      startupSection({ appearance: 'dark', palette: 'sage', startupPage: page }, library, null),
    ).toBe(page);
  expect(startupSection({ ...normalizeSettings({}), startupPage: 'last' }, library, 'genres')).toBe(
    'genres',
  );
  expect(
    startupSection({ ...normalizeSettings({}), startupPage: 'playlist:deleted' }, library, null),
  ).toBe('home');
  expect(
    startupSection({ ...normalizeSettings({}), startupPage: 'last' }, library, 'invalid'),
  ).toBe('home');
  expect(normalizeSettings({ appearance: 'dark', scanIntervalMinutes: -1 })).toMatchObject({
    appearance: 'dark',
    startupPage: 'home',
    showHomeBanner: true,
    scanIntervalMinutes: null,
  });
});
it('offers every page and named playlist, persists the choice and validates custom scan minutes', async () => {
  render(<LibraryPreferences />);
  fireEvent.click(screen.getByRole('button', { name: 'Стартовая страница' }));
  const options = screen.getAllByRole('option');
  expect(options.length).toBe(9);
  fireEvent.click(screen.getByRole('option', { name: 'Плейлист: Мой микс' }));
  expect(useStore.getState().settings.startupPage).toBe('playlist:mix');
  expect(JSON.parse(localStorage.getItem('sonotune-settings')!).startupPage).toBe('playlist:mix');
  fireEvent.click(screen.getByRole('button', { name: 'Фоновое сканирование' }));
  fireEvent.click(screen.getByRole('option', { name: 'Раз в указанное число минут' }));
  const input = screen.getByLabelText('Интервал в минутах');
  for (const invalid of ['0', '1.5', '10081', '']) {
    fireEvent.change(input, { target: { value: invalid } });
    fireEvent.blur(input);
    expect(input.getAttribute('aria-invalid')).toBe('true');
  }
  fireEvent.change(input, { target: { value: '17' } });
  fireEvent.blur(input);
  await waitFor(() => expect(service.configureScan).toHaveBeenLastCalledWith(17));
  fireEvent.click(screen.getByRole('button', { name: 'Фоновое сканирование' }));
  fireEvent.click(screen.getByRole('option', { name: 'При старте приложения' }));
  await waitFor(() => expect(service.configureScan).toHaveBeenLastCalledWith(null));
});
it('hides only the Home banner and keeps the three cards and pinned tracks', async () => {
  useStore.setState({
    settings: normalizeSettings({ showHomeBanner: false }),
    library: { ...library, pins: [{ trackId: 'a', label: 'Под игру' }] },
  });
  render(<HomeView />);
  expect(screen.queryByText('Меньше шума.')).toBeNull();
  expect(screen.getByRole('article', { name: 'Может, это?' })).toBeTruthy();
  expect(screen.getByText('Под игру')).toBeTruthy();
  await waitFor(() =>
    expect(
      within(screen.getByRole('region', { name: 'Закреплённые треки' })).getByText('Song a'),
    ).toBeTruthy(),
  );
});
it('creates, edits and removes a pin, including an empty caption', async () => {
  const close = vi.fn();
  const { unmount } = render(<PinDialog track={library.tracks[0]} onClose={close} />);
  fireEvent.change(screen.getByLabelText('Подпись — необязательно'), {
    target: { value: ' Под игру ' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
  await waitFor(() => expect(close).toHaveBeenCalledOnce());
  expect(useStore.getState().library.pins).toEqual([{ trackId: 'a', label: 'Под игру' }]);
  unmount();
  const next = render(<PinDialog track={library.tracks[0]} onClose={close} />);
  fireEvent.change(screen.getByLabelText('Подпись — необязательно'), { target: { value: '' } });
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
  await waitFor(() => expect(useStore.getState().library.pins?.[0].label).toBe(''));
  next.unmount();
  render(<PinDialog track={library.tracks[0]} onClose={close} />);
  fireEvent.click(screen.getByRole('button', { name: 'Открепить' }));
  await waitFor(() => expect(useStore.getState().library.pins).toEqual([]));
});
it('selects a track through the searchable pin picker without playing it', async () => {
  render(<PinDialog onClose={() => {}} />);
  fireEvent.change(screen.getByLabelText('Найти трек'), { target: { value: 'Song c' } });
  await waitFor(() => expect(screen.getByRole('button', { name: 'Song c Artist' })).toBeTruthy());
  fireEvent.click(screen.getByRole('button', { name: 'Song c Artist' }));
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
  await waitFor(() => expect(service.savePin).toHaveBeenCalledWith('c', ''));
  expect(service.play).not.toHaveBeenCalled();
});
it('edits a virtual queue, protects the current track and plays a row without rebuilding the order', async () => {
  const { container } = render(<Queue onClose={() => {}} />);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Поднять: Song c' })).toBeTruthy());
  expect(
    (screen.getByRole('button', { name: 'Убрать из очереди: Song b' }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Поднять: Song c' }));
  await waitFor(() => expect(service.reorderQueue).toHaveBeenCalledWith(['a', 'c', 'b']));
  fireEvent.click(screen.getByRole('button', { name: 'Убрать из очереди: Song a' }));
  await waitFor(() => expect(service.removeQueue).toHaveBeenCalledWith('a'));
  fireEvent.click(screen.getByRole('button', { name: 'Очистить следующие' }));
  await waitFor(() => expect(service.clearNext).toHaveBeenCalledOnce());
  fireEvent.click(screen.getByRole('button', { name: 'Слушать Song c' }));
  await waitFor(() => expect(service.playQueued).toHaveBeenCalledWith('c'));
  const rows = container.querySelectorAll('[draggable=true]');
  fireEvent.drop(rows[2], { clientY: 0, dataTransfer: { getData: () => 'a' } });
  await waitFor(() => expect(service.reorderQueue).toHaveBeenLastCalledWith(['b', 'a', 'c']));
  expect(service.play).not.toHaveBeenCalled();
  expect(useStore.getState().playback.position).toBe(42);
  expect(moveInQueue(['a', 'b'], 'missing', 'a')).toEqual(['a', 'b']);
});
it('clicking the player title clears filters and reveals the song without starting playback', () => {
  useStore.setState({ section: 'artists', group: 'Artist', query: 'wrong', view: 'grid' });
  render(<Player onQueue={() => {}} />);
  fireEvent.click(screen.getByRole('button', { name: 'Song b' }));
  expect(useStore.getState()).toMatchObject({
    section: 'tracks',
    group: null,
    query: '',
    view: 'list',
    reveal: { id: 'b' },
    playback: { position: 42, playing: false },
  });
  expect(service.toggle).not.toHaveBeenCalled();
  expect(service.play).not.toHaveBeenCalled();
});
it('reveals and focuses a far-away track while keeping a 10000-track library virtualized', async () => {
  const tracks = Array.from({ length: 10000 }, (_, i) => track(String(i)));
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(400);
  vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(680000);
  vi.spyOn(HTMLElement.prototype, 'scrollTo').mockImplementation(function (
    this: HTMLElement,
    options: ScrollToOptions | number,
  ) {
    this.scrollTop = typeof options === 'number' ? options : (options.top ?? 0);
    this.dispatchEvent(new Event('scroll'));
  });
  render(<TrackList tracks={tracks} onMenu={() => {}} onEdit={() => {}} />);
  await waitFor(() => expect(screen.getAllByRole('row').length).toBeGreaterThan(2));
  act(() => useStore.setState({ reveal: { id: '8500', nonce: 1 } }));
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Song 8500' })).toBe(document.activeElement),
  );
  expect(screen.getAllByRole('row').length).toBeLessThan(40);
});
it('localizes the new preferences and pin actions in English', () => {
  setLanguage('en');
  render(<LibraryPreferences />);
  expect(screen.getByRole('switch', { name: 'Show the Home banner' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Startup page' })).toBeTruthy();
});
