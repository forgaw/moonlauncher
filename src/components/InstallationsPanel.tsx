import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Download, Trash2, CheckCircle, Clock, AlertCircle, RefreshCw, Folder, Settings, FolderOpen } from "lucide-react"
import { Card } from "./ui/card"
import { Button } from "./ui/button"
import { Badge } from "./ui/badge"
import { Progress } from "./ui/progress"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select"
import { Input } from "./ui/input"
import { backendService, type CustomPackEntry, type GameVersion, type InstallTaskStatus } from "../services/backend"
import { toast } from "sonner"
import { translateInstallStatus } from "../utils/installStatus"

interface InstallationEntry {
  versionId: string
  taskId: string
  progress: number
  status: string
  completed: boolean
  error?: string | null
}

const CARD_ICON = "w-12 h-12 rounded-lg flex items-center justify-center"
const INSTALLED_ICON = `${CARD_ICON} bg-gradient-to-br from-green-500 to-blue-600`
const AVAILABLE_ICON = `${CARD_ICON} bg-gradient-to-br from-gray-500 to-gray-600`

const typeColors: Record<string, string> = {
  release: "bg-green-500/20 text-green-400 border-green-400/50",
  snapshot: "bg-yellow-500/20 text-yellow-400 border-yellow-400/50",
  beta: "bg-orange-500/20 text-orange-400 border-orange-400/50",
  forge: "bg-purple-500/20 text-purple-400 border-purple-400/50",
  fabric: "bg-blue-500/20 text-blue-400 border-blue-400/50",
  quilt: "bg-cyan-500/20 text-cyan-400 border-cyan-400/50",
  neoforge: "bg-pink-500/20 text-pink-400 border-pink-400/50",
  optifine: "bg-cyan-500/20 text-cyan-300 border-cyan-300/50",
  modpack: "bg-indigo-500/20 text-indigo-300 border-indigo-400/50",
}

const MODPACK_VERSION_PREFIX = "modpack::"

function formatDate(dateString: string) {
  const date = new Date(dateString)
  return date.toLocaleDateString("ru-RU", {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

function getVersionBadgeLabel(type: string) {
  if (type === "forge") return "F"
  if (type === "fabric") return "Fb"
  if (type === "quilt") return "Q"
  if (type === "neoforge") return "N"
  if (type === "optifine") return "OF"
  if (type === "modpack") return "MP"
  return "MC"
}

function getModpackId(versionId: string): string {
  if (!versionId.startsWith(MODPACK_VERSION_PREFIX)) return ""
  return versionId.slice(MODPACK_VERSION_PREFIX.length)
}

const InstalledVersionCard = memo(function InstalledVersionCard({
  version,
  onUninstall,
  onApplyPack,
}: {
  version: GameVersion
  onUninstall: (id: string) => void
  onApplyPack: (id: string) => void
}) {
  const isModpack = version.type === "modpack"
  const packId = getModpackId(version.id)

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className={INSTALLED_ICON}>
            <span className="text-white font-bold text-sm">{getVersionBadgeLabel(version.type)}</span>
          </div>
          <div>
            <h3 className="font-semibold">{version.name}</h3>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="outline" className={typeColors[version.type] ?? typeColors.release}>
                {version.type.charAt(0).toUpperCase() + version.type.slice(1)}
              </Badge>
              <span className="text-sm text-muted-foreground">{formatDate(version.releaseDate)}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant="outline" className="bg-green-500/20 text-green-400 border-green-400/50">
            <CheckCircle className="size-3 mr-1" />
            Установлена
          </Badge>
          <Button variant="outline" size="sm" className="gap-2" disabled>
            <Folder className="size-4" />
            Папка
          </Button>
          <Button variant="outline" size="sm" className="gap-2" disabled>
            <Settings className="size-4" />
            Конфиг
          </Button>
          {isModpack ? (
            <Button size="sm" className="gap-2" disabled={!packId} onClick={() => onApplyPack(packId)}>
              Применить
            </Button>
          ) : (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => onUninstall(version.id)}
              className="gap-2"
            >
              <Trash2 className="size-4" />
              Удалить
            </Button>
          )}
        </div>
      </div>
    </Card>
  )
})

const AvailableVersionCard = memo(function AvailableVersionCard({
  version,
  installation,
  onInstall,
}: {
  version: GameVersion
  installation?: InstallationEntry
  onInstall: (id: string) => void
}) {
  const isInstalling = Boolean(installation && !installation.completed)
  const progress = installation?.progress ?? 0
  const status = installation?.status ?? ""

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className={AVAILABLE_ICON}>
            <span className="text-white font-bold text-sm">{getVersionBadgeLabel(version.type)}</span>
          </div>
          <div>
            <h3 className="font-semibold">{version.name}</h3>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="outline" className={typeColors[version.type] ?? typeColors.release}>
                {version.type.charAt(0).toUpperCase() + version.type.slice(1)}
              </Badge>
              <span className="text-sm text-muted-foreground">{formatDate(version.releaseDate)}</span>
            </div>
          </div>
        </div>

        <Button
          variant="default"
          size="sm"
          onClick={() => onInstall(version.id)}
          disabled={isInstalling}
          className="gap-2"
        >
          {isInstalling ? <Clock className="size-4 animate-spin" /> : <Download className="size-4" />}
          {isInstalling ? "Установка..." : "Установить"}
        </Button>
      </div>

      {isInstalling && (
        <div className="space-y-2">
          <Progress value={progress} className="h-2" />
          <div className="text-xs text-muted-foreground flex items-center justify-between">
            <span>{status || "Загрузка..."}</span>
            <span>{Math.round(progress)}%</span>
          </div>
        </div>
      )}
    </Card>
  )
})

