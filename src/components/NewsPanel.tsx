import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Calendar, ExternalLink, RefreshCw } from "lucide-react"
import { Card } from "./ui/card"
import { Button } from "./ui/button"
import { Badge } from "./ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog"
import { ImageWithFallback } from "./figma/ImageWithFallback"
import { backendService, type NewsArticle } from "../services/backend"
import minecraftBackground from "figma:asset/c80877b64f6066aa2903984efb421fe249bbada5.png"

const AUTO_REFRESH_MS = 10 * 60 * 1000
const NEWS_PAGE_STEP = 12

function formatDate(dateString: string): string {
  const date = new Date(dateString)
  if (Number.isNaN(date.getTime())) return dateString
  return date.toLocaleDateString("ru-RU", {
    year: "numeric",
    month: "long",
    day: "numeric",
  })
}

function categoryStyle(category: string): string {
  const value = category.toLowerCase()
  if (value.includes("update") || value.includes("обнов") || value.includes("верси")) return "bg-blue-500/20 text-blue-300 border-blue-400/50"
  if (value.includes("snapshot") || value.includes("beta") || value.includes("снап")) return "bg-amber-500/20 text-amber-300 border-amber-400/50"
  if (value.includes("community") || value.includes("сооб") || value.includes("мод")) return "bg-emerald-500/20 text-emerald-300 border-emerald-400/50"
  return "bg-indigo-500/20 text-indigo-300 border-indigo-400/50"
}

function openNewsUrl(article: NewsArticle) {
  const target = String(article.url || "").trim() || "https://www.minecraft.net"
  window.open(target, "_blank", "noopener,noreferrer")
}

function newsFallbackImage(_article: NewsArticle): string {
  return minecraftBackground
}

