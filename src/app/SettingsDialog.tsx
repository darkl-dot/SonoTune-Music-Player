import { t, useLanguage } from '../shared/i18n';
import { Check, Folder, FolderPlus, Moon, Monitor, RefreshCw, Sun } from 'lucide-react';
import { Modal } from '../shared/ui';
import { useStore } from './store';
import { desktop } from '../shared/api';
import type { Settings } from '../shared/types';
import { LanguageOptions } from './LanguageDialog';
import { LibraryPreferences } from './LibraryPreferences';

export function SettingsDialog({ onClose }: { onClose(): void }) {
  useLanguage();
  const settings = useStore((s) => s.settings);
  const folders = useStore((s) => s.library.folders);
  const busy = useStore((s) => s.busy);
  return (
    <Modal title={t('Сделайте SonoTune своим')} onClose={onClose} className="settings-modal">
      <p className="dialog-description">{t('Ваши цвета, ваша музыка, ваш ритм.')}</p>
      <span className="settings-label">{t('Язык интерфейса')}</span>
      <LanguageOptions />
      <p className="field-hint">{t('Шрифт: Nunito')}</p>
      <LibraryPreferences />
      <span className="settings-label">{t('Оформление')}</span>
      <div className="appearance-options">
        {(
          [
            ['light', t('Светлое'), Sun],
            ['dark', t('Тёмное'), Moon],
            ['system', t('Системное'), Monitor],
          ] as const
        ).map(([value, label, Icon]) => (
          <button
            key={value}
            className={settings.appearance === value ? 'selected' : ''}
            aria-pressed={settings.appearance === value}
            onClick={() => useStore.getState().setSettings({ appearance: value })}
          >
            <Icon size={21} />
            {label}
          </button>
        ))}
      </div>
      <span className="settings-label">{t('Цветовая палитра')}</span>
      <div className="palette-options">
        {(
          [
            { value: 'adaptive', label: t('От обложки'), hue: 280 },
            { value: 'lilac', label: t('Сирень'), hue: 275 },
            { value: 'sage', label: t('Шалфей'), hue: 145 },
            { value: 'peach', label: t('Персик'), hue: 25 },
          ] as { value: Settings['palette']; label: string; hue: number }[]
        ).map((palette) => (
          <button
            key={palette.value}
            aria-pressed={settings.palette === palette.value}
            onClick={() => useStore.getState().setSettings({ palette: palette.value })}
          >
            <span
              className={`palette-swatch ${palette.value === 'adaptive' ? 'adaptive-swatch' : ''}`}
              style={{ backgroundColor: `hsl(${palette.hue} 40% 80%)` }}
            >
              {settings.palette === palette.value && <Check size={19} />}
            </span>
            {palette.label}
          </button>
        ))}
      </div>
      <span className="settings-label">{t('Папки с музыкой')}</span>
      <div className="folder-list">
        {folders.length ? (
          folders.map((folder) => (
            <div key={folder}>
              <Folder size={18} />
              <span title={folder}>{folder}</span>
            </div>
          ))
        ) : (
          <p>{t('Пока не добавлены')}</p>
        )}
      </div>
      <div className="inline-actions">
        <button
          className="button tonal small"
          disabled={busy}
          onClick={() => void useStore.getState().importFolder()}
        >
          <FolderPlus size={17} />
          {t('Добавить папку')}
        </button>
        {desktop && (
          <button
            className="button ghost small"
            disabled={busy || !folders.length}
            onClick={() => void useStore.getState().importFolder(true)}
          >
            <RefreshCw size={16} />
            {t('Пересканировать')}
          </button>
        )}
      </div>
      <div className="settings-about">
        <strong>
          SonoTune <span>0.5.0</span>
        </strong>
        <p>{t('Музыка рядом. Без аккаунтов и облака.')}</p>
        <span>
          {desktop
            ? t('Локальный аудиодвижок · Tauri + Rust')
            : t('Браузерный режим · теги сохраняются в JSON')}
        </span>
      </div>
    </Modal>
  );
}
