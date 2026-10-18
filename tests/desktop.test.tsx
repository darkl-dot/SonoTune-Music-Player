// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { DesktopPreferences } from '../src/app/DesktopPreferences';
import { DesktopBridge } from '../src/app/DesktopBridge';
import { useStore } from '../src/app/store';
import { setLanguage } from '../src/shared/i18n';

const native = vi.hoisted(() => ({
  preferences: vi.fn(),
  configure: vi.fn(),
  registerOpenWith: vi.fn(),
  openDataFolder: vi.fn(),
  diagnostics: vi.fn(),
  onExternal: vi.fn(),
  pendingExternal: vi.fn(),
}));
vi.mock('../src/shared/desktop-api', () => ({ desktopApi: native }));
vi.mock('../src/shared/api', () => ({
  desktop: true,
  api: Promise.resolve({}),
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
const defaults = {
  closeToTray: true,
  autostart: false,
  associationsRegistered: false,
  trayAvailable: true,
};
beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  setLanguage('ru');
  native.preferences.mockResolvedValue({ ...defaults });
  native.configure.mockImplementation(async (patch) => ({ ...defaults, ...patch }));
  native.registerOpenWith.mockResolvedValue({ ...defaults, associationsRegistered: true });
  native.openDataFolder.mockResolvedValue(undefined);
  native.diagnostics.mockResolvedValue('SonoTune v1.1.3\nPlaying: false\nRecent errors: None');
  native.onExternal.mockResolvedValue(() => {});
  native.pendingExternal.mockResolvedValue(null);
  useStore.setState({
    loaded: true,
    section: 'home',
    query: 'old search',
    group: null,
    reveal: null,
    toasts: [],
    view: 'grid',
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it('reads actual desktop state, changes each preference and keeps a failed toggle unchanged', async () => {
  render(<DesktopPreferences />);
  const tray = screen.getByRole('switch', {
    name: 'Сворачивать в трей при закрытии',
  }) as HTMLInputElement;
  const autostart = screen.getByRole('switch', {
    name: 'Автозапуск при старте системы',
  }) as HTMLInputElement;
  await waitFor(() => expect(tray.disabled).toBe(false));
  expect(tray.checked).toBe(true);
  expect(autostart.checked).toBe(false);
  fireEvent.click(tray);
  await waitFor(() => expect(native.configure).toHaveBeenCalledWith({ closeToTray: false }));
  await waitFor(() => expect(tray.checked).toBe(false));
  native.configure.mockRejectedValueOnce(new Error('Registry access denied'));
  fireEvent.click(autostart);
  await waitFor(() =>
    expect(useStore.getState().toasts.at(-1)?.message).toContain('Registry access denied'),
  );
  expect(autostart.checked).toBe(false);
});
it('offers diagnostics with a selectable fallback, opens the data folder and registers Open with explicitly', async () => {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: {
      writeText: vi.fn(async () => {
        throw new Error('Clipboard unavailable');
      }),
    },
  });
  render(<DesktopPreferences />);
  fireEvent.click(screen.getByRole('button', { name: 'Открыть папку данных' }));
  expect(native.openDataFolder).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole('button', { name: 'Скопировать диагностику' }));
  await waitFor(() =>
    expect(
      (screen.getByRole('textbox', { name: 'Диагностика' }) as HTMLTextAreaElement).value,
    ).toContain('v1.1.3'),
  );
  expect(native.registerOpenWith).not.toHaveBeenCalled();
  const button = screen.getByRole('button', { name: 'Добавить в «Открыть с помощью»' });
  await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(button);
  await screen.findByRole('button', { name: 'Обновить «Открыть с помощью»' });
  expect(native.registerOpenWith).toHaveBeenCalledOnce();
});
it('cannot hide the only window if the native tray is unavailable', async () => {
  native.preferences.mockResolvedValue({ ...defaults, trayAvailable: false });
  render(<DesktopPreferences />);
  await waitFor(() => expect(native.preferences).toHaveBeenCalledOnce());
  expect(
    (screen.getByRole('switch', { name: 'Сворачивать в трей при закрытии' }) as HTMLInputElement)
      .disabled,
  ).toBe(true);
});
it('an external file opens the track list, clears filters, and repeated requests get a new reveal nonce', async () => {
  let receive!: (id: string) => void;
  native.onExternal.mockImplementation(async (callback) => {
    receive = callback;
    return () => {};
  });
  native.pendingExternal.mockResolvedValue('first');
  render(<DesktopBridge />);
  await waitFor(() => expect(useStore.getState().reveal?.id).toBe('first'));
  expect(useStore.getState()).toMatchObject({
    section: 'tracks',
    view: 'list',
    query: '',
    group: null,
  });
  const before = useStore.getState().reveal!.nonce;
  act(() => receive('first'));
  expect(useStore.getState().reveal!.nonce).toBeGreaterThan(before);
  expect(native.configure).toHaveBeenCalledWith({ language: 'ru' });
});
it('a later external request wins over an older pending-startup reply', async () => {
  let receive!: (id: string) => void;
  let complete!: (id: string) => void;
  native.onExternal.mockImplementation(async (callback) => {
    receive = callback;
    return () => {};
  });
  native.pendingExternal.mockReturnValue(
    new Promise((resolve) => {
      complete = resolve;
    }),
  );
  render(<DesktopBridge />);
  await waitFor(() => expect(native.pendingExternal).toHaveBeenCalledOnce());
  act(() => receive('new'));
  await act(async () => complete('stale'));
  expect(useStore.getState().reveal?.id).toBe('new');
});
