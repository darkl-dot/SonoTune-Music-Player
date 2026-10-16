// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { Select } from '../src/shared/Select';
import globalCss from '../src/app/styles.css?raw';
import extrasCss from '../src/app/enhancements.css?raw';
import { setLanguage } from '../src/shared/i18n';

const options = [
  { value: 'added', label: 'Recently added' },
  { value: 'title', label: 'By title' },
  { value: 'artist', label: 'By artist' },
  { value: 'duration', label: 'By duration' },
];
function Example() {
  const [value, setValue] = useState('added');
  return <Select label="Sort tracks" value={value} options={options} onChange={setValue} />;
}
afterEach(() => {
  cleanup();
  setLanguage('ru');
  vi.restoreAllMocks();
  document.querySelectorAll('[data-select-test]').forEach((e) => e.remove());
});

it('supports keyboard selection, typeahead, Escape and focus restoration', () => {
  render(<Example />);
  const trigger = screen.getByRole('button', { name: 'Sort tracks' });
  fireEvent.keyDown(trigger, { key: 'ArrowDown' });
  const list = screen.getByRole('listbox');
  expect(document.activeElement).toBe(list);
  fireEvent.keyDown(list, { key: 'End' });
  fireEvent.keyDown(list, { key: 'Enter' });
  expect(trigger.textContent).toBe('By duration');
  expect(document.activeElement).toBe(trigger);
  fireEvent.click(trigger);
  fireEvent.keyDown(screen.getByRole('listbox'), { key: 'r' });
  fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Enter' });
  expect(trigger.textContent).toBe('Recently added');
  fireEvent.click(trigger);
  fireEvent.keyDown(screen.getByRole('listbox'), { key: 'ArrowDown' });
  fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Escape' });
  expect(trigger.textContent).toBe('Recently added');
  expect(screen.queryByRole('listbox')).toBeNull();
});

it('dismisses on outside click and on Tab leaving the control', () => {
  render(
    <>
      <Example />
      <button>Outside</button>
    </>,
  );
  const trigger = screen.getByRole('button', { name: 'Sort tracks' });
  fireEvent.click(trigger);
  fireEvent.pointerDown(screen.getByText('Outside'));
  expect(screen.queryByRole('listbox')).toBeNull();
  fireEvent.click(trigger);
  fireEvent.blur(screen.getByRole('listbox'), { relatedTarget: screen.getByText('Outside') });
  expect(screen.queryByRole('listbox')).toBeNull();
});

it('uses theme colors and opens above when the player leaves insufficient space below', () => {
  const style = document.createElement('style');
  style.dataset.selectTest = '';
  style.textContent =
    globalCss + extrasCss + ':root { --surface: #252127; --text: #eee9f0; --outline: #6b5c70; }';
  document.head.append(style);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    return {
      top: this.tagName === 'FOOTER' ? 510 : this.classList.contains('select-trigger') ? 430 : 0,
      bottom: 468,
      height: this.classList.contains('select-popover') ? 176 : 38,
      width: 225,
      left: 20,
      right: 245,
      x: 20,
      y: 430,
      toJSON() {},
    };
  });
  render(
    <>
      <Example />
      <footer />
    </>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Sort tracks' }));
  const list = screen.getByRole('listbox');
  expect(list.classList.contains('opens-above')).toBe(true);
  expect(getComputedStyle(list).backgroundColor).toBe('#252127');
  expect(getComputedStyle(list).borderRadius).toBe('17px');
  expect(document.querySelector('select')).toBeNull();
});

it('switches font families with the interface language and retains a Cyrillic fallback', () => {
  const style = document.createElement('style');
  style.dataset.selectTest = '';
  style.textContent = globalCss + extrasCss;
  document.head.append(style);
  setLanguage('ru');
  expect(getComputedStyle(document.documentElement).fontFamily).toContain('Nunito');
  expect(getComputedStyle(document.documentElement).fontFamily).not.toContain('Varela Round');
  setLanguage('en');
  const family = getComputedStyle(document.documentElement).fontFamily;
  expect(family.indexOf('Varela Round')).toBeLessThan(family.indexOf('Nunito'));
  expect(family).toContain('Nunito');
});
