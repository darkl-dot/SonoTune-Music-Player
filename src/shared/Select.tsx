import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
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
  const [above, setAbove] = useState(false);
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
    trigger.current?.focus();
  };
  const choose = (i: number) => {
    onChange(options[i].value);
    close();
  };
  useLayoutEffect(() => {
    if (!open || !trigger.current || !list.current) return;
    const anchor = trigger.current.getBoundingClientRect();
    const height = list.current.getBoundingClientRect().height;
    const playerTop = document.querySelector('footer')?.getBoundingClientRect().top;
    const limit = playerTop || window.innerHeight;
    setAbove(limit - anchor.bottom < height + 10 && anchor.top > height + 10);
  }, [open]);
  useEffect(() => {
    if (open) list.current?.children[active]?.scrollIntoView?.({ block: 'nearest' });
  }, [active, open]);
  useEffect(() => {
    if (!open) return;
    list.current?.focus();
    const dismiss = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const resize = () => setOpen(false);
    document.addEventListener('pointerdown', dismiss);
    window.addEventListener('resize', resize);
    return () => {
      document.removeEventListener('pointerdown', dismiss);
      window.removeEventListener('resize', resize);
    };
  }, [open]);
  return (
    <div
      className="custom-select"
      ref={root}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false);
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
      {open && (
        <div
          ref={list}
          id={id}
          className={`select-popover ${above ? 'opens-above' : ''}`}
          role="listbox"
          aria-label={label}
          tabIndex={-1}
          aria-activedescendant={`${id}-${active}`}
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
        </div>
      )}
    </div>
  );
}
