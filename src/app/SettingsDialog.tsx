import { useState } from 'react';
import type { KeyboardEvent } from 'react';
import { Folder, Monitor, Palette, PictureInPicture2, Settings2, Volume2 } from 'lucide-react';
import { t, useLanguage } from '../shared/i18n';
import { Modal } from '../shared/ui';
import { GeneralPreferences } from './GeneralPreferences';
import { AppearancePreferences } from './AppearancePreferences';
import { AudioPreferences } from './AudioPreferences';
import { LibraryPreferences } from './LibraryPreferences';
import { DesktopPreferences } from './DesktopPreferences';
import { MiniPlayerPreferences } from './MiniPlayerPreferences';

const tabs = [
  { id: 'general', label: 'Общие', icon: Settings2 },
  { id: 'appearance', label: 'Оформление', icon: Palette },
  { id: 'mini', label: 'Мини-плеер', icon: PictureInPicture2 },
  { id: 'audio', label: 'Звук', icon: Volume2 },
  { id: 'library', label: 'Библиотека', icon: Folder },
  { id: 'application', label: 'Приложение', icon: Monitor },
] as const;
type Tab = (typeof tabs)[number]['id'];

export function SettingsDialog({ onClose }: { onClose(): void }) {
  useLanguage();
  const [tab, setTab] = useState<Tab>('general');
  const select = (next: Tab) => {
    setTab(next);
    requestAnimationFrame(() => document.getElementById(`settings-tab-${next}`)?.focus());
  };
  const onKeys = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = tabs.findIndex((item) => item.id === tab);
    const next =
      event.key === 'ArrowRight'
        ? (index + 1) % tabs.length
        : event.key === 'ArrowLeft'
          ? (index - 1 + tabs.length) % tabs.length
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? tabs.length - 1
              : -1;
    if (next < 0) return;
    event.preventDefault();
    select(tabs[next].id);
  };
  return (
    <Modal title={t('Сделайте SonoTune своим')} onClose={onClose} className="settings-modal">
      <div className="settings-tabs" role="tablist" aria-label={t('Настройки')} onKeyDown={onKeys}>
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            id={`settings-tab-${id}`}
            type="button"
            role="tab"
            className="settings-tab"
            aria-selected={tab === id}
            aria-controls="settings-panel"
            tabIndex={tab === id ? 0 : -1}
            title={t(label)}
            onClick={() => setTab(id)}
          >
            <Icon size={16} />
            <span>{t(label)}</span>
          </button>
        ))}
      </div>
      <div
        className="settings-body"
        id="settings-panel"
        role="tabpanel"
        aria-labelledby={`settings-tab-${tab}`}
        tabIndex={-1}
      >
        <div className="settings-panel" key={tab}>
          {tab === 'general' && <GeneralPreferences />}
          {tab === 'appearance' && <AppearancePreferences />}
          {tab === 'mini' && <MiniPlayerPreferences />}
          {tab === 'audio' && <AudioPreferences />}
          {tab === 'library' && <LibraryPreferences />}
          {tab === 'application' && (
            <>
              <DesktopPreferences />
              <div className="settings-about">
                <strong>SonoTune</strong>
                <p>{t('Музыка рядом. Без аккаунтов и облака.')}</p>
              </div>
              <p className="field-hint">{t('Шрифт: Nunito')}</p>
            </>
          )}
        </div>
      </div>
      <div className="settings-footer">
        <span className="technical-version">v{__APP_VERSION__}</span>
      </div>
    </Modal>
  );
}
