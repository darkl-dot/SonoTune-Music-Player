import { useEffect, useState } from 'react';
import type { MouseEvent } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Heart, Maximize2, Pause, Pin, Play, SkipBack, SkipForward, X } from 'lucide-react';
import { initializeMini, run, useStore } from '../../app/store';
import { useTheme } from '../../app/useTheme';
import { api, desktop } from '../../shared/api';
import { desktopApi } from '../../shared/desktop-api';
import { t, useLanguage } from '../../shared/i18n';
import type { Track, VisualizerMode } from '../../shared/types';
import { Artwork } from '../../shared/ui';
import { artistName, trackHue } from '../../shared/utils';
import { PlaybackMode } from '../player/PlaybackMode';
import { VisualizerCanvas } from './VisualizerCanvas';
import styles from './MiniPlayer.module.css';

export function MiniPlayerCard({
  track,
  playing,
  position = 0,
  duration = 0,
  ambient,
  ambientMotion,
  visualizer,
  alwaysOnTop = true,
  preview = false,
  onClose,
}: {
  track?: Track | null;
  playing: boolean;
  position?: number;
  duration?: number;
  ambient: boolean;
  ambientMotion: boolean;
  visualizer: VisualizerMode;
  alwaysOnTop?: boolean;
  preview?: boolean;
  onClose?(): void;
}) {
  useLanguage();
  const [modeMenuOpen, setModeMenuOpen] = useState(false);
  const hue = trackHue(track);
  const percent = duration > 0 ? Math.min(100, Math.max(0, (position / duration) * 100)) : 0;

  const seek = (event: MouseEvent<HTMLDivElement>) => {
    if (preview || !track || duration <= 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width) return;
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    void run(async () => {
      await (await api).seek(ratio * duration);
    });
  };

  return (
    <div
      className={`${styles.shell} ${preview ? styles.previewShell : ''}`}
      data-tauri-drag-region={!preview ? true : undefined}
    >
      {ambient && (
        <div
          className={`${styles.ambient} ${ambientMotion ? styles.ambientMoving : ''}`}
          aria-hidden="true"
        >
          {track?.artwork ? (
            <img className={styles.ambientImage} src={track.artwork} alt="" draggable={false} />
          ) : (
            <div
              className={styles.ambientGlow}
              style={{
                background: `radial-gradient(circle at 30% 25%, hsla(${hue}, 65%, 48%, 0.72), transparent 58%), radial-gradient(circle at 75% 75%, hsla(${(hue + 38) % 360}, 62%, 38%, 0.65), transparent 60%)`,
              }}
            />
          )}
        </div>
      )}
      <div className={styles.vignette} aria-hidden="true" />

      {!preview && (
        <div className={styles.topBar}>
          {desktop && (
            <button
              type="button"
              className={`${styles.btn} ${alwaysOnTop ? styles.btnActive : ''}`}
              aria-label={t('Всегда поверх окон')}
              aria-pressed={alwaysOnTop}
              title={t('Всегда поверх окон')}
              onClick={() => useStore.getState().setSettings({ miniAlwaysOnTop: !alwaysOnTop })}
            >
              <Pin size={14} fill={alwaysOnTop ? 'currentColor' : 'none'} />
            </button>
          )}
          {desktop && (
            <button
              type="button"
              className={styles.btn}
              aria-label={t('Вернуться в основное окно')}
              title={t('Вернуться в основное окно')}
              onClick={() => void desktopApi.showMainWindow().catch(() => {})}
            >
              <Maximize2 size={14} />
            </button>
          )}
          <button
            type="button"
            className={styles.btn}
            aria-label={t('Закрыть мини-плеер')}
            title={t('Закрыть мини-плеер')}
            onClick={() => {
              if (onClose) onClose();
              else if (desktop) void getCurrentWindow().close().catch(() => {});
            }}
          >
            <X size={15} />
          </button>
        </div>
      )}

      <div className={styles.content} data-tauri-drag-region={!preview ? true : undefined}>
        <div className={styles.cover}>
          <Artwork track={track} />
        </div>
        <div className={styles.meta}>
          <strong className={styles.title}>
            {track ? track.title : t('Ваш следующий любимый трек')}
          </strong>
          <span className={styles.artist}>
            {track ? artistName(track) : t('Выберите музыку в библиотеке')}
          </span>
        </div>
      </div>

      <VisualizerCanvas
        mode={visualizer}
        playing={playing}
        hue={hue}
        preview={preview}
        className={styles.visualizer}
      />

      {!preview && (
        <>
          <div
            className={`${styles.controlsBar} ${modeMenuOpen ? styles.controlsBarOpen : ''}`}
            role="group"
            aria-label={t('Управление воспроизведением')}
          >
            <button
              type="button"
              className={`${styles.btn} ${track?.favorite ? styles.btnActive : ''}`}
              aria-label={track?.favorite ? t('Убрать из избранного') : t('В избранное')}
              title={track?.favorite ? t('Убрать из избранного') : t('В избранное')}
              disabled={!track}
              onClick={() => track && void run(() => useStore.getState().favorite(track))}
            >
              <Heart size={15} fill={track?.favorite ? 'currentColor' : 'none'} />
            </button>
            <button
              type="button"
              className={styles.btn}
              aria-label={t('Предыдущий трек')}
              title={t('Предыдущий трек')}
              disabled={!track}
              onClick={() =>
                void run(async () => {
                  await (await api).step(-1);
                })
              }
            >
              <SkipBack size={16} fill="currentColor" />
            </button>
            <button
              type="button"
              className={`${styles.btn} ${styles.playBtn}`}
              aria-label={playing ? t('Пауза') : t('Воспроизвести')}
              title={playing ? t('Пауза') : t('Воспроизвести')}
              disabled={!track}
              onClick={() =>
                void run(async () => {
                  await (await api).toggle();
                })
              }
            >
              {playing ? (
                <Pause size={17} fill="currentColor" />
              ) : (
                <Play size={17} fill="currentColor" />
              )}
            </button>
            <button
              type="button"
              className={styles.btn}
              aria-label={t('Следующий трек')}
              title={t('Следующий трек')}
              disabled={!track}
              onClick={() =>
                void run(async () => {
                  await (await api).step(1);
                })
              }
            >
              <SkipForward size={16} fill="currentColor" />
            </button>
            <PlaybackMode
              buttonClassName={styles.btn}
              activeClassName={styles.btnActive}
              iconSize={15}
              compact
              onOpenChange={setModeMenuOpen}
            />
          </div>
          <div className={styles.progressTrack} onClick={seek} aria-hidden="true">
            <div className={styles.progressFill} style={{ width: `${percent}%` }} />
          </div>
        </>
      )}
    </div>
  );
}

