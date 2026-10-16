import type { Playlist, Track } from '../../shared/types';
import { Artwork } from '../../shared/ui';

export function PlaylistArtwork({
  playlist,
  track,
}: {
  playlist: Pick<Playlist, 'artwork'>;
  track?: Track;
}) {
  return playlist.artwork ? (
    <img className="artwork" src={playlist.artwork} alt="" draggable={false} loading="lazy" />
  ) : (
    <Artwork track={track} />
  );
}
