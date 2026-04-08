import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Settings2, AlertCircle, Clock, Calendar, Activity, FolderOpen, X, RefreshCw, Trash2 } from "lucide-react"
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
  selectedVersionId?: string
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
  return `${hours} С‡ ${mins} Рј`
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

const MODPACK_VERSION_PREFIX = "modpack::"

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
  const [isVersionMenuOpen, setIsVersionMenuOpen] = useState(false)
  const versionsRef = useRef<GameVersion[]>([])
  const settingsRef = useRef<LauncherSettings>({})
  const versionMenuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    versionsRef.current = versions
  }, [versions])

  useEffect(() => {
    settingsRef.current = launcherSettings
  }, [launcherSettings])

  const loadVersions = useCallback(async (options?: { silent?: boolean }) => {
    try {
      const loaded = await backendService.getVersions()
      setVersions(prev => (loaded.length > 0 ? loaded : prev))
      setSelectedVersion(prev => {
        const source = loaded.length > 0 ? loaded : versionsRef.current
        if (source.some(version => version.id === prev)) {
          return prev
        }
        const persistedVersion = String(settingsRef.current.selectedVersionId || "").trim()
        if (persistedVersion && source.some(version => version.id === persistedVersion)) {
          return persistedVersion
        }
        const installed = source.find(version => version.installed)
        return installed?.id ?? source[0]?.id ?? prev
      })
    } catch (error) {
      if (!options?.silent) {
        setValidationError(normalizeError(error, "РќРµ СѓРґР°Р»РѕСЃСЊ Р·Р°РіСЂСѓР·РёС‚СЊ РІРµСЂСЃРёРё"))
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
      const settings = await backendService.getSettings() as LauncherSettings
      setLauncherSettings(settings)
      settingsRef.current = settings
      const persistedVersion = String(settings.selectedVersionId || "").trim()
      if (persistedVersion) {
        setSelectedVersion(persistedVersion)
      }
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

  useEffect(() => {
    if (!isVersionMenuOpen) return

    const closeOnOutsideClick = (event: PointerEvent) => {
      const target = event.target as Node | null
      if (!target) return
      if (versionMenuRef.current && !versionMenuRef.current.contains(target)) {
        setIsVersionMenuOpen(false)
      }
    }

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsVersionMenuOpen(false)
      }
    }

    document.addEventListener("pointerdown", closeOnOutsideClick)
    document.addEventListener("keydown", closeOnEscape)

    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick)
      document.removeEventListener("keydown", closeOnEscape)
    }
  }, [isVersionMenuOpen])

  useEffect(() => {
    if (isLaunching) {
      setIsVersionMenuOpen(false)
    }
  }, [isLaunching])

  useEffect(() => {
    if (!selectedVersion) return
    if (!versions.some(version => version.id === selectedVersion)) return

    const storedVersion = String(settingsRef.current.selectedVersionId || "").trim()
    if (storedVersion === selectedVersion) return

    const timeoutId = window.setTimeout(() => {
      void backendService
        .updateSettings({ selectedVersionId: selectedVersion })
        .then(() => {
          settingsRef.current = { ...settingsRef.current, selectedVersionId: selectedVersion }
          setLauncherSettings(prev => ({ ...prev, selectedVersionId: selectedVersion }))
        })
        .catch(() => {
          // Keep launch UX stable if persisting choice fails.
        })
    }, 280)

    return () => window.clearTimeout(timeoutId)
  }, [selectedVersion, versions])

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
          : "РћС‚СЃСѓС‚СЃС‚РІСѓСЋС‚ РѕР±СЏР·Р°С‚РµР»СЊРЅС‹Рµ С„Р°Р№Р»С‹ РІРµСЂСЃРёРё"
        setValidationError(missing)
        return false
      }
      setValidationError(null)
      return true
    } catch (error) {
      setValidationError(normalizeError(error, "РџСЂРѕРІРµСЂРєР° С„Р°Р№Р»РѕРІ РЅРµ СѓРґР°Р»Р°СЃСЊ"))
      return false
    }
  }, [])

  const installVersionIfNeeded = useCallback(async (versionId: string, installed: boolean) => {
    if (installed) return

    setLaunchStatus("РЎРєР°С‡РёРІР°РЅРёРµ РІРµСЂСЃРёРё...")
    setLaunchProgress(5)
    const task = await backendService.installVersion(versionId)
    let status = task
    const deadline = Date.now() + 1000 * 60 * 25

    while (!status.completed) {
      if (Date.now() > deadline) {
        throw new Error("РџСЂРµРІС‹С€РµРЅРѕ РІСЂРµРјСЏ РѕР¶РёРґР°РЅРёСЏ Р·Р°РіСЂСѓР·РєРё РІРµСЂСЃРёРё")
      }
      await new Promise(resolve => window.setTimeout(resolve, 1200))
      status = await backendService.getInstallTaskStatus(task.taskId)
      setLaunchStatus(translateInstallStatus(status.status || "РЎРєР°С‡РёРІР°РЅРёРµ РІРµСЂСЃРёРё..."))
      setLaunchProgress(Math.max(5, Math.min(94, status.progress)))
    }

    if (status.error) {
      throw new Error(status.error)
    }

    await loadVersions({ silent: true })
  }, [loadVersions])

  const simulateLaunchProgress = useCallback(() => {
    const steps = [
      "РџРѕРґРіРѕС‚РѕРІРєР° Р·Р°РїСѓСЃРєР°...",
      "РџСЂРѕРІРµСЂРєР° С„Р°Р№Р»РѕРІ...",
      "РџСЂРѕРІРµСЂРєР° Java...",
      "Р—Р°РіСЂСѓР·РєР° СЂРµСЃСѓСЂСЃРѕРІ...",
      "Р—Р°РїСѓСЃРє РёРіСЂС‹...",
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
      setValidationError("Р’РµСЂСЃРёСЏ РЅРµ РЅР°Р№РґРµРЅР°")
      return
    }

    setIsLaunching(true)
    setValidationError(null)

    try {
      await installVersionIfNeeded(selectedVersion, selectedVersionData.installed)
    } catch (error) {
      const message = normalizeError(error, "РќРµ СѓРґР°Р»РѕСЃСЊ СЃРєР°С‡Р°С‚СЊ РІРµСЂСЃРёСЋ", true)
      setValidationError(message)
      setIsLaunching(false)
      setLaunchProgress(0)
      setLaunchStatus("")
      toast.error("РћС€РёР±РєР° Р·Р°РіСЂСѓР·РєРё РІРµСЂСЃРёРё")
      return
    }

    const isValid = await validateFiles(selectedVersion)
    if (!isValid) {
      setIsLaunching(false)
      toast.error("РћС€РёР±РєР° РїСЂРѕРІРµСЂРєРё С„Р°Р№Р»РѕРІ")
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
      toast.success(`Р—Р°РїСѓСЃРє РёРіСЂС‹: ${selectedVersion}`)

      if (effectiveSettings.closeOnLaunch) {
        window.setTimeout(() => requestHostClose(), 600)
      }
    } catch (error) {
      const message = normalizeError(error, "РќРµ СѓРґР°Р»РѕСЃСЊ Р·Р°РїСѓСЃС‚РёС‚СЊ РёРіСЂСѓ", true)
      setValidationError(message)
      setIsLaunching(false)
      toast.error("РћС€РёР±РєР° Р·Р°РїСѓСЃРєР°")
    }
  }, [selectedVersionData, selectedVersion, installVersionIfNeeded, validateFiles, simulateLaunchProgress, launcherSettings])

  const openSelectedVersionFolder = useCallback(async () => {
    if (!selectedVersionData) return
    try {
      if (selectedVersionData.type === "modpack" || selectedVersionData.id.startsWith(MODPACK_VERSION_PREFIX)) {
        await backendService.openFolder("modpacks")
      } else {
        await backendService.openFolder("versions")
      }
    } catch {
      toast.error("РќРµ СѓРґР°Р»РѕСЃСЊ РѕС‚РєСЂС‹С‚СЊ РїР°РїРєСѓ РІРµСЂСЃРёРё")
    }
  }, [selectedVersionData])

  const uninstallSelectedVersion = useCallback(async () => {
    if (!selectedVersionData) return
    if (selectedVersionData.type === "modpack" || selectedVersionData.id.startsWith(MODPACK_VERSION_PREFIX)) {
      toast.info("РЎР±РѕСЂРєРё СѓРґР°Р»СЏСЋС‚СЃСЏ РІРѕ РІРєР»Р°РґРєРµ В«РЎР±РѕСЂРєРёВ»")
      return
    }
    try {
      await backendService.uninstallVersion(selectedVersionData.id)
      toast.success(`РЈРґР°Р»РµРЅРѕ: ${selectedVersionData.name}`)
      await loadVersions({ silent: true })
    } catch (error) {
      const message = normalizeError(error, "РќРµ СѓРґР°Р»РѕСЃСЊ СѓРґР°Р»РёС‚СЊ РІРµСЂСЃРёСЋ", true)
      toast.error(message)
    }
  }, [selectedVersionData, loadVersions])

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
                      ? "Р—Р°РїСѓСЃРє..."
                      : selectedVersionData?.installed
                        ? "Р“РѕС‚РѕРІРѕ Рє РёРіСЂРµ"
                        : "Р’РµСЂСЃРёСЏ Р±СѓРґРµС‚ СЃРєР°С‡Р°РЅР° Р°РІС‚РѕРјР°С‚РёС‡РµСЃРєРё"}
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
                  aria-label="Р—Р°РєСЂС‹С‚СЊ СѓРІРµРґРѕРјР»РµРЅРёРµ РѕР± РѕС€РёР±РєРµ"
                  className="absolute right-3 top-3 rounded-md border border-red-300/30 p-1 text-red-200/90 transition hover:bg-red-300/10 hover:text-red-100"
                >
                  <X className="h-4 w-4" />
                </button>
              </Alert>
            )}

            <div className="flex items-end gap-4 flex-wrap">
              <div className="space-y-2">
                <label className="text-white/90 text-sm font-medium block font-mojangles">Р’РµСЂСЃРёСЏ</label>
                <Input
                  value={versionQuery}
                  onChange={event => setVersionQuery(event.target.value)}
                  placeholder="РџРѕРёСЃРє РІРµСЂСЃРёРё..."
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
                              РЈСЃС‚Р°РЅРѕРІР»РµРЅР°
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
                    toast.error("РќРµ СѓРґР°Р»РѕСЃСЊ РѕС‚РєСЂС‹С‚СЊ РїР°РїРєСѓ РёРіСЂС‹")
                  }
                }}
              >
                <FolderOpen className="size-4 mr-2" />
                РџР°РїРєР° РёРіСЂС‹
              </Button>

              <div className="relative" ref={versionMenuRef}>
                <Button
                  variant="outline"
                  size="icon"
                  className="glass-button border-white/20 text-white hover:bg-white/10 backdrop-blur-sm h-10 w-10"
                  onClick={() => setIsVersionMenuOpen(prev => !prev)}
                  disabled={isLaunching}
                  aria-label="Параметры версии"
                  aria-expanded={isVersionMenuOpen}
                >
                  <Settings2 className="size-4" />
                </Button>

                {isVersionMenuOpen && (
                  <div className="absolute bottom-full left-0 mb-2 z-[220] w-72 glass-button bg-gray-900/95 border-white/20 text-white rounded-xl p-1 overflow-visible">
                    <button
                      type="button"
                      className="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-left hover:bg-white/10 transition-colors font-mojangles"
                      onClick={() => {
                        setIsVersionMenuOpen(false)
                        void loadVersions()
                      }}
                    >
                      <RefreshCw className="size-4" />
                      РћР±РЅРѕРІРёС‚СЊ СЃРїРёСЃРѕРє РІРµСЂСЃРёР№
                    </button>

                    <button
                      type="button"
                      className="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-left hover:bg-white/10 transition-colors font-mojangles"
                      onClick={() => {
                        setIsVersionMenuOpen(false)
                        void openSelectedVersionFolder()
                      }}
                    >
                      <FolderOpen className="size-4" />
                      РћС‚РєСЂС‹С‚СЊ РїР°РїРєСѓ РІРµСЂСЃРёРё
                    </button>

                    <button
                      type="button"
                      className="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-left transition-colors font-mojangles disabled:opacity-50 disabled:cursor-not-allowed hover:bg-white/10"
                      onClick={() => {
                        setIsVersionMenuOpen(false)
                        void uninstallSelectedVersion()
                      }}
                      disabled={!selectedVersionData || !selectedVersionData.installed || selectedVersionData.type === "modpack"}
                    >
                      <Trash2 className="size-4" />
                      РЈРґР°Р»РёС‚СЊ РІС‹Р±СЂР°РЅРЅСѓСЋ РІРµСЂСЃРёСЋ
                    </button>
                  </div>
                )}
              </div>

              <div className="relative flex items-center ml-2">
                {isLaunching ? (
                  <button disabled className="relative cursor-not-allowed">
                    <img src={playButtonClicked} alt="Р—Р°РїСѓСЃРє" className="h-10 w-auto opacity-80" />
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
                      alt="РРіСЂР°С‚СЊ"
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
                    <span className="text-white/90 font-mojangles text-sm">Р’СЂРµРјСЏ РІ РёРіСЂРµ</span>
                  </div>
                  <div className="text-white text-lg font-mojangles">
                    {playerStats ? formatPlayTime(playerStats.totalPlayTime) : "0 С‡ 0 Рј"}
                  </div>
                </Card>

                <Card className={`glass-button border-white/20 backdrop-blur-xl bg-black/70 p-4 text-center transition-all duration-500 ${
                  statsVisible[1] ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
                }`}>
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <Activity className="size-5 text-green-400" />
                    <span className="text-white/90 font-mojangles text-sm">РЎРµСЃСЃРёРё</span>
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
                    <span className="text-white/90 font-mojangles text-sm">РРіСЂРѕРІР°СЏ СЃРµСЂРёСЏ</span>
                  </div>
                  <div className="text-white text-lg font-mojangles">
                    {playerStats ? `${playerStats.playStreak} РґРЅ.` : "0 РґРЅ."}
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

