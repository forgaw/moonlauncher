import { useCallback, useEffect, useMemo, useState } from "react"
import { Play, Download, Settings, Newspaper, User, Plus, Trash2, Box, Pencil, Users, Palette, Layers3, Wrench, RefreshCw, type LucideIcon } from "lucide-react"
import { Button } from "./ui/button"
import { cn } from "./ui/utils"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "./ui/dropdown-menu"
import { Input } from "./ui/input"
import { Label } from "./ui/label"
import { backendService, type PlayerProfile } from "../services/backend"
import appAvatar from "../assets/moonlauncher-avatar.png"
import { toast } from "sonner"
import { notifySettingsUpdated, subscribeSettingsUpdated } from "../utils/settingsSync"
import { buildVisibleSidebarTabs, SIDEBAR_TABS, type SidebarTabId } from "../constants/sidebarTabs"

interface LauncherSidebarProps {
  activeTab: string
  onTabChange: (tab: string) => void
  sidebarOpacity?: number
}

const TAB_ICONS: Record<SidebarTabId, LucideIcon> = {
  play: Play,
  news: Newspaper,
  installations: Download,
  mods: Box,
  modpacks: Layers3,
  skins: Palette,
  friends: Users,
  tools: Wrench,
  java: RefreshCw,
  settings: Settings,
}

