import { useMemo, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Pencil, Pin, Plus } from 'lucide-react';
import { useStore, run } from '../../app/store';
import { api } from '../../shared/api';
import { t } from '../../shared/i18n';
import { Artwork, IconButton } from '../../shared/ui';
import { artistName } from '../../shared/utils';
import { useColumns } from '../../shared/useColumns';
import type { Track } from '../../shared/types';
import styles from './PinnedTracks.module.css';

export function PinnedTracks({ onEdit }: { onEdit?(track?: Track): void }) {
  const pins = useStore((s) => s.library.pins);
  const tracks = useStore((s) => s.library.tracks);
  const values = useMemo(() => {
    const byId = new Map(tracks.map((track) => [track.id, track]));
    return (pins ?? []).flatMap((pin) => {
      const track = byId.get(pin.trackId);
      return track ? [{ ...pin, track }] : [];
    });
  }, [pins, tracks]);
  const parent = useRef<HTMLDivElement>(null);
  const columns = useColumns(parent, 280, 3);
  const count = Math.ceil(values.length / columns);
  const virtual = useVirtualizer({
    count,
    getScrollElement: () => parent.current,
    estimateSize: () => 94,
    overscan: 2,
  });
  return (
    <section className={styles.section} aria-label={t('Закреплённые треки')}>
      <div className={styles.heading}>
        <h2>
          <Pin size={16} />
          {t('Всегда под рукой')}
        </h2>
        <button className="button ghost small" onClick={() => onEdit?.()} disabled={!tracks.length}>
          <Plus size={16} />
          {t('Закрепить трек')}
        </button>
      </div>
      <div className={styles.scroll} ref={parent} style={{ height: Math.min(count * 94, 282) }}>
        <div style={{ height: virtual.getTotalSize(), position: 'relative' }}>
          {virtual.getVirtualItems().map((row) => (
            <div
              className={styles.grid}
              key={row.key}
              style={{
                gridTemplateColumns: `repeat(${columns},minmax(0,1fr))`,
                transform: `translateY(${row.start}px)`,
              }}
            >
              {values
                .slice(row.index * columns, (row.index + 1) * columns)
                .map(({ track, label }) => (
                  <article key={track.id} className={styles.pin}>
                    <button
                      className={styles.play}
                      aria-label={t('Слушать {title}', { title: track.title })}
                      onClick={() =>
                        void run(async () =>
                          (await api).play(
                            track.id,
                            values.map((p) => p.track.id),
                          ),
                        )
                      }
                    >
                      <Artwork track={track} />
                      <span>
                        {label && <small className={styles.caption}>{label}</small>}
                        <strong>{track.title}</strong>
                        <small>
                          {artistName(track)}
                          {!track.available && t(' · файл недоступен')}
                        </small>
                      </span>
                    </button>
                    <IconButton
                      label={t('Изменить закрепление: {title}', { title: track.title })}
                      onClick={() => onEdit?.(track)}
                    >
                      <Pencil size={15} />
                    </IconButton>
                  </article>
                ))}
            </div>
          ))}
        </div>
      </div>
      {!values.length && (
        <p className={styles.empty}>
          {t('Закрепите любимую песню и добавьте подпись — например, «Под игру».')}
        </p>
      )}
    </section>
  );
}
