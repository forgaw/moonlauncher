export type SidebarTabId =
  | "play"
  | "news"
  | "installations"
  | "mods"
  | "modpacks"
  | "skins"
  | "friends"
  | "tools"
  | "java"
  | "settings"

export interface SidebarTabDefinition {
  id: SidebarTabId
  label: string
}

export const SIDEBAR_TABS: SidebarTabDefinition[] = [
  { id: "play", label: "Играть" },
  { id: "news", label: "Новости" },
  { id: "installations", label: "Версии" },
  { id: "mods", label: "Моды" },
  { id: "modpacks", label: "Сборки" },
  { id: "skins", label: "Скины" },
  { id: "friends", label: "Друзья" },
  { id: "tools", label: "Инструменты" },
  { id: "java", label: "Java" },
  { id: "settings", label: "Настройки" },
]

export const SIDEBAR_TAB_IDS: SidebarTabId[] = SIDEBAR_TABS.map(tab => tab.id)
export const SIDEBAR_NON_HIDEABLE_IDS: SidebarTabId[] = ["settings"]
export const SIDEBAR_DEFAULT_ORDER: SidebarTabId[] = [...SIDEBAR_TAB_IDS]

export function normalizeSidebarTabOrder(value: unknown): SidebarTabId[] {
  if (!Array.isArray(value)) {
    return [...SIDEBAR_DEFAULT_ORDER]
  }
  const ordered: SidebarTabId[] = []
  const seen = new Set<string>()
  for (const item of value) {
    const tabId = String(item || "").trim() as SidebarTabId
    if (!SIDEBAR_TAB_IDS.includes(tabId)) continue
    if (seen.has(tabId)) continue
    seen.add(tabId)
    ordered.push(tabId)
  }
  for (const tabId of SIDEBAR_TAB_IDS) {
    if (!seen.has(tabId)) {
      ordered.push(tabId)
    }
  }
  return ordered
}

export function normalizeHiddenSidebarTabs(value: unknown): SidebarTabId[] {
  if (!Array.isArray(value)) {
    return []
  }
  const hidden: SidebarTabId[] = []
  const seen = new Set<string>()
  for (const item of value) {
    const tabId = String(item || "").trim() as SidebarTabId
    if (!SIDEBAR_TAB_IDS.includes(tabId)) continue
    if (SIDEBAR_NON_HIDEABLE_IDS.includes(tabId)) continue
    if (seen.has(tabId)) continue
    seen.add(tabId)
    hidden.push(tabId)
  }
  return hidden
}

export function buildVisibleSidebarTabs(orderValue: unknown, hiddenValue: unknown): SidebarTabId[] {
  const order = normalizeSidebarTabOrder(orderValue)
  const hidden = new Set(normalizeHiddenSidebarTabs(hiddenValue))
  const visible = order.filter(tabId => !hidden.has(tabId))
  if (visible.length > 0) {
    return visible
  }
  return [...SIDEBAR_DEFAULT_ORDER]
}
