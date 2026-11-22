import { useEffect, useRef } from 'react';
import { api, desktop } from '../../shared/api';
import type { VisualizerMode } from '../../shared/types';

const BANDS = 32;

function samplePreview(out: Float32Array, time: number, gentle = false) {
  for (let i = 0; i < out.length; i++) {
    const x = i / (out.length - 1);
    const wave1 = Math.sin(x * Math.PI * 3.2 + time * 1.4) * 0.5 + 0.5;
    const wave2 = Math.sin(x * Math.PI * 6.5 - time * 2.1 + 1.1) * 0.5 + 0.5;
    const wave3 = Math.sin(x * Math.PI * 1.8 + time * 0.7) * 0.5 + 0.5;
    const envelope = 0.45 + 0.55 * Math.sin(x * Math.PI);
    const value = (wave1 * 0.45 + wave2 * 0.35 + wave3 * 0.2) * envelope;
    out[i] = gentle ? 0.14 + value * 0.44 : 0.18 + value * 0.72;
  }
}

export function VisualizerCanvas({
  mode,
  playing,
  hue,
  preview = false,
  className = '',
}: {
  mode: VisualizerMode;
  playing: boolean;
  hue: number;
  preview?: boolean;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (mode === 'off') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    let active = true;
    let raf = 0;
    let lastFetch = 0;
    let fetching = false;
    const target = new Float32Array(BANDS);
    const smooth = new Float32Array(BANDS);

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.max(1, Math.round(rect.width * dpr));
      const height = Math.max(1, Math.round(rect.height * dpr));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
    };

    resize();
    const observer =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => resize()) : null;
    observer?.observe(canvas);

    const draw = (now: number) => {
      if (!active) return;

      const tSec = now * 0.001;
      if (playing && desktop) {
        if (!fetching && now - lastFetch >= 30) {
          fetching = true;
          lastFetch = now;
          void api
            .then((service) => service.audioSpectrum?.())
            .then((bands) => {
              if (!active) return;
              if (bands && bands.length) {
                for (let i = 0; i < BANDS; i++) {
                  const v = bands[Math.min(i, bands.length - 1)] ?? 0;
                  target[i] = Math.max(0, Math.min(1, v));
                }
              }
            })
            .catch(() => {})
            .finally(() => {
              fetching = false;
            });
        }
      } else if (playing || preview) {
        samplePreview(target, reducedMotion ? 1.2 : tSec, !playing);
      } else {
        target.fill(0);
      }

      let maxLevel = 0;
      for (let i = 0; i < BANDS; i++) {
        const rate = target[i] > smooth[i] ? 0.34 : 0.14;
        smooth[i] += (target[i] - smooth[i]) * (reducedMotion ? 1 : rate);
        if (smooth[i] < 0.004) smooth[i] = 0;
        if (smooth[i] > maxLevel) maxLevel = smooth[i];
      }

      const w = canvas.width;
      const h = canvas.height;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      ctx.clearRect(0, 0, w, h);

      const baseY = h;
      const maxH = h * 0.86;
      const topPadding = h * 0.14;

      if (mode === 'bars' || mode === 'both') {
        const gap = Math.max(2 * dpr, (w / BANDS) * 0.24);
        const barW = Math.max(2 * dpr, (w - gap * (BANDS + 1)) / BANDS);
        const radius = Math.min(barW / 2, 3 * dpr);
        const grad = ctx.createLinearGradient(0, topPadding, 0, baseY);
        grad.addColorStop(0, `hsla(${hue}, 68%, 78%, 0.56)`);
        grad.addColorStop(1, `hsla(${hue}, 52%, 56%, 0.16)`);
        ctx.fillStyle = grad;

        for (let i = 0; i < BANDS; i++) {
          const level = smooth[i];
          const bh = Math.max(2.5 * dpr, level * maxH);
          const x = gap + i * (barW + gap);
          const y = baseY - bh;
          ctx.beginPath();
          ctx.moveTo(x, baseY);
          ctx.lineTo(x, y + radius);
          ctx.quadraticCurveTo(x, y, x + radius, y);
          ctx.lineTo(x + barW - radius, y);
          ctx.quadraticCurveTo(x + barW, y, x + barW, y + radius);
          ctx.lineTo(x + barW, baseY);
          ctx.closePath();
          ctx.fill();
        }
      }

      if (mode === 'wave' || mode === 'both') {
        const stepX = w / (BANDS - 1);
        const points: { x: number; y: number }[] = [];
        for (let i = 0; i < BANDS; i++) {
          const level = smooth[i];
          points.push({
            x: i * stepX,
            y: baseY - Math.max(3 * dpr, level * maxH),
          });
        }

        const traceCurve = (pts: { x: number; y: number }[]) => {
          ctx.beginPath();
          ctx.moveTo(pts[0].x, pts[0].y);
          for (let i = 0; i < pts.length - 1; i++) {
            const xc = (pts[i].x + pts[i + 1].x) / 2;
            const yc = (pts[i].y + pts[i + 1].y) / 2;
            ctx.quadraticCurveTo(pts[i].x, pts[i].y, xc, yc);
          }
          const last = pts[pts.length - 1];
          ctx.lineTo(last.x, last.y);
        };

        // Soft fill under the wave
        traceCurve(points);
        ctx.lineTo(w, baseY);
        ctx.lineTo(0, baseY);
        ctx.closePath();
        const fillGrad = ctx.createLinearGradient(0, topPadding, 0, baseY);
        fillGrad.addColorStop(0, `hsla(${hue}, 74%, 76%, ${mode === 'wave' ? 0.28 : 0.16})`);
        fillGrad.addColorStop(1, `hsla(${hue}, 55%, 52%, 0.02)`);
        ctx.fillStyle = fillGrad;
        ctx.fill();

        // Main glowing stroke
        ctx.save();
        traceCurve(points);
        ctx.strokeStyle = `hsla(${hue}, 82%, 82%, 0.85)`;
        ctx.lineWidth = 2 * dpr;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.shadowColor = `hsla(${hue}, 82%, 74%, 0.55)`;
        ctx.shadowBlur = 8 * dpr;
        ctx.stroke();
        ctx.restore();
      }

      if (!reducedMotion && (playing || preview || maxLevel > 0.005)) {
        raf = requestAnimationFrame(draw);
      }
    };

    raf = requestAnimationFrame(draw);

    return () => {
      active = false;
      cancelAnimationFrame(raf);
      observer?.disconnect();
    };
  }, [mode, playing, hue, preview]);

  if (mode === 'off') return null;
  return <canvas ref={canvasRef} className={className} aria-hidden="true" />;
}
