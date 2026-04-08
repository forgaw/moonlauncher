import { memo, useCallback, useEffect, useMemo, useState } from "react"
import { UserPlus, Users, Server, Play, Square, Loader2, Copy, Trash2, Rocket, Shield, Download, RefreshCw } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card"
import { Button } from "./ui/button"
import { Input } from "./ui/input"
import { Label } from "./ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select"
import { Badge } from "./ui/badge"
import {
  backendService,
  type CoopServerStatus,
  type FriendEntry,
  type GameVersion,
  type PlayerProfile,
  type RadminStatus,
} from "../services/backend"
import { toast } from "sonner"

function fallbackMessage(error: unknown, value: string): string {
  if (!(error instanceof Error)) return value
  return error.message.replace(/^Request failed \(\d+\)\s*/i, "").trim() || value
}

function copyText(value: string, label: string) {
  void navigator.clipboard.writeText(value).then(
    () => toast.success(`${label} скопировано`),
    () => toast.error("Не удалось скопировать в буфер обмена"),
  )
}

const FriendCard = memo(function FriendCard({
  friend,
  onDelete,
}: {
  friend: FriendEntry
  onDelete: (friendId: string) => void
}) {
  return (
    <Card className="p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="size-10 rounded-lg overflow-hidden border border-white/10 bg-black/30">
            {friend.avatarUrl ? (
              <img src={friend.avatarUrl} alt={friend.nickname} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground">
                {friend.nickname.slice(0, 2).toUpperCase()}
              </div>
            )}
          </div>
          <div className="min-w-0">
            <p className="font-medium truncate">{friend.nickname}</p>
            <p className="text-xs text-muted-foreground">{friend.source === "elyby" ? "Профиль: Ely.by" : "Локальный друг"}</p>
          </div>
        </div>
        <Button variant="destructive" size="sm" onClick={() => onDelete(friend.id)}>
          <Trash2 className="size-4" />
        </Button>
      </div>
    </Card>
  )
})

