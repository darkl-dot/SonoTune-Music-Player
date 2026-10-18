// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { Window } from 'happy-dom';
import { HomeView } from '../src/features/home/HomeView';
import { useStore } from '../src/app/store';
import { setLanguage } from '../src/shared/i18n';
import type { Track } from '../src/shared/types';
import globalCss from '../src/app/styles.css?raw';
import homeCss from '../src/features/home/HomeView.module.css?inline';
import styles from '../src/features/home/HomeView.module.css';

const service = vi.hoisted(() => ({ play: vi.fn(async () => {}) }));
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
const track = (id: string, available = true): Track => ({
  id,
  title: id,
  artists: ['Artist'],
  album: 'Album',
  path: id + '.opus',
  duration: 180,
  artwork: 'data:image/png;base64,',
  format: 'OPUS',
  size: 1,
  modified: 1,
  addedAt: 1,
  favorite: false,
  available,
  demo: false,
  year: null,
  genres: [],
});
const happy = (window as unknown as Window).happyDOM;
beforeEach(() => {
  vi.clearAllMocks();
  setLanguage('ru');
  vi.spyOn(Math, 'random').mockReturnValue(0);
  happy.setWindowSize({ width: 1280, height: 860 });
  happy.settings.device.prefersReducedMotion = 'no-preference';
  useStore.setState({
    section: 'home',
    loaded: true,
    library: {
      tracks: ['Recent', 'Frequent', 'Random', 'Another']
        .map((id) => track(id))
        .concat(track('Offline', false)),
      playlists: [],
      folders: [],
      listening: {
        Recent: { lastPlayed: 100, playCount: 1 },
        Frequent: { lastPlayed: 90, playCount: 5 },
      },
    },
  });
});
afterEach(() => {
  cleanup();
  setLanguage('ru');
  vi.restoreAllMocks();
  document.querySelectorAll('[data-home-test]').forEach((e) => e.remove());
  happy.settings.device.prefersReducedMotion = 'no-preference';
});
function css() {
  const el = document.createElement('style');
  el.dataset.homeTest = '';
  el.textContent = homeCss + '\n' + globalCss;
  document.head.append(el);
}

it('plays the last and most played tracks and rerolls a suggestion without starting it', async () => {
  render(<HomeView />);
  const recent = screen.getByRole('article', { name: 'Недавно играло' });
  const frequent = screen.getByRole('article', { name: 'Чаще остальных' });
  expect(within(frequent).getByText('5 прослушиваний')).toBeTruthy();
  fireEvent.click(within(recent).getByRole('button', { name: 'Слушать Recent' }));
  await waitFor(() =>
    expect(service.play).toHaveBeenCalledWith('Recent', [
      'Recent',
      'Frequent',
      'Random',
      'Another',
    ]),
  );
  fireEvent.click(within(frequent).getByRole('button', { name: 'Слушать Frequent' }));
  await waitFor(() => expect(service.play).toHaveBeenCalledTimes(2));
  const suggestion = screen.getByRole('article', { name: 'А может, это?' });
  expect(within(suggestion).getByText('Random')).toBeTruthy();
  fireEvent.click(within(suggestion).getByRole('button', { name: 'Предложить другой трек' }));
  expect(within(suggestion).getByText('Another')).toBeTruthy();
  expect(service.play).toHaveBeenCalledTimes(2);
  fireEvent.click(screen.getByRole('button', { name: '…или посмотреть все треки?' }));
  expect(useStore.getState().section).toBe('tracks');
});

it('pins each highlight without triggering playback and marks an existing pin', () => {
  const onPin = vi.fn();
  render(<HomeView onPin={onPin} />);
  for (const [name, id] of [
    ['Недавно играло', 'Recent'],
    ['Чаще остальных', 'Frequent'],
    ['А может, это?', 'Random'],
  ]) {
    fireEvent.click(
      within(screen.getByRole('article', { name })).getByRole('button', {
        name: 'Закрепить на главной',
      }),
    );
    expect(onPin.mock.calls.at(-1)?.[0].id).toBe(id);
  }
  expect(service.play).not.toHaveBeenCalled();
  act(() =>
    useStore.setState((s) => ({
      library: { ...s.library, pins: [{ trackId: 'Recent', label: 'For work' }] },
    })),
  );
  expect(
    within(screen.getByRole('article', { name: 'Недавно играло' }))
      .getByRole('button', { name: 'Изменить закрепление' })
      .classList.contains('is-active'),
  ).toBe(true);
});

it('shows honest empty history and translates cards without changing song titles', () => {
  useStore.setState((s) => ({ library: { ...s.library, listening: {} } }));
  render(<HomeView />);
  expect(
    within(screen.getByRole('article', { name: 'Недавно играло' })).getByText('С чего начнём?'),
  ).toBeTruthy();
  act(() => setLanguage('en'));
  expect(screen.getByRole('article', { name: 'Recently played' })).toBeTruthy();
  expect(screen.getByRole('article', { name: 'Most played' })).toBeTruthy();
  expect(
    within(screen.getByRole('article', { name: 'How about this?' })).getByText('Recent'),
  ).toBeTruthy();
  fireEvent.click(
    within(screen.getByRole('article', { name: 'Recently played' })).getByRole('button', {
      name: 'Choose some music',
    }),
  );
  expect(useStore.getState().section).toBe('tracks');
});

it.each([360, 1280])(
  'contains covers within the card and keeps its background noninteractive at %ipx',
  (width) => {
    happy.setWindowSize({ width, height: 860 });
    css();
    const { container } = render(<HomeView />);
    const grid = container.querySelector('.' + styles.cards)!;
    expect(getComputedStyle(grid).gridTemplateColumns.replace(/\s/g, '')).toBe(
      width <= 760 ? '1fr' : 'repeat(3,minmax(0,1fr))',
    );
    const image = container.querySelector('img')!;
    image.width = 6000;
    image.height = 9000;
    expect(getComputedStyle(image).width).toBe('100%');
    expect(getComputedStyle(image).height).toBe('100%');
    expect(getComputedStyle(image).objectFit).toBe('cover');
    expect(getComputedStyle(container.querySelector('.' + styles.backdrop)!).pointerEvents).toBe(
      'none',
    );
  },
);

it('turns off background and cover animation when reduced motion is requested', () => {
  happy.settings.device.prefersReducedMotion = 'reduce';
  css();
  const { container } = render(<HomeView />);
  expect(matchMedia('(prefers-reduced-motion: reduce)').matches).toBe(true);
  for (const element of container.querySelectorAll(
    '.' + styles.floating + ', .' + styles.cardMedia,
  ))
    expect(getComputedStyle(element).animation).toBe('none');
});