export function InstallationsPanel() {
  const [versions, setVersions] = useState<GameVersion[]>([])
  const [customPacks, setCustomPacks] = useState<CustomPackEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [installations, setInstallations] = useState<Record<string, InstallationEntry>>({})
  const [filterType, setFilterType] = useState<string>("all")
  const [sortBy, setSortBy] = useState<string>("name")
  const [versionQuery, setVersionQuery] = useState("")

  const installationsRef = useRef<Record<string, InstallationEntry>>({})
  useEffect(() => {
    installationsRef.current = installations
  }, [installations])

  const loadVersions = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) {
      setIsLoading(true)
    }
    try {
      const [loadedVersions, loadedPacks] = await Promise.all([
        backendService.getVersions(),
        backendService.getCustomPacks(),
      ])
      setVersions(prev => (loadedVersions.length > 0 ? loadedVersions : prev))
      setCustomPacks(loadedPacks)
    } catch (error) {
      console.error("Error loading versions:", error)
      if (!options?.silent) {
        toast.error("Не удалось загрузить версии")
      }
    } finally {
      if (!options?.silent) {
        setIsLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    void loadVersions()
  }, [loadVersions])

  useEffect(() => {
    const refreshVersions = () => {
      if (document.visibilityState !== "visible") return
      void loadVersions({ silent: true })
    }

    const intervalId = window.setInterval(refreshVersions, 60_000)
    window.addEventListener("focus", refreshVersions)
    document.addEventListener("visibilitychange", refreshVersions)

    return () => {
      window.clearInterval(intervalId)
      window.removeEventListener("focus", refreshVersions)
      document.removeEventListener("visibilitychange", refreshVersions)
    }
  }, [loadVersions])

  const pollKey = useMemo(
    () =>
      Object.values(installations)
        .filter(item => !item.completed)
        .map(item => item.taskId)
        .sort()
        .join("|"),
    [installations],
  )

  useEffect(() => {
    if (!pollKey) return

    let disposed = false

    const tick = async () => {
      const current = Object.values(installationsRef.current).filter(item => !item.completed)
      if (!current.length || disposed) return

      const updates: InstallTaskStatus[] = await Promise.all(
        current.map(item => backendService.getInstallTaskStatus(item.taskId).catch(() => null)),
      ).then(result => result.filter(Boolean) as InstallTaskStatus[])

      if (disposed || !updates.length) return

      setInstallations(prev => {
        const next = { ...prev }
        for (const status of updates) {
          const existing = next[status.versionId]
          if (!existing) continue

          const becameCompleted = !existing.completed && status.completed
          const localizedStatus = translateInstallStatus(status.status || "")
          next[status.versionId] = {
            ...existing,
            status: localizedStatus,
            progress: status.progress,
            completed: status.completed,
            error: status.error,
          }

          if (becameCompleted) {
            if (status.error) {
               toast.error(`Ошибка установки: ${status.versionId}`)
             } else {
               toast.success(`Установлено: ${status.versionId}`)
             }
          }
        }
        return next
      })

      const hasCompleted = updates.some(item => item.completed)
      if (hasCompleted) {
        void loadVersions({ silent: true })
        setTimeout(() => {
          setInstallations(prev => {
            const next: Record<string, InstallationEntry> = {}
            for (const [key, value] of Object.entries(prev)) {
              if (!value.completed) next[key] = value
            }
            return next
          })
        }, 2500)
      }
    }

    tick()
    const intervalId = window.setInterval(tick, 1200)
    return () => {
      disposed = true
      window.clearInterval(intervalId)
    }
  }, [pollKey, loadVersions])

  const handleInstall = useCallback(async (versionId: string) => {
    try {
      const task = await backendService.installVersion(versionId)
      setInstallations(prev => ({
        ...prev,
        [versionId]: {
          versionId,
          taskId: task.taskId,
          progress: task.progress,
          status: translateInstallStatus(task.status || ""),
          completed: task.completed,
          error: task.error,
        },
      }))
      toast.info(`Добавлено в очередь: ${versionId}`)
    } catch (error) {
      console.error("Error installing version:", error)
      toast.error(`Не удалось установить ${versionId}`)
    }
  }, [])

  const handleUninstall = useCallback(async (versionId: string) => {
    try {
      await backendService.uninstallVersion(versionId)
      setVersions(prev => prev.map(item => (item.id === versionId ? { ...item, installed: false } : item)))
      toast.success(`Удалено: ${versionId}`)
    } catch (error) {
      console.error("Error uninstalling version:", error)
      toast.error(`Не удалось удалить ${versionId}`)
    }
  }, [])

  const handleApplyPack = useCallback(async (packId: string) => {
    try {
      const result = await backendService.applyCustomPack(packId)
      toast.success(`Сборка применена: ${result.totalItems} элементов`)
    } catch (error) {
      console.error("Error applying custom pack:", error)
      toast.error("Не удалось применить сборку")
    }
  }, [])

  const filteredVersions = useMemo(
    () =>
      versions.filter(version => {
        if (filterType !== "all" && version.type !== filterType) {
          return false
        }

        const query = versionQuery.trim().toLowerCase()
        if (!query) {
          return true
        }

        const haystack = `${version.id} ${version.name} ${version.type}`.toLowerCase()
        return haystack.includes(query)
      }),
    [versions, filterType, versionQuery],
  )

  const sortedVersions = useMemo(() => {
    const copy = [...filteredVersions]
    copy.sort((a, b) => {
      switch (sortBy) {
        case "name":
          return a.name.localeCompare(b.name)
        case "date":
          return new Date(b.releaseDate).getTime() - new Date(a.releaseDate).getTime()
        case "type":
          return a.type.localeCompare(b.type)
        default:
          return 0
      }
    })
    return copy
  }, [filteredVersions, sortBy])

  const installedVersions = useMemo(() => sortedVersions.filter(item => item.installed), [sortedVersions])
  const availableVersions = useMemo(() => sortedVersions.filter(item => !item.installed), [sortedVersions])

  return (
    <div className="panel-container">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold mb-2">Версии Minecraft</h2>
          <p className="text-muted-foreground">Управление версиями в %USERPROFILE%\\MoonMine</p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={async () => {
              try {
                await backendService.openFolder("root")
              } catch (error) {
                console.error("Error opening game folder:", error)
                toast.error("Не удалось открыть папку игры")
              }
            }}
            className="gap-2"
          >
            <FolderOpen className="size-4" />
            Папка игры
          </Button>
          <Button variant="outline" onClick={() => void loadVersions()} disabled={isLoading} className="gap-2">
            <RefreshCw className={`size-4 ${isLoading ? "animate-spin" : ""}`} />
            Обновить
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2 min-w-[260px] flex-1">
          <label className="text-sm font-medium whitespace-nowrap">Поиск:</label>
          <Input
            value={versionQuery}
            onChange={event => setVersionQuery(event.target.value)}
            placeholder="Введите версию, например 1.20.1"
            className="max-w-md"
          />
        </div>

        <div className="flex items-center gap-2">
          <label className="text-sm font-medium">Фильтр:</label>
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все</SelectItem>
              <SelectItem value="release">Релиз</SelectItem>
              <SelectItem value="snapshot">Снапшот</SelectItem>
              <SelectItem value="forge">Forge</SelectItem>
              <SelectItem value="fabric">Fabric</SelectItem>
              <SelectItem value="quilt">Quilt</SelectItem>
              <SelectItem value="neoforge">NeoForge</SelectItem>
              <SelectItem value="optifine">OptiFine</SelectItem>
              <SelectItem value="modpack">Сборка</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-sm font-medium">Сортировка:</label>
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="name">Название</SelectItem>
              <SelectItem value="date">Дата</SelectItem>
              <SelectItem value="type">Тип</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Tabs defaultValue="installed" className="space-y-4">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="installed" className="gap-2">
            <CheckCircle className="size-4" />
            Установленные ({installedVersions.length})
          </TabsTrigger>
          <TabsTrigger value="available" className="gap-2">
            <Download className="size-4" />
            Доступные ({availableVersions.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="installed" className="space-y-4">
          {installedVersions.length === 0 ? (
            <Card className="p-8 text-center">
              <AlertCircle className="size-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="font-semibold mb-2">Нет установленных версий</h3>
            </Card>
          ) : (
            <div className="grid gap-4">
              {installedVersions.map(version => (
                <InstalledVersionCard
                  key={version.id}
                  version={version}
                  onUninstall={handleUninstall}
                  onApplyPack={handleApplyPack}
                />
              ))}
            </div>
          )}

          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">Установленные сборки ({customPacks.length})</h3>
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  try {
                    await backendService.openFolder("modpacks")
                  } catch {
                    toast.error("Не удалось открыть папку сборок")
                  }
                }}
              >
                <FolderOpen className="size-4 mr-2" />
                Папка сборок
              </Button>
            </div>

            {customPacks.length === 0 ? (
              <p className="text-sm text-muted-foreground">Сборки не найдены.</p>
            ) : (
              <div className="grid gap-2">
                {customPacks.map(pack => (
                  <Card key={pack.id} className="p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium truncate">{pack.name}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="outline" className="bg-indigo-500/20 text-indigo-300 border-indigo-400/50">
                            Сборка
                          </Badge>
                          <Badge variant="outline" className="bg-green-500/20 text-green-300 border-green-400/50">
                            Установлена
                          </Badge>
                          <span className="text-xs text-muted-foreground">{new Date(pack.modifiedAt).toLocaleString("ru-RU")}</span>
                        </div>
                      </div>
                      <Button size="sm" onClick={() => void handleApplyPack(pack.id)}>
                        Применить
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="available" className="space-y-4">
          {availableVersions.length === 0 ? (
            <Card className="p-8 text-center">
              <CheckCircle className="size-12 mx-auto text-green-500 mb-4" />
              <h3 className="font-semibold mb-2">Все версии уже установлены</h3>
            </Card>
          ) : (
            <div className="grid gap-4">
              {availableVersions.map(version => (
                <AvailableVersionCard
                  key={version.id}
                  version={version}
                  installation={installations[version.id]}
                  onInstall={handleInstall}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {isLoading && (
        <div className="grid gap-4">
          {[...Array(5)].map((_, index) => (
            <Card key={index} className="p-4">
              <div className="h-20 bg-muted rounded animate-pulse" />
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

