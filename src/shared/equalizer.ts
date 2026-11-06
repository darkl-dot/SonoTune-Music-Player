import { create } from 'zustand';
export const frequencies = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
export interface EqualizerSettings {
  enabled: boolean;
  preamp: number;
  gains: number[];
}
export const flatEqualizer = (): EqualizerSettings => ({
  enabled: false,
  preamp: 0,
  gains: frequencies.map(() => 0),
});
export function normalizeEqualizer(value: Partial<EqualizerSettings> | null): EqualizerSettings {
  const clamp = (n: unknown, min: number, max: number) =>
    typeof n === 'number' && Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : 0;
  return {
    enabled: value?.enabled === true,
    preamp: clamp(value?.preamp, -24, 0),
    gains: frequencies.map((_, i) => clamp(value?.gains?.[i], -12, 12)),
  };
}
let saved = flatEqualizer();
try {
  saved = normalizeEqualizer(JSON.parse(localStorage.getItem('sonotune-equalizer') ?? 'null'));
} catch {
  /* Use defaults. */
}
export const useEqualizer = create<{
  value: EqualizerSettings;
  set(value: EqualizerSettings): void;
}>((set) => ({
  value: saved,
  set: (value) => {
    const normalized = normalizeEqualizer(value);
    localStorage.setItem('sonotune-equalizer', JSON.stringify(normalized));
    set({ value: normalized });
  },
}));
export const presets = [
  { id: 'flat', name: 'Ровный', preamp: 0, gains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { id: 'bass', name: 'Бас', preamp: -6, gains: [5, 5, 3, 1, 0, 0, 0, 0, 0, 0] },
  { id: 'vocal', name: 'Вокал', preamp: -4, gains: [-2, -1, 0, 1, 2, 3, 3, 1, 0, -1] },
  { id: 'rock', name: 'Рок', preamp: -6, gains: [4, 3, 1, -1, -2, 0, 2, 3, 4, 3] },
  { id: 'electronic', name: 'Электроника', preamp: -6, gains: [5, 4, 2, 0, -1, 0, 1, 3, 4, 3] },
];
