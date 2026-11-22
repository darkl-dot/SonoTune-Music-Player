// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { SettingsDialog } from '../src/app/SettingsDialog';
import { normalizeSettings } from '../src/app/preferences';
import { useStore } from '../src/app/store';
import { useTheme } from '../src/app/useTheme';
import { setLanguage } from '../src/shared/i18n';
import { extraThemes } from '../src/shared/themes';

vi.mock('../src/shared/api', () => ({
  api: Promise.resolve({}),
  desktop: false,
  initialPlayback: {},
}));

function ThemeProbe() {
  useTheme();
  return null;
}
beforeEach(() => {
  setLanguage('ru');
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
  useStore.setState({
    settings: normalizeSettings({}),
    library: { tracks: [], playlists: [], folders: [] },
  });
});
afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute('data-theme');
});

it('accepts every extra theme, dark and light, and rejects unknown ones', () => {
  expect(extraThemes).toHaveLength(18);
  for (const theme of extraThemes) {
    expect(normalizeSettings({ appearance: theme.id }).appearance).toBe(theme.id);
  }
  expect(normalizeSettings({ appearance: 'solarized' as never }).appearance).toBe('light');
});

it('lists every extra theme and switches the document between them', () => {
  render(
    <>
      <ThemeProbe />
      <SettingsDialog onClose={() => {}} />
    </>,
  );
  expect(screen.queryByRole('button', { name: 'Gruvbox' })).toBeNull();
  fireEvent.click(screen.getByRole('tab', { name: 'Оформление' }));
  expect(screen.getByText('Цветовая палитра')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Дополнительные темы' }));
  for (const theme of extraThemes) {
    expect(screen.getByRole('button', { name: theme.name })).toBeTruthy();
  }
  const dark = screen.getByRole('button', { name: 'Gruvbox' });
  const light = screen.getByRole('button', { name: 'Gruvbox Light' });
  expect(dark.getAttribute('aria-pressed')).toBe('false');
  expect(light.getAttribute('aria-pressed')).toBe('false');

  fireEvent.click(dark);
  expect(useStore.getState().settings.appearance).toBe('gruvbox');
  expect(JSON.parse(localStorage.getItem('sonotune-settings')!).appearance).toBe('gruvbox');
  expect(dark.getAttribute('aria-pressed')).toBe('true');
  expect(screen.queryByText('Цветовая палитра')).toBeNull();
  expect(
    screen.getByText('В дополнительных темах палитра фиксированная, поэтому оттенки не меняются.'),
  ).toBeTruthy();
  expect(document.documentElement.dataset.theme).toBe('gruvbox');

  fireEvent.click(light);
  expect(document.documentElement.dataset.theme).toBe('gruvbox-light');
  expect(JSON.parse(localStorage.getItem('sonotune-settings')!).appearance).toBe('gruvbox-light');

  fireEvent.click(screen.getByRole('button', { name: 'Dracula Light' }));
  expect(document.documentElement.dataset.theme).toBe('dracula-light');

  fireEvent.click(screen.getByRole('button', { name: 'Светлое' }));
  expect(document.documentElement.dataset.theme).toBe('light');
  expect(screen.getByText('Цветовая палитра')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Dracula Light' })).toBeTruthy();
});
