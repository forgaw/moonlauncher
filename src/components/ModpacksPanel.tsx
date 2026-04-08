
import { type ChangeEvent, memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Box, Download, FolderOpen, Info, Layers3, Loader2, Package, Play, Plus, Search, Sparkles, Trash2, Upload } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card"
import { Button } from "./ui/button"
import { Input } from "./ui/input"
import { Label } from "./ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select"
import { Switch } from "./ui/switch"
import { Badge } from "./ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog"
import {
  backendService,
  type ContentKind,
  type ContentDetails,
  type ContentProject,
  type CustomPackEntry,
  type GameVersion,
  type InstalledContentEntry,
  type MoonPack,
  type ProviderFilter,
  type ProviderType,
} from "../services/backend"
import { toast } from "sonner"
import { notifySettingsUpdated } from "../utils/settingsSync"

const RESULTS_LIMIT = 80
const INITIAL_VISIBLE = 18
const STEP_VISIBLE = 12
const CONTENT_KINDS = ["mod", "resourcepack", "shader", "map"] as const
type PackContentKind = (typeof CONTENT_KINDS)[number]

const providerMeta: Record<ProviderType, { label: string; avatar: string; avatarClass: string }> = {
  modrinth: {
    label: "Modrinth",
    avatar: "MR",
    avatarClass: "bg-green-500/20 text-green-300 border-green-400/40",
  },
  curseforge: {
    label: "CurseForge",
    avatar: "CF",
    avatarClass: "bg-orange-500/20 text-orange-300 border-orange-400/40",
  },
  rf: {
    label: "RF Community",
    avatar: "RF",
    avatarClass: "bg-blue-500/20 text-blue-300 border-blue-400/40",
  },
}

const contentKindLabels: Record<PackContentKind, string> = {
  mod: "Моды",
  resourcepack: "Ресурс-паки",
  shader: "Шейдеры",
  map: "Карты",
}

const contentKindBadgeColors: Record<PackContentKind, string> = {
  mod: "bg-emerald-500/20 text-emerald-300 border-emerald-400/40",
  resourcepack: "bg-cyan-500/20 text-cyan-300 border-cyan-400/40",
  shader: "bg-purple-500/20 text-purple-300 border-purple-400/40",
  map: "bg-amber-500/20 text-amber-300 border-amber-400/40",
}

const contentFolderByKind: Record<PackContentKind, string> = {
  mod: "mods",
  resourcepack: "resourcepacks",
  shader: "shaderpacks",
  map: "saves",
}

function bytesToMb(value: number): string {
  return `${(value / (1024 * 1024)).toFixed(1)} MB`
}

function failText(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback
  return error.message.replace(/^Request failed \(\d+\)\s*/i, "").trim() || fallback
}

function isContentInstalledByName(item: ContentProject, entries: InstalledContentEntry[]): boolean {
  if (item.installed) return true
  const slug = item.slug.toLowerCase()
  const title = item.title.toLowerCase()
  return entries.some(entry => {
    const name = entry.name.toLowerCase()
    return name.includes(slug) || name.includes(title)
  })
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const value = String(reader.result || "")
      const [, data] = value.split(",", 2)
      if (!data) {
        reject(new Error("Не удалось прочитать файл"))
        return
      }
      resolve(data)
    }
    reader.onerror = () => reject(new Error("Ошибка чтения файла"))
    reader.readAsDataURL(file)
  })
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ""))
    reader.onerror = () => reject(new Error("Ошибка чтения файла"))
    reader.readAsDataURL(file)
  })
}

