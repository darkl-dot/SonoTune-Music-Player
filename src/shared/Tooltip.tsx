import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const DELAY = 450;
const GAP = 9;

interface Tip {
  text: string;
  center: number;
  top: number;
  bottom: number;
  above: boolean;
}

/**
 * Replaces the operating-system tooltip for elements that carry `title` or
 * `data-tooltip` with a themed popover. The native title is removed while the
 * custom tooltip is visible so both never show at once.
 */
export function Tooltips() {
  const [tip, setTip] = useState<Tip | null>(null);
  const [left, setLeft] = useState(0);
  const layer = useRef<HTMLDivElement>(null);
  const target = useRef<HTMLElement | null>(null);
  const content = useRef('');
  const observer = useRef<MutationObserver | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const restore = () => {
      observer.current?.disconnect();
      observer.current = null;
      const element = target.current;
      if (!element) return;
      const value = element.dataset.tooltipBackup;
      if (value !== undefined) {
        if (!element.hasAttribute('title')) element.setAttribute('title', value);
        delete element.dataset.tooltipBackup;
      }
      target.current = null;
    };
    const hide = () => {
      clearTimeout(timer.current);
      restore();
      setTip(null);
    };
    /** Keep removing a title that React puts back while the tooltip is open. */
    const watch = (element: HTMLElement) => {
      observer.current?.disconnect();
      observer.current = new MutationObserver(() => {
        const title = element.getAttribute('title');
        if (title === null) return;
        element.dataset.tooltipBackup = title;
        content.current = title;
        element.removeAttribute('title');
        setTip((current) => (current ? { ...current, text: title.trim() } : current));
      });
      observer.current.observe(element, { attributes: true, attributeFilter: ['title'] });
    };
    const show = (element: HTMLElement) => {
      if (element === target.current) return;
      clearTimeout(timer.current);
      hide();
      const text = element.dataset.tooltip ?? element.getAttribute('title');
      if (!text?.trim()) return;
      content.current = text;
      if (element.hasAttribute('title')) {
        element.dataset.tooltipBackup = text;
        element.removeAttribute('title');
      }
      target.current = element;
      watch(element);
      timer.current = setTimeout(() => {
        if (target.current !== element) return;
        const rect = element.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        setTip({
          text: content.current.trim(),
          center: rect.left + rect.width / 2,
          top: rect.top - GAP,
          bottom: rect.bottom + GAP,
          above: rect.top > 64,
        });
      }, DELAY);
    };
    const elementAt = (value: EventTarget | null) =>
      value instanceof Element ? value.closest<HTMLElement>('[title],[data-tooltip]') : null;
    const over = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return;
      const element = elementAt(event.target);
      if (element) show(element);
    };
    const out = (event: PointerEvent) => {
      const element = target.current;
      if (!element) return;
      const related = event.relatedTarget as Node | null;
      if (related && element.contains(related)) return;
      if (!related || (event.target instanceof Node && element.contains(event.target))) hide();
    };
    const focus = (event: FocusEvent) => {
      const element = elementAt(event.target);
      if (element) show(element);
    };
    const blur = (event: FocusEvent) => {
      if (target.current && event.target === target.current) hide();
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') hide();
    };
    document.addEventListener('pointerover', over);
    document.addEventListener('pointerout', out);
    document.addEventListener('pointerdown', hide);
    document.addEventListener('focusin', focus);
    document.addEventListener('focusout', blur);
    document.addEventListener('keydown', key);
    document.addEventListener('wheel', hide, { passive: true });
    document.addEventListener('scroll', hide, true);
    window.addEventListener('blur', hide);
    return () => {
      clearTimeout(timer.current);
      restore();
      document.removeEventListener('pointerover', over);
      document.removeEventListener('pointerout', out);
      document.removeEventListener('pointerdown', hide);
      document.removeEventListener('focusin', focus);
      document.removeEventListener('focusout', blur);
      document.removeEventListener('keydown', key);
      document.removeEventListener('wheel', hide);
      document.removeEventListener('scroll', hide, true);
      window.removeEventListener('blur', hide);
    };
  }, []);

  useLayoutEffect(() => {
    if (!tip || !layer.current) return;
    const half = layer.current.getBoundingClientRect().width / 2;
    const min = half + 8;
    const max = Math.max(min, window.innerWidth - half - 8);
    setLeft(Math.min(Math.max(tip.center, min), max));
  }, [tip]);

  if (!tip) return null;
  return createPortal(
    <div
      ref={layer}
      className="app-tooltip"
      role="tooltip"
      style={{
        left,
        top: tip.above ? tip.top : tip.bottom,
        transform: tip.above ? 'translate(-50%, -100%)' : 'translate(-50%, 0)',
      }}
    >
      {tip.text}
    </div>,
    document.body,
  );
}
