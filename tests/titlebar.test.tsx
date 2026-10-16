// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TitleBar } from '../src/app/TitleBar';
import { setLanguage } from '../src/shared/i18n';
import { useStore } from '../src/app/store';

const native = vi.hoisted(() => ({
  desktop: true,
  maximized: false,
  resize: undefined as (() => void) | undefined,
  focus: undefined as ((event: { payload: boolean }) => void) | undefined,
  minimize: vi.fn(async () => {}),
  toggleMaximize: vi.fn(async () => {}),
  close: vi.fn(async () => {}),
  isMaximized: vi.fn(async () => false),
  isFocused: vi.fn(async () => true),
  disposeResize: vi.fn(),
  disposeFocus: vi.fn(),
  onResized: vi.fn(),
  onFocusChanged: vi.fn(),
}));
vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: () => native }));
vi.mock('../src/shared/api', () => ({
  get desktop() {
    return native.desktop;
  },
  api: Promise.resolve({}),
  initialPlayback: {},
}));

beforeEach(() => {
  vi.clearAllMocks();
  native.desktop = true;
  native.maximized = false;
  native.isMaximized.mockImplementation(async () => native.maximized);
  native.minimize.mockResolvedValue();
  native.toggleMaximize.mockImplementation(async () => {
    native.maximized = !native.maximized;
  });
  native.onResized.mockImplementation(async (callback) => {
    native.resize = callback;
    return native.disposeResize;
  });
  native.onFocusChanged.mockImplementation(async (callback) => {
    native.focus = callback;
    return native.disposeFocus;
  });
  setLanguage('ru');
  useStore.setState({ toasts: [] });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it('dispatches the three native controls and updates maximize/restore labels in both languages', async () => {
  render(<TitleBar />);
  fireEvent.click(screen.getByRole('button', { name: 'Свернуть окно' }));
  fireEvent.click(screen.getByRole('button', { name: 'Развернуть окно' }));
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Восстановить окно' })).toBeTruthy(),
  );
  act(() => setLanguage('en'));
  fireEvent.click(screen.getByRole('button', { name: 'Restore window' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Maximize window' })).toBeTruthy());
  fireEvent.click(screen.getByRole('button', { name: 'Close window' }));
  expect(native.minimize).toHaveBeenCalledOnce();
  expect(native.toggleMaximize).toHaveBeenCalledTimes(2);
  expect(native.close).toHaveBeenCalledOnce();
});

it('tracks externally maximized windows and focus, with controls outside the drag region', async () => {
  const { container, unmount } = render(<TitleBar />);
  await waitFor(() => expect(native.resize).toBeTypeOf('function'));
  await act(async () => {
    native.maximized = true;
    native.resize!();
    native.focus!({ payload: false });
  });
  expect(screen.getByRole('button', { name: 'Восстановить окно' })).toBeTruthy();
  expect(container.querySelector('header')?.dataset.focused).toBe('false');
  expect(container.querySelector('[data-tauri-drag-region]')).toBeTruthy();
  for (const control of screen.getAllByRole('button')) {
    expect(control.closest('[data-tauri-drag-region]')).toBeNull();
  }
  unmount();
  expect(native.disposeResize).toHaveBeenCalledOnce();
  expect(native.disposeFocus).toHaveBeenCalledOnce();
});

it('cleans up subscriptions even if native registration finishes after unmount', async () => {
  let finish!: (dispose: () => void) => void;
  native.onResized.mockReturnValueOnce(
    new Promise<() => void>((resolve) => {
      finish = resolve;
    }),
  );
  const { unmount } = render(<TitleBar />);
  unmount();
  await act(async () => finish(native.disposeResize));
  expect(native.disposeResize).toHaveBeenCalledOnce();
  expect(native.disposeFocus).toHaveBeenCalledOnce();
});

it('reports a failed window command without breaking the application', async () => {
  native.minimize.mockRejectedValueOnce(Error('IPC denied'));
  render(<TitleBar />);
  fireEvent.click(screen.getByRole('button', { name: 'Свернуть окно' }));
  await waitFor(() =>
    expect(useStore.getState().toasts[0]?.message).toBe('Не удалось изменить состояние окна'),
  );
  expect(useStore.getState().toasts[0]?.error).toBe(true);
  expect(screen.getByRole('button', { name: 'Закрыть окно' })).toBeTruthy();
});

it('does not add desktop controls to the browser preview', () => {
  native.desktop = false;
  const { container } = render(<TitleBar />);
  expect(container.childElementCount).toBe(0);
  expect(native.onResized).not.toHaveBeenCalled();
});
