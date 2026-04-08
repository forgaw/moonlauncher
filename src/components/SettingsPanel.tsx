import { type ChangeEvent, useCallback, useEffect, useRef, useState } from "react"
import { Save, RefreshCw, Monitor, Cpu, Folder, AlertCircle, Shield, FolderOpen, Palette, Paintbrush, Upload, Eraser, ArrowUp, ArrowDown } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card"
import { Button } from "./ui/button"
import { Label } from "./ui/label"
import { Switch } from "./ui/switch"
import { Slider } from "./ui/slider"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select"
import { Input } from "./ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs"
import { Alert, AlertDescription } from "./ui/alert"
import { backendService } from "../services/backend"
import { BackendStatus } from "./BackendStatus"
import { toast } from "sonner"
import { notifySettingsUpdated } from "../utils/settingsSync"
import {
  SIDEBAR_NON_HIDEABLE_IDS,
  SIDEBAR_TABS,
  normalizeHiddenSidebarTabs,
  normalizeSidebarTabOrder,
  type SidebarTabId,
} from "../constants/sidebarTabs"

interface Settings {
  gameDirectory: string
  javaPath: string
  javaArgs: string
  runtimeOptimizerEnabled: boolean
  runtimeOptimizerAgentPath: string
  runtimeOptimizerArgs: string
  maxMemory: number
  minMemory: number
  windowWidth: number
  windowHeight: number
  fullscreen: boolean
  closeOnLaunch: boolean
  autoUpdate: boolean
  betaVersions: boolean
  analytics: boolean
  theme: string
  language: string
  proxyEnabled: boolean
  proxyScheme: string
  proxyHost: string
  proxyPort: number
  proxyAuth: boolean
  proxyUsername: string
  proxyPassword: string
  proxyCustomUrl: string
  proxyBypass: string
  modrinthApiKey: string
  curseforgeApiKey: string
  preferredServerAddress: string
  themePreset: string
  themeAccent: string
  themeBackgroundOpacity: number
  themeSidebarOpacity: number
  themeAnimations: boolean
  playBackgroundUrl: string
  customFontName: string
  customFontUrl: string
  hideMoonPacksSuggestion: boolean
  discordRichPresence: boolean
  discordClientId: string
  showPerformanceOverlay: boolean
  themeTextOutline: boolean
  themeTextOutlineStrength: number
  themeTextOutlineOpacity: number
  themeGlassBlur: number
  themeCardRadius: number
  hiddenSidebarTabs: string[]
  sidebarTabOrder: string[]
}

const defaults: Settings = {
  gameDirectory: "",
  javaPath: "java",
  javaArgs: "-Xms1G -Xmx4G",
  runtimeOptimizerEnabled: false,
  runtimeOptimizerAgentPath: "",
  runtimeOptimizerArgs: "fastMath=true;entityTick=true;allocationCache=true;network=true;verbose=false",
  maxMemory: 4096,
  minMemory: 1024,
  windowWidth: 1280,
  windowHeight: 720,
  fullscreen: false,
  closeOnLaunch: false,
  autoUpdate: true,
  betaVersions: true,
  analytics: false,
  theme: "dark",
  language: "ru",
  proxyEnabled: false,
  proxyScheme: "http",
  proxyHost: "",
  proxyPort: 8080,
  proxyAuth: false,
  proxyUsername: "",
  proxyPassword: "",
  proxyCustomUrl: "",
  proxyBypass: "",
  modrinthApiKey: "",
  curseforgeApiKey: "",
  preferredServerAddress: "",
  themePreset: "moon-dark",
  themeAccent: "#22c55e",
  themeBackgroundOpacity: 0.45,
  themeSidebarOpacity: 0.9,
  themeAnimations: true,
  playBackgroundUrl: "",
  customFontName: "Montserrat",
  customFontUrl: "",
  hideMoonPacksSuggestion: false,
  discordRichPresence: false,
  discordClientId: "1215873028268019712",
  showPerformanceOverlay: false,
  themeTextOutline: true,
  themeTextOutlineStrength: 1.0,
  themeTextOutlineOpacity: 0.35,
  themeGlassBlur: 10,
  themeCardRadius: 12,
  hiddenSidebarTabs: [],
  sidebarTabOrder: normalizeSidebarTabOrder([]),
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ""))
    reader.onerror = () => reject(new Error("Не удалось прочитать файл"))
    reader.readAsDataURL(file)
  })
}

