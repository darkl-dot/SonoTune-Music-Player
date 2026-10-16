import { t, useLanguage } from '../../shared/i18n';
import { useEffect, useRef, useState } from 'react';
import {
  Heart,
  ListMusic,
  Pause,
  Play,
  Shuffle,
  SkipBack,
  SkipForward,
  Square,
  Volume1,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useStore, run } from '../../app/store';
import { api } from '../../shared/api';
import { Artwork, IconButton } from '../../shared/ui';
import { artistName, formatTime } from '../../shared/utils';
import styles from './Player.module.css';
import { PlaybackMode } from './PlaybackMode';

const wave = Array.from(
  { length: 201 },
  (_, i) => `${i ? 'L' : 'M'}${i * 5},${15 + Math.sin((i * Math.PI) / 5) * 4}`,
).join(' ');
const seekKeys = [
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'Home',
  'End',
  'PageUp',
  'PageDown',
];

function Progress() {
  useLanguage();
  const position = useStore((s) => s.playback.position);
  const duration = useStore((s) => s.playback.duration);
  const playing = useStore((s) => s.playback.playing);
  const trackId = useStore((s) => s.playback.trackId);
  const [draft, setDraft] = useState<number | null>(null);
  useEffect(() => setDraft(null), [trackId]);
  const value = draft ?? position;
  const percent = duration > 0 ? Math.min(100, (value / duration) * 100) : 0;
  const seek = (seconds: number) =>
    void run(async () => {
      try {
        await (await api).seek(seconds);
      } finally {
        setDraft(null);
      }
    });
  return (
    <div className={styles.progress}>
      <span>{formatTime(value)}</span>
      <div className={`${styles.waveSlider} ${playing ? styles.moving : ''}`}>
        <div className={styles.waveRemainder} />
        <div className={styles.waveFill} style={{ width: `${percent}%` }}>
          <svg viewBox="0 0 1000 30" preserveAspectRatio="none" aria-hidden="true">
            <path d={wave} />
          </svg>
        </div>
        <div className={styles.thumb} style={{ left: `${percent}%` }} />
        <input
          type="range"
          aria-label={t('Позиция воспроизведения')}
          aria-valuetext={t('{position} из {duration}', {
            position: formatTime(value),
            duration: formatTime(duration),
          })}
          min="0"
          max={duration || 1}
          step="0.1"
          value={value}
          disabled={!trackId}
          onChange={(e) => setDraft(Number(e.target.value))}
          onPointerDown={(e) => e.currentTarget.setPointerCapture(e.pointerId)}
          onPointerUp={(e) => {
            seek(Number(e.currentTarget.value));
          }}
          onKeyUp={(e) => {
            if (seekKeys.includes(e.key)) seek(Number(e.currentTarget.value));
          }}
          onPointerCancel={() => setDraft(null)}
        />
      </div>
      <span>{formatTime(duration)}</span>
    </div>
  );
}

