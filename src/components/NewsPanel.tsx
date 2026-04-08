import { useState, useEffect } from "react"
import { Calendar, ExternalLink, RefreshCw } from "lucide-react"
import { Card } from "./ui/card"
import { Button } from "./ui/button"
import { Badge } from "./ui/badge"
import { ImageWithFallback } from "./figma/ImageWithFallback"
import { backendService, type NewsArticle } from "../services/backend"

export function NewsPanel() {
  const [news, setNews] = useState<NewsArticle[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  useEffect(() => {
    void loadNews()
  }, [])

  const loadNews = async () => {
    setIsLoading(true)
    try {
      const articles = await backendService.getNews()
      setNews(articles)
      setLastUpdated(new Date())
    } catch (error) {
      console.error("Error loading news:", error)
      setNews([
        {
          id: "1",
          title: "Moonlauncher: обновление доступно",
          content: "Вышло новое обновление лаунчера.",
          excerpt: "Добавлены улучшения стабильности, исправления ошибок и обновлённые модули загрузки.",
          author: "Команда Moonlauncher",
          publishDate: "2026-04-06",
          category: "Обновление",
          tags: ["обновление", "launcher"],
          imageUrl: "https://images.unsplash.com/photo-1612461313099-0bc8da7dccb0?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080",
          featured: true,
        },
      ])
    } finally {
      setIsLoading(false)
    }
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString("ru-RU", {
      year: "numeric",
      month: "long",
      day: "numeric",
    })
  }

  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      "Обновление": "bg-blue-500/20 text-blue-400 border-blue-400/50",
      "Разработка": "bg-purple-500/20 text-purple-400 border-purple-400/50",
      "Сообщество": "bg-green-500/20 text-green-400 border-green-400/50",
      "Новости": "bg-yellow-500/20 text-yellow-400 border-yellow-400/50",
    }
    return colors[category] || "bg-gray-500/20 text-gray-400 border-gray-400/50"
  }

  const featuredArticle = news.find(article => article.featured)

  return (
    <div className="flex-1 p-6 space-y-6 overflow-y-auto">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold mb-2">Новости и обновления</h2>
          <p className="text-muted-foreground">
            Последние новости Minecraft и Moonlauncher
          </p>
        </div>

        <div className="flex items-center gap-4">
          {lastUpdated && (
            <p className="text-sm text-muted-foreground">
              Обновлено: {formatDate(lastUpdated.toISOString())}
            </p>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => void loadNews()}
            disabled={isLoading}
            className="gap-2"
          >
            <RefreshCw className={`size-4 ${isLoading ? "animate-spin" : ""}`} />
            Обновить
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-6">
          <Card className="overflow-hidden">
            <div className="grid md:grid-cols-2 gap-0">
              <div className="h-64 md:h-auto bg-muted animate-pulse" />
              <div className="p-6 space-y-4">
                <div className="h-6 bg-muted rounded animate-pulse" />
                <div className="h-8 bg-muted rounded animate-pulse" />
                <div className="space-y-2">
                  <div className="h-4 bg-muted rounded animate-pulse" />
                  <div className="h-4 bg-muted rounded animate-pulse w-3/4" />
                </div>
              </div>
            </div>
          </Card>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[...Array(6)].map((_, i) => (
              <Card key={i} className="overflow-hidden">
                <div className="aspect-video bg-muted animate-pulse" />
                <div className="p-4 space-y-3">
                  <div className="h-4 bg-muted rounded animate-pulse w-16" />
                  <div className="h-5 bg-muted rounded animate-pulse" />
                  <div className="space-y-2">
                    <div className="h-3 bg-muted rounded animate-pulse" />
                    <div className="h-3 bg-muted rounded animate-pulse w-2/3" />
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      ) : (
        <>
          {featuredArticle && (
            <Card className="overflow-hidden border-primary/50">
              <div className="grid md:grid-cols-2 gap-0">
                <div className="relative h-64 md:h-auto">
                  <ImageWithFallback
                    src={featuredArticle.imageUrl || ""}
                    alt={featuredArticle.title}
                    className="w-full h-full object-cover"
                  />
                  <Badge className="absolute top-4 left-4" variant="destructive">
                    Важно
                  </Badge>
                </div>
                <div className="p-6 flex flex-col justify-center">
                  <div className="space-y-4">
                    <Badge variant="outline" className={getCategoryColor(featuredArticle.category)}>
                      {featuredArticle.category}
                    </Badge>
                    <h3 className="text-xl font-bold">{featuredArticle.title}</h3>
                    <p className="text-muted-foreground">{featuredArticle.excerpt}</p>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Calendar className="size-4" />
                        {formatDate(featuredArticle.publishDate)}
                      </div>
                      <Button variant="outline" size="sm">
                        Подробнее
                        <ExternalLink className="size-3 ml-2" />
                      </Button>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Автор: {featuredArticle.author}
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          )}

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {news.filter(article => !article.featured).map((article) => (
              <Card key={article.id} className="overflow-hidden hover:shadow-lg transition-shadow group">
                <div className="aspect-video relative overflow-hidden">
                  <ImageWithFallback
                    src={article.imageUrl || ""}
                    alt={article.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                </div>
                <div className="p-4 space-y-3">
                  <Badge variant="outline" className={`text-xs ${getCategoryColor(article.category)}`}>
                    {article.category}
                  </Badge>
                  <h3 className="font-semibold line-clamp-2 group-hover:text-primary transition-colors">
                    {article.title}
                  </h3>
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {article.excerpt}
                  </p>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Calendar className="size-3" />
                      {formatDate(article.publishDate)}
                    </div>
                    <Button variant="ghost" size="sm" className="h-8 text-xs">
                      Подробнее
                    </Button>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Автор: {article.author}
                  </div>
                </div>
              </Card>
            ))}
          </div>

          {news.length === 0 && !isLoading && (
            <Card className="p-8 text-center">
              <p className="text-muted-foreground">Сейчас новостей нет.</p>
              <Button variant="outline" onClick={() => void loadNews()} className="mt-4">
                <RefreshCw className="size-4 mr-2" />
                Повторить
              </Button>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
