import { t, useLanguage } from '../../shared/i18n';
import { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ListMusic, Plus } from 'lucide-react';
import { useStore } from '../../app/store';
import { Flower } from '../../shared/ui';
import { plural } from '../../shared/utils';
import { useColumns } from '../../shared/useColumns';
import { PlaylistArtwork } from './PlaylistArtwork';
import type { Playlist } from '../../shared/types';

export function PlaylistOverview({
  onCreate,
  onEdit,
}: {
  onCreate(): void;
  onEdit(playlist: Playlist): void;
}) {
  useLanguage();
  const playlists = useStore((s) => s.library.playlists);
  const tracks = useStore((s) => s.library.tracks);
  const query = useStore((s) => s.query);
  const values = playlists.filter((p) =>
    p.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
  );
  const byId = new Map(tracks.map((t) => [t.id, t]));
  const parent = useRef<HTMLDivElement>(null);
  const columns = useColumns(parent);
  const virtual = useVirtualizer({
    count: Math.ceil((values.length + 1) / columns),
    getScrollElement: () => parent.current,
    estimateSize: () => 250,
    overscan: 2,
  });
  return (
    <div
      className="grid-scroll"
      ref={parent}
      style={{ '--columns': columns } as React.CSSProperties}
    >
      <div style={{ height: virtual.getTotalSize(), position: 'relative' }}>
        {virtual.getVirtualItems().map((row) => (
          <div
            className="track-grid-row"
            key={row.key}
            style={{ transform: `translateY(${row.start}px)` }}
          >
            {Array.from({ length: columns }, (_, col) => {
              const index = row.index * columns + col;
              if (index > values.length) return null;
              const playlist = values[index];
              const track = byId.get(playlist?.trackIds.find((id) => byId.has(id)) ?? '');
              return playlist ? (
                <button
                  key={playlist.id}
                  className="group-card playlist-card"
                  onClick={() => useStore.getState().setSection(`playlist:${playlist.id}`)}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    onEdit(playlist);
                  }}
                >
                  <div className="group-art">
                    <PlaylistArtwork playlist={playlist} track={track} />
                    <span className="playlist-art-icon">
                      <ListMusic size={23} />
                    </span>
                  </div>
                  <strong>{playlist.name}</strong>
                  <span>{plural(playlist.trackIds.length)}</span>
                </button>
              ) : (
                <button key="create" className="group-card create-playlist-card" onClick={onCreate}>
                  <div className="group-art">
                    <Flower petals={7} className="group-flower" />
                    <span>
                      <Plus size={36} />
                    </span>
                  </div>
                  <strong>{t('Новый плейлист')}</strong>
                  <span>{t('Соберите своё настроение')}</span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
