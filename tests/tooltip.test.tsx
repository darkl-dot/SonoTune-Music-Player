// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Tooltips } from '../src/shared/Tooltip';

const rect = {
  left: 10,
  top: 200,
  right: 110,
  bottom: 230,
  width: 100,
  height: 30,
  x: 10,
  y: 200,
  toJSON() {},
};
beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(rect as DOMRect);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});
const advance = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });

it('shows a themed tooltip after a delay instead of the native one', () => {
  render(
    <>
      <Tooltips />
      <button title="Громкость: 70%">x</button>
    </>,
  );
  const button = screen.getByRole('button', { name: 'x' });
  fireEvent.pointerOver(button, { pointerType: 'mouse' });
  advance(400);
  expect(screen.queryByRole('tooltip')).toBeNull();
  expect(button.hasAttribute('title')).toBe(false);
  advance(100);
  expect(screen.getByRole('tooltip').textContent).toBe('Громкость: 70%');
  fireEvent.pointerOut(button, { relatedTarget: document.body });
  expect(screen.queryByRole('tooltip')).toBeNull();
  expect(button.getAttribute('title')).toBe('Громкость: 70%');
});

it('reads data-tooltip, clears on wheel and hovering another element', () => {
  render(
    <>
      <Tooltips />
      <span data-tooltip="Первая">a</span>
      <span data-tooltip="Вторая">b</span>
    </>,
  );
  fireEvent.pointerOver(screen.getByText('a'), { pointerType: 'mouse' });
  advance(500);
  expect(screen.getByRole('tooltip').textContent).toBe('Первая');
  fireEvent.pointerOver(screen.getByText('b'), { pointerType: 'mouse' });
  advance(500);
  expect(screen.getByRole('tooltip').textContent).toBe('Вторая');
  fireEvent.wheel(document, { deltaY: 12 });
  expect(screen.queryByRole('tooltip')).toBeNull();
  fireEvent.pointerOver(screen.getByText('a'), { pointerType: 'touch' });
  advance(500);
  expect(screen.queryByRole('tooltip')).toBeNull();
});

it('hides the tooltip when the pointer leaves a nested child directly', () => {
  render(
    <>
      <Tooltips />
      <button title="Настройки">
        <span>Настройки</span>
      </button>
    </>,
  );
  const button = screen.getByRole('button', { name: 'Настройки' });
  const label = screen.getByText('Настройки');
  fireEvent.pointerOver(label, { pointerType: 'mouse' });
  advance(500);
  expect(screen.getByRole('tooltip').textContent).toBe('Настройки');
  fireEvent.pointerOut(label, { relatedTarget: document.body });
  expect(screen.queryByRole('tooltip')).toBeNull();
  expect(button.getAttribute('title')).toBe('Настройки');
});
