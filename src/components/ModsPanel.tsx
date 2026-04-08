import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Download, Search, Loader2, Package, Sparkles, FolderOpen, Trash2, Info } from "lucide-react"
import {
  backendService,
  type ContentDetails,
  type ContentKind,
  type ContentProject,
  type GameVersion,
  type InstalledContentEntry,
  type ProviderFilter,
  type ProviderType,
} from "../services/backend"
import { Card } from "./ui/card"
import { Button } from "./ui/button"
import { Input } from "./ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select"
import { Badge } from "./ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog"
import { toast } from "sonner"

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

const kindLabels: Record<ContentKind, string> = {
  mod: "Мод",
  modpack: "Сборка",
  resourcepack: "Ресурс-пак",
  shader: "Шейдер",
  map: "Карта",
}

const kindColors: Record<ContentKind, string> = {
  mod: "bg-emerald-500/20 text-emerald-300 border-emerald-400/40",
  modpack: "bg-indigo-500/20 text-indigo-300 border-indigo-400/40",
  resourcepack: "bg-cyan-500/20 text-cyan-300 border-cyan-400/40",
  shader: "bg-purple-500/20 text-purple-300 border-purple-400/40",
  map: "bg-amber-500/20 text-amber-300 border-amber-400/40",
}

const RESULTS_LIMIT = 80
const INITIAL_VISIBLE_COUNT = 18
const VISIBLE_INCREMENT = 12

function formatDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }
  return date.toLocaleString("ru-RU")
}

const ContentCard = memo(function ContentCard({
  item,
  onInstall,
  onDetails,
  isInstalling,
  isInstalled,
}: {
  item: ContentProject
  onInstall: (item: ContentProject) => void
  onDetails: (item: ContentProject) => void
  isInstalling: boolean
  isInstalled: boolean
}) {
  const platform = providerMeta[item.provider]

  return (
    <Card className="p-4 space-y-3">
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
          <h3 className="font-semibold leading-tight">{item.title}</h3>
          <p className="text-xs text-muted-foreground mt-1 truncate">@{item.slug}</p>
          <div className="flex flex-wrap gap-2 mt-2">
            <Badge variant="outline">{platform.label}</Badge>
            <Badge variant="outline" className={kindColors[item.kind]}>
              {kindLabels[item.kind]}
            </Badge>
          </div>
        </div>
      </div>

      <p className="text-sm text-muted-foreground line-clamp-2">{item.description || "Описание отсутствует"}</p>

      <div className="text-xs text-muted-foreground flex items-center gap-3">
        <span>Загрузки: {item.downloads.toLocaleString()}</span>
        <span>Подписчики: {item.followers.toLocaleString()}</span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" onClick={() => onDetails(item)}>
          <Info className="size-4 mr-2" />
          Подробнее
        </Button>
        <Button onClick={() => onInstall(item)} disabled={isInstalling || isInstalled}>
          {isInstalling ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Download className="size-4 mr-2" />}
          {isInstalled ? "Установлено" : "Установить"}
        </Button>
      </div>
    </Card>
  )
})

const InstalledEntryCard = memo(function InstalledEntryCard({
  entry,
  onDelete,
}: {
  entry: InstalledContentEntry
  onDelete: (entry: InstalledContentEntry) => void
}) {
  return (
    <Card className="p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium truncate">{entry.name}</p>
          <p className="text-xs text-muted-foreground">Изменено: {formatDate(entry.modifiedAt)}</p>
        </div>
        <Button variant="destructive" size="sm" onClick={() => onDelete(entry)}>
          <Trash2 className="size-4 mr-2" />
          Удалить
        </Button>
      </div>
    </Card>
  )
})

