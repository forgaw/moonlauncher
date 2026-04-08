import { useCallback, useEffect, useMemo, useState } from "react"
import { Link2, Loader2, Shield } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card"
import { Button } from "./ui/button"
import { Input } from "./ui/input"
import { Label } from "./ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select"
import { Badge } from "./ui/badge"
import { backendService, type ElyProfile, type PlayerProfile } from "../services/backend"
import { toast } from "sonner"

function normalizeError(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback
  return error.message.replace(/^Request failed \(\d+\)\s*/i, "").trim() || fallback
}

export function SkinsPanel() {
  const [profiles, setProfiles] = useState<PlayerProfile[]>([])
  const [selectedProfileId, setSelectedProfileId] = useState("")
  const [elyNickname, setElyNickname] = useState("")
  const [preview, setPreview] = useState<ElyProfile | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSearching, setIsSearching] = useState(false)
  const [isLinking, setIsLinking] = useState(false)

  const selectedProfile = useMemo(
    () => profiles.find(profile => profile.id === selectedProfileId) ?? null,
    [profiles, selectedProfileId],
  )

  const loadProfiles = useCallback(async () => {
    setIsLoading(true)
    try {
      const [loadedProfiles, settings] = await Promise.all([
        backendService.getProfiles(),
        backendService.getSettings(),
      ])
      setProfiles(loadedProfiles)
      const selectedId = String(settings.selectedProfileId || "")
      const selected = loadedProfiles.find(profile => profile.id === selectedId) ?? loadedProfiles[0] ?? null
      if (selected) {
        setSelectedProfileId(selected.id)
        setElyNickname(selected.elyNickname || selected.name || "")
      }
    } catch (error) {
      toast.error(normalizeError(error, "Не удалось загрузить профили"))
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadProfiles()
  }, [loadProfiles])

  useEffect(() => {
    if (!selectedProfile) return
    setElyNickname(selectedProfile.elyNickname || selectedProfile.name || "")
  }, [selectedProfile])

  const findElyProfile = useCallback(async () => {
    if (!elyNickname.trim()) {
      toast.error("Введите ник Ely.by")
      return
    }
    setIsSearching(true)
    try {
      const data = await backendService.getElyProfile(elyNickname.trim())
      setPreview(data)
      toast.success("Профиль Ely.by найден")
    } catch (error) {
      setPreview(null)
      toast.error(normalizeError(error, "Профиль Ely.by не найден"))
    } finally {
      setIsSearching(false)
    }
  }, [elyNickname])

  const linkProfile = useCallback(async () => {
    if (!selectedProfileId) {
      toast.error("Выберите профиль")
      return
    }
    if (!elyNickname.trim()) {
      toast.error("Введите ник Ely.by")
      return
    }

    setIsLinking(true)
    try {
      const updated = await backendService.linkElyProfile(selectedProfileId, elyNickname.trim(), true)
      setProfiles(prev => prev.map(profile => (profile.id === updated.id ? updated : profile)))
      setPreview({
        id: updated.elyUuid || "",
        name: updated.elyNickname || updated.name,
        skinUrl: updated.skinUrl,
        capeUrl: updated.capeUrl,
        avatarUrl: updated.skinUrl,
        exists: true,
      })
      toast.success("Скин и ник профиля синхронизированы через Ely.by")
    } catch (error) {
      toast.error(normalizeError(error, "Не удалось привязать профиль к Ely.by"))
    } finally {
      setIsLinking(false)
    }
  }, [selectedProfileId, elyNickname])

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
        <h2 className="text-2xl font-bold mb-2">Скины Ely.by</h2>
        <p className="text-muted-foreground">Отдельная вкладка для скинов и синхронизации профиля</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="size-4" />
            Привязка профиля к Ely.by
          </CardTitle>
          <CardDescription>Выберите профиль, проверьте ник и примените скин</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Профиль лаунчера</Label>
            <Select value={selectedProfileId} onValueChange={setSelectedProfileId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {profiles.map(profile => (
                  <SelectItem key={profile.id} value={profile.id}>
                    {profile.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Ely.by ник</Label>
            <Input
              value={elyNickname}
              onChange={event => setElyNickname(event.target.value)}
              placeholder="Введите Ely.by ник"
            />
          </div>

          <div className="flex gap-2">
            <Button variant="outline" onClick={() => void findElyProfile()} disabled={isSearching}>
              {isSearching ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Shield className="size-4 mr-2" />}
              Проверить
            </Button>
            <Button onClick={() => void linkProfile()} disabled={isLinking}>
              {isLinking ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Link2 className="size-4 mr-2" />}
              Применить скин
            </Button>
          </div>

          {(preview || selectedProfile?.skinUrl) && (
            <Card className="p-3">
              <div className="flex items-center gap-3">
                <div className="size-16 rounded-lg overflow-hidden bg-black/30 border border-white/10">
                  {preview?.skinUrl || selectedProfile?.skinUrl ? (
                    <img
                      src={preview?.skinUrl || selectedProfile?.skinUrl}
                      alt="skin"
                      className="w-full h-full object-cover"
                    />
                  ) : null}
                </div>
                <div className="space-y-1">
                  <p className="font-medium">{preview?.name || selectedProfile?.elyNickname || selectedProfile?.name}</p>
                  <div className="flex gap-2 flex-wrap">
                    <Badge variant="outline">Скин: {(preview?.skinUrl || selectedProfile?.skinUrl) ? "есть" : "нет"}</Badge>
                    <Badge variant="outline">Плащ: {(preview?.capeUrl || selectedProfile?.capeUrl) ? "есть" : "нет"}</Badge>
                  </div>
                </div>
              </div>
            </Card>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
