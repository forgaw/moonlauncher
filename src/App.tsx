import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react"
import { LauncherSidebar } from "./components/LauncherSidebar"
import { PlayPanel } from "./components/PlayPanel"
import { NewsPanel } from "./components/NewsPanel"
import { InstallationsPanel } from "./components/InstallationsPanel"
import { LauncherToaster } from "./components/LauncherToaster"
import { backendService } from "./services/backend"
import { subscribeSettingsUpdated } from "./utils/settingsSync"

const SettingsPanel = lazy(() =>
  import("./components/SettingsPanel").then(module => ({ default: module.SettingsPanel })),
)

const ModsPanel = lazy(() =>
  import("./components/ModsPanel").then(module => ({ default: module.ModsPanel })),
)

const SkinsPanel = lazy(() =>
  import("./components/SkinsPanel").then(module => ({ default: module.SkinsPanel })),
)

const FriendsPanel = lazy(() =>
  import("./components/FriendsPanel").then(module => ({ default: module.FriendsPanel })),
)

const ModpacksPanel = lazy(() =>
  import("./components/ModpacksPanel").then(module => ({ default: module.ModpacksPanel })),
)

const ToolsPanel = lazy(() =>
  import("./components/ToolsPanel").then(module => ({ default: module.ToolsPanel })),
)

const UpdatesPanel = lazy(() =>
  import("./components/UpdatesPanel").then(module => ({ default: module.UpdatesPanel })),
)

interface LauncherTheme {
  themeAccent: string
  themeBackgroundOpacity: number
  themeSidebarOpacity: number
  themeAnimations: boolean
  themeTextOutline: boolean
  themeTextOutlineStrength: number
  themeTextOutlineOpacity: number
  themeGlassBlur: number
  themeCardRadius: number
  customFontName: string
  customFontUrl: string
  playBackgroundUrl: string
}

const defaultTheme: LauncherTheme = {
  themeAccent: "#22c55e",
  themeBackgroundOpacity: 0.45,
  themeSidebarOpacity: 0.9,
  themeAnimations: true,
  themeTextOutline: true,
  themeTextOutlineStrength: 1,
  themeTextOutlineOpacity: 0.35,
  themeGlassBlur: 10,
  themeCardRadius: 12,
  customFontName: "Montserrat",
  customFontUrl: "",
  playBackgroundUrl: "",
}

function parseHexToRgb(value: string): string {
  const cleaned = value.trim().replace(/^#/, "")
  const normalized = cleaned.length === 3
    ? cleaned.split("").map(item => `${item}${item}`).join("")
    : cleaned
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
    return "34,197,94"
  }
  const r = Number.parseInt(normalized.slice(0, 2), 16)
  const g = Number.parseInt(normalized.slice(2, 4), 16)
  const b = Number.parseInt(normalized.slice(4, 6), 16)
  return `${r},${g},${b}`
}

function LazyFallback() {
  return (
    <div className="panel-container">
      <div className="space-y-3">
        <div className="h-10 w-64 bg-muted rounded animate-pulse" />
        <div className="h-28 bg-muted rounded animate-pulse" />
        <div className="h-28 bg-muted rounded animate-pulse" />
      </div>
    </div>
  )
}

