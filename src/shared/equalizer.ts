import { create } from 'zustand';
export const frequencies = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
export interface EqualizerSettings {
  enabled: boolean;
  preamp: number;
  gains: number[];
}
export interface CustomPreset {
  id: string;
  name: string;
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
export function normalizeCustomPresets(value: unknown): CustomPreset[] {
  if (!Array.isArray(value)) return [];
  const out: CustomPreset[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const raw = item as Partial<CustomPreset>;
    const id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : '';
    const name = typeof raw.name === 'string' ? raw.name.trim().slice(0, 60) : '';
    if (!id || !name) continue;
    const eq = normalizeEqualizer({ preamp: raw.preamp, gains: raw.gains });
    out.push({ id, name, preamp: eq.preamp, gains: eq.gains });
  }
  return out;
}
let saved = flatEqualizer();
try {
  saved = normalizeEqualizer(JSON.parse(localStorage.getItem('sonotune-equalizer') ?? 'null'));
} catch {
  /* Use defaults. */
}
let savedPresets: CustomPreset[] = [];
try {
  savedPresets = normalizeCustomPresets(
    JSON.parse(localStorage.getItem('sonotune-eq-presets') ?? '[]'),
  );
} catch {
  /* Use empty presets. */
}
export const useEqualizer = create<{
  value: EqualizerSettings;
  customPresets: CustomPreset[];
  set(value: EqualizerSettings): void;
  savePreset(name: string): CustomPreset | null;
  deletePreset(id: string): void;
}>((set, get) => ({
  value: saved,
  customPresets: savedPresets,
  set: (value) => {
    const normalized = normalizeEqualizer(value);
    localStorage.setItem('sonotune-equalizer', JSON.stringify(normalized));
    set({ value: normalized });
  },
  savePreset: (rawName) => {
    const name = rawName.trim().slice(0, 60);
    if (!name) return null;
    const current = get().value;
    const existing = get().customPresets.find(
      (item) => item.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
    );
    const preset: CustomPreset = {
      id: existing?.id ?? crypto.randomUUID(),
      name,
      preamp: current.preamp,
      gains: [...current.gains],
    };
    const next = existing
      ? get().customPresets.map((item) => (item.id === preset.id ? preset : item))
      : [...get().customPresets, preset];
    localStorage.setItem('sonotune-eq-presets', JSON.stringify(next));
    set({ customPresets: next });
    return preset;
  },
  deletePreset: (id) => {
    const next = get().customPresets.filter((item) => item.id !== id);
    localStorage.setItem('sonotune-eq-presets', JSON.stringify(next));
    set({ customPresets: next });
  },
}));
export const presets = [
  { id: 'flat', name: 'Ровный', preamp: 0, gains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { id: 'bass', name: 'Бас', preamp: -6, gains: [5, 5, 3, 1, 0, 0, 0, 0, 0, 0] },
  { id: 'vocal', name: 'Вокал', preamp: -4, gains: [-2, -1, 0, 1, 2, 3, 3, 1, 0, -1] },
  { id: 'rock', name: 'Рок', preamp: -6, gains: [4, 3, 1, -1, -2, 0, 2, 3, 4, 3] },
  { id: 'electronic', name: 'Электроника', preamp: -6, gains: [5, 4, 2, 0, -1, 0, 1, 3, 4, 3] },
];
