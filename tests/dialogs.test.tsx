// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PlaylistDialog } from '../src/features/playlists/PlaylistDialog';
import { TagEditor } from '../src/features/tag-editor/TagEditor';
import { useStore } from '../src/app/store';
import type { Track } from '../src/shared/types';

vi.mock('../src/shared/api', () => ({
  desktop: false,
  api: Promise.resolve({ savePlaylist: vi.fn(), deletePlaylist: vi.fn() }),
  initialPlayback: {
    trackId: null,
    playing: false,
    queue: [],
    position: 0,
    duration: 0,
    volume: 0.7,
    shuffle: false,
    repeat: 'none',
  },
  mergeTrack: vi.fn(),
}));
const track: Track = {
  id: 'one',
  path: 'song.flac',
  title: 'Soft Orbit',
  artists: ['SonoTune'],
  album: 'Soft Shapes',
  year: 2026,
  genres: ['Ambient'],
  duration: 32,
  artwork: null,
  format: 'FLAC',
  size: 1000,
  modified: 1,
  addedAt: 1,
  favorite: false,
  available: true,
  demo: true,
};
afterEach(() => {
  cleanup();
  useStore.setState({ library: { tracks: [], playlists: [], folders: [] }, section: 'tracks' });
  vi.restoreAllMocks();
});
describe('playlist editor', () => {
  it('creates a named playlist, includes the selected track and closes', async () => {
    const close = vi.fn();
    const user = userEvent.setup();
    render(<PlaylistDialog track={track} onClose={close} />);
    await user.type(screen.getByLabelText('Название'), 'Без спешки');
    await user.click(screen.getByRole('button', { name: 'Создать' }));
    await waitFor(() => expect(close).toHaveBeenCalledOnce());
    expect(useStore.getState().library.playlists[0]).toMatchObject({
      name: 'Без спешки',
      trackIds: ['one'],
    });
  });
  it('rejects whitespace-only names', () => {
    render(<PlaylistDialog onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText('Название'), { target: { value: '   ' } });
    expect((screen.getByRole('button', { name: 'Создать' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });
});
describe('tag editor', () => {
  it('validates the year and exposes browser sidecar limitations', () => {
    render(<TagEditor track={track} onClose={() => {}} />);
    expect(screen.getByText(/Запись в аудиофайл доступна/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Год'), { target: { value: 'abcd' } });
    expect(screen.getByLabelText('Год').getAttribute('aria-invalid')).toBe('true');
    expect((screen.getByRole('button', { name: 'Сохранить' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });
  it('normalizes multiple artists and genres when saving', async () => {
    const save = vi.spyOn(useStore.getState(), 'saveTags').mockResolvedValue(true);
    const close = vi.fn();
    render(<TagEditor track={track} onClose={close} />);
    fireEvent.change(screen.getByLabelText('Исполнитель'), {
      target: { value: '  Dayroom ; Гость ; ' },
    });
    fireEvent.change(screen.getByLabelText('Жанр'), {
      target: { value: ' Ambient ; Electronic ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    await waitFor(() =>
      expect(save).toHaveBeenCalledWith(
        'one',
        expect.objectContaining({
          artists: ['Dayroom', 'Гость'],
          genres: ['Ambient', 'Electronic'],
        }),
        true,
      ),
    );
    expect(close).toHaveBeenCalledOnce();
  });
});
