import { Pin } from 'lucide-react';
import { useStore } from '../../app/store';
import { t, useLanguage } from '../../shared/i18n';
import { IconButton } from '../../shared/ui';
import type { Track } from '../../shared/types';

export function PinButton({ track, onPin }: { track?: Track | null; onPin?(track: Track): void }) {
  useLanguage();
  const pinned = useStore(
    (s) => !!track && !!s.library.pins?.some((pin) => pin.trackId === track.id),
  );
  return (
    <IconButton
      label={pinned ? t('Изменить закрепление') : t('Закрепить на главной')}
      className={pinned ? 'is-active' : ''}
      aria-haspopup="dialog"
      disabled={!track || !onPin}
      onClick={() => track && onPin?.(track)}
    >
      <Pin size={18} fill={pinned ? 'currentColor' : 'none'} />
    </IconButton>
  );
}
