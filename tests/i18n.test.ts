import { afterEach, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { english, localizeError, readLanguage, setLanguage, translate } from '../src/shared/i18n';
import { albumKey, groupName, plural } from '../src/shared/utils';

afterEach(() => setLanguage('ru'));
it('restores only a valid saved language and handles unavailable storage', () => {
  expect(readLanguage({ getItem: () => 'en' })).toBe('en');
  expect(readLanguage({ getItem: () => 'ru' })).toBe('ru');
  expect(readLanguage({ getItem: () => 'broken' })).toBeNull();
  expect(
    readLanguage({
      getItem: () => {
        throw Error('blocked');
      },
    }),
  ).toBeNull();
});
it('formats counts and placeholders in both languages without translating user values', () => {
  expect(translate('en', 'Создан плейлист «{name}»', { name: 'Мой плейлист' })).toBe(
    'Created playlist “Мой плейлист”',
  );
  setLanguage('en');
  expect(plural(1)).toBe('1 track');
  expect(plural(22)).toBe('22 tracks');
  expect(groupName(albumKey({ artists: [], album: 'Без альбома' }))).toBe('No album');
  setLanguage('ru');
  expect(plural(22)).toBe('22 трека');
});
it('translates native errors while keeping the track title and technical details intact', () => {
  setLanguage('en');
  expect(localizeError('Не удалось прочитать аудио «Моя песня»: Отсутствует заголовок Opus')).toBe(
    'Could not read audio «Моя песня»: Missing Opus header',
  );
  expect(
    localizeError('Файл изменился вне SonoTune. Пересканируйте библиотеку перед записью.'),
  ).toBe('The file has changed outside SonoTune. Rescan your library before saving.');
});
it('has an English translation for every static UI translation key', () => {
  const missing = new Set<string>();
  function scan(directory: string) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const file = join(directory, entry.name);
      if (entry.isDirectory()) scan(file);
      else if (/\.tsx?$/.test(file) && !file.endsWith('i18n.ts')) {
        const source = ts.createSourceFile(
          file,
          readFileSync(file, 'utf8'),
          ts.ScriptTarget.Latest,
          true,
        );
        function visit(node: ts.Node) {
          if (
            ts.isCallExpression(node) &&
            ts.isIdentifier(node.expression) &&
            node.expression.text === 't' &&
            node.arguments[0] &&
            ts.isStringLiteral(node.arguments[0])
          ) {
            const key = node.arguments[0].text;
            if (/[А-Яа-яЁё]/.test(key) && !english[key]) missing.add(key);
          }
          ts.forEachChild(node, visit);
        }
        visit(source);
      }
    }
  }
  scan(join(process.cwd(), 'src'));
  expect([...missing]).toEqual([]);
});
