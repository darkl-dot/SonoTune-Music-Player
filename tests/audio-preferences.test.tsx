// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AudioPreferences } from '../src/app/AudioPreferences';
import { useStore } from '../src/app/store';
import { normalizeSettings } from '../src/app/preferences';
import { setLanguage } from '../src/shared/i18n';
const audio = vi.hoisted(() => ({
  audioOutputs: vi.fn(async () => [{ id: 'headphones:0', name: 'Headphones' }]),
  configureAudio: vi.fn(async () => {}),
  configureNormalization: vi.fn(async () => {}),
  configureLimiter: vi.fn(async () => {}),
  loudnessStats: vi.fn(async () => [12, 40] as [number, number]),
  recomputeLoudness: vi.fn(async () => {}),
}));
vi.mock('../src/shared/api', () => ({
  api: Promise.resolve(audio),
  desktop: true,
  initialPlayback: {},
}));
beforeEach(() => {
  setLanguage('ru');
  useStore.setState({ settings: normalizeSettings({}) });
  vi.clearAllMocks();
});
afterEach(cleanup);
it('saves the crossfade duration and routes playback to the selected output', async () => {
  render(<AudioPreferences />);
  await waitFor(() => expect(audio.audioOutputs).toHaveBeenCalled());
  fireEvent.change(screen.getByRole('slider', { name: 'Длительность кроссфейда' }), {
    target: { value: '4.5' },
  });
  await waitFor(() => expect(audio.configureAudio).toHaveBeenLastCalledWith(4.5, null));
  fireEvent.click(screen.getByRole('button', { name: 'Устройство вывода' }));
  fireEvent.click(await screen.findByRole('option', { name: 'Headphones' }));
  await waitFor(() => expect(audio.configureAudio).toHaveBeenLastCalledWith(4.5, 'headphones:0'));
  expect(JSON.parse(localStorage.getItem('sonotune-settings')!).outputDevice).toBe('headphones:0');
});
it('keeps a disconnected saved device visible instead of silently choosing another output', async () => {
  useStore.setState({
    settings: normalizeSettings({ crossfade: 3, outputDevice: 'missing' }),
  });
  render(<AudioPreferences />);
  await waitFor(() => expect(screen.getByText('Выбранное устройство недоступно')).toBeTruthy());
  expect(useStore.getState().settings.outputDevice).toBe('missing');
});
it('levels loudness per track or album and shows measurement progress', async () => {
  render(<AudioPreferences />);
  await waitFor(() => expect(audio.loudnessStats).toHaveBeenCalled());
  expect(screen.getByText('Громкость измерена: 12 из 40')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Выравнивание громкости' }));
  fireEvent.click(screen.getByRole('option', { name: 'По альбомам' }));
  await waitFor(() => expect(audio.configureNormalization).toHaveBeenLastCalledWith('album'));
  expect(JSON.parse(localStorage.getItem('sonotune-settings')!).normalization).toBe('album');
  fireEvent.click(screen.getByRole('button', { name: 'Пересчитать громкость' }));
  await waitFor(() => expect(audio.recomputeLoudness).toHaveBeenCalledOnce());
});
it('enables overload protection by default and disables it on request', async () => {
  expect(normalizeSettings({}).limiter).toBe(true);
  render(<AudioPreferences />);
  const toggle = screen.getByRole('switch', { name: 'Защита от перегрузки' }) as HTMLInputElement;
  expect(toggle.checked).toBe(true);
  fireEvent.click(toggle);
  await waitFor(() => expect(audio.configureLimiter).toHaveBeenLastCalledWith(false));
  expect(JSON.parse(localStorage.getItem('sonotune-settings')!).limiter).toBe(false);
});
