import { useStore } from './store';
import { Select } from '../shared/Select';
import { t } from '../shared/i18n';
import type { Settings } from '../shared/types';
import { LanguageOptions } from './LanguageDialog';

export function GeneralPreferences() {
  const settings = useStore((s) => s.settings);
  const playlists = useStore((s) => s.library.playlists);
  const change = (value: Partial<Settings>) => useStore.getState().setSettings(value);
  return (
    <div className="general-preferences">
      <span className="settings-label">{t('Язык интерфейса')}</span>
      <LanguageOptions />
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
    </div>
  );
}
