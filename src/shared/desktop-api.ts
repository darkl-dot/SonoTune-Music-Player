import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

export interface DesktopPreferences {
  closeToTray: boolean;
  autostart: boolean;
  associationsRegistered: boolean;
  trayAvailable: boolean;
}
export const desktopApi = {
  preferences: () => invoke<DesktopPreferences>('desktop_preferences'),
  configure: (patch: { closeToTray?: boolean; autostart?: boolean; language?: 'ru' | 'en' }) =>
    invoke<DesktopPreferences>('configure_desktop', { patch }),
  registerOpenWith: () => invoke<DesktopPreferences>('register_open_with'),
  openDataFolder: () => invoke<void>('open_data_folder'),
  diagnostics: () => invoke<string>('diagnostics'),
  pendingExternal: () => invoke<string | null>('pending_external'),
  onExternal: (receive: (id: string) => void) =>
    listen<string>('external-opened', ({ payload }) => receive(payload)),
  toggleMiniPlayer: (alwaysOnTop: boolean) =>
    invoke<boolean>('toggle_mini_player', { alwaysOnTop }),
  setMiniAlwaysOnTop: (value: boolean) => invoke<void>('set_mini_always_on_top', { value }),
  showMainWindow: () => invoke<void>('show_main_window'),
  onFileDragOver: (receive: (over: boolean) => void) =>
    listen<boolean>('file-drag-over', ({ payload }) => receive(payload)),
  onDropResult: (receive: (result: { kind: 'folders' | 'tracks'; count: number }) => void) =>
    listen<{ kind: 'folders' | 'tracks'; count: number }>('drop-result', ({ payload }) =>
      receive(payload),
    ),
  onMiniState: (receive: (open: boolean) => void) =>
    listen<boolean>('mini-state', ({ payload }) => receive(payload)),
};
