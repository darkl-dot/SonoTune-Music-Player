// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../src/app/App';
import { useStore } from '../src/app/store';
import { setLanguage, useLanguageStore } from '../src/shared/i18n';
import type { Track } from '../src/shared/types';

vi.mock('../src/shared/api', () => {
  const initialPlayback = {
    trackId: null,
    queue: [],
    playing: false,
    position: 0,
    duration: 0,
    volume: 0.7,
    shuffle: false,
    repeat: 'none',
  };
  const track = {
    id: 'song',
    path: 'daylight.flac',
    title: 'Daylight',
    artists: ['Dayroom'],
    album: 'Warm Light',
    year: 2026,
    genres: ['Electronic'],
    duration: 30,
    artwork: null,
    format: 'FLAC',
    size: 1000,
    modified: 1,
    addedAt: 1,
    favorite: false,
    available: true,
    demo: false,
  };
  return {
    desktop: false,
    initialPlayback,
    api: Promise.resolve({
      load: async () => ({ tracks: [track], playlists: [], folders: [] }),
      subscribe: async () => () => {},
      volume: async () => {},
      configureScan: async () => {},
      savePlaylist: async () => {},
    }),
  };
});

beforeEach(() => {
  setLanguage('ru');
  useStore.setState({ section: 'home', group: null, query: '', view: 'list', toasts: [] });
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(400);
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(900);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it('mounts the complete app, searches, navigates by artist and creates a playlist', async () => {
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole('button', { name: 'Все треки' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Daylight' })).toBeTruthy());
  fireEvent.keyDown(document.body, { key: 'k', ctrlKey: true });
  const search = screen.getByRole('textbox', { name: 'Поиск по библиотеке' });
  expect(document.activeElement).toBe(search);
  await user.type(search, 'нет такого трека');
  await waitFor(() => expect(screen.getByText('Пока ничего не нашлось')).toBeTruthy());
  await user.click(screen.getByRole('button', { name: 'Очистить поиск' }));
  await user.click(screen.getByRole('button', { name: 'Исполнители' }));
  await user.click(await screen.findByRole('button', { name: /Dayroom/ }));
  expect(screen.getByRole('heading', { name: 'Dayroom' })).toBeTruthy();
  await user.click(screen.getByRole('button', { name: 'Создать плейлист' }));
  await user.type(screen.getByLabelText('Название'), 'Прогулка');
  await user.click(screen.getByRole('button', { name: 'Создать' }));
  await waitFor(() => expect(screen.getByRole('heading', { name: 'Прогулка' })).toBeTruthy());
  expect(useStore.getState().library.playlists[0].name).toBe('Прогулка');
});

it('shows the banner only on Home and a themed signature in each category', async () => {
  render(<App />);
  expect(screen.getByRole('region', { name: 'Ваша музыка' })).toBeTruthy();
  for (const [name, phrase] of [
    ['Все треки', 'Каждый трек — история'],
    ['Исполнители', 'Голоса, которые близки'],
    ['Альбомы', 'Хорошее слушают целиком'],
    ['Жанры', 'У каждого дня свой жанр'],
    ['Избранное', 'Любимое всегда рядом'],
    ['Плейлисты', 'Плейлисты — это удобно'],
  ]) {
    fireEvent.click(screen.getByRole('button', { name }));
    expect(screen.queryByRole('region', { name: 'Ваша музыка' })).toBeNull();
    expect(screen.getByText(phrase)).toBeTruthy();
  }
  fireEvent.click(screen.getByRole('button', { name: 'Главная' }));
  expect(screen.getByRole('region', { name: 'Ваша музыка' })).toBeTruthy();
});

it('chooses English on first run, persists it, translates categories and switches back in Settings', async () => {
  useLanguageStore.setState({ chosen: false });
  render(<App />);
  const firstRun = screen.getByRole('dialog', { name: 'Добро пожаловать / Welcome' });
  fireEvent.keyDown(document.body, { key: 'k', ctrlKey: true });
  expect(document.activeElement).not.toBe(screen.getByLabelText('Поиск по библиотеке'));
  fireEvent.click(within(firstRun).getByRole('button', { name: /English/ }));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(localStorage.getItem('sonotune-language')).toBe('en');
  expect(document.documentElement.lang).toBe('en');
  expect(screen.getByRole('region', { name: 'Your music' })).toBeTruthy();
  for (const [name, phrase] of [
    ['All tracks', 'Every track tells a story'],
    ['Artists', 'Voices that feel like home'],
    ['Albums', 'Good albums deserve every track'],
    ['Genres', 'Every day has its own genre'],
    ['Favorites', 'Keep your favorites close'],
    ['Playlists', 'Life’s better with playlists'],
  ]) {
    fireEvent.click(screen.getByRole('button', { name }));
    expect(screen.getByText(phrase)).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Your music' })).toBeNull();
  }
  fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
  const settings = screen.getByRole('dialog', { name: 'Make SonoTune yours' });
  fireEvent.click(within(settings).getByRole('button', { name: /Русский/ }));
  expect(document.documentElement.lang).toBe('ru');
  expect(localStorage.getItem('sonotune-language')).toBe('ru');
  expect(screen.getByRole('dialog', { name: 'Сделайте SonoTune своим' })).toBeTruthy();
});

it('sorts the actual library through the custom listbox in English without changing track metadata', async () => {
  const seed = useStore.getState().library.tracks[0] as Track;
  useStore.setState({
    library: {
      tracks: [
        { ...seed, id: 'z', title: 'Zebra', addedAt: 2 },
        { ...seed, id: 'a', title: 'Alpha', addedAt: 1 },
      ],
      playlists: [],
      folders: [],
    },
    loaded: true,
    section: 'tracks',
  });
  setLanguage('en');
  render(<App />);
  const table = screen.getByRole('table', { name: 'Track list' });
  const titles = () => Array.from(table.querySelectorAll('.track-title')).map((e) => e.textContent);
  expect(titles()).toEqual(['Zebra', 'Alpha']);
  fireEvent.click(screen.getByRole('button', { name: 'Sort tracks' }));
  fireEvent.click(screen.getByRole('option', { name: 'By title' }));
  expect(titles()).toEqual(['Alpha', 'Zebra']);
  expect(useStore.getState().library.tracks[0].title).toBe('Zebra');
  expect(screen.queryByRole('listbox')).toBeNull();
  expect(document.body.textContent).not.toMatch(/[А-Яа-яЁё]/);
});

it('keeps an unknown-artist group selected when changing language', () => {
  const seed = useStore.getState().library.tracks[0] as Track;
  useStore.setState({
    library: { tracks: [{ ...seed, artists: [] }], playlists: [], folders: [] },
    section: 'artists',
    loaded: true,
  });
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: /Неизвестный исполнитель/ }));
  expect(screen.getByRole('heading', { name: 'Неизвестный исполнитель' })).toBeTruthy();
  act(() => setLanguage('en'));
  expect(screen.getByRole('heading', { name: 'Unknown artist' })).toBeTruthy();
  expect(screen.getByRole('table', { name: 'Track list' })).toBeTruthy();
});

it('opens a playlist from the overview and keeps the home banner out of the playlist', () => {
  const seed = useStore.getState().library.tracks[0] as Track;
  useStore.setState({
    library: {
      tracks: [seed],
      playlists: [{ id: 'evening', name: 'Evening Walk', trackIds: [seed.id], createdAt: 1 }],
      folders: [],
    },
    loaded: true,
    section: 'playlists',
  });
  render(<App />);
  fireEvent.click(within(screen.getByRole('main')).getByRole('button', { name: /Evening Walk/ }));
  expect(screen.getByRole('heading', { name: 'Evening Walk' })).toBeTruthy();
  expect(screen.getByRole('table', { name: 'Список треков' })).toBeTruthy();
  expect(screen.queryByRole('region', { name: 'Ваша музыка' })).toBeNull();
});
