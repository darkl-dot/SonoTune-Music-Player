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
};
