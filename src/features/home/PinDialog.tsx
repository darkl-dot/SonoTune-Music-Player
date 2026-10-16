import { useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Pin, Search } from 'lucide-react';
import { useStore, run } from '../../app/store';
import { t, useLanguage } from '../../shared/i18n';
import { Artwork, Modal } from '../../shared/ui';
import { artistName, filterTracks } from '../../shared/utils';
import type { Track } from '../../shared/types';
import styles from './PinnedTracks.module.css';

export function PinDialog({ track: initial, onClose }: { track?: Track; onClose(): void }) {
  useLanguage();
  const tracks = useStore((s) => s.library.tracks);
  const pins = useStore((s) => s.library.pins);
  const [selected, setSelected] = useState(initial);
  const [label, setLabel] = useState(pins?.find((pin) => pin.trackId === initial?.id)?.label ?? '');
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const values = useMemo(() => filterTracks(tracks, query), [tracks, query]);
  const parent = useRef<HTMLDivElement>(null);
  const virtual = useVirtualizer({
    count: values.length,
    getScrollElement: () => parent.current,
    estimateSize: () => 60,
    overscan: 4,
  });
  const save = (remove = false) => {
    if (!selected || saving) return;
    setSaving(true);
    void run(async () => {
      try {
        if (remove) await useStore.getState().deletePin(selected.id);
        else await useStore.getState().savePin(selected.id, label);
        onClose();
      } finally {
        setSaving(false);
      }
    });
  };
  return (
    <Modal title={t('Закрепить на главной')} onClose={onClose}>
      {selected ? (
        <div className={styles.selection}>
          <Artwork track={selected} />
          <div>
            <strong>{selected.title}</strong>
            <small>{artistName(selected)}</small>
          </div>
        </div>
      ) : (
        <>
          <label className={styles.search}>
            <Search size={17} />
            <input
              autoFocus
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                parent.current?.scrollTo({ top: 0 });
              }}
              placeholder={t('Найти трек')}
              aria-label={t('Найти трек')}
            />
          </label>
          <div className={styles.picker} ref={parent}>
            <div style={{ height: virtual.getTotalSize(), position: 'relative' }}>
              {virtual.getVirtualItems().map((row) => {
                const track = values[row.index];
                return (
                  <button
                    key={track.id}
                    className={styles.choice}
                    style={{ transform: `translateY(${row.start}px)` }}
                    onClick={() => {
                      setSelected(track);
                      setLabel(pins?.find((pin) => pin.trackId === track.id)?.label ?? '');
                    }}
                  >
                    <Artwork track={track} />
                    <span>
                      <strong>{track.title}</strong>
                      <small>{artistName(track)}</small>
                    </span>
                  </button>
                );
              })}
            </div>
            {!values.length && <p className="dialog-description">{t('Пока ничего не нашлось')}</p>}
          </div>
        </>
      )}
      {selected && (
        <label className={styles.label}>
          <span>{t('Подпись — необязательно')}</span>
          <input
            autoFocus
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            maxLength={100}
            placeholder={t('Например, «Под игру»')}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                save();
              }
            }}
          />
        </label>
      )}
      <div className="modal-footer">
        {pins?.some((pin) => pin.trackId === selected?.id) && (
          <button className="button ghost" disabled={saving} onClick={() => save(true)}>
            {t('Открепить')}
          </button>
        )}
        <button className="button ghost" onClick={onClose}>
          {t('Отмена')}
        </button>
        <button className="button primary" disabled={!selected || saving} onClick={() => save()}>
          <Pin size={17} />
          {t('Сохранить')}
        </button>
      </div>
    </Modal>
  );
}
