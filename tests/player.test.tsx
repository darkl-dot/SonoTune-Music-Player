// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Player } from '../src/features/player/Player';
import { useStore } from '../src/app/store';
import type { Track } from '../src/shared/types';
import playerCss from '../src/features/player/Player.module.css?inline';
import globalCss from '../src/app/styles.css?raw';
import styles from '../src/features/player/Player.module.css';

const service = vi.hoisted(() => ({
  toggle: vi.fn(async () => {}),
  stop: vi.fn(async () => {}),
  step: vi.fn(async (_direction: number) => {}),
  seek: vi.fn(async (_seconds: number) => {}),
  mode: vi.fn(async (_shuffle: boolean, _repeat: string) => {}),
  volume: vi.fn(async (_value: number) => {}),
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
const track: Track = {
  id: 'song',
  path: 'song.opus',
  title: 'Очень длинное название '.repeat(20),
  artists: ['Исполнитель'],
  album: 'Альбом',
  year: null,
  genres: [],
  duration: 240,
  artwork: 'data:image/png;base64,',
  format: 'OPUS',
  size: 1,
  modified: 1,
  addedAt: 1,
  favorite: false,
  available: true,
  demo: false,
};
const viewport = (width: number) =>
  (
    window as unknown as {
      happyDOM: { setWindowSize(size: { width: number; height: number }): void };
    }
  ).happyDOM.setWindowSize({ width, height: 860 });
beforeEach(() => {
  vi.clearAllMocks();
  viewport(1280);
  useStore.setState({
    library: { tracks: [track], playlists: [], folders: [] },
    toasts: [],
    playback: {
      trackId: track.id,
      queue: [track.id],
      playing: true,
      position: 63,
      duration: 240,
      volume: 0.7,
      shuffle: false,
      repeat: 'none',
    },
  });
});
afterEach(() => {
  cleanup();
  document.querySelectorAll('[data-player-css]').forEach((e) => e.remove());
});

it.each([360, 800, 1280, 1920])(
  'constrains a large cover and keeps every control visible at %ipx, with global CSS loaded last',
  (width) => {
    viewport(width);
    // Match production order: component styles followed by global defaults.
    const style = document.createElement('style');
    style.dataset.playerCss = '';
    style.textContent = playerCss + '\n' + globalCss;
    document.head.append(style);
    const { container } = render(<Player onQueue={() => {}} />);
    const image = container.querySelector('img')!;
    image.width = 4096;
    image.height = 9600;
    const frame = getComputedStyle(image.parentElement!);
    expect(frame.width).toBe(width <= 760 ? '42px' : '58px');
    expect(frame.height).toBe(frame.width);
    expect(frame.flexShrink).toBe('0');
    expect(getComputedStyle(image).height).toBe('100%');
    const panel = getComputedStyle(screen.getByRole('contentinfo', { name: 'Плеер' }));
    expect(panel.display).toBe('grid');
    expect(panel.height).toBe(width <= 760 ? '168px' : '100px');
    expect(panel.maxHeight).toBe(panel.height);
    for (const name of [
      'Пауза',
      'Остановить',
      'Предыдущий трек',
      'Следующий трек',
      'Случайный порядок',
      'Режим воспроизведения: Играть список',
      'Выключить звук',
      'Очередь воспроизведения: 1',
      'Громкость',
      'Позиция воспроизведения',
    ]) {
      const control = screen.getByLabelText(name);
      for (let el: Element | null = control; el; el = el.parentElement) {
        expect(getComputedStyle(el).display).not.toBe('none');
        expect(getComputedStyle(el).visibility).not.toBe('hidden');
      }
    }
  },
);

it('selects a mode with Space without also activating the global play/pause shortcut', async () => {
  render(<Player onQueue={() => {}} />);
  fireEvent.keyDown(screen.getByLabelText('Режим воспроизведения: Играть список'), {
    key: 'Enter',
  });
  fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Home' });
  fireEvent.keyDown(screen.getByRole('listbox'), { key: ' ', code: 'Space' });
  await waitFor(() => expect(service.mode).toHaveBeenCalledWith(false, 'single'));
  expect(service.toggle).not.toHaveBeenCalled();
});

it('opens pin editing for the current song without changing playback', () => {
  const onPin = vi.fn();
  render(<Player onQueue={() => {}} onPin={onPin} />);
  fireEvent.click(screen.getByRole('button', { name: 'Закрепить на главной' }));
  expect(onPin).toHaveBeenCalledWith(track);
  expect(service.toggle).not.toHaveBeenCalled();
  act(() =>
    useStore.setState((s) => ({
      library: { ...s.library, pins: [{ trackId: track.id, label: '' }] },
    })),
  );
  expect(
    screen.getByRole('button', { name: 'Изменить закрепление' }).classList.contains('is-active'),
  ).toBe(true);
});

it('keeps one continuous wave through the thumb after resizing beyond the old 600px limit', () => {
  let width = 331.5;
  let resize!: () => void;
  const measure = vi
    .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
    .mockImplementation(() => ({ width }) as DOMRect);
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: () => void) {
        resize = callback;
      }
      observe() {}
      disconnect() {}
    },
  );
  try {
    const { container } = render(<Player onQueue={() => {}} />);
    const fill = container.querySelector('.' + styles.waveFill)! as HTMLElement;
    for (width of [331.5, 2304, 4096]) {
      act(() => resize());
      const paths = fill.querySelectorAll('path');
      expect(paths.length).toBe(1);
      const path = paths[0].getAttribute('d')!;
      expect(path.match(/M/g)?.length).toBe(1);
      const end = Number(path.match(/T(\d+) 13$/)?.[1]);
      expect(end - 30).toBeGreaterThanOrEqual(width);
    }
    act(() => useStore.setState((s) => ({ playback: { ...s.playback, position: 239 } })));
    expect(fill.style.clipPath).toContain('inset(0 ');
    expect(
      screen.getByLabelText('Позиция воспроизведения').getAttribute('aria-valuetext'),
    ).toContain('3:59');
  } finally {
    measure.mockRestore();
    vi.unstubAllGlobals();
  }
});

