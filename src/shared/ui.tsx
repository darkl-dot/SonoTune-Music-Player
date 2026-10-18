import { t, useLanguage } from './i18n';
import { useEffect, useId, useRef } from 'react';
import type { ButtonHTMLAttributes, CSSProperties, PropsWithChildren, ReactNode } from 'react';
import { X } from 'lucide-react';
import type { Track } from './types';
import { trackHue } from './utils';

export function IconButton({
  label,
  children,
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      className={`icon-button ${className}`}
      aria-label={label}
      title={label}
      {...props}
    >
      {children}
    </button>
  );
}
export function Flower({ className = '', petals = 8 }: { className?: string; petals?: number }) {
  const points =
    Array.from({ length: 241 }, (_, i) => {
      const angle = (i / 240) * Math.PI * 2;
      const r = 41 + 8 * Math.cos(petals * angle);
      return `${i ? 'L' : 'M'}${50 + Math.cos(angle) * r},${50 + Math.sin(angle) * r}`;
    }).join(' ') + 'Z';
  return (
    <svg className={className} width="100" height="100" viewBox="0 0 100 100" aria-hidden="true">
      <path d={points} fill="currentColor" />
    </svg>
  );
}
export function Artwork({
  track,
  className = '',
  decorative = true,
}: {
  track?: Track | null;
  className?: string;
  decorative?: boolean;
}) {
  useLanguage();
  const id = useId().replace(/:/g, '');
  const hue = trackHue(track);
  const variant =
    Math.abs((track?.album ?? 'SonoTune').split('').reduce((a, b) => a + b.charCodeAt(0), 0)) % 3;
  if (track?.artwork)
    return (
      <img
        className={`artwork ${className}`}
        src={track.artwork}
        alt={decorative ? '' : t('Обложка {album}', { album: track.album })}
        loading="lazy"
        draggable={false}
      />
    );
  return (
    <svg
      className={`artwork ${className}`}
      viewBox="0 0 240 240"
      role={decorative ? undefined : 'img'}
      aria-label={
        decorative ? undefined : t('Обложка {album}', { album: track?.album ?? 'SonoTune' })
      }
      aria-hidden={decorative || undefined}
      style={{ '--cover-hue': hue } as CSSProperties}
    >
      <defs>
        <linearGradient id={`g${id}`} x2="1" y2="1">
          <stop stopColor={`hsl(${hue} 43% 86%)`} />
          <stop offset="1" stopColor={`hsl(${hue + 22} 35% 67%)`} />
        </linearGradient>
        <clipPath id={`c${id}`}>
          <rect width="240" height="240" rx="2" />
        </clipPath>
      </defs>
      <g clipPath={`url(#c${id})`}>
        <rect width="240" height="240" fill={`url(#g${id})`} />
        {variant === 0 ? (
          <>
            <g transform="translate(28 23) scale(1.86)" color={`hsl(${hue} 30% 35%)`}>
              <Flower petals={7} />
            </g>
            <g transform="translate(76 71) scale(.88)" color={`hsl(${hue + 40} 65% 85%)`}>
              <Flower petals={7} />
            </g>
            <path
              d="M88 118q16-22 31 0t31 0"
              fill="none"
              stroke={`hsl(${hue} 28% 37%)`}
              strokeWidth="5"
              strokeLinecap="round"
            />
          </>
        ) : variant === 1 ? (
          <>
            {Array.from({ length: 7 }, (_, i) => (
              <path
                key={i}
                d={`M${-100 + i * 25} 260 C${180 + i * 15} 120, ${-50 + i * 32} 80, ${160 + i * 23} -25`}
                fill="none"
                stroke={`hsl(${hue + i * 3} 30% ${33 + i * 6}%)`}
                strokeWidth="16"
              />
            ))}
            <g transform="translate(135 128) scale(.8)" color={`hsl(${hue + 90} 60% 83%)`}>
              <Flower petals={5} />
            </g>
          </>
        ) : (
          <>
            <path
              d="M-15 112C28 18 112 10 132 69s105-58 130 41v151H-15z"
              fill={`hsl(${hue} 30% 36%)`}
            />
            <path
              d="M-15 166c60-69 94-6 136-24s97-59 141-7v126H-15z"
              fill={`hsl(${hue + 28} 45% 78%)`}
            />
            <path d="M-15 215c82-68 130 23 277-20v66H-15z" fill={`hsl(${hue + 9} 26% 49%)`} />
            <g transform="translate(143 21) scale(.63)" color={`hsl(${hue + 80} 67% 86%)`}>
              <Flower petals={9} />
            </g>
          </>
        )}
        <text
          x="17"
          y="224"
          fill={`hsl(${hue} 20% 96%)`}
          fontSize="9"
          fontFamily="system-ui"
          letterSpacing="3"
        >
          {track?.demo ? 'SONOTUNE SESSIONS' : 'LOCAL SOUNDS'}
        </text>
      </g>
    </svg>
  );
}