export function FriendsPanel() {
  const [profiles, setProfiles] = useState<PlayerProfile[]>([])
  const [friends, setFriends] = useState<FriendEntry[]>([])
  const [versions, setVersions] = useState<GameVersion[]>([])
  const [selectedProfileId, setSelectedProfileId] = useState("")
  const [friendNickname, setFriendNickname] = useState("")

  const [serverVersion, setServerVersion] = useState("latest-release")
  const [serverWorld, setServerWorld] = useState("MoonWorld")
  const [serverPort, setServerPort] = useState("25565")
  const [serverPlayers, setServerPlayers] = useState("8")
  const [serverMemory, setServerMemory] = useState("2048")

  const [coopStatus, setCoopStatus] = useState<CoopServerStatus>({ running: false })
  const [sessionInstructions, setSessionInstructions] = useState<string[]>([])
  const [radminStatus, setRadminStatus] = useState<RadminStatus>({ installed: false, running: false })

  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingVersions, setIsLoadingVersions] = useState(true)
  const [isAddingFriend, setIsAddingFriend] = useState(false)
  const [isStartingServer, setIsStartingServer] = useState(false)
  const [isStartingSession, setIsStartingSession] = useState(false)
  const [isStoppingServer, setIsStoppingServer] = useState(false)
  const [isInstallingRadmin, setIsInstallingRadmin] = useState(false)
  const [isLaunchingRadmin, setIsLaunchingRadmin] = useState(false)

  const releaseVersions = useMemo(() => {
    const uniq = new Set<string>()
    const output: string[] = []
    for (const version of versions) {
      if (version.type !== "release") continue
      if (uniq.has(version.version)) continue
      uniq.add(version.version)
      output.push(version.version)
    }
    return output.slice(0, 100)
  }, [versions])

  const loadFastData = useCallback(async () => {
    setIsLoading(true)
    try {
      const [loadedProfiles, settings, loadedFriends, loadedStatus, loadedRadmin] = await Promise.all([
        backendService.getProfiles(),
        backendService.getSettings(),
        backendService.getFriends(),
        backendService.getCoopServerStatus(),
        backendService.getRadminStatus(),
      ])
      setProfiles(loadedProfiles)
      setFriends(loadedFriends)
      setCoopStatus(loadedStatus)
      setRadminStatus(loadedRadmin)

      const selectedId = String(settings.selectedProfileId || "")
      const selected = loadedProfiles.find(profile => profile.id === selectedId) ?? loadedProfiles[0] ?? null
      if (selected) {
        setSelectedProfileId(selected.id)
      }
      if (settings.coopServerPort) {
        setServerPort(String(settings.coopServerPort))
      }
      if (settings.coopServerMemoryMb) {
        setServerMemory(String(settings.coopServerMemoryMb))
      }
    } catch (error) {
      toast.error(fallbackMessage(error, "Не удалось загрузить вкладку друзей"))
    } finally {
      setIsLoading(false)
    }
  }, [])

  const loadVersions = useCallback(async () => {
    setIsLoadingVersions(true)
    try {
      const loadedVersions = await backendService.getVersions()
      setVersions(loadedVersions)
      const firstRelease = loadedVersions.find(item => item.type === "release")
      if (firstRelease) {
        setServerVersion(firstRelease.version)
      }
    } catch {
      setVersions([])
    } finally {
      setIsLoadingVersions(false)
    }
  }, [])

  const refreshServerStatus = useCallback(async () => {
    try {
      const status = await backendService.getCoopServerStatus()
      setCoopStatus(status)
    } catch {
      // ignore polling errors
    }
  }, [])

  const refreshRadminStatus = useCallback(async () => {
    try {
      setRadminStatus(await backendService.getRadminStatus())
    } catch {
      // ignore status errors
    }
  }, [])

  useEffect(() => {
    void loadFastData()
    void loadVersions()
  }, [loadFastData, loadVersions])

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      void refreshServerStatus()
      void refreshRadminStatus()
    }, 3500)
    return () => window.clearInterval(intervalId)
  }, [refreshRadminStatus, refreshServerStatus])

  const addFriend = useCallback(async () => {
    if (!friendNickname.trim()) return
    setIsAddingFriend(true)
    try {
      await backendService.addFriend(friendNickname.trim(), "manual")
      setFriendNickname("")
      setFriends(await backendService.getFriends())
      toast.success("Друг добавлен")
    } catch (error) {
      toast.error(fallbackMessage(error, "Не удалось добавить друга"))
    } finally {
      setIsAddingFriend(false)
    }
  }, [friendNickname])

  const removeFriend = useCallback(async (friendId: string) => {
    try {
      await backendService.removeFriend(friendId)
      setFriends(await backendService.getFriends())
      toast.success("Друг удален")
    } catch (error) {
      toast.error(fallbackMessage(error, "Не удалось удалить друга"))
    }
  }, [])

  const startServer = useCallback(async () => {
    setIsStartingServer(true)
    try {
      const status = await backendService.startCoopServer({
        versionId: serverVersion,
        worldName: serverWorld.trim() || "MoonWorld",
        port: Number(serverPort || 25565),
        maxPlayers: Number(serverPlayers || 8),
        memoryMb: Number(serverMemory || 2048),
        onlineMode: false,
        pvp: true,
        motd: "Moonlauncher Co-op",
      })
      setCoopStatus(status)
      setSessionInstructions(status.instructions || [])
      toast.success("Co-op сервер запущен")
    } catch (error) {
      toast.error(fallbackMessage(error, "Не удалось запустить сервер"))
    } finally {
      setIsStartingServer(false)
    }
  }, [serverMemory, serverPlayers, serverPort, serverVersion, serverWorld])

  const startServerAndGame = useCallback(async () => {
    if (!selectedProfileId) {
      toast.error("Выберите профиль для автозапуска")
      return
    }
    setIsStartingSession(true)
    try {
      const response = await backendService.startCoopSession({
        profileId: selectedProfileId,
        versionId: serverVersion,
        worldName: serverWorld.trim() || "MoonWorld",
        port: Number(serverPort || 25565),
        maxPlayers: Number(serverPlayers || 8),
        memoryMb: Number(serverMemory || 2048),
        onlineMode: false,
        pvp: true,
        motd: "Moonlauncher Co-op",
      })
      setCoopStatus(response.server)
      setSessionInstructions(response.instructions || [])
      toast.success("Сервер создан и Minecraft запущен автоматически")
    } catch (error) {
      toast.error(fallbackMessage(error, "Не удалось создать co-op сессию"))
    } finally {
      setIsStartingSession(false)
    }
  }, [selectedProfileId, serverMemory, serverPlayers, serverPort, serverVersion, serverWorld])

  const stopServer = useCallback(async () => {
    setIsStoppingServer(true)
    try {
      await backendService.stopCoopServer()
      setCoopStatus({ running: false })
      toast.success("Сервер остановлен")
    } catch (error) {
      toast.error(fallbackMessage(error, "Не удалось остановить сервер"))
    } finally {
      setIsStoppingServer(false)
    }
  }, [])

  const installRadmin = useCallback(async () => {
    setIsInstallingRadmin(true)
    try {
      const status = await backendService.installRadmin()
      setRadminStatus(status)
      toast.success("Radmin VPN установлен")
    } catch (error) {
      toast.error(fallbackMessage(error, "Не удалось установить Radmin VPN"))
    } finally {
      setIsInstallingRadmin(false)
    }
  }, [])

  const launchRadmin = useCallback(async () => {
    setIsLaunchingRadmin(true)
    try {
      await backendService.launchRadmin()
      await refreshRadminStatus()
      toast.success("Radmin VPN запущен")
    } catch (error) {
      toast.error(fallbackMessage(error, "Не удалось запустить Radmin VPN"))
    } finally {
      setIsLaunchingRadmin(false)
    }
  }, [refreshRadminStatus])

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
        <h2 className="text-2xl font-bold mb-2">Друзья и Co-op</h2>
        <p className="text-muted-foreground">Быстрый список друзей, встроенный Radmin Manager и авто-сервер</p>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="size-4" />
              Друзья
            </CardTitle>
            <CardDescription>Добавляйте друзей и храните контакты для совместной игры</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Input
                value={friendNickname}
                onChange={event => setFriendNickname(event.target.value)}
                placeholder="Ник друга"
                onKeyDown={event => {
                  if (event.key === "Enter") {
                    void addFriend()
                  }
                }}
              />
              <Button onClick={() => void addFriend()} disabled={isAddingFriend}>
                {isAddingFriend ? <Loader2 className="size-4 mr-2 animate-spin" /> : <UserPlus className="size-4 mr-2" />}
                Добавить
              </Button>
            </div>

            <div className="space-y-2">
              {friends.length === 0 ? (
                <p className="text-sm text-muted-foreground">Список друзей пока пуст</p>
              ) : (
                friends.map(friend => <FriendCard key={friend.id} friend={friend} onDelete={removeFriend} />)
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="size-4" />
              Radmin VPN Manager
            </CardTitle>
            <CardDescription>Установка и запуск Radmin прямо из лаунчера</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2 flex-wrap">
              <Badge variant={radminStatus.installed ? "default" : "outline"}>
                {radminStatus.installed ? "Установлен" : "Не установлен"}
              </Badge>
              <Badge variant={radminStatus.running ? "default" : "outline"}>
                {radminStatus.running ? "Запущен" : "Остановлен"}
              </Badge>
            </div>

            {radminStatus.adapterIp && (
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm text-muted-foreground">IP Radmin адаптера</span>
                <Button variant="ghost" size="sm" onClick={() => copyText(radminStatus.adapterIp || "", "IP Radmin") }>
                  {radminStatus.adapterIp}
                  <Copy className="size-4 ml-2" />
                </Button>
              </div>
            )}

            <div className="flex gap-2 flex-wrap">
              <Button variant="outline" onClick={() => void refreshRadminStatus()}>
                <RefreshCw className="size-4 mr-2" />
                Обновить статус
              </Button>
              <Button onClick={() => void installRadmin()} disabled={isInstallingRadmin || radminStatus.installed}>
                {isInstallingRadmin ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Download className="size-4 mr-2" />}
                Установить Radmin
              </Button>
              <Button onClick={() => void launchRadmin()} disabled={isLaunchingRadmin || !radminStatus.installed}>
                {isLaunchingRadmin ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Shield className="size-4 mr-2" />}
                Открыть Radmin
              </Button>
            </div>

            <p className="text-xs text-muted-foreground">
              После запуска Radmin создайте/войдите в сеть и используйте IP адаптера для подключения в Minecraft.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Server className="size-4" />
            Авто-сервер и авто-запуск игры
          </CardTitle>
          <CardDescription>
            Лаунчер создает сервер, выдает IP:порт и может сразу запустить Minecraft с автоподключением
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-2">
              <Label>Профиль для автозапуска</Label>
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
              <Label>Версия сервера</Label>
              <Select value={serverVersion} onValueChange={setServerVersion} disabled={isLoadingVersions}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value="latest-release">latest-release</SelectItem>
                  {releaseVersions.map(version => (
                    <SelectItem key={version} value={version}>
                      {version}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Мир</Label>
              <Input value={serverWorld} onChange={event => setServerWorld(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Порт</Label>
              <Input value={serverPort} onChange={event => setServerPort(event.target.value.replace(/[^\d]/g, ""))} />
            </div>
            <div className="space-y-2">
              <Label>Игроков</Label>
              <Input value={serverPlayers} onChange={event => setServerPlayers(event.target.value.replace(/[^\d]/g, ""))} />
            </div>
            <div className="space-y-2">
              <Label>RAM сервера (MB)</Label>
              <Input value={serverMemory} onChange={event => setServerMemory(event.target.value.replace(/[^\d]/g, ""))} />
            </div>
          </div>

          <div className="flex gap-2 flex-wrap">
            <Button onClick={() => void startServer()} disabled={isStartingServer || !!coopStatus.running}>
              {isStartingServer ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Play className="size-4 mr-2" />}
              Запустить сервер
            </Button>
            <Button onClick={() => void startServerAndGame()} disabled={isStartingSession || !!coopStatus.running}>
              {isStartingSession ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Rocket className="size-4 mr-2" />}
              Сервер + сразу запустить игру
            </Button>
            <Button variant="outline" onClick={() => void stopServer()} disabled={isStoppingServer || !coopStatus.running}>
              {isStoppingServer ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Square className="size-4 mr-2" />}
              Остановить
            </Button>
          </div>

          <Card className="p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm">Статус сервера</span>
              <Badge variant={coopStatus.running ? "default" : "outline"}>{coopStatus.running ? "Запущен" : "Остановлен"}</Badge>
            </div>

            {coopStatus.running && (
              <>
                {coopStatus.localAddress && (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm text-muted-foreground">IP:порт (LAN)</span>
                    <Button variant="ghost" size="sm" onClick={() => copyText(coopStatus.localAddress || "", "LAN адрес") }>
                      {coopStatus.localAddress}
                      <Copy className="size-4 ml-2" />
                    </Button>
                  </div>
                )}
                {coopStatus.publicAddress && (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm text-muted-foreground">IP:порт (Интернет)</span>
                    <Button variant="ghost" size="sm" onClick={() => copyText(coopStatus.publicAddress || "", "Публичный адрес") }>
                      {coopStatus.publicAddress}
                      <Copy className="size-4 ml-2" />
                    </Button>
                  </div>
                )}
              </>
            )}
          </Card>

          {sessionInstructions.length > 0 && (
            <Card className="p-3 space-y-2">
              <p className="text-sm font-medium">Инструкция по настройке</p>
              <div className="text-sm text-muted-foreground space-y-1">
                {sessionInstructions.map(line => (
                  <p key={line}>{line}</p>
                ))}
              </div>
            </Card>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
