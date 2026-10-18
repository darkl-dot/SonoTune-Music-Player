import { useEffect } from 'react';
import { desktop } from '../shared/api';
import { desktopApi } from '../shared/desktop-api';
import { localizeError, useLanguage } from '../shared/i18n';
import { useStore } from './store';

export function DesktopBridge() {
  const language = useLanguage();
  const loaded = useStore((s) => s.loaded);
  useEffect(() => {
    if (!desktop) return;
    void desktopApi
      .configure({ language })
      .catch((e) => useStore.getState().notify(localizeError(e), true));
  }, [language]);
  useEffect(() => {
    if (!desktop || !loaded) return;
    let active = true;
    let revision = 0;
    let dispose: (() => void) | undefined;
    const reveal = (id: string) => {
      if (!active) return;
      localStorage.setItem('sonotune-last-section', 'tracks');
      useStore.setState((s) => ({
        section: 'tracks',
        query: '',
        group: null,
        view: 'list',
        reveal: { id, nonce: (s.reveal?.nonce ?? 0) + 1 },
      }));
    };
    void (async () => {
      dispose = await desktopApi.onExternal((id) => {
        revision++;
        reveal(id);
      });
      if (!active) {
        dispose();
        return;
      }
      const before = revision;
      const id = await desktopApi.pendingExternal();
      if (id && before === revision) reveal(id);
    })().catch((e) => active && useStore.getState().notify(localizeError(e), true));
    return () => {
      active = false;
      dispose?.();
    };
  }, [loaded]);
  return null;
}