const ResultCard = memo(function ResultCard({
  item,
  onInstall,
  onDetails,
  isInstalling,
}: {
  item: ContentProject
  onInstall: (item: ContentProject) => void
  onDetails: (item: ContentProject) => void
  isInstalling: boolean
}) {
  const installed = Boolean(item.installed)
  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-start gap-3">
        <div className="size-16 rounded-xl overflow-hidden border border-white/15 bg-black/30 shrink-0">
          {item.iconUrl ? (
            <img src={item.iconUrl} alt={item.title} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground">PACK</div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold leading-tight line-clamp-2">{item.title}</h3>
          <p className="text-xs text-muted-foreground mt-1 truncate">@{item.slug}</p>
          <div className="flex items-center gap-2 mt-2">
            <Badge variant="outline">{item.provider}</Badge>
            {installed && <Badge variant="outline" className="bg-green-500/20 text-green-300 border-green-400/40">Установлено</Badge>}
          </div>
        </div>
      </div>

      <p className="text-sm text-muted-foreground line-clamp-2">{item.description || "Описание отсутствует"}</p>

      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" onClick={() => onDetails(item)}>
          <Info className="size-4 mr-2" />
          Подробнее
        </Button>
        <Button disabled={installed || isInstalling} onClick={() => onInstall(item)}>
          {isInstalling ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Download className="size-4 mr-2" />}
          {installed ? "Установлено" : "Скачать"}
        </Button>
      </div>
    </Card>
  )
})

export function ModpacksPanel() {
  const [versions, setVersions] = useState<GameVersion[]>([])
  const [selectedVersion, setSelectedVersion] = useState("1.21.4")
  const [loader, setLoader] = useState("fabric")
  const [provider, setProvider] = useState<ProviderFilter>("all")
  const [query, setQuery] = useState("")

  const [moonPacks, setMoonPacks] = useState<MoonPack[]>([])
  const [hideMoonSuggestion, setHideMoonSuggestion] = useState(false)
  const [results, setResults] = useState<ContentProject[]>([])
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE)
  const [isRecommendations, setIsRecommendations] = useState(true)
  const [isSearching, setIsSearching] = useState(false)
  const [installingId, setInstallingId] = useState<string | null>(null)
  const [installingMoonId, setInstallingMoonId] = useState<string | null>(null)

  const [contentKind, setContentKind] = useState<PackContentKind>("mod")
  const [contentProvider, setContentProvider] = useState<ProviderFilter>("all")
  const [contentQuery, setContentQuery] = useState("")
  const [contentResults, setContentResults] = useState<ContentProject[]>([])
  const [contentVisibleCount, setContentVisibleCount] = useState(INITIAL_VISIBLE)
  const [contentIsRecommendations, setContentIsRecommendations] = useState(true)
  const [contentIsSearching, setContentIsSearching] = useState(false)
  const [contentInstallingId, setContentInstallingId] = useState<string | null>(null)
  const [contentInstalledEntries, setContentInstalledEntries] = useState<InstalledContentEntry[]>([])
  const [contentLoadingInstalled, setContentLoadingInstalled] = useState(false)

  const [customPacks, setCustomPacks] = useState<CustomPackEntry[]>([])
  const [newPackName, setNewPackName] = useState("")
  const [newPackVersion, setNewPackVersion] = useState("")
  const [newPackAvatarDataUrl, setNewPackAvatarDataUrl] = useState("")
  const [isCreatingPack, setIsCreatingPack] = useState(false)
  const [isImportingPack, setIsImportingPack] = useState(false)
  const [isLaunchingPack, setIsLaunchingPack] = useState<string | null>(null)
  const [wipeBeforeApply, setWipeBeforeApply] = useState(false)
  const [applyAfterImport, setApplyAfterImport] = useState(true)

  const [includeMods, setIncludeMods] = useState(true)
  const [includeResourcepacks, setIncludeResourcepacks] = useState(true)
  const [includeShaders, setIncludeShaders] = useState(true)
  const [includeSaves, setIncludeSaves] = useState(false)
  const [includeConfig, setIncludeConfig] = useState(true)

  const [detailsOpen, setDetailsOpen] = useState(false)
  const [detailsTarget, setDetailsTarget] = useState<ContentProject | null>(null)
  const [detailsData, setDetailsData] = useState<ContentDetails | null>(null)
  const [detailsLoading, setDetailsLoading] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  const importInputRef = useRef<HTMLInputElement | null>(null)
  const avatarInputRef = useRef<HTMLInputElement | null>(null)
  const loadMoreRef = useRef<HTMLDivElement | null>(null)
  const contentLoadMoreRef = useRef<HTMLDivElement | null>(null)

  const releaseVersions = useMemo(() => {
    const unique = new Set<string>()
    const items: string[] = []
    for (const version of versions) {
      if (version.type !== "release") continue
      if (unique.has(version.version)) continue
      unique.add(version.version)
      items.push(version.version)
    }
    return items.slice(0, 120)
  }, [versions])

  useEffect(() => {
    if (newPackVersion) return
    if (selectedVersion) {
      setNewPackVersion(selectedVersion)
      return
    }
    if (releaseVersions[0]) {
      setNewPackVersion(releaseVersions[0])
    }
  }, [newPackVersion, releaseVersions, selectedVersion])

  const visibleResults = useMemo(() => results.slice(0, visibleCount), [results, visibleCount])
  const hasMoreVisible = visibleCount < results.length
  const visibleContentResults = useMemo(
    () => contentResults.slice(0, contentVisibleCount),
    [contentResults, contentVisibleCount],
  )
  const hasMoreContentVisible = contentVisibleCount < contentResults.length

  const refreshBootstrap = useCallback(async () => {
    const [allVersions, moon, packs, settings] = await Promise.all([
      backendService.getVersions(),
      backendService.getMoonPacks(),
      backendService.getCustomPacks(),
      backendService.getSettings(),
    ])
    setVersions(prev => (allVersions.length > 0 ? allVersions : prev))
    setMoonPacks(moon)
    setCustomPacks(packs)
    setHideMoonSuggestion(Boolean(settings.hideMoonPacksSuggestion))
    setSelectedVersion(prev => {
      if (allVersions.some(item => item.version === prev)) return prev
      return allVersions.find(item => item.type === "release")?.version || prev
    })
  }, [])

  const loadRecommendations = useCallback(async () => {
    setIsSearching(true)
    try {
      const data = await backendService.getContentRecommendations("modpack", provider, selectedVersion, loader, RESULTS_LIMIT)
      setResults(data)
      setVisibleCount(INITIAL_VISIBLE)
      setIsRecommendations(true)
    } catch (error) {
      toast.error(failText(error, "Не удалось загрузить рекомендации"))
    } finally {
      setIsSearching(false)
    }
  }, [provider, selectedVersion, loader])

  const runSearch = useCallback(async () => {
    if (!query.trim()) {
      await loadRecommendations()
      return
    }
    setIsSearching(true)
    try {
      const data = await backendService.searchContent(query.trim(), "modpack", provider, selectedVersion, loader, RESULTS_LIMIT)
      setResults(data)
      setVisibleCount(INITIAL_VISIBLE)
      setIsRecommendations(false)
      if (data.length === 0) toast.info("По этому запросу сборки не найдены")
    } catch (error) {
      toast.error(failText(error, "Не удалось выполнить поиск"))
    } finally {
      setIsSearching(false)
    }
  }, [query, provider, selectedVersion, loader, loadRecommendations])

  const loadInstalledContent = useCallback(async () => {
    setContentLoadingInstalled(true)
    try {
      const entries = await backendService.getInstalledContent(contentKind)
      setContentInstalledEntries(entries)
    } catch (error) {
      toast.error(failText(error, "Не удалось загрузить установленный контент"))
    } finally {
      setContentLoadingInstalled(false)
    }
  }, [contentKind])

  const loadContentRecommendations = useCallback(async () => {
    setContentIsSearching(true)
    try {
      const data = await backendService.getContentRecommendations(contentKind, contentProvider, selectedVersion, loader, RESULTS_LIMIT)
      setContentResults(data)
      setContentVisibleCount(INITIAL_VISIBLE)
      setContentIsRecommendations(true)
    } catch (error) {
      toast.error(failText(error, "Не удалось загрузить рекомендации контента"))
    } finally {
      setContentIsSearching(false)
    }
  }, [contentKind, contentProvider, selectedVersion, loader])

  const runContentSearch = useCallback(async () => {
    if (!contentQuery.trim()) {
      await loadContentRecommendations()
      return
    }
    setContentIsSearching(true)
    try {
      const data = await backendService.searchContent(contentQuery.trim(), contentKind, contentProvider, selectedVersion, loader, RESULTS_LIMIT)
      setContentResults(data)
      setContentVisibleCount(INITIAL_VISIBLE)
      setContentIsRecommendations(false)
      if (data.length === 0) toast.info("По этому запросу контент не найден")
    } catch (error) {
      toast.error(failText(error, "Не удалось выполнить поиск контента"))
    } finally {
      setContentIsSearching(false)
    }
  }, [contentQuery, contentKind, contentProvider, selectedVersion, loader, loadContentRecommendations])

  const installExtraContent = useCallback(async (item: ContentProject) => {
    setContentInstallingId(item.id)
    try {
      const response = await backendService.installContent({
        projectId: item.id,
        provider: item.provider,
        kind: item.kind,
        gameVersion: selectedVersion,
        loader,
      })
      setContentResults(prev => prev.map(entry => (
        entry.id === item.id && entry.provider === item.provider && entry.kind === item.kind
          ? { ...entry, installed: true }
          : entry
      )))
      await loadInstalledContent()
      toast.success(`Установлено: ${response.fileName}`)
    } catch (error) {
      toast.error(failText(error, "Не удалось установить контент"))
    } finally {
      setContentInstallingId(null)
    }
  }, [selectedVersion, loader, loadInstalledContent])

  const removeInstalledContent = useCallback(async (entry: InstalledContentEntry) => {
    try {
      await backendService.removeInstalledContent(contentKind, entry.name)
      setContentResults(prev => prev.map(item => ({ ...item, installed: false })))
      await loadInstalledContent()
      toast.success(`Удалено: ${entry.name}`)
    } catch (error) {
      toast.error(failText(error, "Не удалось удалить контент"))
    }
  }, [contentKind, loadInstalledContent])

  useEffect(() => {
    setIsLoading(true)
    refreshBootstrap()
      .catch(error => toast.error(failText(error, "Не удалось загрузить вкладку сборок")))
      .finally(() => setIsLoading(false))
  }, [refreshBootstrap])

  useEffect(() => {
    if (!selectedVersion) return
    if (query.trim()) return
    void loadRecommendations()
  }, [selectedVersion, provider, loader, query, loadRecommendations])

  useEffect(() => {
    void loadInstalledContent()
  }, [loadInstalledContent])

  useEffect(() => {
    if (!selectedVersion) return
    if (contentQuery.trim()) return
    void loadContentRecommendations()
  }, [selectedVersion, contentProvider, contentKind, loader, contentQuery, loadContentRecommendations])

  useEffect(() => {
    if (!hasMoreVisible || isSearching) return
    const marker = loadMoreRef.current
    if (!marker) return
    const observer = new IntersectionObserver(
      entries => {
        if (!entries.some(entry => entry.isIntersecting)) return
        setVisibleCount(prev => Math.min(prev + STEP_VISIBLE, results.length))
      },
      { rootMargin: "240px 0px" },
    )
    observer.observe(marker)
    return () => observer.disconnect()
  }, [hasMoreVisible, isSearching, results.length])

  useEffect(() => {
    if (!hasMoreContentVisible || contentIsSearching) return
    const marker = contentLoadMoreRef.current
    if (!marker) return
    const observer = new IntersectionObserver(
      entries => {
        if (!entries.some(entry => entry.isIntersecting)) return
        setContentVisibleCount(prev => Math.min(prev + STEP_VISIBLE, contentResults.length))
      },
      { rootMargin: "240px 0px" },
    )
    observer.observe(marker)
    return () => observer.disconnect()
  }, [hasMoreContentVisible, contentIsSearching, contentResults.length])

  const loadCustomPacks = useCallback(async () => {
    setCustomPacks(await backendService.getCustomPacks())
  }, [])

  const installPack = useCallback(async (item: ContentProject) => {
    if (item.installed) return
    setInstallingId(item.id)
    try {
      const installed = await backendService.installContent({
        projectId: item.id,
        provider: item.provider,
        kind: "modpack",
        gameVersion: selectedVersion,
        loader,
      })
      setResults(prev => prev.map(entry => (
        entry.id === item.id && entry.provider === item.provider ? { ...entry, installed: true } : entry
      )))
      try {
        await backendService.applyCustomPack(installed.fileName, wipeBeforeApply)
      } catch {
        // keep downloaded pack even if apply fails
      }
      await loadCustomPacks()
      notifySettingsUpdated()
      toast.success("Сборка скачана")
    } catch (error) {
      toast.error(failText(error, "Не удалось установить сборку"))
    } finally {
      setInstallingId(null)
    }
  }, [selectedVersion, loader, wipeBeforeApply, loadCustomPacks])

  const installMoonPack = useCallback(async (packId: string) => {
    setInstallingMoonId(packId)
    try {
      await backendService.installMoonPack(packId, selectedVersion, loader)
      await loadCustomPacks()
      notifySettingsUpdated()
      toast.success("Сборка Moonlauncher установлена")
    } catch (error) {
      toast.error(failText(error, "Не удалось установить сборку Moonlauncher"))
    } finally {
      setInstallingMoonId(null)
    }
  }, [selectedVersion, loader, loadCustomPacks])

  const createCustomPack = useCallback(async () => {
    if (!newPackName.trim()) {
      toast.error("Введите имя новой сборки")
      return
    }
    const includeRoots = [
      includeMods ? "mods" : null,
      includeResourcepacks ? "resourcepacks" : null,
      includeShaders ? "shaderpacks" : null,
      includeSaves ? "saves" : null,
      includeConfig ? "config" : null,
    ].filter(Boolean) as string[]

    if (includeRoots.length === 0) {
      toast.error("Выберите хотя бы один компонент")
      return
    }

    setIsCreatingPack(true)
    try {
      await backendService.createCustomPack(newPackName.trim(), includeConfig, includeRoots, newPackVersion.trim(), newPackAvatarDataUrl)
      setNewPackName("")
      setNewPackVersion("")
      setNewPackAvatarDataUrl("")
      await loadCustomPacks()
      notifySettingsUpdated()
      toast.success("Архив сборки создан")
    } catch (error) {
      toast.error(failText(error, "Не удалось создать сборку"))
    } finally {
      setIsCreatingPack(false)
    }
  }, [includeMods, includeResourcepacks, includeShaders, includeSaves, includeConfig, newPackName, newPackVersion, newPackAvatarDataUrl, loadCustomPacks])

  const applyPack = useCallback(async (packId: string) => {
    try {
      const result = await backendService.applyCustomPack(packId, wipeBeforeApply)
      toast.success(`Применено: ${result.totalItems} элементов`)
    } catch (error) {
      toast.error(failText(error, "Не удалось применить сборку"))
    }
  }, [wipeBeforeApply])

  const launchPack = useCallback(async (packId: string) => {
    setIsLaunchingPack(packId)
    try {
      await backendService.applyCustomPack(packId, wipeBeforeApply)
      const settings = await backendService.getSettings()
      let profileId = String(settings.selectedProfileId || "")
      if (!profileId) {
        const profiles = await backendService.getProfiles()
        profileId = profiles[0]?.id || ""
      }
      if (!profileId) throw new Error("Не найден игровой профиль")
      await backendService.launchGame({ profileId, versionId: selectedVersion })
      toast.success("Сборка применена и игра запущена")
    } catch (error) {
      toast.error(failText(error, "Не удалось запустить сборку"))
    } finally {
      setIsLaunchingPack(null)
    }
  }, [wipeBeforeApply, selectedVersion])

  const saveHideSuggestion = useCallback(async (value: boolean) => {
    setHideMoonSuggestion(value)
    try {
      await backendService.updateSettings({ hideMoonPacksSuggestion: value })
      notifySettingsUpdated()
    } catch {
      setHideMoonSuggestion(prev => !prev)
    }
  }, [])

  const importPack = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    setIsImportingPack(true)
    try {
      const dataBase64 = await fileToBase64(file)
      await backendService.importCustomPack(file.name, dataBase64, applyAfterImport)
      await loadCustomPacks()
      notifySettingsUpdated()
      toast.success("Сборка импортирована")
    } catch (error) {
      toast.error(failText(error, "Не удалось импортировать сборку"))
    } finally {
      event.target.value = ""
      setIsImportingPack(false)
    }
  }, [applyAfterImport, loadCustomPacks])

  const pickAvatar = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      const dataUrl = await fileToDataUrl(file)
      if (!dataUrl.startsWith("data:image/")) {
        toast.error("Нужен файл изображения")
        return
      }
      setNewPackAvatarDataUrl(dataUrl)
    } catch {
      toast.error("Не удалось выбрать аватар")
    } finally {
      event.target.value = ""
    }
  }, [])

  const openDetails = useCallback(async (item: ContentProject) => {
    setDetailsTarget(item)
    setDetailsOpen(true)
    setDetailsData(null)
    setDetailsLoading(true)
    try {
      const details = await backendService.getContentDetails(item.id, item.provider, item.kind)
      setDetailsData(details)
    } catch {
      toast.error("Не удалось загрузить подробности")
    } finally {
      setDetailsLoading(false)
    }
  }, [])

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
      <div>
        <h2 className="text-2xl font-bold mb-2">Сборки</h2>
        <p className="text-muted-foreground">Поиск, создание, импорт и запуск сборок прямо в лаунчере</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Поиск сборок</CardTitle>
          <CardDescription>Рекомендации и поиск по Modrinth, CurseForge и RF</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 lg:grid-cols-5">
            <Input value={query} onChange={event => setQuery(event.target.value)} placeholder="Поиск сборок..." className="lg:col-span-2" onKeyDown={event => {
              if (event.key === "Enter") void runSearch()
            }} />
            <Select value={provider} onValueChange={value => setProvider(value as ProviderFilter)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все платформы</SelectItem>
                <SelectItem value="modrinth">Modrinth</SelectItem>
                <SelectItem value="curseforge">CurseForge</SelectItem>
                <SelectItem value="rf">RF Community</SelectItem>
              </SelectContent>
            </Select>
            <Select value={selectedVersion} onValueChange={setSelectedVersion}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {releaseVersions.map(version => <SelectItem key={version} value={version}>{version}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={loader} onValueChange={setLoader}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="fabric">Fabric</SelectItem>
                <SelectItem value="forge">Forge</SelectItem>
                <SelectItem value="quilt">Quilt</SelectItem>
                <SelectItem value="neoforge">NeoForge</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-2 flex-wrap">
            <Button onClick={() => void runSearch()} disabled={isSearching}>
              {isSearching ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Search className="size-4 mr-2" />}
              {query.trim() ? "Искать" : "Обновить рекомендации"}
            </Button>
            <Button variant="outline" onClick={() => void loadRecommendations()}>
              <Sparkles className="size-4 mr-2" />
              Рекомендации
            </Button>
            <Button variant="outline" onClick={async () => {
              try {
                await backendService.openFolder("modpacks")
              } catch {
                toast.error("Не удалось открыть папку сборок")
              }
            }}>
              <FolderOpen className="size-4 mr-2" />
              Папка сборок
            </Button>
          </div>

          <div className="settings-row">
            <Label htmlFor="wipeBeforeApply">Очищать текущие файлы перед применением</Label>
            <Switch id="wipeBeforeApply" checked={wipeBeforeApply} onCheckedChange={setWipeBeforeApply} />
          </div>
        </CardContent>
      </Card>

      {results.length > 0 && (
        <>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            {isRecommendations ? <Sparkles className="size-4 text-amber-400" /> : <Search className="size-4" />}
            <span>{isRecommendations ? "Рекомендуемые сборки" : "Результаты поиска"}</span>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {visibleResults.map(item => (
              <ResultCard key={`${item.provider}-${item.id}`} item={item} onInstall={installPack} onDetails={openDetails} isInstalling={installingId === item.id} />
            ))}
          </div>
          <div className="text-xs text-muted-foreground text-center">Показано {visibleResults.length} из {results.length}</div>
          {hasMoreVisible && <div ref={loadMoreRef} className="h-2 w-full" />}
        </>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Layers3 className="size-4" />Moonlauncher сборки</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="settings-row">
            <Label htmlFor="hideMoonSuggestion">Скрыть блок рекомендаций Moonlauncher</Label>
            <Switch id="hideMoonSuggestion" checked={hideMoonSuggestion} onCheckedChange={value => void saveHideSuggestion(value)} />
          </div>
          {!hideMoonSuggestion && (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {moonPacks.map(pack => (
                <Card key={pack.id} className="p-4">
                  <p className="font-semibold">{pack.title}</p>
                  <p className="text-xs text-muted-foreground mt-1 mb-2">{pack.description}</p>
                  <p className="text-xs text-muted-foreground mb-3">{pack.mods.join(", ")}</p>
                  <Button className="w-full" disabled={installingMoonId === pack.id} onClick={() => void installMoonPack(pack.id)}>
                    {installingMoonId === pack.id ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Download className="size-4 mr-2" />}
                    Установить
                  </Button>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="size-4" />
            Контент для сборки
          </CardTitle>
          <CardDescription>Устанавливай моды, ресурспаки, шейдеры и карты прямо во вкладке сборок</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 lg:grid-cols-5">
            <Input
              value={contentQuery}
              onChange={event => setContentQuery(event.target.value)}
              placeholder={`Поиск: ${contentKindLabels[contentKind].toLowerCase()}...`}
              className="lg:col-span-2"
              onKeyDown={event => {
                if (event.key === "Enter") void runContentSearch()
              }}
            />
            <Select value={contentKind} onValueChange={value => setContentKind(value as PackContentKind)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="mod">Моды</SelectItem>
                <SelectItem value="resourcepack">Ресурс-паки</SelectItem>
                <SelectItem value="shader">Шейдеры</SelectItem>
                <SelectItem value="map">Карты</SelectItem>
              </SelectContent>
            </Select>
            <Select value={contentProvider} onValueChange={value => setContentProvider(value as ProviderFilter)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все платформы</SelectItem>
                <SelectItem value="modrinth">Modrinth</SelectItem>
                <SelectItem value="curseforge">CurseForge</SelectItem>
                <SelectItem value="rf">RF Community</SelectItem>
              </SelectContent>
            </Select>
            <Select value={selectedVersion} onValueChange={setSelectedVersion}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {releaseVersions.map(version => <SelectItem key={version} value={version}>{version}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-2 flex-wrap">
            <Button onClick={() => void runContentSearch()} disabled={contentIsSearching}>
              {contentIsSearching ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Search className="size-4 mr-2" />}
              {contentQuery.trim() ? "Искать" : "Обновить рекомендации"}
            </Button>
            <Button variant="outline" onClick={() => void loadContentRecommendations()}>
              <Sparkles className="size-4 mr-2" />
              Рекомендации
            </Button>
            <Button variant="outline" onClick={async () => {
              try {
                await backendService.openFolder(contentFolderByKind[contentKind])
              } catch {
                toast.error("Не удалось открыть папку контента")
              }
            }}>
              <FolderOpen className="size-4 mr-2" />
              Папка контента
            </Button>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Установлено ({contentInstalledEntries.length})
              </p>
              {contentLoadingInstalled && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
            </div>
            {contentInstalledEntries.length === 0 ? (
              <p className="text-sm text-muted-foreground">Пока ничего не установлено в этой категории.</p>
            ) : (
              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {contentInstalledEntries.map(entry => (
                  <Card key={entry.id} className="p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium truncate">{entry.name}</p>
                        <p className="text-xs text-muted-foreground">{bytesToMb(entry.sizeBytes)}</p>
                      </div>
                      <Button size="sm" variant="destructive" onClick={() => void removeInstalledContent(entry)}>
                        <Trash2 className="size-4 mr-1" />
                        Удалить
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {contentResults.length > 0 && (
            <>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                {contentIsRecommendations ? <Sparkles className="size-4 text-amber-400" /> : <Search className="size-4" />}
                <span>{contentIsRecommendations ? "Рекомендуемый контент" : "Результаты поиска контента"}</span>
              </div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {visibleContentResults.map(item => {
                  const platform = providerMeta[item.provider]
                  const kindLabel = contentKindLabels[item.kind as PackContentKind] ?? item.kind
                  const kindColor = contentKindBadgeColors[item.kind as PackContentKind] ?? contentKindBadgeColors.mod
                  const installed = isContentInstalledByName(item, contentInstalledEntries)
                  return (
                    <Card key={`${item.provider}-${item.kind}-${item.id}`} className="p-4 space-y-3">
                      <div className="flex items-start gap-3">
                        <div className="w-16 h-16 rounded-xl overflow-hidden border border-white/20 shrink-0 bg-black/40">
                          {item.iconUrl ? (
                            <img src={item.iconUrl} alt={item.title} className="w-full h-full object-cover" />
                          ) : (
                            <div className={`w-full h-full text-xs font-bold flex items-center justify-center ${platform.avatarClass}`}>
                              {platform.avatar}
                            </div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <h3 className="font-semibold leading-tight line-clamp-2">{item.title}</h3>
                          <p className="text-xs text-muted-foreground mt-1 truncate">@{item.slug}</p>
                          <div className="flex flex-wrap gap-2 mt-2">
                            <Badge variant="outline">{platform.label}</Badge>
                            <Badge variant="outline" className={kindColor}>{kindLabel}</Badge>
                            {installed && <Badge variant="outline" className="bg-green-500/20 text-green-300 border-green-400/40">Установлено</Badge>}
                          </div>
                        </div>
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-2">{item.description || "Описание отсутствует"}</p>
                      <div className="grid grid-cols-2 gap-2">
                        <Button variant="outline" onClick={() => void openDetails(item)}>
                          <Info className="size-4 mr-2" />
                          Подробнее
                        </Button>
                        <Button onClick={() => void installExtraContent(item)} disabled={installed || contentInstallingId === item.id}>
                          {contentInstallingId === item.id ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Download className="size-4 mr-2" />}
                          {installed ? "Установлено" : "Установить"}
                        </Button>
                      </div>
                    </Card>
                  )
                })}
              </div>
              <div className="text-xs text-muted-foreground text-center">Показано {visibleContentResults.length} из {contentResults.length}</div>
              {hasMoreContentVisible && <div ref={contentLoadMoreRef} className="h-2 w-full" />}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Plus className="size-4" />Конструктор сборок</CardTitle>
          <CardDescription>Версия сборки, аватар, импорт и компоненты</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 lg:grid-cols-3">
            <Input value={newPackName} onChange={event => setNewPackName(event.target.value)} placeholder="Название сборки" />
            <Select value={newPackVersion} onValueChange={setNewPackVersion}>
              <SelectTrigger>
                <SelectValue placeholder="Версия сборки" />
              </SelectTrigger>
              <SelectContent>
                {newPackVersion && !releaseVersions.includes(newPackVersion) && (
                  <SelectItem value={newPackVersion}>{newPackVersion}</SelectItem>
                )}
                {releaseVersions.map(version => (
                  <SelectItem key={version} value={version}>{version}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex gap-2">
              <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={event => void pickAvatar(event)} />
              <Button variant="outline" className="flex-1" onClick={() => avatarInputRef.current?.click()}><Upload className="size-4 mr-2" />Аватар</Button>
              {newPackAvatarDataUrl && <img src={newPackAvatarDataUrl} alt="avatar" className="size-10 rounded-lg object-cover border border-white/15" />}
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <div className="settings-row rounded-md border border-white/10 px-3 py-2"><Label>Моды</Label><Switch checked={includeMods} onCheckedChange={setIncludeMods} /></div>
            <div className="settings-row rounded-md border border-white/10 px-3 py-2"><Label>Ресурс-паки</Label><Switch checked={includeResourcepacks} onCheckedChange={setIncludeResourcepacks} /></div>
            <div className="settings-row rounded-md border border-white/10 px-3 py-2"><Label>Шейдеры</Label><Switch checked={includeShaders} onCheckedChange={setIncludeShaders} /></div>
            <div className="settings-row rounded-md border border-white/10 px-3 py-2"><Label>Карты</Label><Switch checked={includeSaves} onCheckedChange={setIncludeSaves} /></div>
            <div className="settings-row rounded-md border border-white/10 px-3 py-2"><Label>Config</Label><Switch checked={includeConfig} onCheckedChange={setIncludeConfig} /></div>
          </div>

          <div className="flex gap-2 flex-wrap">
            <Button onClick={() => void createCustomPack()} disabled={isCreatingPack}>{isCreatingPack ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Plus className="size-4 mr-2" />}Создать архив</Button>
            <input ref={importInputRef} type="file" accept=".zip" className="hidden" onChange={event => void importPack(event)} />
            <Button variant="outline" onClick={() => importInputRef.current?.click()} disabled={isImportingPack}>{isImportingPack ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Upload className="size-4 mr-2" />}Импорт .zip</Button>
            <div className="settings-row rounded-md border border-white/10 px-3 py-2 gap-2"><Label htmlFor="applyAfterImport">Применять после импорта</Label><Switch id="applyAfterImport" checked={applyAfterImport} onCheckedChange={setApplyAfterImport} /></div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Box className="size-4" />Мои сборки</CardTitle></CardHeader>
        <CardContent className="space-y-2 max-h-[400px] overflow-y-auto no-scrollbar pr-1">
          {customPacks.length === 0 ? (
            <p className="text-sm text-muted-foreground">Сборки не найдены.</p>
          ) : customPacks.map(pack => (
            <Card key={pack.id} className="p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 flex items-center gap-3">
                  {pack.avatarDataUrl ? <img src={pack.avatarDataUrl} alt={pack.name} className="size-10 rounded-lg object-cover border border-white/15" /> : null}
                  <div>
                    <p className="font-medium truncate">{pack.name}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant="outline" className="bg-indigo-500/20 text-indigo-300 border-indigo-400/50">Сборка</Badge>
                      {pack.packVersion && <Badge variant="outline">{pack.packVersion}</Badge>}
                      <span>{bytesToMb(pack.sizeBytes)}</span>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => void applyPack(pack.id)}>Применить</Button>
                  <Button size="sm" onClick={() => void launchPack(pack.id)} disabled={isLaunchingPack === pack.id}>{isLaunchingPack === pack.id ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Play className="size-4 mr-2" />}Запустить</Button>
                </div>
              </div>
            </Card>
          ))}
        </CardContent>
      </Card>

      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="w-[96vw] max-w-6xl max-h-[95vh] overflow-y-auto no-scrollbar">
          <DialogHeader><DialogTitle>{detailsData?.title ?? detailsTarget?.title ?? "Подробнее о сборке"}</DialogTitle></DialogHeader>
          {detailsLoading && <div className="py-10 flex items-center justify-center text-muted-foreground"><Loader2 className="size-5 mr-2 animate-spin" />Загрузка...</div>}
          {!detailsLoading && detailsData && (
            <div className="space-y-4">
              {detailsData.gallery.length > 0 && (
                <div className="space-y-2">
                  <div className="w-full h-80 rounded-xl overflow-hidden border border-white/10 bg-black/30"><img src={detailsData.gallery[0]} alt={detailsData.title} className="w-full h-full object-cover" /></div>
                  {detailsData.gallery.length > 1 && <div className="grid grid-cols-2 md:grid-cols-4 gap-2">{detailsData.gallery.slice(1, 9).map(image => <img key={image} src={image} alt="preview" className="h-24 w-full object-cover rounded-lg border border-white/10" />)}</div>}
                </div>
              )}
              <Card className="p-4"><p className="text-sm whitespace-pre-wrap leading-relaxed">{detailsData.description || detailsData.summary || "Описание отсутствует."}</p></Card>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
