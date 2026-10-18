import { useEffect, useState } from 'react';
import { Copy, FolderOpen, FileAudio } from 'lucide-react';
import { desktop } from '../shared/api';
import { desktopApi, type DesktopPreferences as Preferences } from '../shared/desktop-api';
import { t, localizeError } from '../shared/i18n';
import { useStore } from './store';

export function DesktopPreferences() {
  const [preferences, setPreferences] = useState<Preferences | null>(null);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState('');
  const notify = (error: unknown) => useStore.getState().notify(localizeError(error), true);
  useEffect(() => {
    if (!desktop) return;
    let active = true;
    void desktopApi
      .preferences()
      .then((value) => active && setPreferences(value))
      .catch(notify);
    return () => {
      active = false;
    };
  }, []);
  if (!desktop) return null;
  const change = async (patch: { closeToTray?: boolean; autostart?: boolean }) => {
    setBusy(true);
    try {
      setPreferences(await desktopApi.configure(patch));
    } catch (error) {
      notify(error);
    } finally {
      setBusy(false);
    }
  };
  const copyReport = async () => {
    setBusy(true);
    try {
      const value = await desktopApi.diagnostics();
      setReport(value);
      try {
        await navigator.clipboard.writeText(value);
        useStore.getState().notify(t('Диагностика скопирована'));
      } catch {
        useStore.getState().notify(t('Не удалось скопировать. Текст можно выделить ниже.'), true);
      }
    } catch (error) {
      notify(error);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="desktop-preferences" aria-label={t('Работа приложения')}>
      <span className="settings-label">{t('Работа приложения')}</span>
      <label className="preference-toggle">
        <span>{t('Сворачивать в трей при закрытии')}</span>
        <input
          type="checkbox"
          role="switch"
          disabled={!preferences || busy || !preferences.trayAvailable}
          checked={preferences ? preferences.closeToTray && preferences.trayAvailable : true}
          onChange={(e) => void change({ closeToTray: e.target.checked })}
        />
      </label>
      <label className="preference-toggle">
        <span>{t('Автозапуск при старте системы')}</span>
        <input
          type="checkbox"
          role="switch"
          disabled={!preferences || busy}
          checked={preferences?.autostart ?? false}
          onChange={(e) => void change({ autostart: e.target.checked })}
        />
      </label>
      <p className="field-hint">
        {preferences && !preferences.trayAvailable
          ? t('Трей недоступен. Крестик полностью закроет приложение.')
          : t('Из трея можно открыть плеер, поставить музыку на паузу или полностью выйти.')}
      </p>
      <div className="technical-heading">
        <span className="settings-label">{t('Техническое')}</span>
        <span className="technical-version" aria-label={t('Версия')}>
          v1.1.3
        </span>
      </div>
      <div className="technical-actions">
        <button
          className="button tonal small"
          onClick={() => void desktopApi.openDataFolder().catch(notify)}
        >
          <FolderOpen size={17} />
          {t('Открыть папку данных')}
        </button>
        <button className="button ghost small" disabled={busy} onClick={() => void copyReport()}>
          <Copy size={17} />
          {t('Скопировать диагностику')}
        </button>
        <button
          className="button ghost small"
          disabled={!preferences || busy}
          onClick={() => {
            setBusy(true);
            void desktopApi
              .registerOpenWith()
              .then((value) => {
                setPreferences(value);
                useStore.getState().notify(t('SonoTune добавлен в «Открыть с помощью»'));
              })
              .catch(notify)
              .finally(() => setBusy(false));
          }}
        >
          <FileAudio size={17} />
          {preferences?.associationsRegistered
            ? t('Обновить «Открыть с помощью»')
            : t('Добавить в «Открыть с помощью»')}
        </button>
      </div>
      <p className="field-hint">
        {t(
          'Выбери SonoTune плеером по умолчанию в Windows, чтобы открывать музыку двойным щелчком.',
        )}
      </p>
      {report && (
        <label className="diagnostic-report">
          <span>{t('Диагностика')}</span>
          <textarea readOnly value={report} rows={8} onFocus={(e) => e.target.select()} />
        </label>
      )}
    </section>
  );
}
