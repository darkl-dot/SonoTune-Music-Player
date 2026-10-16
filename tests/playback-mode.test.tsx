// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PlaybackMode } from '../src/features/player/PlaybackMode';
import { useStore } from '../src/app/store';
import { setLanguage } from '../src/shared/i18n';
import type { RepeatMode } from '../src/shared/types';
import css from '../src/features/player/PlaybackMode.module.css?inline';
import globalCss from '../src/app/styles.css?raw';
import type { Window } from 'happy-dom';

const service = vi.hoisted(() => ({ mode: vi.fn() }));
vi.mock('../src/shared/api', () => ({
  api: Promise.resolve(service),
  initialPlayback: { repeat: 'none', shuffle: false },
}));
const happy = (window as unknown as Window).happyDOM;
beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  setLanguage('ru');
  happy.setWindowSize({ width: 1280, height: 860 });
  happy.settings.device.prefersReducedMotion = 'no-preference';
  useStore.setState((state) => ({
    playback: { ...state.playback, repeat: 'none', shuffle: false },
  }));
  service.mode.mockImplementation(async (shuffle: boolean, repeat: RepeatMode) => {
    useStore.setState((s) => ({ playback: { ...s.playback, shuffle, repeat } }));
  });
});
afterEach(() => {
  cleanup();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.querySelectorAll('[data-mode-test]').forEach((el) => el.remove());
  happy.settings.device.prefersReducedMotion = 'no-preference';
});
const advance = async (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
const trigger = () => screen.getByRole('button', { name: /^Режим воспроизведения:/ });

it('cycles all four modes in order even when clicks arrive before the backend replies', async () => {
  service.mode.mockImplementation(async (shuffle: boolean, repeat: RepeatMode) => {
    await new Promise((resolve) => setTimeout(resolve, 60));
    useStore.setState((s) => ({ playback: { ...s.playback, shuffle, repeat } }));
  });
  render(<PlaybackMode />);
  for (let i = 0; i < 4; i++) fireEvent.click(trigger());
  await advance(500);
  expect(service.mode.mock.calls.map((call) => call[1])).toEqual(['one', 'all', 'single', 'none']);
  expect(trigger().getAttribute('aria-label')).toBe('Режим воспроизведения: Играть список');
});

it('keeps cycling when command acknowledgments precede playback events', async () => {
  service.mode.mockImplementation(async () => {});
  render(<PlaybackMode />);
  fireEvent.click(trigger());
  await advance(1);
  fireEvent.click(trigger());
  await advance(1);
  expect(service.mode.mock.calls.map((call) => call[1])).toEqual(['one', 'all']);
});

it('opens on hover without stealing focus and lets the pointer cross into the list', async () => {
  render(<PlaybackMode />);
  trigger().focus();
  fireEvent.pointerEnter(trigger(), { pointerType: 'mouse' });
  await advance(349);
  expect(screen.queryByRole('listbox')).toBeNull();
  await advance(2);
  const list = screen.getByRole('listbox');
  expect(document.activeElement).toBe(trigger());
  expect(screen.getAllByRole('option')).toHaveLength(4);
  fireEvent.pointerLeave(trigger(), { pointerType: 'mouse' });
  await advance(120);
  fireEvent.pointerEnter(list, { pointerType: 'mouse' });
  await advance(300);
  expect(trigger().getAttribute('aria-expanded')).toBe('true');
  fireEvent.click(screen.getByRole('option', { name: /Один трек/ }));
  await advance(170);
  expect(service.mode).toHaveBeenCalledWith(false, 'single');
  expect(screen.queryByRole('listbox')).toBeNull();
});

it('supports keyboard selection, Escape and outside dismissal', async () => {
  render(
    <>
      <PlaybackMode />
      <button>Outside</button>
    </>,
  );
  trigger().focus();
  fireEvent.keyDown(trigger(), { key: 'ArrowDown' });
  const list = screen.getByRole('listbox');
  expect(document.activeElement).toBe(list);
  fireEvent.keyDown(list, { key: 'End' });
  expect(list.getAttribute('aria-activedescendant')).toContain('-3');
  fireEvent.keyDown(list, { key: 'Enter' });
  await advance(170);
  expect(service.mode).toHaveBeenCalledWith(false, 'all');
  expect(document.activeElement).toBe(trigger());
  fireEvent.keyDown(trigger(), { key: 'Enter' });
  fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Escape' });
  await advance(170);
  expect(screen.queryByRole('listbox')).toBeNull();
  fireEvent.keyDown(trigger(), { key: 'ArrowUp' });
  fireEvent.pointerDown(screen.getByText('Outside'));
  await advance(170);
  expect(screen.queryByRole('listbox')).toBeNull();
});

it('dismisses on blur, cancels pending hover on unmount, and opens via touch context menu', async () => {
  const view = render(
    <>
      <PlaybackMode />
      <button>Outside</button>
    </>,
  );
  fireEvent.pointerEnter(trigger(), { pointerType: 'touch' });
  await advance(400);
  expect(screen.queryByRole('listbox')).toBeNull();
  fireEvent.contextMenu(trigger());
  expect(screen.getByRole('listbox')).toBeTruthy();
  fireEvent.blur(screen.getByRole('listbox'), { relatedTarget: screen.getByText('Outside') });
  await advance(170);
  expect(screen.queryByRole('listbox')).toBeNull();
  fireEvent.pointerEnter(trigger(), { pointerType: 'mouse' });
  view.unmount();
  await advance(500);
  expect(screen.queryByRole('listbox')).toBeNull();
});

it('translates the complete mode list and keeps shuffle when selecting a mode', async () => {
  setLanguage('en');
  useStore.setState((s) => ({ playback: { ...s.playback, shuffle: true } }));
  render(<PlaybackMode />);
  fireEvent.keyDown(screen.getByRole('button', { name: 'Playback mode: Play list' }), {
    key: 'Enter',
  });
  expect(screen.getByRole('option', { name: /Repeat current track/ })).toBeTruthy();
  expect(screen.getByRole('option', { name: /Repeat current list/ })).toBeTruthy();
  fireEvent.click(screen.getByRole('option', { name: /One track/ }));
  await advance(170);
  expect(service.mode).toHaveBeenCalledWith(true, 'single');
});

it.each([360, 800, 1920])(
  'positions above the controls within the viewport at %ipx',
  async (width) => {
    happy.setWindowSize({ width, height: 620 });
    happy.settings.device.prefersReducedMotion = 'reduce';
    const style = document.createElement('style');
    style.dataset.modeTest = '';
    style.textContent = globalCss + css;
    document.head.append(style);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      const rect =
        this.tagName === 'BUTTON'
          ? { left: width - 58, top: 480, width: 36, height: 36 }
          : { left: 0, top: 0, width: Math.min(340, width - 16), height: 300 };
      return {
        ...rect,
        right: rect.left + rect.width,
        bottom: rect.top + rect.height,
        x: rect.left,
        y: rect.top,
        toJSON() {},
      };
    });
    render(<PlaybackMode />);
    fireEvent.keyDown(trigger(), { key: 'Enter' });
    const list = screen.getByRole('listbox');
    const left = parseFloat(list.style.left);
    expect(left).toBeGreaterThanOrEqual(8);
    expect(left + Math.min(340, width - 16)).toBeLessThanOrEqual(width - 8);
    expect(list.style.bottom).toBe('150px');
    expect(getComputedStyle(list).position).toBe('fixed');
    expect(getComputedStyle(list).animation).toBe('none');
  },
);
