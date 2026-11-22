// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { EqualizerBridge, EqualizerView } from '../src/features/equalizer/EqualizerView';
import { flatEqualizer, normalizeEqualizer, useEqualizer } from '../src/shared/equalizer';
import { setLanguage } from '../src/shared/i18n';
const configure = vi.hoisted(() => vi.fn(async () => {}));
vi.mock('../src/shared/api', () => ({
  api: Promise.resolve({ configureEqualizer: configure }),
  initialPlayback: {},
}));
beforeEach(() => {
  localStorage.clear();
  setLanguage('ru');
  useEqualizer.setState({ value: flatEqualizer(), customPresets: [] });
  configure.mockClear();
});
afterEach(cleanup);
it('changes gain, applies it while mounted elsewhere, preserves it when bypassed, and persists settings', async () => {
  const view = render(
    <>
      <EqualizerBridge />
      <EqualizerView />
    </>,
  );
  fireEvent.click(screen.getByRole('switch'));
  fireEvent.change(screen.getByRole('slider', { name: '1000 Гц' }), { target: { value: '5' } });
  expect(useEqualizer.getState().value.gains[5]).toBe(5);
  await waitFor(() =>
    expect(configure).toHaveBeenLastCalledWith(
      expect.objectContaining({ enabled: true, gains: expect.arrayContaining([5]) }),
    ),
  );
  fireEvent.click(screen.getByRole('switch'));
  expect(useEqualizer.getState().value.gains[5]).toBe(5);
  expect(JSON.parse(localStorage.getItem('sonotune-equalizer')!).enabled).toBe(false);
  view.rerender(<EqualizerBridge />);
  await waitFor(() =>
    expect(configure).toHaveBeenLastCalledWith(expect.objectContaining({ enabled: false })),
  );
});
it('resets all bands and preamp and translates controls', () => {
  useEqualizer.setState({ value: { enabled: true, preamp: -6, gains: Array(10).fill(4) } });
  render(<EqualizerView />);
  fireEvent.click(screen.getByRole('button', { name: 'Сбросить' }));
  expect(useEqualizer.getState().value).toEqual({ ...flatEqualizer(), enabled: true });
  setLanguage('en');
});
it('sanitizes persisted and untrusted gains', () => {
  expect(normalizeEqualizer({ enabled: true, preamp: NaN, gains: [50, -50, Infinity] })).toEqual({
    enabled: true,
    preamp: 0,
    gains: [12, -12, 0, 0, 0, 0, 0, 0, 0, 0],
  });
});

it('saves, selects, and deletes custom equalizer presets', () => {
  useEqualizer.setState({
    value: { enabled: true, preamp: -1, gains: [3, 2, 1, 0, 0, 0, 1, 2, 3, 2] },
    customPresets: [],
  });
  render(<EqualizerView />);
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить пресет' }));
  const input = screen.getByLabelText('Название пресета');
  fireEvent.change(input, { target: { value: 'Наушники' } });
  fireEvent.submit(input.closest('form')!);
  expect(useEqualizer.getState().customPresets).toHaveLength(1);
  expect(useEqualizer.getState().customPresets[0].name).toBe('Наушники');
  expect(JSON.parse(localStorage.getItem('sonotune-eq-presets')!)).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: 'Удалить пресет' }));
  expect(useEqualizer.getState().customPresets).toHaveLength(0);
});