function toPlainText(value: string): string {
  return String(value || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim()
}

function toTimestamp(value: string): number {
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? 0 : parsed
}

export function NewsPanel() {
  const [news, setNews] = useState<NewsArticle[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [detailsArticle, setDetailsArticle] = useState<NewsArticle | null>(null)
  const [isDetailsOpen, setIsDetailsOpen] = useState(false)
  const [visibleCount, setVisibleCount] = useState(NEWS_PAGE_STEP + 1)
  const loadMoreAnchorRef = useRef<HTMLDivElement | null>(null)

  const openDetails = useCallback((article: NewsArticle) => {
    setDetailsArticle(article)
    setIsDetailsOpen(true)
  }, [])

  const loadNews = useCallback(async () => {
    setIsLoading(true)
    try {
      const articles = await backendService.getNews()
      setNews(Array.isArray(articles) ? articles : [])
      setVisibleCount(prev => Math.max(prev, NEWS_PAGE_STEP + 1))
      setLastUpdated(new Date())
    } catch (error) {
      console.error("Error loading news:", error)
      setNews([])
      setLastUpdated(new Date())
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadNews()
  }, [loadNews])

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState !== "visible") return
      void loadNews()
    }
    const intervalId = window.setInterval(tick, AUTO_REFRESH_MS)
    window.addEventListener("focus", tick)
    document.addEventListener("visibilitychange", tick)
    return () => {
      window.clearInterval(intervalId)
      window.removeEventListener("focus", tick)
      document.removeEventListener("visibilitychange", tick)
    }
  }, [loadNews])

  const sortedNews = useMemo(() => {
    return [...news].sort((a, b) => toTimestamp(b.publishDate) - toTimestamp(a.publishDate))
  }, [news])

  useEffect(() => {
    setVisibleCount(prev => {
      const minValue = NEWS_PAGE_STEP + 1
      const maxValue = Math.max(sortedNews.length, minValue)
      return Math.min(Math.max(prev, minValue), maxValue)
    })
  }, [sortedNews.length])

  useEffect(() => {
    const anchor = loadMoreAnchorRef.current
    if (!anchor) return
    if (visibleCount >= sortedNews.length) return

    const observer = new IntersectionObserver(
      entries => {
        const first = entries[0]
        if (!first?.isIntersecting) return
        setVisibleCount(prev => Math.min(prev + NEWS_PAGE_STEP, sortedNews.length))
      },
      { root: null, rootMargin: "420px 0px 420px 0px", threshold: 0.01 },
    )

    observer.observe(anchor)
    return () => observer.disconnect()
  }, [visibleCount, sortedNews.length])

  const featuredArticle = useMemo(() => sortedNews[0], [sortedNews])
  const listArticles = useMemo(() => {
    if (sortedNews.length <= 1) return []
    return sortedNews.slice(1, Math.max(1, visibleCount))
  }, [sortedNews, visibleCount])

  return (
    <div className="panel-container">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold mb-2">Новости Minecraft</h2>
          <p className="text-muted-foreground">Автообновляемая лента: новые сверху, старые в конце</p>
        </div>

        <div className="flex items-center gap-3">
          {lastUpdated && (
            <p className="text-sm text-muted-foreground">Обновлено: {formatDate(lastUpdated.toISOString())}</p>
          )}
          <Button variant="outline" size="sm" onClick={() => void loadNews()} disabled={isLoading} className="gap-2">
            <RefreshCw className={`size-4 ${isLoading ? "animate-spin" : ""}`} />
            Обновить
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <Card className="p-6"><div className="h-40 bg-muted rounded animate-pulse" /></Card>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {[...Array(6)].map((_, index) => (
              <Card key={index} className="p-4"><div className="h-28 bg-muted rounded animate-pulse" /></Card>
            ))}
          </div>
        </div>
      ) : sortedNews.length === 0 ? (
        <Card className="p-8 text-center space-y-3">
          <p className="text-muted-foreground">Сейчас новости не загрузились.</p>
          <Button variant="outline" onClick={() => void loadNews()}>Повторить</Button>
        </Card>
      ) : (
        <>
          {featuredArticle && (
            <Card className="overflow-hidden border-primary/40">
              <div className="grid md:grid-cols-2 gap-0">
                <div className="h-64 md:h-auto relative">
                  <ImageWithFallback
                    src={featuredArticle.imageUrl}
                    fallbackSrc={newsFallbackImage(featuredArticle)}
                    fallbackLabel="Изображение новости"
                    alt={featuredArticle.title}
                    className="w-full h-full object-cover"
                  />
                  <Badge className="absolute top-4 left-4" variant="destructive">Главная</Badge>
                </div>
                <div className="p-6 flex flex-col justify-center gap-4">
                  <Badge variant="outline" className={categoryStyle(featuredArticle.category)}>{featuredArticle.category}</Badge>
                  <h3 className="text-xl font-semibold leading-snug">{featuredArticle.title}</h3>
                  <p className="text-muted-foreground">{featuredArticle.excerpt}</p>
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Calendar className="size-4" />
                      {formatDate(featuredArticle.publishDate)}
                    </div>
                    <Button variant="outline" onClick={() => openDetails(featuredArticle)}>
                      Подробнее
                    </Button>
                    <Button variant="ghost" onClick={() => openNewsUrl(featuredArticle)}>
                      Источник
                      <ExternalLink className="size-3 ml-2" />
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">Источник: {featuredArticle.author}</p>
                </div>
              </div>
            </Card>
          )}

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {listArticles.map(article => (
              <Card key={article.id} className="overflow-hidden group">
                <div className="aspect-video overflow-hidden">
                  <ImageWithFallback
                    src={article.imageUrl}
                    fallbackSrc={newsFallbackImage(article)}
                    fallbackLabel="Изображение новости"
                    alt={article.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                </div>
                <div className="p-4 space-y-3">
                  <Badge variant="outline" className={categoryStyle(article.category)}>{article.category}</Badge>
                  <h3 className="font-semibold line-clamp-2">{article.title}</h3>
                  <p className="text-sm text-muted-foreground line-clamp-3">{article.excerpt}</p>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Calendar className="size-3" />
                      {formatDate(article.publishDate)}
                    </div>
                    <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => openDetails(article)}>
                      Подробнее
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>

          <div className="flex flex-col items-center gap-3 py-2">
            {visibleCount < sortedNews.length ? (
              <>
                <div ref={loadMoreAnchorRef} className="h-4 w-full" />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setVisibleCount(prev => Math.min(prev + NEWS_PAGE_STEP, sortedNews.length))}
                >
                  Загрузить ещё новости
                </Button>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">Вы на конце ленты, показаны самые старые новости.</p>
            )}
          </div>

          <Dialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
            <DialogContent className="max-w-3xl max-h-[86vh] overflow-hidden p-0 border-white/20 bg-gray-950/95 text-white backdrop-blur-xl">
              {detailsArticle && (
                <div className="flex h-full flex-col">
                  <div className="relative h-56 shrink-0 overflow-hidden">
                    <ImageWithFallback
                      src={detailsArticle.imageUrl}
                      fallbackSrc={newsFallbackImage(detailsArticle)}
                      fallbackLabel="Изображение новости"
                      alt={detailsArticle.title}
                      className="h-full w-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                    <Badge variant="outline" className={`absolute left-4 top-4 ${categoryStyle(detailsArticle.category)}`}>
                      {detailsArticle.category}
                    </Badge>
                  </div>

                  <div className="min-h-0 flex-1 overflow-y-auto p-6 space-y-4">
                    <DialogHeader>
                      <DialogTitle className="text-2xl leading-snug font-mojangles">{detailsArticle.title}</DialogTitle>
                      <DialogDescription className="text-sm text-white/70 flex items-center gap-2">
                        <Calendar className="size-4" />
                        {formatDate(detailsArticle.publishDate)} • {detailsArticle.author}
                      </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-3 text-white/90">
                      {toPlainText(detailsArticle.content || detailsArticle.excerpt)
                        .split(/\n{2,}/)
                        .filter(Boolean)
                        .map((paragraph, index) => (
                          <p key={`${detailsArticle.id}-p-${index}`} className="leading-relaxed whitespace-pre-wrap">
                            {paragraph}
                          </p>
                        ))}
                    </div>

                    <div className="flex items-center justify-end">
                      <Button variant="outline" onClick={() => openNewsUrl(detailsArticle)}>
                        Открыть источник
                        <ExternalLink className="size-3 ml-2" />
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  )
}
