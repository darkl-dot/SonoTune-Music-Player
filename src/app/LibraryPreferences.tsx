import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Copy,
  Folder,
  FolderPlus,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { useStore, run } from './store';
import { t } from '../shared/i18n';
import { desktop } from '../shared/api';
import { IconButton } from '../shared/ui';
import { analyzeLibrary } from '../shared/library-health';
import { artistName } from '../shared/utils';

export function LibraryPreferences() {
  const folders = useStore((s) => s.library.folders);
  const tracks = useStore((s) => s.library.tracks);
  const busy = useStore((s) => s.busy);
  const [pending, setPending] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  const [cleanupKind, setCleanupKind] = useState<'unavailable' | 'duplicates' | null>(null);
  const [expanded, setExpanded] = useState<'unavailable' | 'duplicates' | null>(null);
  const health = useMemo(() => analyzeLibrary(tracks), [tracks]);
  const remove = async (path: string) => {
    setRemoving(true);
    await run(() => useStore.getState().removeFolder(path));
    setRemoving(false);
    setPending(null);
  };
  const clean = async (kind: 'unavailable' | 'duplicates') => {
    const ids =
      kind === 'unavailable'
        ? health.unavailable.map((track) => track.id)
        : health.duplicateTrackIds;
    if (!ids.length) return;
    setRemoving(true);
    await run(async () => {
      await useStore.getState().removeTracks(ids);
      useStore
        .getState()
        .notify(
          kind === 'unavailable'
            ? t('Убрано недоступных треков: {count}.', { count: ids.length })
            : t('Убрано повторов: {count}.', { count: ids.length }),
        );
    });
    setRemoving(false);
    setCleanupKind(null);
    setExpanded(null);
  };
  return (
    <div className="library-preferences">
      <span className="settings-label">{t('Папки с музыкой')}</span>
      <div className="folder-list">
        {folders.length ? (
          folders.map((folder) => (
            <div key={folder}>
              <Folder size={18} />
              <span title={folder}>{folder}</span>
              <IconButton
                label={t('Убрать папку из библиотеки')}
                className="folder-remove"
                onClick={() => setPending(folder)}
              >
                <Trash2 size={15} />
              </IconButton>
            </div>
          ))
        ) : (
          <p>{t('Пока не добавлены')}</p>
        )}
      </div>
      {pending && (
        <div
          className="folder-confirm"
          role="alertdialog"
          aria-label={t('Убрать папку из библиотеки?')}
        >
          <p>{t('Треки из этой папки исчезнут из библиотеки. Файлы на диске останутся.')}</p>
          <div className="folder-confirm-actions">
            <button
              className="button danger small"
              disabled={removing}
              onClick={() => void remove(pending)}
            >
              {t('Убрать')}
            </button>
            <button
              className="button ghost small"
              disabled={removing}
              onClick={() => setPending(null)}
            >
              {t('Отмена')}
            </button>
          </div>
        </div>
      )}
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
      <p className="field-hint">
        {desktop
          ? t(
              'Папки с музыкой проверяются постоянно: новые и изменённые файлы появляются в библиотеке сами.',
            )
          : t('В приложении для компьютера папки проверяются постоянно, без ручного обновления.')}
      </p>
      <span className="settings-label">{t('Порядок в библиотеке')}</span>
      <div className="library-health">
        <div className="health-row">
          <div className="health-info">
            <AlertTriangle size={16} />
            <div>
              <strong>{t('Недоступные треки')}</strong>
              <small>
                {health.unavailable.length
                  ? t('Не найдены на диске: {count}', { count: health.unavailable.length })
                  : t('Все файлы на месте')}
              </small>
            </div>
          </div>
          {health.unavailable.length > 0 && (
            <div className="health-actions">
              <IconButton
                label={t('Показать список')}
                onClick={() =>
                  setExpanded((cur) => (cur === 'unavailable' ? null : 'unavailable'))
                }
              >
                {expanded === 'unavailable' ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </IconButton>
              <button
                className="button ghost small danger-text"
                disabled={removing}
                onClick={() => setCleanupKind('unavailable')}
              >
                {t('Почистить')}
              </button>
            </div>
          )}
        </div>
        {expanded === 'unavailable' && health.unavailable.length > 0 && (
          <div className="health-list">
            {health.unavailable.slice(0, 50).map((track) => (
              <div key={track.id} className="health-item">
                <strong>{track.title}</strong>
                <small title={track.path}>{track.path}</small>
              </div>
            ))}
          </div>
        )}
        <div className="health-row">
          <div className="health-info">
            <Copy size={16} />
            <div>
              <strong>{t('Дубликаты')}</strong>
              <small>
                {health.duplicateTrackIds.length
                  ? t('Найдено повторов: {count}', { count: health.duplicateTrackIds.length })
                  : t('Повторов не найдено')}
              </small>
            </div>
          </div>
          {health.duplicateTrackIds.length > 0 && (
            <div className="health-actions">
              <IconButton
                label={t('Показать список')}
                onClick={() => setExpanded((cur) => (cur === 'duplicates' ? null : 'duplicates'))}
              >
                {expanded === 'duplicates' ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </IconButton>
              <button
                className="button ghost small danger-text"
                disabled={removing}
                onClick={() => setCleanupKind('duplicates')}
              >
                {t('Почистить')}
              </button>
            </div>
          )}
        </div>
        {expanded === 'duplicates' && health.duplicateGroups.length > 0 && (
          <div className="health-list">
            {health.duplicateGroups.slice(0, 40).map((group) => (
              <div key={group.key} className="health-item">
                <strong>
                  {group.keep.title} · {artistName(group.keep)}
                </strong>
                <small>
                  {t('Останется: {format} · Уберётся копий: {count}', {
                    format: group.keep.format,
                    count: group.duplicates.length,
                  })}
                </small>
              </div>
            ))}
          </div>
        )}
        {cleanupKind && (
          <div
            className="folder-confirm"
            role="alertdialog"
            aria-label={t('Очистить записи из библиотеки?')}
          >
            <p>
              {cleanupKind === 'unavailable'
                ? t(
                    'Недоступные записи исчезнут из библиотеки и плейлистов. Файлы на диске не затрагиваются.',
                  )
                : t(
                    'Лишние копии исчезнут из библиотеки, лучшая версия каждого трека останется. Файлы на диске не удаляются.',
                  )}
            </p>
            <div className="folder-confirm-actions">
              <button
                className="button danger small"
                disabled={removing}
                onClick={() => void clean(cleanupKind)}
              >
                {t('Убрать из библиотеки')}
              </button>
              <button
                className="button ghost small"
                disabled={removing}
                onClick={() => setCleanupKind(null)}
              >
                {t('Отмена')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
