// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PlaylistDialog } from '../src/features/playlists/PlaylistDialog';
import { useStore } from '../src/app/store';
import { coverCrop, preparePlaylistCover } from '../src/shared/playlist-cover';
import type { Playlist } from '../src/shared/types';

vi.mock('../src/shared/api', () => ({
  api: Promise.resolve({ savePlaylist: async () => {} }),
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
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const cover = 'data:image/webp;base64,dGVzdA==';
function imageMocks() {
  const close = vi.fn(),
    drawImage = vi.fn();
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => ({ width: 2000, height: 1000, close })),
  );
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage,
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(cover);
  return { close, drawImage };
}
it('crops in the center without distortion, bounds the stored image and releases its bitmap', async () => {
  expect(coverCrop(2000, 1000)).toEqual({ x: 500, y: 0, size: 1000 });
  const { close, drawImage } = imageMocks();
  expect(await preparePlaylistCover(new File(['image'], 'art.png', { type: 'image/png' }))).toBe(
    cover,
  );
  expect(drawImage).toHaveBeenCalledWith(expect.anything(), 500, 0, 1000, 1000, 0, 0, 512, 512);
  expect(close).toHaveBeenCalledOnce();
});
it('rejects non-image input and reports a damaged image without saving it', async () => {
  await expect(
    preparePlaylistCover(new File(['bad'], 'art.svg', { type: 'image/svg+xml' })),
  ).rejects.toThrow('JPG');
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => {
      throw Error('bad');
    }),
  );
  await expect(
    preparePlaylistCover(new File(['bad'], 'art.png', { type: 'image/png' })),
  ).rejects.toThrow('Не удалось прочитать обложку');
});
it('uploads a playlist cover, preserves tracks and removes it again on explicit save', async () => {
  imageMocks();
  const playlist: Playlist = { id: 'p', name: 'Walk', trackIds: ['song'], createdAt: 1 };
  const save = vi.spyOn(useStore.getState(), 'savePlaylist').mockResolvedValue();
  const close = vi.fn();
  const view = render(<PlaylistDialog playlist={playlist} onClose={close} />);
  fireEvent.change(screen.getByLabelText('Файл обложки плейлиста'), {
    target: { files: [new File(['image'], 'art.png', { type: 'image/png' })] },
  });
  await waitFor(() => expect(screen.getByLabelText('Убрать обложку')).toBeTruthy());
  expect(view.container.querySelector('img')?.src).toBe(cover);
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
  await waitFor(() => expect(save).toHaveBeenCalledWith({ ...playlist, artwork: cover }));
  view.unmount();
  render(<PlaylistDialog playlist={{ ...playlist, artwork: cover }} onClose={close} />);
  fireEvent.click(screen.getByLabelText('Убрать обложку'));
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
  await waitFor(() => expect(save).toHaveBeenLastCalledWith({ ...playlist, artwork: null }));
});
