import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Settings2, AlertCircle, Clock, Calendar, Activity, FolderOpen, X } from "lucide-react"
import { Button } from "./ui/button"
import { Card } from "./ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select"
import { Input } from "./ui/input"
import { Progress } from "./ui/progress"
import { Badge } from "./ui/badge"
import { Alert, AlertDescription } from "./ui/alert"
import { backendService, type GameVersion, type LaunchOptions, type PlayerStats } from "../services/backend"
import minecraftBackground from "figma:asset/c80877b64f6066aa2903984efb421fe249bbada5.png"
import appAvatar from "../assets/moonlauncher-avatar.png"
import playButtonImage from "figma:asset/1a8ff5f66977bec7d4a89b762e1be6ce4207c518.png"
import playButtonHover from "figma:asset/6dbff84a642dd474a66e1bb27794cd6c580c2127.png"
import playButtonClicked from "figma:asset/7ee28fe1acef8541f18c45b1178c32a25691e286.png"
import { toast } from "sonner"
import { translateInstallStatus } from "../utils/installStatus"
import { subscribeSettingsUpdated } from "../utils/settingsSync"

interface LauncherSettings {
  selectedProfileId?: string
  javaArgs?: string
  windowWidth?: number
  windowHeight?: number
  fullscreen?: boolean
  closeOnLaunch?: boolean
  playBackgroundUrl?: string
  themeBackgroundOpacity?: number
}

const TECHNICAL_ERROR_MARKERS = [
  "traceback",
  "exception",
  "java.lang",
  "microsoft.web.webview2",
  "dll",
  "0x",
  "e_accessdenied",
  "stack",
  " at ",
  "subprocess",
  "winerror",
  "permissionerror",
]

function normalizeError(error: unknown, fallback: string, hideTechnical = false): string {
  if (!(error instanceof Error)) return fallback
  const cleaned = error.message.replace(/^Request failed \(\d+\)\s*/i, "").trim()
  if (!cleaned) return fallback
  if (!hideTechnical) return cleaned
  const lowered = cleaned.toLowerCase()
  if (cleaned.length > 180) return fallback
  if (TECHNICAL_ERROR_MARKERS.some(marker => lowered.includes(marker))) {
    return fallback
  }
  return cleaned
}

function formatPlayTime(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return `${hours} ч ${mins} м`
}

function parseJvmArgs(value: string | undefined): string[] {
  return String(value || "")
    .split(/\s+/)
    .map(item => item.trim())
    .filter(Boolean)
}

function requestHostClose() {
  const webviewHost = window as Window & { chrome?: { webview?: { postMessage?: (message: string) => void } } }
  webviewHost.chrome?.webview?.postMessage?.("moonlauncher:close")
  window.close()
}

