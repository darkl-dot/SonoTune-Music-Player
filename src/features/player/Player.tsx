import { t, useLanguage } from '../../shared/i18n';
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Check,
  Heart,
  ListMusic,
  Pause,
  PictureInPicture2,
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
import { api, desktop } from '../../shared/api';
import { desktopApi } from '../../shared/desktop-api';
import { Artwork, IconButton } from '../../shared/ui';
import { artistName, formatTime } from '../../shared/utils';
import styles from './Player.module.css';
import popoverStyles from './PlaybackMode.module.css';
import { PlaybackMode } from './PlaybackMode';
import { SleepTimer } from './SleepTimer';
import { Waveform } from './Waveform';
import { PinButton } from '../home/PinButton';
import type { Track } from '../../shared/types';

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
        <div
          className={styles.waveFill}
          style={{ clipPath: `inset(0 ${100 - percent}% 0 0)` }}
          aria-hidden="true"
        >
          <Waveform />
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

function VolumeButton({ volume, onMuteToggle }: { volume: number; onMuteToggle(): void }) {
  useLanguage();
  const outputDevice = useStore((s) => s.settings.outputDevice ?? '');
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [outputs, setOutputs] = useState<{ id: string; name: string }[]>([]);
  const [error, setError] = useState('');
  const [active, setActive] = useState(0);
  const [position, setPosition] = useState({ left: 8, bottom: 120, maxHeight: 340 });
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const exitTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const id = useId();
  const options = [
    { value: '', label: t('По умолчанию Windows') },
    ...outputs.map((item) => ({ value: item.id, label: item.name })),
    ...(outputDevice && !outputs.some((item) => item.id === outputDevice)
      ? [{ value: outputDevice, label: t('Выбранное устройство недоступно') }]
      : []),
  ];
  const hide = (restoreFocus = false) => {
    setClosing(true);
    clearTimeout(exitTimer.current);
    exitTimer.current = setTimeout(() => {
      setOpen(false);
      setClosing(false);
    }, 160);
    if (restoreFocus) trigger.current?.focus();
  };
  const show = () => {
    clearTimeout(exitTimer.current);
    setError('');
    setClosing(false);
    setOpen(true);
    void api
      .then((service) => service.audioOutputs?.() ?? [])
      .then((list) => {
        setOutputs(list);
        const current = useStore.getState().settings.outputDevice ?? '';
        const nextOptions = [
          '',
          ...list.map((item) => item.id),
          ...(current && !list.some((item) => item.id === current) ? [current] : []),
        ];
        setActive(Math.max(0, nextOptions.indexOf(current)));
      })
      .catch(() => setError(t('Не удалось получить список устройств')));
  };
  const choose = (value: string) => {
    useStore.getState().setSettings({ outputDevice: value || null });
    hide(true);
  };
  useLayoutEffect(() => {
    if (!open || !trigger.current || !menu.current) return;
    const anchor = trigger.current.getBoundingClientRect();
    const width = menu.current.getBoundingClientRect().width || 300;
    setPosition({
      left: Math.max(
        8,
        Math.min(anchor.left + anchor.width / 2 - width / 2, window.innerWidth - width - 8),
      ),
      bottom: Math.max(8, window.innerHeight - anchor.top + 10),
      maxHeight: Math.max(80, Math.min(window.innerHeight - 72, anchor.top - 48)),
    });
    menu.current.focus();
  }, [open, outputs.length]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (
        !menu.current?.contains(event.target as Node) &&
        !trigger.current?.contains(event.target as Node)
      )
        hide();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        hide(menu.current?.contains(document.activeElement));
      }
    };
    const resize = () => hide();
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    window.addEventListener('resize', resize);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
      window.removeEventListener('resize', resize);
    };
  }, [open]);
  useEffect(() => () => clearTimeout(exitTimer.current), []);
  const label = volume ? t('Выключить звук') : t('Включить звук');
  const hint = desktop ? `${label} · ${t('Правая кнопка — выбор устройства вывода')}` : label;
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="icon-button"
        aria-label={label}
        title={hint}
        aria-haspopup={desktop ? 'listbox' : undefined}
        aria-expanded={desktop ? open && !closing : undefined}
        aria-controls={open ? id : undefined}
        onClick={onMuteToggle}
        onContextMenu={(event) => {
          event.preventDefault();
          if (!desktop) return;
          if (open && !closing) hide(true);
          else show();
        }}
        onKeyDown={(event) => {
          if (!desktop) return;
          if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
            event.preventDefault();
            show();
          }
        }}
      >
        {volume === 0 ? (
          <VolumeX size={20} />
        ) : volume < 0.5 ? (
          <Volume1 size={20} />
        ) : (
          <Volume2 size={20} />
        )}
      </button>
      {open &&
        createPortal(
          <div
            ref={menu}
            id={id}
            role="listbox"
            tabIndex={-1}
            aria-label={t('Устройство вывода')}
            aria-activedescendant={`${id}-${active}`}
            className={`${popoverStyles.popover} ${closing ? popoverStyles.closing : ''}`}
            style={position}
            onBlur={(event) => {
              if (
                !menu.current?.contains(event.relatedTarget as Node) &&
                !trigger.current?.contains(event.relatedTarget as Node)
              )
                hide();
            }}
            onKeyDown={(event) => {
              if (['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', ' '].includes(event.key))
                event.preventDefault();
              if (event.key === 'ArrowDown') setActive((i) => (i + 1) % options.length);
              if (event.key === 'ArrowUp')
                setActive((i) => (i + options.length - 1) % options.length);
              if (event.key === 'Home') setActive(0);
              if (event.key === 'End') setActive(options.length - 1);
              if ((event.key === 'Enter' || event.key === ' ') && options[active]) {
                choose(options[active].value);
              }
            }}
          >
            <div className={popoverStyles.heading}>{t('Устройство вывода')}</div>
            {options.map((option, i) => (
              <div
                key={option.value}
                id={`${id}-${i}`}
                role="option"
                aria-selected={outputDevice === option.value}
                className={`${popoverStyles.option} ${active === i ? popoverStyles.active : ''}`}
                onPointerMove={() => setActive(i)}
                onClick={() => choose(option.value)}
              >
                <span>
                  <strong>{option.label}</strong>
                </span>
                {outputDevice === option.value && <Check size={17} />}
              </div>
            ))}
            {error && (
              <div className={popoverStyles.hint} role="status">
                {error}
              </div>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}

export function Player({
  onQueue,
  queueOpen = false,
  onPin,
}: {
  onQueue(): void;
  queueOpen?: boolean;
  onPin?(track: Track): void;
}) {
  useLanguage();
  const id = useStore((s) => s.playback.trackId);
  const track = useStore((s) => s.library.tracks.find((t) => t.id === id));
  const playing = useStore((s) => s.playback.playing);
  const shuffle = useStore((s) => s.playback.shuffle);
  const repeat = useStore((s) => s.playback.repeat);
  const volume = useStore((s) => s.playback.volume);
  const queue = useStore((s) => s.playback.queue);
  const miniOpen = useStore((s) => s.miniOpen);
  const previousVolume = useRef(0.7);
  const volumeSlider = useRef<HTMLInputElement>(null);
  const toggleMini = () => {
    if (desktop) {
      const alwaysOnTop = useStore.getState().settings.miniAlwaysOnTop !== false;
      void run(async () => {
        const opened = await desktopApi.toggleMiniPlayer(alwaysOnTop);
        useStore.getState().setMiniOpen(opened);
      });
    } else {
      useStore.getState().setMiniOpen(!useStore.getState().miniOpen);
    }
  };
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
  // Wheel over the volume slider nudges it without scrolling the page.
  useEffect(() => {
    const slider = volumeSlider.current;
    if (!slider) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const current = useStore.getState().playback.volume;
      const step = event.shiftKey ? 0.01 : 0.05;
      const next = Math.min(
        1,
        Math.max(0, Math.round((current + (event.deltaY < 0 ? step : -step)) * 100) / 100),
      );
      if (next !== current) setVolume(next);
    };
    slider.addEventListener('wheel', wheel, { passive: false });
    return () => slider.removeEventListener('wheel', wheel);
  }, []);
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
        <div className={styles.trackActions}>
          <IconButton
            label={track?.favorite ? t('Убрать из избранного') : t('В избранное')}
            className={track?.favorite ? 'is-active' : ''}
            disabled={!track}
            onClick={() => track && void run(() => useStore.getState().favorite(track))}
          >
            <Heart size={19} fill={track?.favorite ? 'currentColor' : 'none'} />
          </IconButton>
          <PinButton track={track} onPin={onPin} />
        </div>
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
        <SleepTimer />
        <IconButton
          label={t('Мини-плеер')}
          aria-pressed={miniOpen}
          className={miniOpen ? 'is-active' : ''}
          onClick={toggleMini}
        >
          <PictureInPicture2 size={19} />
        </IconButton>
        <VolumeButton
          volume={volume}
          onMuteToggle={() => {
            if (volume) {
              previousVolume.current = volume;
              setVolume(0);
            } else setVolume(previousVolume.current);
          }}
        />
        <input
          ref={volumeSlider}
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