export function LauncherSidebar({ activeTab, onTabChange, sidebarOpacity = 0.9 }: LauncherSidebarProps) {
  const [profiles, setProfiles] = useState<PlayerProfile[]>([])
  const [currentProfile, setCurrentProfile] = useState<PlayerProfile | null>(null)
  const [newProfileName, setNewProfileName] = useState("")
  const [editProfileName, setEditProfileName] = useState("")
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [isRenameDialogOpen, setIsRenameDialogOpen] = useState(false)
  const [presence, setPresence] = useState<Record<string, { profileId: string; isPlaying: boolean; statusText: string; versionId?: string }>>({})
  const [visibleTabs, setVisibleTabs] = useState<SidebarTabId[]>(() => buildVisibleSidebarTabs([], []))


  const loadProfiles = useCallback(async () => {
    try {
      const [loadedProfiles, settings] = await Promise.all([
        backendService.getProfiles(),
        backendService.getSettings(),
      ])
      setProfiles(loadedProfiles)

      const selectedProfileId = String(settings.selectedProfileId || "")
      const selected = loadedProfiles.find(profile => profile.id === selectedProfileId) ?? loadedProfiles[0] ?? null
      setCurrentProfile(selected)
      setVisibleTabs(buildVisibleSidebarTabs(settings.sidebarTabOrder, settings.hiddenSidebarTabs))
      if (selected && selectedProfileId !== selected.id) {
        await backendService.updateSettings({ selectedProfileId: selected.id })
        notifySettingsUpdated()
      }
    } catch (error) {
      console.error("Error loading profiles:", error)
      toast.error("Не удалось загрузить профили")
    }
  }, [])

  const loadPresence = useCallback(async () => {
    try {
      const data = await backendService.getProfilesPresence()
      setPresence(data)
    } catch {
      
    }
  }, [])

  useEffect(() => {
    void loadProfiles()
    void loadPresence()
  }, [loadProfiles, loadPresence])

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      void loadPresence()
    }, 3000)
    return () => window.clearInterval(intervalId)
  }, [loadPresence])

  useEffect(() => {
    const unsubscribe = subscribeSettingsUpdated(() => {
      void loadProfiles()
    })
    return () => unsubscribe()
  }, [loadProfiles])

  useEffect(() => {
    if (!visibleTabs.length) return
    const activeId = String(activeTab || "") as SidebarTabId
    if (!visibleTabs.includes(activeId)) {
      onTabChange(visibleTabs[0])
    }
  }, [activeTab, onTabChange, visibleTabs])

  const currentPresence = useMemo(() => {
    if (!currentProfile) return null
    return presence[currentProfile.id] ?? null
  }, [currentProfile, presence])

  const selectProfile = useCallback(async (profile: PlayerProfile) => {
    setCurrentProfile(profile)
    try {
      await backendService.updateSettings({ selectedProfileId: profile.id })
      notifySettingsUpdated()
    } catch (error) {
      console.error("Error selecting profile:", error)
      toast.error("Не удалось выбрать профиль")
    }
  }, [])

  const createProfile = useCallback(async () => {
    if (!newProfileName.trim()) return

    try {
      const created = await backendService.createProfile({
        name: newProfileName.trim(),
        uuid: crypto.randomUUID(),
        lastPlayed: new Date().toISOString(),
        gameTime: 0,
        version: "latest-release",
        isOnline: false,
      })

      await backendService.updateSettings({ selectedProfileId: created.id })
      notifySettingsUpdated()
      setProfiles(prev => [...prev, created])
      setCurrentProfile(created)
      setNewProfileName("")
      setIsCreateDialogOpen(false)
      toast.success("Профиль создан")
    } catch (error) {
      console.error("Error creating profile:", error)
      toast.error("Не удалось создать профиль")
    }
  }, [newProfileName])

  const renameProfile = useCallback(async () => {
    if (!currentProfile || !editProfileName.trim()) return
    try {
      const updated = await backendService.updateProfile(currentProfile.id, { name: editProfileName.trim() })
      setProfiles(prev => prev.map(profile => (profile.id === updated.id ? updated : profile)))
      setCurrentProfile(updated)
      setIsRenameDialogOpen(false)
      setEditProfileName("")
      toast.success("Ник обновлен")
    } catch (error) {
      console.error("Error renaming profile:", error)
      toast.error("Не удалось обновить ник")
    }
  }, [currentProfile, editProfileName])

  const deleteProfile = useCallback(
    async (profileId: string) => {
      try {
        await backendService.deleteProfile(profileId)
        await loadProfiles()
        toast.success("Профиль удален")
      } catch (error) {
        console.error("Error deleting profile:", error)
        toast.error("Не удалось удалить профиль")
      }
    },
    [loadProfiles],
  )

  const safeSidebarOpacity = Math.max(0.55, Math.min(1, Number(sidebarOpacity || 0.9)))

  return (
    <div
      className="w-full h-full backdrop-blur-xl border-r border-white/10 flex flex-col"
      style={{
        background: `linear-gradient(to bottom, rgba(17, 24, 39, ${safeSidebarOpacity.toFixed(2)}), rgba(0, 0, 0, ${Math.min(1, safeSidebarOpacity + 0.08).toFixed(2)}))`,
      }}
    >
      <div className="p-6 border-b border-white/10 shrink-0">
        <h1 className="text-2xl font-medium font-mojangles tracking-wide" style={{ color: "var(--moon-accent, #22c55e)" }}>moonlauncher</h1>
        <p className="text-sm text-gray-400 font-mojangles">Лаунчер</p>
      </div>

      <nav className="flex-1 p-4 space-y-3 min-h-0 overflow-y-auto no-scrollbar">
        {visibleTabs.map(tabId => {
          const tab = SIDEBAR_TABS.find(item => item.id === tabId)
          if (!tab) return null
          const Icon = TAB_ICONS[tabId]
          const isActive = activeTab === tabId
          return (
            <button
              key={tabId}
              onClick={() => onTabChange(tabId)}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3 rounded-xl",
                "glass-button liquid-shimmer font-mojangles",
                "text-left transition-all duration-300",
                isActive ? "glass-button-active text-green-300" : "text-gray-300 hover:text-white",
              )}
            >
              <Icon className="size-5 shrink-0" />
              <span className="text-sm font-medium tracking-wide">{tab.label}</span>
            </button>
          )
        })}
      </nav>

      <div className="p-4 border-t border-white/10 shrink-0">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <div className="glass-button liquid-shimmer flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all duration-300 hover:text-white">
              <div className="size-10 rounded-xl overflow-hidden border border-white/20">
                <img
                  src={currentProfile?.skinUrl || appAvatar}
                  alt="Moon avatar"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="flex-1 text-left">
                <p className="text-sm font-medium text-gray-200 font-mojangles tracking-wide">
                  {currentProfile?.name || "Без профиля"}
                </p>
                <p className="text-xs text-gray-400 font-mojangles">
                  {currentPresence?.isPlaying ? currentPresence.statusText : currentProfile ? "Готов" : "Не выбран"}
                </p>
              </div>
            </div>
          </DropdownMenuTrigger>

          <DropdownMenuContent
            align="end"
            className="w-64 glass-button border-white/20 backdrop-blur-xl bg-black/80"
          >
            {profiles.map(profile => (
              <DropdownMenuItem
                key={profile.id}
                className={cn(
                  "flex items-center justify-between gap-2 font-mojangles",
                  "hover:bg-white/10 focus:bg-white/10 cursor-pointer",
                  currentProfile?.id === profile.id && "bg-green-500/20 text-green-300",
                )}
                onClick={() => void selectProfile(profile)}
              >
                <div className="flex items-center gap-2">
                  <User className="size-4" />
                  <span className="text-sm tracking-wide">{profile.name}</span>
                </div>
                {currentProfile?.id === profile.id && <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />}
              </DropdownMenuItem>
            ))}

            <DropdownMenuSeparator className="bg-white/20" />

            <DropdownMenuItem
              className="font-mojangles hover:bg-white/10 focus:bg-white/10 cursor-pointer"
              onClick={() => setIsCreateDialogOpen(true)}
            >
              <Plus className="size-4 mr-2" />
              <span className="text-sm tracking-wide">Новый профиль</span>
            </DropdownMenuItem>

            {currentProfile && (
              <DropdownMenuItem
                className="font-mojangles hover:bg-white/10 focus:bg-white/10 cursor-pointer"
                onClick={() => {
                  setEditProfileName(currentProfile.name)
                  setIsRenameDialogOpen(true)
                }}
              >
                <Pencil className="size-4 mr-2" />
                <span className="text-sm tracking-wide">Изменить ник</span>
              </DropdownMenuItem>
            )}

            {currentProfile && profiles.length > 1 && (
              <>
                <DropdownMenuSeparator className="bg-white/20" />
                <DropdownMenuItem
                  className="text-red-400 focus:text-red-300 hover:bg-red-500/20 focus:bg-red-500/20 font-mojangles cursor-pointer"
                  onClick={() => void deleteProfile(currentProfile.id)}
                >
                  <Trash2 className="size-4 mr-2" />
                  <span className="text-sm tracking-wide">Удалить профиль</span>
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {isCreateDialogOpen && (
        <div className="fixed inset-0 z-[1200] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl glass-button border-white/20 bg-black/90 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-mojangles text-lg text-green-400 tracking-wider">Создать профиль</h3>
              <Button variant="outline" size="sm" onClick={() => setIsCreateDialogOpen(false)}>
                Закрыть
              </Button>
            </div>
            <div className="space-y-2">
              <Label htmlFor="profileName" className="font-mojangles text-gray-300">
                Имя профиля
              </Label>
              <Input
                id="profileName"
                value={newProfileName}
                onChange={event => setNewProfileName(event.target.value)}
                placeholder="Введите имя профиля"
                autoFocus
                className="glass-button border-white/20 text-white font-mojangles bg-black/30 placeholder:text-gray-500"
                onKeyDown={event => {
                  if (event.key === "Enter" && newProfileName.trim()) {
                    void createProfile()
                  }
                }}
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                Отмена
              </Button>
              <Button onClick={() => void createProfile()} disabled={!newProfileName.trim()}>
                Создать
              </Button>
            </div>
          </div>
        </div>
      )}

      {isRenameDialogOpen && (
        <div className="fixed inset-0 z-[1200] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl glass-button border-white/20 bg-black/90 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-mojangles text-lg text-green-400 tracking-wider">Изменить ник</h3>
              <Button variant="outline" size="sm" onClick={() => setIsRenameDialogOpen(false)}>
                Закрыть
              </Button>
            </div>
            <div className="space-y-2">
              <Label htmlFor="profileNickname" className="font-mojangles text-gray-300">
                Новый ник
              </Label>
              <Input
                id="profileNickname"
                value={editProfileName}
                onChange={event => setEditProfileName(event.target.value)}
                placeholder="Введите ник"
                autoFocus
                className="glass-button border-white/20 text-white font-mojangles bg-black/30 placeholder:text-gray-500"
                onKeyDown={event => {
                  if (event.key === "Enter" && editProfileName.trim()) {
                    void renameProfile()
                  }
                }}
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setIsRenameDialogOpen(false)}>
                Отмена
              </Button>
              <Button onClick={() => void renameProfile()} disabled={!editProfileName.trim()}>
                Сохранить
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

