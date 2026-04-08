const SETTINGS_UPDATED_EVENT = "moonlauncher:settings-updated"

export function notifySettingsUpdated(): void {
  window.dispatchEvent(new CustomEvent(SETTINGS_UPDATED_EVENT))
}

export function subscribeSettingsUpdated(handler: () => void): () => void {
  window.addEventListener(SETTINGS_UPDATED_EVENT, handler as EventListener)
  return () => {
    window.removeEventListener(SETTINGS_UPDATED_EVENT, handler as EventListener)
  }
}