it('dispatches transport actions, cycles repeat modes and opens the queue', async () => {
  const queue = vi.fn();
  const view = render(<Player onQueue={queue} />);
  fireEvent.click(screen.getByLabelText('Пауза'));
  fireEvent.click(screen.getByLabelText('Остановить'));
  fireEvent.click(screen.getByLabelText('Предыдущий трек'));
  fireEvent.click(screen.getByLabelText('Следующий трек'));
  fireEvent.click(screen.getByLabelText('Случайный порядок'));
  fireEvent.click(screen.getByLabelText('Режим воспроизведения: Играть список'));
  await waitFor(() => expect(service.mode).toHaveBeenCalledWith(false, 'one'));
  expect(service.toggle).toHaveBeenCalledOnce();
  expect(service.stop).toHaveBeenCalledOnce();
  expect(service.step.mock.calls).toEqual([[-1], [1]]);
  expect(service.mode).toHaveBeenCalledWith(true, 'none');
  act(() => useStore.setState((s) => ({ playback: { ...s.playback, repeat: 'one' } })));
  fireEvent.click(screen.getByLabelText('Режим воспроизведения: Повтор текущего трека'));
  await waitFor(() => expect(service.mode).toHaveBeenCalledWith(false, 'all'));
  fireEvent.click(screen.getByLabelText('Очередь воспроизведения: 1'));
  expect(queue).toHaveBeenCalledOnce();
  view.rerender(<Player onQueue={queue} queueOpen />);
  expect(screen.getByLabelText('Очередь воспроизведения: 1').getAttribute('aria-pressed')).toBe(
    'true',
  );
});

it('commits scrubbing, ignores Tab, and recovers from a failed seek', async () => {
  render(<Player onQueue={() => {}} />);
  const slider = screen.getByLabelText('Позиция воспроизведения');
  fireEvent.change(slider, { target: { value: '120' } });
  fireEvent.keyUp(slider, { key: 'Tab' });
  expect(service.seek).not.toHaveBeenCalled();
  fireEvent.pointerUp(slider);
  await waitFor(() => expect(service.seek).toHaveBeenCalledWith(120));
  service.seek.mockRejectedValueOnce(new Error('Файл недоступен'));
  fireEvent.change(slider, { target: { value: '180' } });
  fireEvent.keyUp(slider, { key: 'ArrowRight' });
  await waitFor(() => expect((slider as HTMLInputElement).value).toBe('63'));
  expect(useStore.getState().toasts.at(-1)?.message).toContain('Файл недоступен');
});

it('resets an unfinished scrub on track change and disables transport without a track', () => {
  render(<Player onQueue={() => {}} />);
  fireEvent.change(screen.getByLabelText('Позиция воспроизведения'), { target: { value: '180' } });
  act(() =>
    useStore.setState((s) => ({
      playback: { ...s.playback, trackId: null, playing: false, position: 0, duration: 0 },
    })),
  );
  expect((screen.getByLabelText('Позиция воспроизведения') as HTMLInputElement).value).toBe('0');
  for (const name of ['Воспроизвести', 'Остановить', 'Следующий трек', 'Предыдущий трек'])
    expect((screen.getByLabelText(name) as HTMLButtonElement).disabled).toBe(true);
});

it('mutes, restores volume, and handles playback shortcuts outside input fields', async () => {
  render(<Player onQueue={() => {}} />);
  fireEvent.click(screen.getByLabelText('Выключить звук'));
  await waitFor(() => expect(service.volume).toHaveBeenCalledWith(0));
  act(() => useStore.setState((s) => ({ playback: { ...s.playback, volume: 0 } })));
  fireEvent.click(screen.getByLabelText('Включить звук'));
  await waitFor(() => expect(service.volume).toHaveBeenCalledWith(0.7));
  fireEvent.keyDown(document.body, { code: 'Space' });
  fireEvent.keyDown(document.body, { code: 'Space', shiftKey: true });
  fireEvent.keyDown(screen.getByLabelText('Громкость'), { code: 'Space' });
  await waitFor(() => expect(service.stop).toHaveBeenCalledOnce());
  expect(service.toggle).toHaveBeenCalledOnce();
});
