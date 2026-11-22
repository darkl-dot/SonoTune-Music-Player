import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';

export interface SelectOption {
  value: string;
  label: string;
}
/** A themed, keyboard accessible listbox instead of the OS-owned select popup. */
export function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly SelectOption[];
  onChange(value: string): void;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [placement, setPlacement] = useState<{
    above: boolean;
    left: number;
    width: number;
    top?: number;
    bottom?: number;
    maxHeight: number;
  } | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const id = useId();
  const index = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );
  const show = () => {
    setActive(index);
    setOpen(true);
  };
  const close = () => {
    setOpen(false);
    setPlacement(null);
    trigger.current?.focus();
  };
  const choose = (i: number) => {
    onChange(options[i].value);
    close();
  };
  useLayoutEffect(() => {
    if (!open || !trigger.current) return;
    const place = () => {
      const anchor = trigger.current!.getBoundingClientRect();
      const inDialog = !!trigger.current!.closest('[role="dialog"]');
      const player = inDialog ? null : document.querySelector('footer');
      const limit = Math.min(
        player?.getBoundingClientRect().top ?? window.innerHeight,
        window.innerHeight,
      );
      const height =
        list.current?.scrollHeight || list.current?.getBoundingClientRect().height || 0;
      const spaceBelow = limit - anchor.bottom - 8;
      const spaceAbove = anchor.top - 8;
      // Inside a dialog the list always opens downward and scrolls within the free space,
      // so it never covers the header or the tabs above the trigger.
      const above = !inDialog && height + 10 > spaceBelow && spaceAbove > spaceBelow;
      const maxHeight = Math.max(120, Math.min(320, above ? spaceAbove : spaceBelow));
      const width = Math.min(Math.max(anchor.width, 225), window.innerWidth - 16);
      setPlacement({
        above,
        left: Math.min(Math.max(anchor.left, 8), window.innerWidth - width - 8),
        width,
        top: above ? undefined : anchor.bottom + 6,
        bottom: above ? window.innerHeight - anchor.top + 6 : undefined,
        maxHeight,
      });
    };
    place();
    window.addEventListener('resize', place);
    document.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      document.removeEventListener('scroll', place, true);
    };
  }, [open]);
  useEffect(() => {
    if (open) list.current?.children[active]?.scrollIntoView?.({ block: 'nearest' });
  }, [active, open]);
  useEffect(() => {
    if (!open) return;
    list.current?.focus();
    const dismiss = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!root.current?.contains(target) && !list.current?.contains(target)) setOpen(false);
    };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [open]);
  return (
    <div
      className="custom-select"
      ref={root}
      onBlur={(e) => {
        const next = e.relatedTarget as Node | null;
        if (!root.current?.contains(next) && !list.current?.contains(next)) setOpen(false);
      }}
    >
      <button
        ref={trigger}
        type="button"
        className={`select-trigger ${open ? 'is-open' : ''}`}
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => (open ? close() : show())}
        onKeyDown={(e) => {
          if (['ArrowDown', 'ArrowUp'].includes(e.key)) {
            e.preventDefault();
            show();
          }
        }}
      >
        <span>{options[index]?.label}</span>
        <ChevronDown size={15} />
      </button>
      {open &&
        createPortal(
          <div
            ref={list}
            id={id}
            className={`select-popover ${placement?.above ? 'opens-above' : ''}`}
            style={
              placement
                ? {
                    left: placement.left,
                    width: placement.width,
                    top: placement.top,
                    bottom: placement.bottom,
                    maxHeight: placement.maxHeight,
                  }
                : { visibility: 'hidden', left: -10000, top: 0, maxHeight: 320 }
            }
            role="listbox"
            aria-label={label}
            tabIndex={-1}
            aria-activedescendant={`${id}-${active}`}
            onBlur={(e) => {
              const next = e.relatedTarget as Node | null;
              if (!list.current?.contains(next) && !root.current?.contains(next)) setOpen(false);
            }}
            onKeyDown={(e) => {
              if (['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', ' ', 'Escape'].includes(e.key))
                e.preventDefault();
              if (e.key === 'Escape') {
                e.stopPropagation();
                close();
              } else if (e.key === 'Enter' || e.key === ' ') choose(active);
              else if (e.key === 'Home') setActive(0);
              else if (e.key === 'End') setActive(options.length - 1);
              else if (['ArrowDown', 'ArrowUp'].includes(e.key))
                setActive(
                  (i) => (i + (e.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length,
                );
              else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
                const match = options.findIndex(
                  (o, i) =>
                    i > active && o.label.toLocaleLowerCase().startsWith(e.key.toLocaleLowerCase()),
                );
                const fallback = options.findIndex((o) =>
                  o.label.toLocaleLowerCase().startsWith(e.key.toLocaleLowerCase()),
                );
                if (match >= 0 || fallback >= 0) setActive(match >= 0 ? match : fallback);
              }
            }}
          >
            {options.map((option, i) => (
              <div
                key={option.value}
                id={`${id}-${i}`}
                role="option"
                aria-selected={option.value === value}
                className={`select-option ${i === active ? 'focused' : ''}`}
                onPointerMove={() => setActive(i)}
                onClick={() => choose(i)}
              >
                <span>{option.label}</span>
                {option.value === value && <Check size={16} />}
              </div>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}