export function Modal({
  title,
  children,
  onClose,
  className = '',
  dismissible = true,
}: PropsWithChildren<{
  title: string;
  onClose(): void;
  className?: string;
  dismissible?: boolean;
}>) {
  useLanguage();
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = ref.current!;
    const focusable = () =>
      Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), textarea, select, [tabindex="0"]',
        ),
      ).filter((e) => e.getClientRects().length > 0);
    (dialog.querySelector<HTMLElement>('[data-autofocus]') ?? focusable()[0] ?? dialog).focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && dismissible) {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
      if (event.key === 'Tab') {
        const elements = focusable(),
          first = elements[0],
          last = elements.at(-1);
        if (!first) {
          event.preventDefault();
          return;
        }
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    dialog.addEventListener('keydown', key);
    return () => {
      dialog.removeEventListener('keydown', key);
      previous?.focus();
    };
  }, [onClose, dismissible]);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && dismissible) onClose();
      }}
    >
      <div
        className={`modal ${className}`}
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
        tabIndex={-1}
      >
        <div className="modal-heading">
          <h2 id={id}>{title}</h2>
          {dismissible && (
            <IconButton label={t('Закрыть')} onClick={onClose}>
              <X size={21} />
            </IconButton>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}
export interface MenuItem {
  label: string;
  icon?: ReactNode;
  action(): void;
  danger?: boolean;
  separator?: boolean;
}
export function Menu({
  x,
  y,
  items,
  onClose,
  footer,
}: {
  x: number;
  y: number;
  items: MenuItem[];
  onClose(): void;
  footer?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const menu = ref.current!;
    const rect = menu.getBoundingClientRect();
    menu.style.left = `${Math.max(8, Math.min(x, window.innerWidth - rect.width - 8))}px`;
    menu.style.top = `${Math.max(8, Math.min(y, window.innerHeight - rect.height - 8))}px`;
    menu.querySelector('button')?.focus();
    const close = (event: PointerEvent) => {
      if (!menu.contains(event.target as Node)) onClose();
    };
    document.addEventListener('pointerdown', close);
    window.addEventListener('resize', onClose);
    return () => {
      document.removeEventListener('pointerdown', close);
      window.removeEventListener('resize', onClose);
    };
  }, [x, y, onClose]);
  return (
    <div
      role="menu"
      ref={ref}
      className="context-menu"
      style={{ left: x, top: y }}
      onKeyDown={(e) => {
        const buttons = Array.from(ref.current!.querySelectorAll('button'));
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
          e.preventDefault();
          buttons[
            e.key === 'Home'
              ? 0
              : e.key === 'End'
                ? buttons.length - 1
                : (index + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length
          ]?.focus();
        }
        if (e.key === 'Escape' || e.key === 'Tab') onClose();
      }}
    >
      {items.map((item, i) => (
        <button
          key={i}
          role="menuitem"
          className={`${item.danger ? 'danger-text' : ''} ${item.separator ? 'menu-separated' : ''}`}
          onClick={() => {
            onClose();
            item.action();
          }}
        >
          {item.icon}
          <span>{item.label}</span>
        </button>
      ))}
      {footer && <div className="context-menu-footer">{footer}</div>}
    </div>
  );
}