export function SettingsPanel() {
  const [settings, setSettings] = useState<Settings>(defaults)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [hasChanges, setHasChanges] = useState(false)

  const backgroundInputRef = useRef<HTMLInputElement | null>(null)
  const fontInputRef = useRef<HTMLInputElement | null>(null)

  const loadSettings = useCallback(async () => {
    setIsLoading(true)
    try {
      const loaded = await backendService.getSettings()
      setSettings(prev => ({ ...prev, ...loaded, sidebarTabOrder: normalizeSidebarTabOrder(loaded.sidebarTabOrder), hiddenSidebarTabs: normalizeHiddenSidebarTabs(loaded.hiddenSidebarTabs) }))
    } catch (error) {
      console.error("Error loading settings:", error)
      toast.error("Не удалось загрузить настройки")
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadSettings()
  }, [loadSettings])

  const saveSettings = useCallback(async () => {
    setIsSaving(true)
    setSaveMessage(null)
    try {
      const payload = {
        ...settings,
        sidebarTabOrder: normalizeSidebarTabOrder(settings.sidebarTabOrder),
        hiddenSidebarTabs: normalizeHiddenSidebarTabs(settings.hiddenSidebarTabs),
      }
      await backendService.updateSettings(payload)
      notifySettingsUpdated()
      setSaveMessage("Настройки сохранены")
      setHasChanges(false)
      toast.success("Настройки сохранены")
      window.setTimeout(() => setSaveMessage(null), 3000)
    } catch (error) {
      console.error("Error saving settings:", error)
      setSaveMessage("Не удалось сохранить настройки")
      toast.error("Ошибка сохранения")
    } finally {
      setIsSaving(false)
    }
  }, [settings])

  const updateSetting = useCallback(<K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }))
    setHasChanges(true)
  }, [])

  const resetToDefaults = useCallback(() => {
    setSettings({
      ...defaults,
      sidebarTabOrder: normalizeSidebarTabOrder([]),
      hiddenSidebarTabs: normalizeHiddenSidebarTabs([]),
    })
    setHasChanges(true)
  }, [])

  const toggleSidebarTabHidden = useCallback((tabId: SidebarTabId, hidden: boolean) => {
    if (SIDEBAR_NON_HIDEABLE_IDS.includes(tabId)) {
      return
    }
    setSettings(prev => {
      const current = normalizeHiddenSidebarTabs(prev.hiddenSidebarTabs)
      const next = hidden
        ? normalizeHiddenSidebarTabs([...current, tabId])
        : current.filter(item => item !== tabId)
      return { ...prev, hiddenSidebarTabs: next }
    })
    setHasChanges(true)
  }, [])

  const moveSidebarTab = useCallback((tabId: SidebarTabId, direction: -1 | 1) => {
    setSettings(prev => {
      const order = normalizeSidebarTabOrder(prev.sidebarTabOrder)
      const index = order.indexOf(tabId)
      if (index < 0) return prev
      const nextIndex = index + direction
      if (nextIndex < 0 || nextIndex >= order.length) return prev
      const next = [...order]
      const [moved] = next.splice(index, 1)
      next.splice(nextIndex, 0, moved)
      return { ...prev, sidebarTabOrder: next }
    })
    setHasChanges(true)
  }, [])

  const handleBackgroundPick = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      const dataUrl = await fileToDataUrl(file)
      updateSetting("playBackgroundUrl", dataUrl)
      toast.success(`Фон выбран: ${file.name}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось выбрать фон")
    } finally {
      event.target.value = ""
    }
  }, [updateSetting])

  const handleFontPick = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      const dataUrl = await fileToDataUrl(file)
      updateSetting("customFontUrl", dataUrl)
      const guessedName = file.name.replace(/\.[^.]+$/, "") || "CustomFont"
      updateSetting("customFontName", guessedName)
      toast.success(`Шрифт выбран: ${file.name}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось выбрать шрифт")
    } finally {
      event.target.value = ""
    }
  }, [updateSetting])

  const normalizedSidebarOrder = normalizeSidebarTabOrder(settings.sidebarTabOrder)
  const hiddenSidebarSet = new Set(normalizeHiddenSidebarTabs(settings.hiddenSidebarTabs))

  if (isLoading) {
    return (
      <div className="panel-container">
        <Card className="p-10">
          <div className="h-24 bg-muted rounded animate-pulse" />
        </Card>
      </div>
    )
  }

  return (
    <div className="panel-container">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold mb-2">Настройки</h2>
          <p className="text-muted-foreground">Параметры moonlauncher, игры и кастомизации интерфейса</p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {saveMessage && (
            <Alert className={`${saveMessage.includes("Не удалось") ? "border-destructive bg-destructive/10" : "border-green-500 bg-green-500/10"} min-w-fit`}>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-sm">{saveMessage}</AlertDescription>
            </Alert>
          )}

          <Button variant="outline" onClick={resetToDefaults} className="gap-2">
            <RefreshCw className="size-4" />
            Сброс
          </Button>

          <Button onClick={saveSettings} disabled={isSaving || !hasChanges} className="gap-2">
            <Save className={`size-4 ${isSaving ? "animate-spin" : ""}`} />
            {isSaving ? "Сохранение..." : "Сохранить"}
          </Button>
        </div>
      </div>

      <Tabs defaultValue="game" className="space-y-6">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="game" className="gap-2">
            <Monitor className="size-4" />
            Игра
          </TabsTrigger>
          <TabsTrigger value="performance" className="gap-2">
            <Cpu className="size-4" />
            Производительность
          </TabsTrigger>
          <TabsTrigger value="launcher" className="gap-2">
            <Folder className="size-4" />
            Лаунчер
          </TabsTrigger>
          <TabsTrigger value="appearance" className="gap-2">
            <Palette className="size-4" />
            Тема
          </TabsTrigger>
          <TabsTrigger value="advanced" className="gap-2">
            <Shield className="size-4" />
            Дополнительно
          </TabsTrigger>
        </TabsList>

        <TabsContent value="game" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Пути игры</CardTitle>
              <CardDescription>Папка игры по умолчанию: %USERPROFILE%\MoonMine</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="gameDirectory">Папка игры</Label>
                <Input
                  id="gameDirectory"
                  value={settings.gameDirectory}
                  onChange={event => updateSetting("gameDirectory", event.target.value)}
                  placeholder="%USERPROFILE%\\MoonMine"
                />
              </div>

              <div className="flex flex-wrap gap-2">
                {[
                  { key: "root", label: "Папка игры" },
                  { key: "versions", label: "Версии" },
                  { key: "saves", label: "Сохранения" },
                  { key: "mods", label: "Моды" },
                  { key: "resourcepacks", label: "Ресурс-паки" },
                  { key: "shaderpacks", label: "Шейдеры" },
                  { key: "modpacks", label: "Сборки" },
                ].map(folder => (
                  <Button
                    key={folder.key}
                    variant="outline"
                    onClick={async () => {
                      try {
                        await backendService.openFolder(folder.key)
                      } catch {
                        toast.error(`Не удалось открыть: ${folder.label}`)
                      }
                    }}
                  >
                    <FolderOpen className="size-4 mr-2" />
                    {folder.label}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="performance" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Память и окно</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Минимальная RAM: {settings.minMemory} MB</Label>
                <Slider value={[settings.minMemory]} onValueChange={([value]) => updateSetting("minMemory", value)} min={512} max={8192} step={256} />
              </div>
              <div className="space-y-2">
                <Label>Максимальная RAM: {settings.maxMemory} MB</Label>
                <Slider value={[settings.maxMemory]} onValueChange={([value]) => updateSetting("maxMemory", value)} min={1024} max={16384} step={512} />
              </div>
              <div className="settings-row">
                <Label htmlFor="fullscreen">Полный экран</Label>
                <Switch id="fullscreen" checked={settings.fullscreen} onCheckedChange={checked => updateSetting("fullscreen", checked)} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="launcher" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Поведение лаунчера</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="settings-row">
                <Label htmlFor="closeOnLaunch">Закрывать лаунчер при старте игры</Label>
                <Switch id="closeOnLaunch" checked={settings.closeOnLaunch} onCheckedChange={checked => updateSetting("closeOnLaunch", checked)} />
              </div>
              <div className="settings-row">
                <Label htmlFor="autoUpdate">Автообновление версий</Label>
                <Switch id="autoUpdate" checked={settings.autoUpdate} onCheckedChange={checked => updateSetting("autoUpdate", checked)} />
              </div>
              <div className="settings-row">
                <Label htmlFor="betaVersions">Показывать snapshot/beta версии</Label>
                <Switch id="betaVersions" checked={settings.betaVersions} onCheckedChange={checked => updateSetting("betaVersions", checked)} />
              </div>
              <div className="settings-row">
                <Label htmlFor="hideMoonPacksSuggestion">Скрыть предложение сборок Moonlauncher</Label>
                <Switch id="hideMoonPacksSuggestion" checked={settings.hideMoonPacksSuggestion} onCheckedChange={checked => updateSetting("hideMoonPacksSuggestion", checked)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="language">Язык</Label>
                <Select value={settings.language} onValueChange={value => updateSetting("language", value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ru">Русский</SelectItem>
                    <SelectItem value="en">Английский</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-3 rounded-xl border border-white/10 p-3 bg-black/20">
                <Label>Боковая панель: порядок и скрытие вкладок</Label>
                {normalizedSidebarOrder.map((tabId, index) => {
                  const tab = SIDEBAR_TABS.find(item => item.id === tabId)
                  if (!tab) return null
                  const isHidden = hiddenSidebarSet.has(tabId)
                  const canHide = !SIDEBAR_NON_HIDEABLE_IDS.includes(tabId)
                  return (
                    <div key={tabId} className="flex items-center justify-between gap-2 rounded-md border border-white/10 px-3 py-2">
                      <div className="min-w-0">
                        <p className="text-sm truncate">{tab.label}</p>
                        <p className="text-xs text-muted-foreground">
                          {isHidden ? "Скрыта в боковой панели" : "Показывается в боковой панели"}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="outline"
                          size="icon"
                          disabled={index === 0}
                          onClick={() => moveSidebarTab(tabId, -1)}
                        >
                          <ArrowUp className="size-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          disabled={index === normalizedSidebarOrder.length - 1}
                          onClick={() => moveSidebarTab(tabId, 1)}
                        >
                          <ArrowDown className="size-4" />
                        </Button>
                        {canHide ? (
                          <Switch
                            checked={!isHidden}
                            onCheckedChange={checked => toggleSidebarTabHidden(tabId, !checked)}
                          />
                        ) : (
                          <div className="text-xs text-muted-foreground px-2">Всегда</div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="appearance" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Paintbrush className="size-4" />
                Тема и кастомизация
              </CardTitle>
              <CardDescription>Акцент, обводка текста, прозрачность, анимации, фон и кастомные шрифты</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="themePreset">Пресет темы</Label>
                <Select value={settings.themePreset} onValueChange={value => updateSetting("themePreset", value)}>
                  <SelectTrigger id="themePreset">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="moon-dark">Moon Dark</SelectItem>
                    <SelectItem value="night-sky">Night Sky</SelectItem>
                    <SelectItem value="forest">Forest</SelectItem>
                    <SelectItem value="ocean">Ocean</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid md:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="themeAccent">Акцентный цвет</Label>
                  <div className="flex gap-2">
                    <Input id="themeAccent" value={settings.themeAccent} onChange={event => updateSetting("themeAccent", event.target.value)} placeholder="#22c55e" />
                    <Input type="color" value={settings.themeAccent} onChange={event => updateSetting("themeAccent", event.target.value)} className="w-16 p-1" />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="customFontName">Имя шрифта</Label>
                  <Input id="customFontName" value={settings.customFontName} onChange={event => updateSetting("customFontName", event.target.value)} placeholder="Montserrat" />
                </div>
              </div>

              <div className="settings-row">
                <Label htmlFor="themeTextOutline">Обводка текста акцентным цветом</Label>
                <Switch id="themeTextOutline" checked={settings.themeTextOutline} onCheckedChange={checked => updateSetting("themeTextOutline", checked)} />
              </div>

              {settings.themeTextOutline && (
                <>
                  <div className="space-y-2">
                    <Label>Толщина обводки: {settings.themeTextOutlineStrength.toFixed(1)} px</Label>
                    <Slider
                      value={[Math.round(settings.themeTextOutlineStrength * 10)]}
                      onValueChange={([value]) => updateSetting("themeTextOutlineStrength", clampNumber(value / 10, 0.2, 2))}
                      min={2}
                      max={20}
                      step={1}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Интенсивность обводки: {Math.round(settings.themeTextOutlineOpacity * 100)}%</Label>
                    <Slider
                      value={[Math.round(settings.themeTextOutlineOpacity * 100)]}
                      onValueChange={([value]) => updateSetting("themeTextOutlineOpacity", clampNumber(value / 100, 0.05, 0.9))}
                      min={5}
                      max={90}
                      step={1}
                    />
                  </div>
                </>
              )}

              <div className="space-y-2">
                <Label>Прозрачность фона вкладки "Играть": {Math.round(settings.themeBackgroundOpacity * 100)}%</Label>
                <Slider value={[Math.round(settings.themeBackgroundOpacity * 100)]} onValueChange={([value]) => updateSetting("themeBackgroundOpacity", clampNumber(value / 100, 0.2, 0.9))} min={20} max={90} step={1} />
              </div>

              <div className="space-y-2">
                <Label>Прозрачность боковой панели: {Math.round(settings.themeSidebarOpacity * 100)}%</Label>
                <Slider value={[Math.round(settings.themeSidebarOpacity * 100)]} onValueChange={([value]) => updateSetting("themeSidebarOpacity", clampNumber(value / 100, 0.55, 1))} min={55} max={100} step={1} />
              </div>

              <div className="space-y-2">
                <Label>Размытие стекла: {Math.round(settings.themeGlassBlur)} px</Label>
                <Slider value={[Math.round(settings.themeGlassBlur)]} onValueChange={([value]) => updateSetting("themeGlassBlur", clampNumber(value, 0, 28))} min={0} max={28} step={1} />
              </div>

              <div className="space-y-2">
                <Label>Скругление карточек: {Math.round(settings.themeCardRadius)} px</Label>
                <Slider value={[Math.round(settings.themeCardRadius)]} onValueChange={([value]) => updateSetting("themeCardRadius", clampNumber(value, 0, 24))} min={0} max={24} step={1} />
              </div>

              <div className="settings-row">
                <Label htmlFor="themeAnimations">Анимации интерфейса</Label>
                <Switch id="themeAnimations" checked={settings.themeAnimations} onCheckedChange={checked => updateSetting("themeAnimations", checked)} />
              </div>

              <div className="space-y-2">
                <Label>Фон вкладки "Играть" (файл с компьютера)</Label>
                <div className="flex gap-2 flex-wrap">
                  <input ref={backgroundInputRef} type="file" accept="image/*" className="hidden" onChange={event => void handleBackgroundPick(event)} />
                  <Button variant="outline" onClick={() => backgroundInputRef.current?.click()}>
                    <Upload className="size-4 mr-2" />
                    Выбрать файл
                  </Button>
                  <Button variant="outline" onClick={() => updateSetting("playBackgroundUrl", "")}>
                    <Eraser className="size-4 mr-2" />
                    Очистить
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {settings.playBackgroundUrl ? "Фон установлен из локального файла." : "Фон не выбран."}
                </p>
              </div>

              <div className="space-y-2">
                <Label>Кастомный шрифт (файл с компьютера)</Label>
                <div className="flex gap-2 flex-wrap">
                  <input ref={fontInputRef} type="file" accept=".ttf,.otf,.woff,.woff2,.ttc" className="hidden" onChange={event => void handleFontPick(event)} />
                  <Button variant="outline" onClick={() => fontInputRef.current?.click()}>
                    <Upload className="size-4 mr-2" />
                    Выбрать шрифт
                  </Button>
                  <Button variant="outline" onClick={() => updateSetting("customFontUrl", "")}>
                    <Eraser className="size-4 mr-2" />
                    Очистить
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {settings.customFontUrl ? `Шрифт применён: ${settings.customFontName}` : "Шрифт по умолчанию."}
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="advanced" className="space-y-6">
            <BackendStatus />

            <Card>
              <CardHeader>
                <CardTitle>API интеграции</CardTitle>
                <CardDescription>Modrinth, CurseForge, Discord и внешние сервисы</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="javaPath">Путь к Java</Label>
                  <Input id="javaPath" value={settings.javaPath} onChange={event => updateSetting("javaPath", event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="javaArgs">Аргументы Java</Label>
                  <Input id="javaArgs" value={settings.javaArgs} onChange={event => updateSetting("javaArgs", event.target.value)} />
                </div>

                <div className="space-y-3 rounded-xl border border-white/10 p-3 bg-black/20">
                  <div className="settings-row">
                    <Label htmlFor="proxyEnabled">Использовать прокси</Label>
                    <Switch
                      id="proxyEnabled"
                      checked={settings.proxyEnabled}
                      onCheckedChange={checked => updateSetting("proxyEnabled", checked)}
                    />
                  </div>

                  {settings.proxyEnabled && (
                    <>
                      <div className="grid gap-2 md:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor="proxyScheme">Тип прокси</Label>
                          <Select value={settings.proxyScheme} onValueChange={value => updateSetting("proxyScheme", value)}>
                            <SelectTrigger id="proxyScheme">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="http">HTTP</SelectItem>
                              <SelectItem value="https">HTTPS</SelectItem>
                              <SelectItem value="socks4">SOCKS4</SelectItem>
                              <SelectItem value="socks4a">SOCKS4a</SelectItem>
                              <SelectItem value="socks5">SOCKS5</SelectItem>
                              <SelectItem value="socks5h">SOCKS5h</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="proxyPort">Порт</Label>
                          <Input
                            id="proxyPort"
                            type="number"
                            min={1}
                            max={65535}
                            value={settings.proxyPort}
                            onChange={event => updateSetting("proxyPort", clampNumber(Number(event.target.value) || 8080, 1, 65535))}
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="proxyHost">Хост / IP</Label>
                        <Input
                          id="proxyHost"
                          value={settings.proxyHost}
                          onChange={event => updateSetting("proxyHost", event.target.value)}
                          placeholder="127.0.0.1 или proxy.example.com"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="proxyCustomUrl">Полный URL прокси (необязательно)</Label>
                        <Input
                          id="proxyCustomUrl"
                          value={settings.proxyCustomUrl}
                          onChange={event => updateSetting("proxyCustomUrl", event.target.value)}
                          placeholder="socks5://user:pass@127.0.0.1:1080"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="proxyBypass">Исключения прокси (через запятую)</Label>
                        <Input
                          id="proxyBypass"
                          value={settings.proxyBypass}
                          onChange={event => updateSetting("proxyBypass", event.target.value)}
                          placeholder="localhost,127.0.0.1,*.local"
                        />
                      </div>

                      <div className="settings-row">
                        <Label htmlFor="proxyAuth">Авторизация прокси</Label>
                        <Switch
                          id="proxyAuth"
                          checked={settings.proxyAuth}
                          onCheckedChange={checked => updateSetting("proxyAuth", checked)}
                        />
                      </div>

                      {settings.proxyAuth && (
                        <div className="grid gap-2 md:grid-cols-2">
                          <div className="space-y-2">
                            <Label htmlFor="proxyUsername">Логин</Label>
                            <Input
                              id="proxyUsername"
                              value={settings.proxyUsername}
                              onChange={event => updateSetting("proxyUsername", event.target.value)}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="proxyPassword">Пароль</Label>
                            <Input
                              id="proxyPassword"
                              type="password"
                              value={settings.proxyPassword}
                              onChange={event => updateSetting("proxyPassword", event.target.value)}
                              placeholder="••••••••"
                            />
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="modrinthApiKey">API ключ Modrinth</Label>
                  <Input id="modrinthApiKey" type="password" value={settings.modrinthApiKey} onChange={event => updateSetting("modrinthApiKey", event.target.value)} placeholder="mrp_..." />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="curseforgeApiKey">API ключ CurseForge</Label>
                  <Input id="curseforgeApiKey" type="password" value={settings.curseforgeApiKey} onChange={event => updateSetting("curseforgeApiKey", event.target.value)} placeholder="CF-API-KEY" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="preferredServerAddress">Адрес сервера</Label>
                  <Input id="preferredServerAddress" value={settings.preferredServerAddress} onChange={event => updateSetting("preferredServerAddress", event.target.value)} placeholder="play.example.com:25565" />
                </div>
                <div className="settings-row">
                  <Label htmlFor="discordRichPresence">Discord Rich Presence</Label>
                  <Switch id="discordRichPresence" checked={settings.discordRichPresence} onCheckedChange={checked => updateSetting("discordRichPresence", checked)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="discordClientId">Discord Client ID</Label>
                  <Input id="discordClientId" value={settings.discordClientId} onChange={event => updateSetting("discordClientId", event.target.value)} />
                </div>

                <div className="space-y-3 rounded-xl border border-white/10 p-3 bg-black/20">
                  <div className="settings-row">
                    <Label htmlFor="runtimeOptimizerEnabled">Java Agent ASM (Runtime Optimizer)</Label>
                    <Switch
                      id="runtimeOptimizerEnabled"
                      checked={settings.runtimeOptimizerEnabled}
                      onCheckedChange={checked => updateSetting("runtimeOptimizerEnabled", checked)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="runtimeOptimizerAgentPath">Путь к agent JAR</Label>
                    <Input
                      id="runtimeOptimizerAgentPath"
                      value={settings.runtimeOptimizerAgentPath}
                      onChange={event => updateSetting("runtimeOptimizerAgentPath", event.target.value)}
                      placeholder="java-agent\\target\\moon-optimizer-agent-1.0.0.jar"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="runtimeOptimizerArgs">Аргументы agent</Label>
                    <Input
                      id="runtimeOptimizerArgs"
                      value={settings.runtimeOptimizerArgs}
                      onChange={event => updateSetting("runtimeOptimizerArgs", event.target.value)}
                      placeholder="fastMath=true;entityTick=true;allocationCache=true;network=true;verbose=false"
                    />
                  </div>
                </div>
                <Button variant="outline" onClick={() => window.open(`${backendService.getConfig().baseUrl}/privacy-policy`, "_blank")}>
                  Открыть политику конфиденциальности
                </Button>
              </CardContent>
            </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

