import { useState } from 'react';
import { useStore } from './store';
import { Select } from '../shared/Select';
import { t } from '../shared/i18n';
import { desktop } from '../shared/api';
import type { Settings } from '../shared/types';

export function LibraryPreferences() {
  const settings = useStore((s) => s.settings);
  const playlists = useStore((s) => s.library.playlists);
  const [minutes, setMinutes] = useState(String(settings.scanIntervalMinutes ?? 5));
  const [invalid, setInvalid] = useState(false);
  const change = (value: Partial<Settings>) => useStore.getState().setSettings(value);
  const commit = () => {
    const value = Number(minutes);
    const valid = minutes.trim() !== '' && Number.isInteger(value) && value >= 1 && value <= 10080;
    setInvalid(!valid);
    if (valid) change({ scanIntervalMinutes: value });
  };
  return (
    <div className="library-preferences">
      <span className="settings-label">{t('При запуске открывать')}</span>
      <Select
        label={t('Стартовая страница')}
        value={settings.startupPage ?? 'home'}
        onChange={(value) => change({ startupPage: value as Settings['startupPage'] })}
        options={[
          { value: 'home', label: t('Главная') },
          { value: 'tracks', label: t('Все треки') },
          { value: 'artists', label: t('Исполнители') },
          { value: 'albums', label: t('Альбомы') },
          { value: 'genres', label: t('Жанры') },
          { value: 'favorites', label: t('Избранное') },
          { value: 'playlists', label: t('Плейлисты') },
          { value: 'last', label: t('Последний открытый раздел') },
          ...playlists.map((p) => ({
            value: `playlist:${p.id}`,
            label: `${t('Плейлист')}: ${p.name}`,
          })),
        ]}
      />
      <p className="field-hint">
        {t('Трек, очередь и позиция сохраняются. Продолжайте нажатием Play.')}
      </p>
      <label className="preference-toggle">
        <span>{t('Показывать баннер на главной')}</span>
        <input
          type="checkbox"
          role="switch"
          checked={settings.showHomeBanner !== false}
          onChange={(e) => change({ showHomeBanner: e.target.checked })}
        />
      </label>
      <span className="settings-label">{t('Частота фонового сканирования папок')}</span>
      {desktop ? (
        <>
          <Select
            label={t('Фоновое сканирование')}
            value={settings.scanIntervalMinutes ? 'interval' : 'startup'}
            options={[
              { value: 'startup', label: t('При старте приложения') },
              { value: 'interval', label: t('Раз в указанное число минут') },
            ]}
            onChange={(value) => {
              if (value === 'startup') {
                change({ scanIntervalMinutes: null });
                setInvalid(false);
              } else {
                const n = Number(minutes);
                const valid = Number.isInteger(n) && n >= 1 && n <= 10080;
                const interval = valid ? n : 5;
                setMinutes(String(interval));
                setInvalid(false);
                change({ scanIntervalMinutes: interval });
              }
            }}
          />
          {!!settings.scanIntervalMinutes && (
            <label className="scan-minutes">
              <span>{t('Раз в')}</span>
              <input
                type="number"
                aria-label={t('Интервал в минутах')}
                min={1}
                max={10080}
                step={1}
                value={minutes}
                aria-invalid={invalid}
                onChange={(e) => setMinutes(e.target.value)}
                onBlur={commit}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    commit();
                  }
                }}
              />
              <span>{t('минут')}</span>
            </label>
          )}
          {invalid && (
            <p className="field-error" role="alert">
              {t('Укажите целое число от 1 до 10080 минут.')}
            </p>
          )}
          <p className="field-hint">
            {t(
              'При каждом запуске папки проверяются всегда. Неизменённые файлы не разбираются повторно.',
            )}
          </p>
        </>
      ) : (
        <p className="field-hint">
          {t('Автоматическое сканирование доступно в приложении для компьютера.')}
        </p>
      )}
    </div>
  );
}
