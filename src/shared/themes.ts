/** Extra appearance themes available under "More themes", dark followed by its light variant. */
export const extraThemeIds = [
  'absolutely',
  'absolutely-light',
  'ayu',
  'ayu-light',
  'catppuccin',
  'catppuccin-latte',
  'dracula',
  'dracula-light',
  'everforest',
  'everforest-light',
  'github',
  'github-light',
  'gruvbox',
  'gruvbox-light',
  'linear',
  'linear-light',
  'lobster',
  'lobster-light',
] as const;

export type ExtraTheme = (typeof extraThemeIds)[number];

export interface ExtraThemeInfo {
  id: ExtraTheme;
  name: string;
  description: string;
  /** Light themes also switch the window chrome and the palette hint. */
  light: boolean;
  /** Six colors shown on the picker card: surface, raised surface, accent, warm accent, green, text. */
  swatches: readonly string[];
}

export const extraThemes: readonly ExtraThemeInfo[] = [
  {
    id: 'absolutely',
    name: 'Absolutely',
    description: 'Тёплые бумажные оттенки',
    light: false,
    swatches: ['#1e1e1c', '#2a2724', '#dfa27a', '#d96b5a', '#a8c090', '#ece7dd'],
  },
  {
    id: 'absolutely-light',
    name: 'Absolutely Light',
    description: 'Светлая бумажная палитра',
    light: true,
    swatches: ['#faf8f3', '#fffdf8', '#a85438', '#c26a4b', '#7d9a6a', '#2b2723'],
  },
  {
    id: 'ayu',
    name: 'Ayu',
    description: 'Тёплый акцент на графитовом фоне',
    light: false,
    swatches: ['#0b0e14', '#141920', '#e6b450', '#ff8f40', '#aad94c', '#bfbdb6'],
  },
  {
    id: 'ayu-light',
    name: 'Ayu Light',
    description: 'Тёплый светлый вариант Ayu',
    light: true,
    swatches: ['#fafafa', '#ffffff', '#b45309', '#ff9940', '#86b300', '#4c5666'],
  },
  {
    id: 'catppuccin',
    name: 'Catppuccin',
    description: 'Мягкие пастельные тона',
    light: false,
    swatches: ['#1e1e2e', '#313244', '#cba6f7', '#f9e2af', '#a6e3a1', '#cdd6f4'],
  },
  {
    id: 'catppuccin-latte',
    name: 'Catppuccin Latte',
    description: 'Светлая пастель Catppuccin Latte',
    light: true,
    swatches: ['#eff1f5', '#ccd0da', '#8839ef', '#df8e1d', '#40a02b', '#4c4f69'],
  },
  {
    id: 'dracula',
    name: 'Dracula',
    description: 'Глубокий фиолетовый с розовым акцентом',
    light: false,
    swatches: ['#282a36', '#44475a', '#ff79c6', '#bd93f9', '#50fa7b', '#f8f8f2'],
  },
  {
    id: 'dracula-light',
    name: 'Dracula Light',
    description: 'Светлая пара Dracula (Alucard)',
    light: true,
    swatches: ['#fffbeb', '#e8e2d0', '#644ac9', '#a3144d', '#14710a', '#1f1f1f'],
  },
  {
    id: 'everforest',
    name: 'Everforest',
    description: 'Приглушённый зелёный лес',
    light: false,
    swatches: ['#2d353b', '#373e44', '#a7c080', '#dbbc7f', '#83c092', '#d3c6aa'],
  },
  {
    id: 'everforest-light',
    name: 'Everforest Light',
    description: 'Светлый лес Everforest',
    light: true,
    swatches: ['#fdf6e3', '#efebd4', '#6c7a00', '#dfa000', '#8da101', '#5c6a72'],
  },
  {
    id: 'github',
    name: 'GitHub',
    description: 'Знакомые цвета GitHub Dark',
    light: false,
    swatches: ['#0d1117', '#161b22', '#58a6ff', '#3fb950', '#d29922', '#e6edf3'],
  },
  {
    id: 'github-light',
    name: 'GitHub Light',
    description: 'Светлые цвета GitHub',
    light: true,
    swatches: ['#ffffff', '#f6f8fa', '#0969da', '#cf222e', '#1a7f37', '#1f2328'],
  },
  {
    id: 'gruvbox',
    name: 'Gruvbox',
    description: 'Тёплая тёмная палитра с жёлтым акцентом',
    light: false,
    swatches: ['#282828', '#3c3836', '#fabd2f', '#fe8019', '#8ec07c', '#ebdbb2'],
  },
  {
    id: 'gruvbox-light',
    name: 'Gruvbox Light',
    description: 'Светлая ретро-палитра Gruvbox',
    light: true,
    swatches: ['#fbf1c7', '#ebdbb2', '#af3a03', '#b57614', '#79740e', '#3c3836'],
  },
  {
    id: 'linear',
    name: 'Linear',
    description: 'Сдержанный индиго в стиле Linear',
    light: false,
    swatches: ['#0f1011', '#191a1e', '#7c85e8', '#5e6ad2', '#4cb782', '#f7f8f8'],
  },
  {
    id: 'linear-light',
    name: 'Linear Light',
    description: 'Светлый индиго в стиле Linear',
    light: true,
    swatches: ['#f7f8f8', '#ffffff', '#5e6ad2', '#3f48b0', '#2f9e6b', '#282a30'],
  },
  {
    id: 'lobster',
    name: 'Lobster',
    description: 'Глубокий красный с тёплым акцентом',
    light: false,
    swatches: ['#1d1412', '#261a17', '#ff6b5a', '#ff8b7d', '#d9a05b', '#f0ded8'],
  },
  {
    id: 'lobster-light',
    name: 'Lobster Light',
    description: 'Тёплый светлый вариант Lobster',
    light: true,
    swatches: ['#fdf4f0', '#fffaf7', '#c73f2c', '#b83226', '#b07a3c', '#3a2420'],
  },
];

export function isExtraTheme(value: unknown): value is ExtraTheme {
  return typeof value === 'string' && (extraThemeIds as readonly string[]).includes(value);
}
export function isLightTheme(value: unknown): boolean {
  if (value === 'light') return true;
  return extraThemes.some((theme) => theme.id === value && theme.light);
}
