import { t, useLanguage } from '../../shared/i18n';
import { useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ArrowDown, ArrowUp, AudioLines, GripVertical, ListMusic, X } from 'lucide-react';
import { useStore, run } from '../../app/store';
import { api } from '../../shared/api';
import { Artwork, IconButton } from '../../shared/ui';
import { artistName, plural } from '../../shared/utils';
import styles from './Queue.module.css';

export function moveInQueue(queue: string[], id: string, target: string, after = false) {
  if (id === target || !queue.includes(id) || !queue.includes(target)) return queue;
  const result = queue.filter((value) => value !== id);
  result.splice(result.indexOf(target) + Number(after), 0, id);
  return result;
}
export function Queue({ onClose }: { onClose(): void }) {
  useLanguage();
  const queue = useStore((s) => s.playback.queue);
  const current = useStore((s) => s.playback.trackId);
  const tracks = useStore((s) => s.library.tracks);
  const byId = useMemo(() => new Map(tracks.map((track) => [track.id, track])), [tracks]);
  const [drop, setDrop] = useState<string | null>(null);
  const parent = useRef<HTMLDivElement>(null);
  const virtual = useVirtualizer({
    count: queue.length,
    getScrollElement: () => parent.current,
    estimateSize: () => 68,
    overscan: 5,
  });
  const reorder = (ids: string[]) => void run(async () => (await api).reorderQueue(ids));
  const move = (id: string, direction: -1 | 1) => {
    const values = useStore.getState().playback.queue;
    const index = values.indexOf(id),
      target = values[index + direction];
    if (target) reorder(moveInQueue(values, id, target, direction === 1));
  };
  return (
    <aside className={`queue-panel ${styles.panel}`} aria-label={t('Очередь воспроизведения')}>
      <div className="queue-heading">
        <div>
          <span className="eyebrow">{t('СЕЙЧАС И ДАЛЬШЕ')}</span>
          <h2>{t('Очередь')}</h2>
        </div>
        <IconButton label={t('Закрыть очередь')} onClick={onClose}>
          <X size={21} />
        </IconButton>
      </div>
      <div className={styles.toolbar}>
        <span>{plural(queue.length)}</span>
        <button
          className="button ghost small"
          disabled={!queue.length || queue.indexOf(current ?? '') === queue.length - 1}
          onClick={() => void run(async () => (await api).clearNext())}
        >
          {t('Очистить следующие')}
        </button>
      </div>
      <div className={styles.entries} ref={parent}>
        {queue.length ? (
          <div style={{ position: 'relative', height: virtual.getTotalSize() }}>
            {virtual.getVirtualItems().map((row) => {
              const id = queue[row.index],
                track = byId.get(id);
              return (
                <div
                  key={id}
                  className={`${styles.row} ${id === current ? styles.current : ''} ${drop === id ? styles.drop : ''}`}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: 68,
                    transform: `translateY(${row.start}px)`,
                  }}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('application/x-sonotune-queue', id);
                    e.dataTransfer.effectAllowed = 'move';
                  }}
                  onDragEnd={() => setDrop(null)}
                  onDragOver={(e) => {
                    if (e.dataTransfer.types.includes('application/x-sonotune-queue')) {
                      e.preventDefault();
                      setDrop(id);
                    }
                  }}
                  onDragLeave={() => setDrop(null)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDrop(null);
                    const source = e.dataTransfer.getData('application/x-sonotune-queue');
                    const after = e.clientY > e.currentTarget.getBoundingClientRect().top + 34;
                    reorder(moveInQueue(useStore.getState().playback.queue, source, id, after));
                  }}
                >
                  <GripVertical className={styles.grip} size={15} aria-hidden="true" />
                  <button
                    className={styles.song}
                    onClick={() => void run(async () => (await api).playQueued(id))}
                    aria-label={t('Слушать {title}', { title: track?.title ?? id })}
                  >
                    <Artwork track={track} />
                    <span>
                      <strong>{track?.title ?? t('Файл недоступен')}</strong>
                      <small>{track ? artistName(track) : ''}</small>
                    </span>
                    {id === current && <AudioLines size={17} />}
                  </button>
                  <div className={styles.moves}>
                    <IconButton
                      label={t('Поднять: {title}', { title: track?.title ?? id })}
                      disabled={row.index === 0}
                      onClick={() => move(id, -1)}
                    >
                      <ArrowUp size={13} />
                    </IconButton>
                    <IconButton
                      label={t('Опустить: {title}', { title: track?.title ?? id })}
                      disabled={row.index === queue.length - 1}
                      onClick={() => move(id, 1)}
                    >
                      <ArrowDown size={13} />
                    </IconButton>
                  </div>
                  <IconButton
                    label={t('Убрать из очереди: {title}', { title: track?.title ?? id })}
                    disabled={id === current}
                    onClick={() => void run(async () => (await api).removeQueue(id))}
                  >
                    <X size={16} />
                  </IconButton>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="queue-empty">
            <ListMusic size={35} />
            <h3>{t('Пока тихо')}</h3>
            <p>{t('Включи песню или добавь трек в очередь.')}</p>
          </div>
        )}
      </div>
      <div className={styles.tip}>
        {t('Перетаскивайте треки или используйте стрелки. Текущая песня остаётся в очереди.')}
      </div>
    </aside>
  );
}
