import { useEffect, useState } from 'react';
import { api, desktop } from '../shared/api';
import { useStore } from './store';
import { Select } from '../shared/Select';
import { t, useLanguage } from '../shared/i18n';
export function AudioPreferences() {
  useLanguage();
  const settings = useStore((s) => s.settings);
  const [outputs, setOutputs] = useState<{ id: string; name: string }[]>([]);
  const [error, setError] = useState('');
  const refresh = () => {
    void api
      .then((service) => service.audioOutputs())
      .then(setOutputs)
      .catch(() => setError(t('Не удалось получить список устройств')));
  };
  useEffect(() => {
    if (desktop) refresh();
  }, []);
  if (!desktop) return null;
  return (
    <div className="audio-preferences">
      <span className="settings-label">{t('Звук')}</span>
      <label className="audio-crossfade" htmlFor="crossfade-duration">
        {t('Кроссфейд')}
        <output>
          {settings.crossfade ?? 0} {t('с')}
        </output>
      </label>
      <input
        id="crossfade-duration"
        aria-label={t('Длительность кроссфейда')}
        type="range"
        min="0"
        max="12"
        step="0.5"
        value={settings.crossfade ?? 0}
        onChange={(e) => useStore.getState().setSettings({ crossfade: Number(e.target.value) })}
      />
      <p className="field-hint">
        {t('Плавное перекрытие треков. 0 с — выключено. Для коротких треков переход сокращается.')}
      </p>
      <span className="settings-label">{t('Устройство вывода')}</span>
      <Select
        label={t('Устройство вывода')}
        value={settings.outputDevice ?? ''}
        options={[
          { value: '', label: t('По умолчанию Windows') },
          ...outputs.map((item) => ({ value: item.id, label: item.name })),
          ...(settings.outputDevice && !outputs.some((item) => item.id === settings.outputDevice)
            ? [{ value: settings.outputDevice, label: t('Выбранное устройство недоступно') }]
            : []),
        ]}
        onChange={(value) => useStore.getState().setSettings({ outputDevice: value || null })}
      />
      <button className="button ghost small" onClick={refresh}>
        {t('Обновить устройства')}
      </button>
      {error && (
        <p className="field-hint" role="status">
          {error}
        </p>
      )}
    </div>
  );
}
