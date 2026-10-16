import { useEffect, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { AudioLines, Copy, Minus, Square, X } from 'lucide-react';
import { desktop } from '../shared/api';
import { t, useLanguage } from '../shared/i18n';
import { useStore } from './store';
import styles from './TitleBar.module.css';

export function TitleBar() {
  return desktop ? <WindowTitleBar /> : null;
}

function WindowTitleBar() {
  useLanguage();
  const [maximized, setMaximized] = useState(false);
  const [focused, setFocused] = useState(true);
  useEffect(() => {
    const appWindow = getCurrentWindow();
    let active = true;
    let revision = 0;
    let focusChanged = false;
    const unlisten: (() => void)[] = [];
    const refresh = async () => {
      const request = ++revision;
      const value = await appWindow.isMaximized();
      if (active && request === revision) setMaximized(value);
    };
    const subscribe = (pending: Promise<() => void>) => {
      void pending.then((dispose) => (active ? unlisten.push(dispose) : dispose())).catch(() => {});
    };
    subscribe(appWindow.onResized(() => void refresh().catch(() => {})));
    subscribe(
      appWindow.onFocusChanged(({ payload }) => {
        focusChanged = true;
        if (active) setFocused(payload);
      }),
    );
    void refresh().catch(() => {});
    void appWindow
      .isFocused()
      .then((value) => {
        if (active && !focusChanged) setFocused(value);
      })
      .catch(() => {});
    return () => {
      active = false;
      unlisten.forEach((dispose) => dispose());
    };
  }, []);

  const control = (action: 'minimize' | 'toggleMaximize' | 'close') => {
    void (async () => {
      try {
        const appWindow = getCurrentWindow();
        await appWindow[action]();
        if (action === 'toggleMaximize') setMaximized(await appWindow.isMaximized());
      } catch {
        useStore.getState().notify(t('Не удалось изменить состояние окна'), true);
      }
    })();
  };
  return (
    <header className={styles.titlebar} data-focused={focused}>
      <div className={styles.dragRegion} data-tauri-drag-region>
        <span className={styles.brand} aria-hidden="true">
          <AudioLines size={16} />
          SonoTune
        </span>
      </div>
      <div className={styles.controls} role="group" aria-label={t('Управление окном')}>
        <button
          type="button"
          aria-label={t('Свернуть окно')}
          title={t('Свернуть окно')}
          onClick={() => control('minimize')}
        >
          <Minus size={16} />
        </button>
        <button
          type="button"
          aria-label={maximized ? t('Восстановить окно') : t('Развернуть окно')}
          title={maximized ? t('Восстановить окно') : t('Развернуть окно')}
          onClick={() => control('toggleMaximize')}
        >
          {maximized ? <Copy size={14} /> : <Square size={14} />}
        </button>
        <button
          type="button"
          className={styles.close}
          aria-label={t('Закрыть окно')}
          title={t('Закрыть окно')}
          onClick={() => control('close')}
        >
          <X size={17} />
        </button>
      </div>
    </header>
  );
}