export function Player({ onQueue, queueOpen = false }: { onQueue(): void; queueOpen?: boolean }) {
  useLanguage();
  const id = useStore((s) => s.playback.trackId);
  const track = useStore((s) => s.library.tracks.find((t) => t.id === id));
  const playing = useStore((s) => s.playback.playing);
  const shuffle = useStore((s) => s.playback.shuffle);
  const repeat = useStore((s) => s.playback.repeat);
  const volume = useStore((s) => s.playback.volume);
  const queue = useStore((s) => s.playback.queue);
  const previousVolume = useRef(0.7);
  const toggle = () =>
    void run(async () => {
      await (await api).toggle();
    });
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest(
          'input,textarea,select,button,[contenteditable],[role="dialog"],[role="menu"]',
        )
      )
        return;
      if (event.code === 'Space') {
        event.preventDefault();
        if (event.shiftKey)
          void run(async () => {
            await (await api).stop();
          });
        else toggle();
      }
      if (event.ctrlKey && ['ArrowRight', 'ArrowLeft'].includes(event.key)) {
        event.preventDefault();
        void run(async () => {
          await (await api).step(event.key === 'ArrowRight' ? 1 : -1);
        });
      }
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, []);
  const setVolume = (value: number) => {
    localStorage.setItem('sonotune-volume', String(value));
    void run(async () => {
      await (await api).volume(value);
    });
  };
  return (
    <footer className={styles.player} aria-label={t('Плеер')}>
      <div className={styles.current}>
        <div className={styles.cover}>
          <Artwork track={track} />
        </div>
        <div className={styles.metadata}>
          {track ? (
            <button
              className={styles.currentTitle}
              title={t('Найти текущий трек в библиотеке')}
              onClick={() => useStore.getState().revealCurrent()}
            >
              {track.title}
            </button>
          ) : (
            <strong>{t('Ваш следующий любимый трек')}</strong>
          )}
          <span title={track ? artistName(track) : undefined}>
            {track ? artistName(track) : t('Выберите музыку в библиотеке')}
          </span>
        </div>
        <IconButton
          label={track?.favorite ? t('Убрать из избранного') : t('В избранное')}
          className={track?.favorite ? 'is-active' : ''}
          disabled={!track}
          onClick={() => track && void run(() => useStore.getState().favorite(track))}
        >
          <Heart size={19} fill={track?.favorite ? 'currentColor' : 'none'} />
        </IconButton>
      </div>
      <div className={styles.transport}>
        <div className={styles.controls} role="group" aria-label={t('Управление воспроизведением')}>
          <IconButton
            label={t('Случайный порядок')}
            aria-pressed={shuffle}
            className={shuffle ? 'is-active' : ''}
            onClick={() =>
              void run(async () => {
                await (await api).mode(!shuffle, repeat);
              })
            }
          >
            <Shuffle size={18} />
          </IconButton>
          <IconButton
            label={t('Предыдущий трек')}
            disabled={!id}
            onClick={() =>
              void run(async () => {
                await (await api).step(-1);
              })
            }
          >
            <SkipBack size={22} fill="currentColor" />
          </IconButton>
          <IconButton
            label={playing ? t('Пауза') : t('Воспроизвести')}
            className={styles.play}
            disabled={!id}
            onClick={toggle}
          >
            {playing ? (
              <Pause size={25} fill="currentColor" />
            ) : (
              <Play size={25} fill="currentColor" />
            )}
          </IconButton>
          <IconButton
            label={t('Следующий трек')}
            disabled={!id}
            onClick={() =>
              void run(async () => {
                await (await api).step(1);
              })
            }
          >
            <SkipForward size={22} fill="currentColor" />
          </IconButton>
          <IconButton
            label={t('Остановить')}
            disabled={!id}
            onClick={() =>
              void run(async () => {
                await (await api).stop();
              })
            }
          >
            <Square size={15} fill="currentColor" />
          </IconButton>
          <PlaybackMode />
        </div>
        <Progress />
      </div>
      <div className={styles.extras}>
        <IconButton
          label={volume ? t('Выключить звук') : t('Включить звук')}
          onClick={() => {
            if (volume) {
              previousVolume.current = volume;
              setVolume(0);
            } else setVolume(previousVolume.current);
          }}
        >
          {volume === 0 ? (
            <VolumeX size={20} />
          ) : volume < 0.5 ? (
            <Volume1 size={20} />
          ) : (
            <Volume2 size={20} />
          )}
        </IconButton>
        <input
          className={styles.volume}
          type="range"
          aria-label={t('Громкость')}
          aria-valuetext={`${Math.round(volume * 100)}%`}
          title={t('Громкость: {value}%', { value: Math.round(volume * 100) })}
          min="0"
          max="1"
          step="0.01"
          value={volume}
          style={{
            background: `linear-gradient(to right, var(--primary) ${volume * 100}%, var(--outline) ${volume * 100}%)`,
          }}
          onChange={(e) => setVolume(Number(e.target.value))}
        />
        <div className={styles.divider} />
        <IconButton
          label={t('Очередь воспроизведения: {count}', { count: queue.length })}
          aria-pressed={queueOpen}
          className={queueOpen ? 'is-active' : ''}
          onClick={onQueue}
        >
          <ListMusic size={22} />
        </IconButton>
      </div>
    </footer>
  );
}