export function MiniPlayerApp() {
  useLanguage();
  useTheme();
  const trackId = useStore((s) => s.playback.trackId);
  const track = useStore((s) => s.library.tracks.find((item) => item.id === trackId));
  const playing = useStore((s) => s.playback.playing);
  const position = useStore((s) => s.playback.position);
  const duration = useStore((s) => s.playback.duration);
  const settings = useStore((s) => s.settings);

  useEffect(() => {
    void initializeMini();
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      const target = event.target;
      if (event.code === 'Space') {
        if (target instanceof Element && target.closest('button,[role="listbox"]')) return;
        event.preventDefault();
        void run(async () => {
          await (await api).toggle();
        });
      }
      if (event.key === 'Escape' && desktop) {
        event.preventDefault();
        void getCurrentWindow().close().catch(() => {});
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <main className={styles.windowShell} aria-label={t('Мини-плеер')}>
      <MiniPlayerCard
        track={track}
        playing={playing}
        position={position}
        duration={duration}
        ambient={settings.miniAmbient !== false}
        ambientMotion={settings.miniAmbientMotion !== false}
        visualizer={settings.miniVisualizer ?? 'both'}
        alwaysOnTop={settings.miniAlwaysOnTop !== false}
      />
    </main>
  );
}

export function WebMiniOverlay() {
  const trackId = useStore((s) => s.playback.trackId);
  const track = useStore((s) => s.library.tracks.find((item) => item.id === trackId));
  const playing = useStore((s) => s.playback.playing);
  const position = useStore((s) => s.playback.position);
  const duration = useStore((s) => s.playback.duration);
  const settings = useStore((s) => s.settings);

  return (
    <aside className={styles.webOverlay} aria-label={t('Мини-плеер')}>
      <MiniPlayerCard
        track={track}
        playing={playing}
        position={position}
        duration={duration}
        ambient={settings.miniAmbient !== false}
        ambientMotion={settings.miniAmbientMotion !== false}
        visualizer={settings.miniVisualizer ?? 'both'}
        alwaysOnTop={settings.miniAlwaysOnTop !== false}
        onClose={() => useStore.getState().setMiniOpen(false)}
      />
    </aside>
  );
}
