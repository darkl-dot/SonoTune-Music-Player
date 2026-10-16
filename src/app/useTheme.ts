import { useEffect, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useStore } from './store';
import { trackHue } from '../shared/utils';
import { desktop } from '../shared/api';

export function useTheme() {
  const settings = useStore((s) => s.settings);
  const id = useStore((s) => s.playback.trackId);
  const track = useStore((s) => s.library.tracks.find((t) => t.id === id));
  const [hue, setHue] = useState(275);
  useEffect(() => {
    const fallback = track ? trackHue(track) : 275;
    setHue(fallback);
    if (!track?.artwork) return;
    let active = true;
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 24;
        const context = canvas.getContext('2d', { willReadFrequently: true })!;
        context.drawImage(image, 0, 0, 24, 24);
        const data = context.getImageData(0, 0, 24, 24).data;
        const bins = new Float64Array(36);
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i] / 255,
            g = data[i + 1] / 255,
            b = data[i + 2] / 255;
          const max = Math.max(r, g, b),
            min = Math.min(r, g, b),
            delta = max - min;
          if (delta < 0.08 || max < 0.12 || min > 0.88 || data[i + 3] < 128) continue;
          let h =
            max === r
              ? ((g - b) / delta) % 6
              : max === g
                ? (b - r) / delta + 2
                : (r - g) / delta + 4;
          h = (h * 60 + 360) % 360;
          bins[Math.floor(h / 10)] += delta * (0.5 + (1 - Math.abs((max + min) / 2 - 0.5)));
        }
        const max = Math.max(...bins);
        if (active && max > 0) setHue(bins.indexOf(max) * 10 + 5);
      } catch {
        /* A neutral generated palette remains usable if image sampling fails. */
      }
    };
    image.src = track.artwork;
    return () => {
      active = false;
      image.onload = null;
    };
  }, [track?.artwork, track?.album, track?.id]);
  useEffect(() => {
    const root = document.documentElement;
    const colors = { adaptive: hue, lilac: 275, sage: 145, peach: 25 };
    root.style.setProperty('--hue', String(colors[settings.palette]));
    const media = matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      root.dataset.theme =
        settings.appearance === 'system' ? (media.matches ? 'dark' : 'light') : settings.appearance;
      if (desktop)
        void getCurrentWindow()
          .setTheme(root.dataset.theme === 'dark' ? 'dark' : 'light')
          .catch(() => {});
    };
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [settings, hue]);
}
