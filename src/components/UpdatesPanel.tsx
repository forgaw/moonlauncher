import { useCallback, useEffect, useState } from "react"
import { Loader2, Save, CheckCircle2, AlertTriangle } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card"
import { Button } from "./ui/button"
import { Input } from "./ui/input"
import { Label } from "./ui/label"
import { Switch } from "./ui/switch"
import { backendService, type JavaProfilesPayload } from "../services/backend"
import { toast } from "sonner"

function errorText(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback
  return error.message.replace(/^Request failed \(\d+\)\s*/i, "").trim() || fallback
}

export function UpdatesPanel() {
  const [isLoading, setIsLoading] = useState(true)
  const [isSavingJava, setIsSavingJava] = useState(false)
  const [javaProfiles, setJavaProfiles] = useState<JavaProfilesPayload>({
    useJavaProfiles: true,
    java8Path: "",
    java17Path: "",
    java21Path: "",
  })
  const [discordStatus, setDiscordStatus] = useState<{ enabled: boolean; connected: boolean; error?: string; clientId?: string }>({
    enabled: false,
    connected: false,
  })

  const loadData = useCallback(async () => {
    setIsLoading(true)
    try {
      const [javaData, discordData] = await Promise.all([
        backendService.getJavaProfiles(),
        backendService.getDiscordStatus(),
      ])
      setJavaProfiles(javaData)
      setDiscordStatus(discordData)
    } catch (error) {
      toast.error(errorText(error, "Не удалось загрузить данные Java"))
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const saveJavaProfiles = useCallback(async () => {
    setIsSavingJava(true)
    try {
      const updated = await backendService.updateJavaProfiles(javaProfiles)
      setJavaProfiles(updated)
      toast.success("Java-профили сохранены")
    } catch (error) {
      toast.error(errorText(error, "Не удалось сохранить Java-профили"))
    } finally {
      setIsSavingJava(false)
    }
  }, [javaProfiles])

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
        <h2 className="text-2xl font-bold mb-2">Java</h2>
        <p className="text-muted-foreground">Управление Java 8/17/21 для разных версий Minecraft</p>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Java-профили</CardTitle>
            <CardDescription>Назначение Java по версиям Minecraft</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="settings-row">
              <Label htmlFor="useJavaProfiles">Использовать Java-профили</Label>
              <Switch
                id="useJavaProfiles"
                checked={javaProfiles.useJavaProfiles}
                onCheckedChange={value => setJavaProfiles(prev => ({ ...prev, useJavaProfiles: value }))}
              />
            </div>

            <div className="space-y-2">
              <Label>Java 8 path</Label>
              <Input
                value={javaProfiles.java8Path}
                onChange={event => setJavaProfiles(prev => ({ ...prev, java8Path: event.target.value }))}
                placeholder="C:\\Program Files\\Java\\...\\bin\\java.exe"
              />
            </div>

            <div className="space-y-2">
              <Label>Java 17 path</Label>
              <Input
                value={javaProfiles.java17Path}
                onChange={event => setJavaProfiles(prev => ({ ...prev, java17Path: event.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label>Java 21 path</Label>
              <Input
                value={javaProfiles.java21Path}
                onChange={event => setJavaProfiles(prev => ({ ...prev, java21Path: event.target.value }))}
              />
            </div>

            <Button onClick={() => void saveJavaProfiles()} disabled={isSavingJava}>
              {isSavingJava ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Save className="size-4 mr-2" />}
              Сохранить Java-профили
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Discord Rich Presence</CardTitle>
            <CardDescription>Статус интеграции Discord</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2">
              {discordStatus.connected ? (
                <CheckCircle2 className="size-5 text-emerald-400" />
              ) : (
                <AlertTriangle className="size-5 text-amber-400" />
              )}
              <span>{discordStatus.connected ? "Подключено" : "Не подключено"}</span>
            </div>
            <p className="text-sm text-muted-foreground">Client ID: {discordStatus.clientId || "не задан"}</p>
            {(discordStatus.error || "").trim() && (
              <p className="text-sm text-amber-200 bg-amber-500/10 border border-amber-400/30 rounded-lg p-3">
                {discordStatus.error}
              </p>
            )}
            <Button variant="outline" onClick={() => void loadData()}>
              Обновить статус Discord
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
