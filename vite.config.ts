import { defineConfig } from 'vitest/config';
import { readFileSync } from 'node:fs';
import react from '@vitejs/plugin-react';

const version = (
  JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
    version: string;
  }
).version;

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: { host: '127.0.0.1', port: 1420, strictPort: true },
  build: { target: 'es2022' },
  envPrefix: ['VITE_', 'TAURI_ENV_'],
  define: { __APP_VERSION__: JSON.stringify(version) },
  test: { css: { include: [/\.css(?:\?|$)/], modules: { classNameStrategy: 'scoped' } } },
});