export function PlayPanel() {
  const [selectedVersion, setSelectedVersion] = useState("latest-release")
  const [versions, setVersions] = useState<GameVersion[]>([])
  const [versionQuery, setVersionQuery] = useState("")
  const [isLaunching, setIsLaunching] = useState(false)
  const [isHovered, setIsHovered] = useState(false)
  const [launchProgress, setLaunchProgress] = useState(0)
  const [launchStatus, setLaunchStatus] = useState("")
  const [processId, setProcessId] = useState<string | null>(null)
  const [validationError, setValidationError] = useState<string | null>(null)
  const [playerStats, setPlayerStats] = useState<PlayerStats | null>(null)
  const [launcherSettings, setLauncherSettings] = useState<LauncherSettings>({})
  const [statsVisible, setStatsVisible] = useState([false, false, false])
  const versionsRef = useRef<GameVersion[]>([])

  useEffect(() => {
    versionsRef.current = versions
  }, [versions])

  const loadVersions = useCallback(async (options?: { silent?: boolean }) => {
    try {
      const loaded = await backendService.getVersions()
      setVersions(prev => (loaded.length > 0 ? loaded : prev))
      setSelectedVersion(prev => {
        const source = loaded.length > 0 ? loaded : versionsRef.current
        if (source.some(version => version.id === prev)) {
          return prev
        }
        const installed = source.find(version => version.installed)
        return installed?.id ?? source[0]?.id ?? prev
      })
    } catch (error) {
      if (!options?.silent) {
        setValidationError(normalizeError(error, "Не удалось загрузить версии"))
      }
    }
  }, [])

  const loadPlayerStats = useCallback(async () => {
    try {
      const stats = await backendService.getPlayerStats()
      setPlayerStats(stats)
    } catch {
      setPlayerStats(null)
    }
  }, [])

  const loadSettings = useCallback(async () => {
    try {
      const settings = await backendService.getSettings()
      setLauncherSettings(settings)
    } catch (error) {
      console.error("Error loading settings:", error)
    }
  }, [])

  useEffect(() => {
    void loadVersions()
    void loadPlayerStats()
    void loadSettings()

    const t1 = window.setTimeout(() => setStatsVisible([true, false, false]), 120)
    const t2 = window.setTimeout(() => setStatsVisible([true, true, false]), 260)
    const t3 = window.setTimeout(() => setStatsVisible([true, true, true]), 420)

    return () => {
      window.clearTimeout(t1)
      window.clearTimeout(t2)
      window.clearTimeout(t3)
    }
  }, [loadPlayerStats, loadSettings, loadVersions])

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== "visible") return
      void loadVersions({ silent: true })
      void loadSettings()
    }

    const intervalId = window.setInterval(refresh, 60_000)
    window.addEventListener("focus", refresh)
    document.addEventListener("visibilitychange", refresh)
    const unsubscribe = subscribeSettingsUpdated(refresh)

    return () => {
      window.clearInterval(intervalId)
      window.removeEventListener("focus", refresh)
      document.removeEventListener("visibilitychange", refresh)
      unsubscribe()
    }
  }, [loadSettings, loadVersions])

  useEffect(() => {
    if (!processId) return
    const intervalId = window.setInterval(async () => {
      try {
        const status = await backendService.getGameStatus(processId)
        if (status.status !== "running") {
          window.clearInterval(intervalId)
          setProcessId(null)
          setIsLaunching(false)
          setLaunchProgress(0)
          setLaunchStatus("")
          void loadPlayerStats()
        }
      } catch {
        window.clearInterval(intervalId)
      }
    }, 3000)
    return () => window.clearInterval(intervalId)
  }, [processId, loadPlayerStats])

  const filteredVersions = useMemo(() => {
    const query = versionQuery.trim().toLowerCase()
    if (!query) return versions
    return versions.filter(version => `${version.id} ${version.name} ${version.type}`.toLowerCase().includes(query))
  }, [versions, versionQuery])

  const selectedVersionData = useMemo(
    () => versions.find(version => version.id === selectedVersion),
    [selectedVersion, versions],
  )

  const validateFiles = useCallback(async (versionId: string) => {
    try {
      const validation = await backendService.validateGameFiles(versionId)
      if (!validation.valid) {
        const missing = validation.missingFiles.length
          ? validation.missingFiles.join(", ")
          : "Отсутствуют обязательные файлы версии"
        setValidationError(missing)
        return false
      }
      setValidationError(null)
      return true
    } catch (error) {
      setValidationError(normalizeError(error, "Проверка файлов не удалась"))
      return false
    }
  }, [])

  const installVersionIfNeeded = useCallback(async (versionId: string, installed: boolean) => {
    if (installed) return

    setLaunchStatus("Скачивание версии...")
    setLaunchProgress(5)
    const task = await backendService.installVersion(versionId)
    let status = task
    const deadline = Date.now() + 1000 * 60 * 25

    while (!status.completed) {
      if (Date.now() > deadline) {
        throw new Error("Превышено время ожидания загрузки версии")
      }
      await new Promise(resolve => window.setTimeout(resolve, 1200))
      status = await backendService.getInstallTaskStatus(task.taskId)
      setLaunchStatus(translateInstallStatus(status.status || "Скачивание версии..."))
      setLaunchProgress(Math.max(5, Math.min(94, status.progress)))
    }

    if (status.error) {
      throw new Error(status.error)
    }

    await loadVersions({ silent: true })
  }, [loadVersions])

  const simulateLaunchProgress = useCallback(() => {
    const steps = [
      "Подготовка запуска...",
      "Проверка файлов...",
      "Проверка Java...",
      "Загрузка ресурсов...",
      "Запуск игры...",
    ]

    let currentStep = 0
    const interval = window.setInterval(() => {
      if (currentStep < steps.length) {
        setLaunchStatus(steps[currentStep])
        setLaunchProgress((currentStep + 1) * (100 / steps.length))
        currentStep += 1
      } else {
        window.clearInterval(interval)
      }
    }, 850)
  }, [])

  const handleLaunch = useCallback(async () => {
    if (!selectedVersionData) {
      setValidationError("Версия не найдена")
      return
    }

    setIsLaunching(true)
    setValidationError(null)

    try {
      await installVersionIfNeeded(selectedVersion, selectedVersionData.installed)
    } catch (error) {
      const message = normalizeError(error, "Не удалось скачать версию", true)
      setValidationError(message)
      setIsLaunching(false)
      setLaunchProgress(0)
      setLaunchStatus("")
      toast.error("Ошибка загрузки версии")
      return
    }

    const isValid = await validateFiles(selectedVersion)
    if (!isValid) {
      setIsLaunching(false)
      toast.error("Ошибка проверки файлов")
      return
    }

    try {
      let effectiveSettings: LauncherSettings = launcherSettings
      try {
        const latestSettings = await backendService.getSettings()
        setLauncherSettings(latestSettings)
        effectiveSettings = { ...launcherSettings, ...latestSettings }
      } catch {
        // Launch continues using current in-memory settings.
      }

      const launchOptions: LaunchOptions = {
        profileId: "",
        versionId: selectedVersion,
        javaArgs: parseJvmArgs(effectiveSettings.javaArgs),
        windowWidth: Number(effectiveSettings.windowWidth || 1280),
        windowHeight: Number(effectiveSettings.windowHeight || 720),
        fullscreen: Boolean(effectiveSettings.fullscreen),
      }

      const response = await backendService.launchGame(launchOptions)
      setProcessId(response.processId)
      simulateLaunchProgress()
      toast.success(`Запуск игры: ${selectedVersion}`)

      if (effectiveSettings.closeOnLaunch) {
        window.setTimeout(() => requestHostClose(), 600)
      }
    } catch (error) {
      const message = normalizeError(error, "Не удалось запустить игру", true)
      setValidationError(message)
      setIsLaunching(false)
      toast.error("Ошибка запуска")
    }
  }, [selectedVersionData, selectedVersion, installVersionIfNeeded, validateFiles, simulateLaunchProgress, launcherSettings])

  const playBackgroundImage = String(launcherSettings.playBackgroundUrl || "").trim() || minecraftBackground
  const backgroundOpacity = Math.max(0.2, Math.min(0.9, Number(launcherSettings.themeBackgroundOpacity ?? 0.45)))

  return (
    <div className="w-full h-screen relative overflow-y-auto play-panel-scroll">
      <div className="absolute inset-0">
        <img src={playBackgroundImage} alt="moonlauncher background" className="w-full h-full object-cover fixed" />
        <div className="absolute inset-0 fixed" style={{ backgroundColor: `rgba(0, 0, 0, ${backgroundOpacity.toFixed(2)})` }} />
      </div>

      <div className="relative z-10 min-h-screen flex items-end">
        <div className="w-full bg-gradient-to-t from-black via-black/90 via-black/70 to-transparent p-8">
          <div className="max-w-5xl">
            <div className="flex items-center gap-4 mb-6">
              <div className="flex items-center gap-3">
                <div className="w-14 h-14 rounded-lg flex items-center justify-center shadow-lg overflow-hidden">
                  <img src={appAvatar} alt="moonlauncher avatar" className="w-full h-full object-cover" />
                </div>
                <div>
                  <h2 className="text-white text-lg font-medium font-nunito tracking-wider">moonlauncher</h2>
                  <p className="text-white/70 text-sm font-mojangles">
                    {isLaunching
                      ? "Запуск..."
                      : selectedVersionData?.installed
                        ? "Готово к игре"
                        : "Версия будет скачана автоматически"}
                  </p>
                </div>
              </div>
            </div>

            {validationError && (
              <Alert className="relative mb-4 glass-button bg-red-900/30 border-red-500/50 text-red-300 pr-12">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="font-mojangles">{validationError}</AlertDescription>
                <button
                  type="button"
                  onClick={() => setValidationError(null)}
                  aria-label="Закрыть уведомление об ошибке"
                  className="absolute right-3 top-3 rounded-md border border-red-300/30 p-1 text-red-200/90 transition hover:bg-red-300/10 hover:text-red-100"
                >
                  <X className="h-4 w-4" />
                </button>
              </Alert>
            )}

            <div className="flex items-end gap-4 flex-wrap">
              <div className="space-y-2">
                <label className="text-white/90 text-sm font-medium block font-mojangles">Версия</label>
                <Input
                  value={versionQuery}
                  onChange={event => setVersionQuery(event.target.value)}
                  placeholder="Поиск версии..."
                  className="w-80 h-10 glass-button border-white/20 text-white font-mojangles bg-black/40 placeholder:text-white/50"
                  disabled={isLaunching}
                />
                <Select value={selectedVersion} onValueChange={setSelectedVersion} disabled={isLaunching}>
                  <SelectTrigger className="w-80 h-10 glass-button border-white/20 text-white backdrop-blur-sm font-mojangles">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="glass-button bg-gray-900/90 border-white/20 backdrop-blur-xl">
                    {filteredVersions.map(version => (
                      <SelectItem key={version.id} value={version.id} className="text-white hover:bg-white/10 focus:bg-white/10 font-mojangles">
                        <div className="flex items-center gap-2">
                          <span>{version.name}</span>
                          {version.installed && (
                            <Badge variant="outline" className="text-xs bg-green-500/20 text-green-400 border-green-400/50 font-mojangles">
                              Установлена
                            </Badge>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Button
                variant="outline"
                className="glass-button border-white/20 text-white hover:bg-white/10 backdrop-blur-sm h-10"
                onClick={async () => {
                  try {
                    await backendService.openFolder("root")
                  } catch {
                    toast.error("Не удалось открыть папку игры")
                  }
                }}
              >
                <FolderOpen className="size-4 mr-2" />
                Папка игры
              </Button>

              <Button variant="outline" size="icon" className="glass-button border-white/20 text-white hover:bg-white/10 backdrop-blur-sm h-10 w-10" disabled>
                <Settings2 className="size-4" />
              </Button>

              <div className="relative flex items-center ml-2">
                {isLaunching ? (
                  <button disabled className="relative cursor-not-allowed">
                    <img src={playButtonClicked} alt="Запуск" className="h-10 w-auto opacity-80" />
                  </button>
                ) : (
                  <button
                    onClick={handleLaunch}
                    disabled={!selectedVersionData}
                    onMouseEnter={() => setIsHovered(true)}
                    onMouseLeave={() => setIsHovered(false)}
                    className={`relative transition-transform duration-200 active:scale-95 ${
                      selectedVersionData ? "cursor-pointer hover:scale-105" : "cursor-not-allowed opacity-60"
                    }`}
                  >
                    <img
                      src={isHovered && selectedVersionData ? playButtonHover : playButtonImage}
                      alt="Играть"
                      className="h-10 w-auto transition-all duration-200"
                    />
                  </button>
                )}
              </div>
            </div>

            {isLaunching && (
              <div className="mt-4 space-y-2 max-w-md">
                <Progress value={launchProgress} className="h-2 bg-black/40" />
                <p className="text-white/70 text-sm font-mojangles">{launchStatus}</p>
              </div>
            )}

            <div className="mt-8 pt-6 border-t border-white/20">
              <div className="grid gap-4 md:grid-cols-3">
                <Card className={`glass-button border-white/20 backdrop-blur-xl bg-black/70 p-4 text-center transition-all duration-500 ${
                  statsVisible[0] ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
                }`}>
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <Clock className="size-5 text-blue-400" />
                    <span className="text-white/90 font-mojangles text-sm">Время в игре</span>
                  </div>
                  <div className="text-white text-lg font-mojangles">
                    {playerStats ? formatPlayTime(playerStats.totalPlayTime) : "0 ч 0 м"}
                  </div>
                </Card>

                <Card className={`glass-button border-white/20 backdrop-blur-xl bg-black/70 p-4 text-center transition-all duration-500 ${
                  statsVisible[1] ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
                }`}>
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <Activity className="size-5 text-green-400" />
                    <span className="text-white/90 font-mojangles text-sm">Сессии</span>
                  </div>
                  <div className="text-white text-lg font-mojangles">
                    {playerStats ? playerStats.totalSessions : 0}
                  </div>
                </Card>

                <Card className={`glass-button border-white/20 backdrop-blur-xl bg-black/70 p-4 text-center transition-all duration-500 ${
                  statsVisible[2] ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
                }`}>
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <Calendar className="size-5 text-orange-400" />
                    <span className="text-white/90 font-mojangles text-sm">Игровая серия</span>
                  </div>
                  <div className="text-white text-lg font-mojangles">
                    {playerStats ? `${playerStats.playStreak} дн.` : "0 дн."}
                  </div>
                </Card>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="relative z-10 h-28 bg-gradient-to-b from-black to-black" />
    </div>
  )
}