export function ModsPanel() {
  const [versions, setVersions] = useState<GameVersion[]>([])
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<ContentProject[]>([])
  const [selectedVersion, setSelectedVersion] = useState("1.21.4")
  const [loader, setLoader] = useState("fabric")
  const [provider, setProvider] = useState<ProviderFilter>("all")
  const [kind, setKind] = useState<ContentKind>("mod")
  const [isLoadingVersions, setIsLoadingVersions] = useState(true)
  const [isSearching, setIsSearching] = useState(false)
  const [isRecommendations, setIsRecommendations] = useState(true)
  const [installingId, setInstallingId] = useState<string | null>(null)
  const [installedContent, setInstalledContent] = useState<InstalledContentEntry[]>([])
  const [isLoadingInstalled, setIsLoadingInstalled] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [detailsTarget, setDetailsTarget] = useState<ContentProject | null>(null)
  const [detailsData, setDetailsData] = useState<ContentDetails | null>(null)
  const [detailsLoading, setDetailsLoading] = useState(false)
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_COUNT)
  const loadMoreRef = useRef<HTMLDivElement | null>(null)

  const loadVersions = useCallback(async () => {
    setIsLoadingVersions(true)
    try {
      const allVersions = await backendService.getVersions()
      setVersions(allVersions)
      const firstRelease = allVersions.find(version => version.type === "release")
      if (firstRelease) {
        setSelectedVersion(firstRelease.version)
      }
    } catch (error) {
      console.error("Error loading versions:", error)
      toast.error("Не удалось загрузить версии")
    } finally {
      setIsLoadingVersions(false)
    }
  }, [])

  const loadInstalled = useCallback(async () => {
    setIsLoadingInstalled(true)
    try {
      const items = await backendService.getInstalledContent(kind)
      setInstalledContent(items)
    } catch (error) {
      console.error("Error loading installed content:", error)
      toast.error("Не удалось загрузить установленный контент")
    } finally {
      setIsLoadingInstalled(false)
    }
  }, [kind])

  useEffect(() => {
    void loadVersions()
  }, [loadVersions])

  useEffect(() => {
    void loadInstalled()
  }, [loadInstalled])

  const releaseVersions = useMemo(() => {
    const uniq = new Set<string>()
    const list: string[] = []
    for (const version of versions) {
      if (version.type !== "release") continue
      if (!uniq.has(version.version)) {
        uniq.add(version.version)
        list.push(version.version)
      }
    }
    return list.slice(0, 120)
  }, [versions])

  const loadRecommendations = useCallback(async () => {
    setIsSearching(true)
    try {
      const data = await backendService.getContentRecommendations(
        kind,
        provider,
        selectedVersion,
        loader,
        RESULTS_LIMIT,
      )
      setResults(data)
      setVisibleCount(INITIAL_VISIBLE_COUNT)
      setIsRecommendations(true)
    } catch (error) {
      console.error("Error loading recommendations:", error)
      toast.error("Не удалось загрузить рекомендации")
    } finally {
      setIsSearching(false)
    }
  }, [kind, loader, provider, selectedVersion])

  const runSearch = useCallback(async () => {
    if (!query.trim()) {
      await loadRecommendations()
      return
    }

    setIsSearching(true)
    try {
      const data = await backendService.searchContent(
        query.trim(),
        kind,
        provider,
        selectedVersion,
        loader,
        RESULTS_LIMIT,
      )
      setResults(data)
      setVisibleCount(INITIAL_VISIBLE_COUNT)
      setIsRecommendations(false)
      if (data.length === 0) {
        toast.info("По вашему запросу ничего не найдено")
      }
    } catch (error) {
      console.error("Error searching content:", error)
      toast.error("Ошибка поиска")
    } finally {
      setIsSearching(false)
    }
  }, [kind, loader, provider, query, selectedVersion, loadRecommendations])

  useEffect(() => {
    if (!query.trim()) {
      void loadRecommendations()
    }
  }, [provider, kind, selectedVersion, loader, query, loadRecommendations])

  useEffect(() => {
    if (kind === "map" && provider === "modrinth") {
      setProvider("curseforge")
    }
  }, [kind, provider])

  const installedNames = useMemo(
    () => installedContent.map(entry => entry.name.toLowerCase()),
    [installedContent],
  )

  const visibleResults = useMemo(
    () => results.slice(0, visibleCount),
    [results, visibleCount],
  )

  const hasMoreVisible = visibleCount < results.length

  const isItemInstalled = useCallback(
    (item: ContentProject) => {
      if (item.installed) return true
      const slug = item.slug.toLowerCase()
      const title = item.title.toLowerCase()
      return installedNames.some(name => name.includes(slug) || name.includes(title))
    },
    [installedNames],
  )

  useEffect(() => {
    if (!hasMoreVisible || isSearching) return
    const marker = loadMoreRef.current
    if (!marker) return
    const observer = new IntersectionObserver(
      entries => {
        if (!entries.some(entry => entry.isIntersecting)) return
        setVisibleCount(prev => Math.min(prev + VISIBLE_INCREMENT, results.length))
      },
      { rootMargin: "240px 0px" },
    )
    observer.observe(marker)
    return () => observer.disconnect()
  }, [hasMoreVisible, isSearching, results.length])

  const installItem = useCallback(
    async (item: ContentProject) => {
      setInstallingId(item.id)
      try {
        const response = await backendService.installContent({
          projectId: item.id,
          provider: item.provider,
          kind: item.kind,
          gameVersion: selectedVersion,
          loader,
        })
        toast.success(`Установлено: ${response.fileName}`)
        setResults(prev =>
          prev.map(entry =>
            entry.id === item.id && entry.provider === item.provider && entry.kind === item.kind
              ? { ...entry, installed: true }
              : entry,
          ),
        )
        await loadInstalled()
      } catch (error) {
        console.error("Error installing content:", error)
        toast.error("Ошибка установки. Проверьте API-ключ выбранной платформы.")
      } finally {
        setInstallingId(null)
      }
    },
    [loader, selectedVersion, loadInstalled],
  )

  const deleteInstalled = useCallback(
    async (entry: InstalledContentEntry) => {
      try {
        await backendService.removeInstalledContent(kind, entry.name)
        toast.success(`Удалено: ${entry.name}`)
        await loadInstalled()
      } catch (error) {
        console.error("Error deleting installed content:", error)
        toast.error("Не удалось удалить контент")
      }
    },
    [kind, loadInstalled],
  )

  const openDetails = useCallback(async (item: ContentProject) => {
    setDetailsTarget(item)
    setDetailsOpen(true)
    setDetailsData(null)
    setDetailsLoading(true)
    try {
      const details = await backendService.getContentDetails(item.id, item.provider, item.kind)
      setDetailsData(details)
    } catch (error) {
      console.error("Error loading details:", error)
      toast.error("Не удалось загрузить подробности")
    } finally {
      setDetailsLoading(false)
    }
  }, [])

  return (
    <div className="panel-container">
      <div>
        <h2 className="text-2xl font-bold mb-2">Менеджер контента</h2>
        <p className="text-muted-foreground">
          Установка и удаление модов, ресурс-паков, шейдеров и карт в %USERPROFILE%\MoonMine
        </p>
      </div>

      <Card className="p-4 space-y-4">
        <div className="grid lg:grid-cols-6 gap-3">
          <Input
            value={query}
            onChange={event => setQuery(event.target.value)}
            onKeyDown={event => {
              if (event.key === "Enter") {
                void runSearch()
              }
            }}
            placeholder="Поиск модов, сборок, карт, ресурс-паков, шейдеров..."
            className="lg:col-span-2"
          />

          <Select value={kind} onValueChange={value => setKind(value as ContentKind)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="mod">Моды</SelectItem>
              <SelectItem value="modpack">Сборки</SelectItem>
              <SelectItem value="resourcepack">Ресурс-паки</SelectItem>
              <SelectItem value="shader">Шейдеры</SelectItem>
              <SelectItem value="map">Карты</SelectItem>
            </SelectContent>
          </Select>

          <Select value={provider} onValueChange={value => setProvider(value as ProviderFilter)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все платформы</SelectItem>
              <SelectItem value="modrinth">Modrinth</SelectItem>
              <SelectItem value="curseforge">CurseForge</SelectItem>
              <SelectItem value="rf">RF Community</SelectItem>
            </SelectContent>
          </Select>

          <Select value={selectedVersion} onValueChange={setSelectedVersion} disabled={isLoadingVersions}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {releaseVersions.map(version => (
                <SelectItem key={version} value={version}>
                  {version}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={loader} onValueChange={setLoader} disabled={kind !== "mod"}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="fabric">Fabric</SelectItem>
              <SelectItem value="forge">Forge</SelectItem>
              <SelectItem value="quilt">Quilt</SelectItem>
              <SelectItem value="neoforge">NeoForge</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex justify-end">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={async () => {
                const target =
                  kind === "mod"
                    ? "mods"
                    : kind === "modpack"
                      ? "modpacks"
                    : kind === "resourcepack"
                      ? "resourcepacks"
                      : kind === "shader"
                        ? "shaderpacks"
                        : "saves"
                try {
                  await backendService.openFolder(target)
                } catch (error) {
                  console.error("Error opening content folder:", error)
                  toast.error("Не удалось открыть папку")
                }
              }}
            >
              <FolderOpen className="size-4 mr-2" />
              Открыть папку
            </Button>
            <Button onClick={() => void runSearch()} disabled={isSearching} className="min-w-44">
              {isSearching ? (
                <Loader2 className="size-4 mr-2 animate-spin" />
              ) : (
                <Search className="size-4 mr-2" />
              )}
              {query.trim() ? "Искать" : "Обновить рекомендации"}
            </Button>
          </div>
        </div>
      </Card>

      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Установлено ({installedContent.length})</h3>
          {isLoadingInstalled && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
        </div>
        {installedContent.length === 0 ? (
          <p className="text-sm text-muted-foreground">В выбранном типе пока ничего не установлено.</p>
        ) : (
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {installedContent.map(entry => (
              <InstalledEntryCard key={entry.id} entry={entry} onDelete={deleteInstalled} />
            ))}
          </div>
        )}
      </Card>

      {results.length > 0 && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {isRecommendations ? (
            <>
              <Sparkles className="size-4 text-amber-400" />
              <span>
                Рекомендации
                {provider === "all" ? " по всем платформам" : " по выбранной платформе"}
              </span>
            </>
          ) : (
            <>
              <Package className="size-4" />
              <span>Результаты поиска</span>
            </>
          )}
        </div>
      )}

      {results.length === 0 && !isSearching ? (
        <Card className="p-10 text-center">
          <Package className="size-10 mx-auto mb-3 text-muted-foreground" />
          <p className="text-muted-foreground">
            {query.trim()
              ? "Ничего не найдено. Попробуйте изменить запрос."
              : "Нет рекомендаций для выбранных параметров."}
          </p>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visibleResults.map(item => (
            <ContentCard
              key={`${item.provider}-${item.id}-${item.kind}`}
              item={item}
              onInstall={installItem}
              onDetails={openDetails}
              isInstalling={installingId === item.id}
              isInstalled={isItemInstalled(item)}
            />
          ))}
        </div>
      )}

      {results.length > 0 && (
        <div className="flex items-center justify-center text-xs text-muted-foreground">
          Показано {visibleResults.length} из {results.length}
        </div>
      )}

      {hasMoreVisible && <div ref={loadMoreRef} className="h-2 w-full" />}

      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="w-[95vw] max-w-6xl max-h-[94vh] overflow-y-auto no-scrollbar">
          <DialogHeader>
            <DialogTitle>{detailsData?.title ?? detailsTarget?.title ?? "Подробности"}</DialogTitle>
          </DialogHeader>

          {detailsLoading && (
            <div className="py-10 flex items-center justify-center text-muted-foreground">
              <Loader2 className="size-5 mr-2 animate-spin" />
              Загрузка подробностей...
            </div>
          )}

          {!detailsLoading && detailsData && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">{providerMeta[detailsData.provider]?.label ?? detailsData.provider}</Badge>
                <Badge variant="outline" className={kindColors[detailsData.kind]}>
                  {kindLabels[detailsData.kind]}
                </Badge>
                <Badge variant="outline">Загрузки: {detailsData.downloads.toLocaleString()}</Badge>
                <Badge variant="outline">Подписчики: {detailsData.followers.toLocaleString()}</Badge>
              </div>

              {detailsData.gallery.length > 0 && (
                <div className="space-y-2">
                  <div className="w-full h-72 rounded-xl overflow-hidden bg-black/30 border border-white/10">
                    <img src={detailsData.gallery[0]} alt={detailsData.title} className="w-full h-full object-cover" />
                  </div>
                  {detailsData.gallery.length > 1 && (
                    <div className="grid grid-cols-4 gap-2">
                      {detailsData.gallery.slice(1, 9).map(image => (
                        <div key={image} className="h-20 rounded-lg overflow-hidden border border-white/10 bg-black/20">
                          <img src={image} alt="preview" className="w-full h-full object-cover" />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <Card className="p-4">
                <p className="text-sm whitespace-pre-wrap leading-relaxed">
                  {detailsData.description || detailsData.summary || "Описание отсутствует."}
                </p>
              </Card>

              {detailsData.websiteUrl && (
                <Button variant="outline" onClick={() => window.open(detailsData.websiteUrl, "_blank")}>
                  Открыть страницу проекта
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
