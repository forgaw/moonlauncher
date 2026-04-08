import { useCallback, useEffect, useMemo, useState } from "react"
import { Calendar, ExternalLink, RefreshCw } from "lucide-react"
import { Card } from "./ui/card"
import { Button } from "./ui/button"
import { Badge } from "./ui/badge"
import { ImageWithFallback } from "./figma/ImageWithFallback"
import { backendService, type NewsArticle } from "../services/backend"

const AUTO_REFRESH_MS = 10 * 60 * 1000

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
  if (value.includes("update") || value.includes("обнов")) return "bg-blue-500/20 text-blue-300 border-blue-400/50"
  if (value.includes("snapshot") || value.includes("beta")) return "bg-amber-500/20 text-amber-300 border-amber-400/50"
  if (value.includes("community") || value.includes("сооб")) return "bg-emerald-500/20 text-emerald-300 border-emerald-400/50"
  return "bg-indigo-500/20 text-indigo-300 border-indigo-400/50"
}

function openNewsUrl(article: NewsArticle) {
  const target = String(article.url || "").trim() || "https://www.minecraft.net"
  window.open(target, "_blank", "noopener,noreferrer")
}

function newsFallbackImage(article: NewsArticle): string {
  const seed = `${article.title} ${article.category}`.trim().toLowerCase()
  const query = encodeURIComponent(seed || "minecraft")
  return `https://source.unsplash.com/1280x720/?${query}&sig=${Math.abs(seed.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0)) % 1000}`
}

export function NewsPanel() {
  const [news, setNews] = useState<NewsArticle[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const loadNews = useCallback(async () => {
    setIsLoading(true)
    try {
      const articles = await backendService.getNews()
      setNews(articles)
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

  const featuredArticle = useMemo(() => news.find(article => article.featured) ?? news[0], [news])
  const listArticles = useMemo(() => news.filter(article => article.id !== featuredArticle?.id), [news, featuredArticle])

  return (
    <div className="panel-container">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold mb-2">Новости Minecraft</h2>
          <p className="text-muted-foreground">Свежие новости с официальных источников Minecraft</p>
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
      ) : news.length === 0 ? (
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
                    src={featuredArticle.imageUrl || newsFallbackImage(featuredArticle)}
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
                    <Button variant="outline" onClick={() => openNewsUrl(featuredArticle)}>
                      Открыть
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
                    src={article.imageUrl || newsFallbackImage(article)}
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
                    <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => openNewsUrl(article)}>
                      Подробнее
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
