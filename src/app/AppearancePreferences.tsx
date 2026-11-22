import { useState } from 'react';
import { Check, Moon, Monitor, Palette, Sun } from 'lucide-react';
import { t, useLanguage } from '../shared/i18n';
import type { Settings } from '../shared/types';
import { extraThemes } from '../shared/themes';
import { useStore } from './store';

export function AppearancePreferences() {
  useLanguage();
  const settings = useStore((s) => s.settings);
  const [themesOpen, setThemesOpen] = useState(false);
  const activeTheme = extraThemes.find((theme) => theme.id === settings.appearance);
  return (
    <div className="appearance-preferences">
      <span className="settings-label">{t('Тема')}</span>
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
      <button
        type="button"
        className={`button ghost small extra-theme-toggle ${activeTheme ? 'active' : ''}`}
        aria-expanded={themesOpen}
        aria-controls="extra-themes"
        onClick={() => setThemesOpen((value) => !value)}
      >
        <Palette size={16} />
        {t('Дополнительные темы')}
        {activeTheme && <span className="extra-theme-current">{activeTheme.name}</span>}
      </button>
      {themesOpen && (
        <div
          className="extra-themes"
          id="extra-themes"
          role="group"
          aria-label={t('Дополнительные темы')}
        >
          {extraThemes.map((theme) => {
            const selected = settings.appearance === theme.id;
            return (
              <button
                key={theme.id}
                type="button"
                className={`extra-theme ${selected ? 'selected' : ''}`}
                aria-label={theme.name}
                aria-pressed={selected}
                onClick={() => useStore.getState().setSettings({ appearance: theme.id })}
              >
                <span className="theme-swatches" aria-hidden="true">
                  {theme.swatches.map((color) => (
                    <span key={color} style={{ backgroundColor: color }} />
                  ))}
                </span>
                <span className="theme-copy">
                  <strong>{theme.name}</strong>
                  <small>{t(theme.description)}</small>
                </span>
                {selected && <Check size={17} />}
              </button>
            );
          })}
        </div>
      )}
      {activeTheme ? (
        <p className="field-hint">
          {t('В дополнительных темах палитра фиксированная, поэтому оттенки не меняются.')}
        </p>
      ) : (
        <>
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
        </>
      )}
    </div>
  );
}
