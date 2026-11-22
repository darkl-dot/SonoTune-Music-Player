import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Moon } from 'lucide-react';
import { useStore, run } from '../../app/store';
import { api } from '../../shared/api';
import { t, useLanguage } from '../../shared/i18n';
import popoverStyles from './PlaybackMode.module.css';

interface SleepOption {
  id: string;
  label: string;
  description: string;
  minutes: number | null;
  afterTrack: boolean;
}

function formatRemaining(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function SleepTimer() {
  useLanguage();
  const remaining = useStore((s) => s.playback.sleepRemaining ?? null);
  const afterTrack = useStore((s) => s.playback.sleepAfterTrack === true);
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [position, setPosition] = useState({ left: 8, bottom: 120, maxHeight: 360 });
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const exitTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const id = useId();

  const options: SleepOption[] = [
    {
      id: 'off',
      label: t('Выключен'),
      description: t('Музыка играет без ограничения'),
      minutes: null,
      afterTrack: false,
    },
    {
      id: 'after-track',
      label: t('После этого трека'),
      description: t('Остановится, когда доиграет текущая песня'),
      minutes: null,
      afterTrack: true,
    },
    {
      id: '15',
      label: t('15 минут'),
      description: t('Плавное затухание в конце'),
      minutes: 15,
      afterTrack: false,
    },
    {
      id: '30',
      label: t('30 минут'),
      description: t('Плавное затухание в конце'),
      minutes: 30,
      afterTrack: false,
    },
    {
      id: '45',
      label: t('45 минут'),
      description: t('Плавное затухание в конце'),
      minutes: 45,
      afterTrack: false,
    },
    {
      id: '60',
      label: t('60 минут'),
      description: t('Плавное затухание в конце'),
      minutes: 60,
      afterTrack: false,
    },
  ];

  const isRunning = afterTrack || (remaining !== null && remaining > 0);
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
    setClosing(false);
    setActiveIndex(afterTrack ? 1 : remaining ? 2 : 0);
    setOpen(true);
  };
  const choose = (option: SleepOption) => {
    void run(async () => {
      await (await api).sleepTimer?.(option.minutes, option.afterTrack);
      useStore
        .getState()
        .notify(
          option.afterTrack
            ? t('Таймер сна: остановится после текущего трека')
            : option.minutes
              ? t('Таймер сна установлен на {minutes} мин.', { minutes: option.minutes })
              : t('Таймер сна выключен'),
        );
    });
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
      maxHeight: Math.max(120, Math.min(window.innerHeight - 72, anchor.top - 48)),
    });
    menu.current.focus();
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
  useEffect(() => () => clearTimeout(exitTimer.current), []);

  const label = afterTrack
    ? t('Таймер сна: после этого трека')
    : remaining && remaining > 0
      ? t('Таймер сна: осталось {time}', { time: formatRemaining(remaining) })
      : t('Таймер сна');

  return (
    <>
      <button
        ref={trigger}
        type="button"
        className={`icon-button ${isRunning ? 'is-active' : ''}`}
        aria-label={label}
        title={label}
        aria-haspopup="listbox"
        aria-expanded={open && !closing}
        aria-controls={open ? id : undefined}
        onClick={() => (open && !closing ? hide(true) : show())}
      >
        <Moon size={18} />
      </button>
      {open &&
        createPortal(
          <div
            ref={menu}
            id={id}
            role="listbox"
            tabIndex={-1}
            aria-label={t('Таймер сна')}
            aria-activedescendant={`${id}-${activeIndex}`}
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
              if (event.key === 'ArrowDown') setActiveIndex((i) => (i + 1) % options.length);
              if (event.key === 'ArrowUp')
                setActiveIndex((i) => (i + options.length - 1) % options.length);
              if (event.key === 'Home') setActiveIndex(0);
              if (event.key === 'End') setActiveIndex(options.length - 1);
              if ((event.key === 'Enter' || event.key === ' ') && options[activeIndex]) {
                choose(options[activeIndex]);
              }
            }}
          >
            <div className={popoverStyles.heading}>
              {remaining && remaining > 0
                ? t('Таймер сна · {time}', { time: formatRemaining(remaining) })
                : t('Таймер сна')}
            </div>
            {options.map((option, i) => {
              const selected =
                (option.id === 'off' && !isRunning) ||
                (option.id === 'after-track' && afterTrack);
              return (
                <div
                  key={option.id}
                  id={`${id}-${i}`}
                  role="option"
                  aria-selected={selected}
                  className={`${popoverStyles.option} ${activeIndex === i ? popoverStyles.active : ''}`}
                  onPointerMove={() => setActiveIndex(i)}
                  onClick={() => choose(option)}
                >
                  <span>
                    <strong>{option.label}</strong>
                    <small>{option.description}</small>
                  </span>
                  {selected && <Check size={17} />}
                </div>
              );
            })}
          </div>,
          document.body,
        )}
    </>
  );
}
