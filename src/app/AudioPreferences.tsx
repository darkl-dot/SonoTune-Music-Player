import { useEffect, useState } from 'react';
import { api, desktop } from '../shared/api';
import { run, useStore } from './store';
import { Select } from '../shared/Select';
import { t, useLanguage } from '../shared/i18n';
export function AudioPreferences() {
  useLanguage();
  const settings = useStore((s) => s.settings);
  const [outputs, setOutputs] = useState<{ id: string; name: string }[]>([]);
  const [error, setError] = useState('');
  const [measured, setMeasured] = useState<[number, number] | null>(null);
  const refresh = () => {
    void api
      .then((service) => service.audioOutputs())
      .then(setOutputs)
      .catch(() => setError(t('Не удалось получить список устройств')));
  };
  useEffect(() => {
    if (!desktop) return;
    refresh();
    let active = true;
    const load = () => {
      void api
        .then((service) => service.loudnessStats())
        .then((value) => {
          if (active) setMeasured(value);
        })
        .catch(() => {});
    };
    load();
    const timer = setInterval(load, 3000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);
  if (!desktop)
    return (
      <p className="field-hint">{t('Звуковые настройки доступны в приложении для компьютера.')}</p>
    );
  return (
    <div className="audio-preferences">
      <span className="settings-label">{t('Воспроизведение')}</span>
      <label className="preference-toggle">
        <span>{t('Без пауз между треками')}</span>
        <input
          type="checkbox"
          role="switch"
          checked={settings.gapless !== false}
          onChange={(e) => useStore.getState().setSettings({ gapless: e.target.checked })}
        />
      </label>
      <p className="field-hint">
        {t('Gapless: следующий трек готов заранее. Тишина в самой записи сохраняется.')}
      </p>
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
      <span className="settings-label">{t('Выравнивание громкости')}</span>
      <Select
        label={t('Выравнивание громкости')}
        value={settings.normalization ?? 'off'}
        options={[
          { value: 'off', label: t('Выключено') },
          { value: 'track', label: t('По трекам') },
          { value: 'album', label: t('По альбомам') },
        ]}
        onChange={(value) =>
          useStore.getState().setSettings({ normalization: value as 'off' | 'track' | 'album' })
        }
      />
      <p className="field-hint">
        {t(
          'Тихие записи звучат громче, громкие — тише. Цель −18 LUFS; файлы без измерения играют как есть.',
        )}
      </p>
      <label className="preference-toggle">
        <span>{t('Защита от перегрузки')}</span>
        <input
          type="checkbox"
          role="switch"
          checked={settings.limiter !== false}
          onChange={(e) => useStore.getState().setSettings({ limiter: e.target.checked })}
        />
      </label>
      <p className="field-hint">
        {t('Лимитер удерживает пики на −1 dBFS, чтобы эквалайзер и усиление не давали искажений.')}
      </p>
      {measured && measured[1] > 0 && (
        <p className="field-hint" role="status">
          {t('Громкость измерена: {done} из {total}', {
            done: measured[0],
            total: measured[1],
          })}
        </p>
      )}
      <button
        className="button ghost small"
        onClick={() => void run(async () => (await api).recomputeLoudness())}
      >
        {t('Пересчитать громкость')}
      </button>
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
