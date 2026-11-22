import { AudioLines, Layers, X } from 'lucide-react';
import { t, useLanguage } from '../shared/i18n';
import type { VisualizerMode } from '../shared/types';
import { MiniPlayerCard } from '../features/mini/MiniPlayer';
import { useStore } from './store';

const barHeights = [18, 34, 24, 42, 28, 38, 22, 46, 30, 40, 26, 36];

function VisualizerThumb({ mode }: { mode: VisualizerMode }) {
  if (mode === 'off') {
    return (
      <span className="visualizer-thumb" aria-hidden="true">
        <X size={18} />
      </span>
    );
  }
  return (
    <span className="visualizer-thumb" aria-hidden="true">
      <svg viewBox="0 0 120 56" preserveAspectRatio="none">
        {(mode === 'bars' || mode === 'both') &&
          barHeights.map((height, index) => (
            <rect
              key={index}
              x={5 + index * 9.5}
              y={56 - height}
              width="6.5"
              height={height}
              rx="2"
              className="visualizer-thumb-bar"
            />
          ))}
        {(mode === 'wave' || mode === 'both') && (
          <>
            <path
              d="M0 42 C14 34, 22 24, 34 32 C46 40, 56 18, 70 28 C84 38, 94 22, 106 30 C112 34, 116 36, 120 34"
              className="visualizer-thumb-wave-back"
            />
            <path
              d="M0 36 C12 20, 22 40, 36 24 C48 12, 60 36, 74 20 C88 8, 98 34, 112 22 L120 26"
              className="visualizer-thumb-wave"
            />
          </>
        )}
      </svg>
    </span>
  );
}

const visualizerOptions: { value: VisualizerMode; label: string }[] = [
  { value: 'off', label: 'Без него' },
  { value: 'bars', label: 'Столбики' },
  { value: 'wave', label: 'Волна' },
  { value: 'both', label: 'Столбики и волна' },
];

export function MiniPlayerPreferences() {
  useLanguage();
  const settings = useStore((s) => s.settings);
  const trackId = useStore((s) => s.playback.trackId);
  const playing = useStore((s) => s.playback.playing);
  const tracks = useStore((s) => s.library.tracks);
  const previewTrack = tracks.find((item) => item.id === trackId) ?? tracks[0] ?? null;

  const alwaysOnTop = settings.miniAlwaysOnTop !== false;
  const ambient = settings.miniAmbient !== false;
  const ambientMotion = settings.miniAmbientMotion !== false;
  const visualizer: VisualizerMode = settings.miniVisualizer ?? 'both';

  return (
    <div className="mini-preferences">
      <div className="mini-prefs-preview">
        <MiniPlayerCard
          track={previewTrack}
          playing={playing}
          ambient={ambient}
          ambientMotion={ambientMotion}
          visualizer={visualizer}
          alwaysOnTop={alwaysOnTop}
          preview
        />
      </div>

      <span className="settings-label settings-label-icon">
        <Layers size={14} />
        {t('Окно и фон')}
      </span>
      <label className="preference-toggle">
        <span>{t('Всегда поверх окон')}</span>
        <input
          type="checkbox"
          role="switch"
          checked={alwaysOnTop}
          onChange={(e) => useStore.getState().setSettings({ miniAlwaysOnTop: e.target.checked })}
        />
      </label>
      <label className="preference-toggle">
        <span>{t('Подсветка от обложки')}</span>
        <input
          type="checkbox"
          role="switch"
          checked={ambient}
          onChange={(e) => useStore.getState().setSettings({ miniAmbient: e.target.checked })}
        />
      </label>
      <label className="preference-toggle">
        <span>{t('Плавное движение фона')}</span>
        <input
          type="checkbox"
          role="switch"
          disabled={!ambient}
          checked={ambient && ambientMotion}
          onChange={(e) => useStore.getState().setSettings({ miniAmbientMotion: e.target.checked })}
        />
      </label>

      <span className="settings-label settings-label-icon">
        <AudioLines size={14} />
        {t('Визуализатор')}
      </span>
      <div className="visualizer-grid" role="group" aria-label={t('Визуализатор')}>
        {visualizerOptions.map((option) => {
          const selected = visualizer === option.value;
          return (
            <button
              key={option.value}
              type="button"
              className={`visualizer-card ${selected ? 'selected' : ''}`}
              aria-pressed={selected}
              onClick={() => useStore.getState().setSettings({ miniVisualizer: option.value })}
            >
              <VisualizerThumb mode={option.value} />
              <span>{t(option.label)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
