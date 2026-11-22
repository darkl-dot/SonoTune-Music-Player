// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SettingsDialog } from '../src/app/SettingsDialog';
import { normalizeSettings } from '../src/app/preferences';
import { useStore } from '../src/app/store';
import { setLanguage } from '../src/shared/i18n';

const removeTracks = vi.hoisted(() => vi.fn(async (_ids: string[]) => ({ tracks: [], playlists: [], folders: [] })));
const setMiniAlwaysOnTop = vi.hoisted(() => vi.fn(async (_value: boolean) => {}));

vi.mock('../src/shared/api', () => ({
  api: Promise.resolve({
    audioOutputs: async () => [],
    loudnessStats: async () => [0, 0],
    removeFolder: async () => ({ tracks: [], playlists: [], folders: [] }),
    removeTracks,
  }),
  desktop: true,
  initialPlayback: {},
}));
vi.mock('../src/shared/desktop-api', () => ({
  desktopApi: {
    preferences: async () => ({ closeToTray: true, autostart: false, trayAvailable: true }),
    configure: async (value: object) => ({
      closeToTray: true,
      autostart: false,
      trayAvailable: true,
      ...value,
    }),
    diagnostics: async () => '',
    openDataFolder: async () => {},
    registerOpenWith: async () => {},
    setMiniAlwaysOnTop,
  },
}));

beforeEach(() => {
  setLanguage('ru');
  localStorage.clear();
  useStore.setState({
    settings: normalizeSettings({}),
    library: { tracks: [], playlists: [], folders: [] },
    busy: false,
  });
});
afterEach(cleanup);

it('opens on General and exposes every settings tab', () => {
  render(<SettingsDialog onClose={() => {}} />);
  const tabs = screen.getAllByRole('tab');
  expect(tabs.map((tab) => tab.textContent)).toEqual([
    'Общие',
    'Оформление',
    'Мини-плеер',
    'Звук',
    'Библиотека',
    'Приложение',
  ]);
  expect(tabs[0].getAttribute('aria-selected')).toBe('true');
  expect(screen.getByRole('tabpanel').getAttribute('aria-labelledby')).toBe('settings-tab-general');
  expect(screen.getByRole('group', { name: 'Русский / English' })).toBeTruthy();
  expect(screen.getByRole('switch', { name: 'Показывать баннер на главной' })).toBeTruthy();
  expect(screen.getByText('v1.1.6')).toBeTruthy();
});

it('switches tabs by click and arrow keys and shows the matching panel', () => {
  render(<SettingsDialog onClose={() => {}} />);
  fireEvent.click(screen.getByRole('tab', { name: 'Звук' }));
  expect(screen.getByRole('tab', { name: 'Звук' }).getAttribute('aria-selected')).toBe('true');
  expect(screen.getByRole('tabpanel').getAttribute('aria-labelledby')).toBe('settings-tab-audio');
  expect(screen.getByText('Кроссфейд')).toBeTruthy();
  expect(screen.getByRole('switch', { name: 'Без пауз между треками' })).toBeTruthy();

  fireEvent.keyDown(screen.getByRole('tab', { name: 'Звук' }), { key: 'ArrowRight' });
  expect(screen.getByRole('tab', { name: 'Библиотека' }).getAttribute('aria-selected')).toBe(
    'true',
  );
  expect(screen.getByText('Папки с музыкой')).toBeTruthy();

  fireEvent.keyDown(screen.getByRole('tab', { name: 'Библиотека' }), { key: 'Home' });
  expect(screen.getByRole('tab', { name: 'Общие' }).getAttribute('aria-selected')).toBe('true');

  fireEvent.click(screen.getByRole('tab', { name: 'Приложение' }));
  expect(screen.getByText('Техническое')).toBeTruthy();
  expect(screen.getByText('Сворачивать в трей при закрытии')).toBeTruthy();
});

it('keeps the close button and the footer outside the scrolling panel', () => {
  render(<SettingsDialog onClose={() => {}} />);
  const dialog = screen.getByRole('dialog');
  expect(dialog.querySelector('.settings-body')?.contains(screen.getByRole('tabpanel'))).toBe(true);
  expect(dialog.querySelector('.settings-footer')?.textContent).toContain('v1.1.6');
  expect(screen.getByRole('button', { name: 'Закрыть' })).toBeTruthy();
});

it('removes a music folder from the library after confirmation', async () => {
  useStore.setState({
    library: { tracks: [], playlists: [], folders: ['C:\\Music'] },
  });
  render(<SettingsDialog onClose={() => {}} />);
  fireEvent.click(screen.getByRole('tab', { name: 'Библиотека' }));
  expect(screen.getByText('C:\\Music')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Убрать папку из библиотеки' }));
  expect(screen.getByRole('alertdialog')).toBeTruthy();
  expect(
    screen.getByText('Треки из этой папки исчезнут из библиотеки. Файлы на диске останутся.'),
  ).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Убрать' }));
  await waitFor(() => expect(useStore.getState().library.folders).toEqual([]));
});

it('configures mini-player backdrop and visualizer modes and persists them', async () => {
  render(<SettingsDialog onClose={() => {}} />);
  fireEvent.click(screen.getByRole('tab', { name: 'Мини-плеер' }));
  expect(screen.getByRole('tabpanel').getAttribute('aria-labelledby')).toBe('settings-tab-mini');
  fireEvent.click(screen.getByRole('button', { name: 'Волна' }));
  expect(useStore.getState().settings.miniVisualizer).toBe('wave');
  const ambientSwitch = screen.getByRole('switch', { name: 'Подсветка от обложки' });
  fireEvent.click(ambientSwitch);
  expect(useStore.getState().settings.miniAmbient).toBe(false);
  expect(
    (screen.getByRole('switch', { name: 'Плавное движение фона' }) as HTMLInputElement).disabled,
  ).toBe(true);
  fireEvent.click(screen.getByRole('switch', { name: 'Всегда поверх окон' }));
  expect(useStore.getState().settings.miniAlwaysOnTop).toBe(false);
  await waitFor(() => expect(setMiniAlwaysOnTop).toHaveBeenCalledWith(false));
});

it('cleans unavailable tracks from the library without deleting files', async () => {
  removeTracks.mockClear();
  useStore.setState({
    library: {
      tracks: [
        {
          id: 'missing-1',
          path: 'C:\\Music\\gone.flac',
          title: 'Gone Song',
          artists: ['Artist'],
          album: 'Album',
          year: null,
          genres: [],
          duration: 180,
          artwork: null,
          format: 'FLAC',
          size: 1000,
          modified: 1,
          addedAt: 1,
          favorite: false,
          available: false,
          demo: false,
        },
      ],
      playlists: [],
      folders: [],
    },
  });
  render(<SettingsDialog onClose={() => {}} />);
  fireEvent.click(screen.getByRole('tab', { name: 'Библиотека' }));
  expect(screen.getByText('Не найдены на диске: 1')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Почистить' }));
  fireEvent.click(screen.getByRole('button', { name: 'Убрать из библиотеки' }));
  await waitFor(() => expect(removeTracks).toHaveBeenCalledWith(['missing-1']));
});
