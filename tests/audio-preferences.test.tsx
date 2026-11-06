// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AudioPreferences } from '../src/app/AudioPreferences';
import { useStore } from '../src/app/store';
import { setLanguage } from '../src/shared/i18n';
const audio = vi.hoisted(() => ({
  audioOutputs: vi.fn(async () => [{ id: 'headphones:0', name: 'Headphones' }]),
  configureAudio: vi.fn(async () => {}),
}));
vi.mock('../src/shared/api', () => ({
  api: Promise.resolve(audio),
  desktop: true,
  initialPlayback: {},
}));
beforeEach(() => {
  setLanguage('ru');
  useStore.setState({
    settings: { appearance: 'dark', palette: 'adaptive', crossfade: 0, outputDevice: null },
  });
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
    settings: { appearance: 'dark', palette: 'adaptive', crossfade: 3, outputDevice: 'missing' },
  });
  render(<AudioPreferences />);
  await waitFor(() => expect(screen.getByText('Выбранное устройство недоступно')).toBeTruthy());
  expect(useStore.getState().settings.outputDevice).toBe('missing');
});
