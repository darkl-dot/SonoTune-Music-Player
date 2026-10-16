import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ListMusic, ListRestart, Music2, Repeat1 } from 'lucide-react';
import { api } from '../../shared/api';
import { t, useLanguage } from '../../shared/i18n';
import type { RepeatMode } from '../../shared/types';
import { run, useStore } from '../../app/store';
import styles from './PlaybackMode.module.css';

export const playbackModes = [
  { value: 'single', label: 'Один трек', detail: 'Сыграть песню и остановиться', icon: Music2 },
  {
    value: 'none',
    label: 'Играть список',
    detail: 'Дойти до конца очереди и остановиться',
    icon: ListMusic,
  },
  {
    value: 'one',
    label: 'Повтор текущего трека',
    detail: 'Слушать эту песню по кругу',
    icon: Repeat1,
  },
  {
    value: 'all',
    label: 'Повтор текущего списка',
    detail: 'Начать очередь заново после последней песни',
    icon: ListRestart,
  },
] as const;

export function PlaybackMode() {
  useLanguage();
  const value = useStore((s) => s.playback.repeat);
  const index = Math.max(
    0,
    playbackModes.findIndex((mode) => mode.value === value),
  );
  const current = playbackModes[index];
  const Icon = current.icon;
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [active, setActive] = useState(index);
  const [position, setPosition] = useState({ left: 8, bottom: 120, maxHeight: 340 });
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const exitTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const focusMenu = useRef(false);
  const requested = useRef(value);
  const requestVersion = useRef(0);
  const pending = useRef(false);
  const operations = useRef(Promise.resolve());
  useEffect(() => {
    if (!pending.current) requested.current = value;
  }, [value]);
  const id = useId();
  const clearHover = () => {
    clearTimeout(hoverTimer.current);
    clearTimeout(closeTimer.current);
  };
  const hide = (restoreFocus = false) => {
    clearHover();
    setClosing(true);
    clearTimeout(exitTimer.current);
    exitTimer.current = setTimeout(() => {
      setOpen(false);
      setClosing(false);
    }, 160);
    if (restoreFocus) trigger.current?.focus();
  };
  const show = (keyboard = false) => {
    clearHover();
    clearTimeout(exitTimer.current);
    focusMenu.current = keyboard;
    setActive(index);
    setClosing(false);
    setOpen(true);
    if (keyboard && open) menu.current?.focus();
  };
  const leave = () => {
    clearHover();
    if (menu.current?.contains(document.activeElement)) return;
    closeTimer.current = setTimeout(() => hide(), 200);
  };
  const choose = (mode: RepeatMode) => {
    requested.current = mode;
    pending.current = true;
    const request = ++requestVersion.current;
    let succeeded = false;
    operations.current = operations.current
      .then(() =>
        run(async () => {
          await (await api).mode(useStore.getState().playback.shuffle, mode);
          succeeded = true;
        }),
      )
      .finally(() => {
        if (request === requestVersion.current) {
          pending.current = false;
          if (!succeeded) requested.current = useStore.getState().playback.repeat;
        }
      });
  };
  useLayoutEffect(() => {
    if (!open || !trigger.current || !menu.current) return;
    const anchor = trigger.current.getBoundingClientRect();
    const width = menu.current.getBoundingClientRect().width || 340;
    setPosition({
      left: Math.max(
        8,
        Math.min(anchor.left + anchor.width / 2 - width / 2, window.innerWidth - width - 8),
      ),
      bottom: Math.max(8, window.innerHeight - anchor.top + 10),
      maxHeight: Math.max(80, Math.min(window.innerHeight - 72, anchor.top - 48)),
    });
    if (focusMenu.current) menu.current.focus();
  }, [open]);
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
  useEffect(
    () => () => {
      clearTimeout(hoverTimer.current);
      clearTimeout(closeTimer.current);
      clearTimeout(exitTimer.current);
    },
    [],
  );
  const blur = (target: EventTarget | null) => {
    if (!menu.current?.contains(target as Node) && !trigger.current?.contains(target as Node))
      hide();
  };
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className={`icon-button ${value === 'one' || value === 'all' ? 'is-active' : ''}`}
        aria-label={t('Режим воспроизведения: {mode}', { mode: t(current.label) })}
        aria-haspopup="listbox"
        aria-expanded={open && !closing}
        aria-controls={open ? id : undefined}
        onClick={() => {
          const requestedIndex = playbackModes.findIndex(
            (mode) => mode.value === requested.current,
          );
          choose(playbackModes[(requestedIndex + 1) % playbackModes.length].value);
        }}
        onPointerEnter={(event) => {
          if (event.pointerType !== 'touch') {
            clearHover();
            hoverTimer.current = setTimeout(() => show(), 350);
          }
        }}
        onPointerLeave={leave}
        onBlur={(event) => blur(event.relatedTarget)}
        onContextMenu={(event) => {
          event.preventDefault();
          show(true);
        }}
        onKeyDown={(event) => {
          if (['ArrowDown', 'ArrowUp', 'Enter'].includes(event.key)) {
            event.preventDefault();
            show(true);
          }
        }}
      >
        <Icon size={19} />
      </button>
      {open &&
        createPortal(
          <div
            ref={menu}
            id={id}
            role="listbox"
            tabIndex={-1}
            aria-label={t('Режим воспроизведения')}
            aria-activedescendant={`${id}-${active}`}
            className={`${styles.popover} ${closing ? styles.closing : ''}`}
            style={position}
            onPointerEnter={() => {
              clearHover();
              clearTimeout(exitTimer.current);
              setClosing(false);
            }}
            onPointerLeave={leave}
            onBlur={(event) => blur(event.relatedTarget)}
            onKeyDown={(event) => {
              if (['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', ' '].includes(event.key))
                event.preventDefault();
              if (event.key === 'ArrowDown') setActive((i) => (i + 1) % playbackModes.length);
              if (event.key === 'ArrowUp')
                setActive((i) => (i + playbackModes.length - 1) % playbackModes.length);
              if (event.key === 'Home') setActive(0);
              if (event.key === 'End') setActive(playbackModes.length - 1);
              if (event.key === 'Enter' || event.key === ' ') {
                choose(playbackModes[active].value);
                hide(true);
              }
            }}
          >
            <div className={styles.heading}>{t('Как слушаем?')}</div>
            {playbackModes.map((mode, i) => (
              <div
                key={mode.value}
                id={`${id}-${i}`}
                role="option"
                aria-selected={value === mode.value}
                className={`${styles.option} ${active === i ? styles.active : ''}`}
                onPointerMove={() => setActive(i)}
                onClick={() => {
                  choose(mode.value);
                  hide(true);
                }}
              >
                <mode.icon size={19} />
                <span>
                  <strong>{t(mode.label)}</strong>
                  <small>{t(mode.detail)}</small>
                </span>
                {value === mode.value && <Check size={17} />}
              </div>
            ))}
            <div className={styles.hint}>{t('Нажатие на кнопку переключает режим')}</div>
          </div>,
          document.body,
        )}
    </>
  );
}