export default function App() {
  const [activeTab, setActiveTab] = useState("play")
  const [theme, setTheme] = useState<LauncherTheme>(defaultTheme)

  const applyTheme = useCallback((nextTheme: LauncherTheme) => {
    const root = document.documentElement
    const body = document.body
    const safeBackgroundOpacity = Math.max(0.2, Math.min(0.9, Number(nextTheme.themeBackgroundOpacity || 0.45)))
    const safeSidebarOpacity = Math.max(0.55, Math.min(1, Number(nextTheme.themeSidebarOpacity || 0.9)))
    const safeOutlineStrength = Math.max(0.2, Math.min(2, Number(nextTheme.themeTextOutlineStrength || 1)))
    const safeOutlineOpacity = Math.max(0.05, Math.min(0.9, Number(nextTheme.themeTextOutlineOpacity || 0.35)))
    const safeGlassBlur = Math.max(0, Math.min(28, Number(nextTheme.themeGlassBlur || 10)))
    const safeCardRadius = Math.max(0, Math.min(24, Number(nextTheme.themeCardRadius || 12)))
    const accent = String(nextTheme.themeAccent || defaultTheme.themeAccent).trim() || defaultTheme.themeAccent
    const fontName = String(nextTheme.customFontName || defaultTheme.customFontName).trim() || defaultTheme.customFontName
    const customFontUrl = String(nextTheme.customFontUrl || "").trim()
    const playBackgroundUrl = String(nextTheme.playBackgroundUrl || "").trim()

    root.style.setProperty("--moon-accent", accent)
    root.style.setProperty("--moon-accent-rgb", parseHexToRgb(accent))
    root.style.setProperty("--moon-background-opacity", safeBackgroundOpacity.toFixed(2))
    root.style.setProperty("--moon-sidebar-opacity", safeSidebarOpacity.toFixed(2))
    root.style.setProperty("--moon-text-outline-strength", safeOutlineStrength.toFixed(2))
    root.style.setProperty("--moon-text-outline-opacity", safeOutlineOpacity.toFixed(2))
    root.style.setProperty("--moon-glass-blur", `${safeGlassBlur.toFixed(0)}px`)
    root.style.setProperty("--moon-card-radius", `${safeCardRadius.toFixed(0)}px`)
    root.style.setProperty("--moon-play-background-url", playBackgroundUrl ? `url("${playBackgroundUrl}")` : "none")

    const styleId = "moon-custom-font-style"
    const existing = document.getElementById(styleId)
    if (customFontUrl) {
      const style = existing ?? document.createElement("style")
      style.id = styleId
      style.textContent = `@font-face { font-family: '${fontName.replace(/'/g, "\\'")}'; src: url('${customFontUrl.replace(/'/g, "\\'")}'); font-display: swap; }`
      if (!existing) {
        document.head.appendChild(style)
      }
    } else if (existing) {
      existing.remove()
    }

    body.style.fontFamily = `'${fontName}', 'Montserrat', 'Segoe UI', 'Arial', sans-serif`
    body.style.overflowX = "hidden"
    root.classList.toggle("moon-anim-off", !nextTheme.themeAnimations)
    root.classList.toggle("moon-text-outline", Boolean(nextTheme.themeTextOutline))
  }, [])

  const loadThemeSettings = useCallback(async () => {
    try {
      const settings = await backendService.getSettings()
      setTheme({
        themeAccent: String(settings.themeAccent || defaultTheme.themeAccent),
        themeBackgroundOpacity: Number(settings.themeBackgroundOpacity ?? defaultTheme.themeBackgroundOpacity),
        themeSidebarOpacity: Number(settings.themeSidebarOpacity ?? defaultTheme.themeSidebarOpacity),
        themeAnimations: Boolean(settings.themeAnimations ?? defaultTheme.themeAnimations),
        themeTextOutline: Boolean(settings.themeTextOutline ?? defaultTheme.themeTextOutline),
        themeTextOutlineStrength: Number(settings.themeTextOutlineStrength ?? defaultTheme.themeTextOutlineStrength),
        themeTextOutlineOpacity: Number(settings.themeTextOutlineOpacity ?? defaultTheme.themeTextOutlineOpacity),
        themeGlassBlur: Number(settings.themeGlassBlur ?? defaultTheme.themeGlassBlur),
        themeCardRadius: Number(settings.themeCardRadius ?? defaultTheme.themeCardRadius),
        customFontName: String(settings.customFontName || defaultTheme.customFontName),
        customFontUrl: String(settings.customFontUrl || ""),
        playBackgroundUrl: String(settings.playBackgroundUrl || ""),
      })
    } catch (error) {
      console.error("Failed to load launcher theme settings:", error)
    }
  }, [])

  useEffect(() => {
    document.documentElement.classList.add("dark")
    document.title = "moonlauncher"
    void loadThemeSettings()
    const unsubscribe = subscribeSettingsUpdated(() => {
      void loadThemeSettings()
    })
    return () => unsubscribe()
  }, [loadThemeSettings])

  useEffect(() => {
    applyTheme(theme)
  }, [applyTheme, theme])

  const activePanel = useMemo(() => {
    switch (activeTab) {
      case "play":
        return <PlayPanel />
      case "news":
        return <NewsPanel />
      case "installations":
        return <InstallationsPanel />
      case "mods":
        return (
          <Suspense fallback={<LazyFallback />}>
            <ModsPanel />
          </Suspense>
        )
      case "modpacks":
        return (
          <Suspense fallback={<LazyFallback />}>
            <ModpacksPanel />
          </Suspense>
        )
      case "skins":
        return (
          <Suspense fallback={<LazyFallback />}>
            <SkinsPanel />
          </Suspense>
        )
      case "friends":
        return (
          <Suspense fallback={<LazyFallback />}>
            <FriendsPanel />
          </Suspense>
        )
      case "tools":
        return (
          <Suspense fallback={<LazyFallback />}>
            <ToolsPanel />
          </Suspense>
        )
      case "java":
        return (
          <Suspense fallback={<LazyFallback />}>
            <UpdatesPanel />
          </Suspense>
        )
      case "settings":
        return (
          <Suspense fallback={<LazyFallback />}>
            <SettingsPanel />
          </Suspense>
        )
      default:
        return <PlayPanel />
    }
  }, [activeTab])

  return (
    <div className="min-h-screen w-full overflow-x-hidden bg-background text-foreground dark font-mojangles">
      <div className="fixed left-0 top-0 h-screen w-64 z-30">
        <LauncherSidebar
          activeTab={activeTab}
          onTabChange={setActiveTab}
          sidebarOpacity={theme.themeSidebarOpacity}
        />
      </div>

      <div className="min-h-screen pl-64 overflow-x-hidden">
        {activePanel}
      </div>

      <LauncherToaster />
    </div>
  )
}
