import { useCallback, useEffect, useMemo, useState } from "react"
import { Save, RefreshCw, DatabaseBackup, Loader2, Search, ShieldAlert, Copy, ActivitySquare } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card"
import { Button } from "./ui/button"
import { Input } from "./ui/input"
import { Label } from "./ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select"
import { Switch } from "./ui/switch"
import {
  backendService,
  type IntegrityVerifyResult,
  type LogIndexEntry,
  type LogSearchEntry,
  type ModConflictReport,
  type MonitorSnapshot,
  type WorldBackupEntry,
} from "../services/backend"
import { toast } from "sonner"

function fail(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback
  return error.message.replace(/^Request failed \(\d+\)\s*/i, "").trim() || fallback
}

function toMb(value: number): string {
  return `${value.toLocaleString("ru-RU")} MB`
}

export function ToolsPanel() {
  const [settings, setSettings] = useState<Record<string, any>>({})
  const [worlds, setWorlds] = useState<string[]>([])
  const [selectedWorld, setSelectedWorld] = useState("all")
  const [backups, setBackups] = useState<WorldBackupEntry[]>([])
  const [isCreatingBackup, setIsCreatingBackup] = useState(false)

  const [logs, setLogs] = useState<LogIndexEntry[]>([])
  const [selectedLog, setSelectedLog] = useState("")
  const [logLines, setLogLines] = useState<string[]>([])
  const [logQuery, setLogQuery] = useState("")
  const [logLevel, setLogLevel] = useState<"all" | "error" | "warn" | "info" | "debug">("all")
  const [logMatches, setLogMatches] = useState<LogSearchEntry[]>([])

  const [monitor, setMonitor] = useState<MonitorSnapshot | null>(null)
  const [conflicts, setConflicts] = useState<ModConflictReport | null>(null)
  const [integrity, setIntegrity] = useState<IntegrityVerifyResult | null>(null)

  const [isLoading, setIsLoading] = useState(true)
  const [isSavingSchedule, setIsSavingSchedule] = useState(false)

  const loadData = useCallback(async () => {
    setIsLoading(true)
    try {
      const [loadedSettings, loadedBackups, installedMaps, loadedLogs, loadedMonitor, loadedConflicts] = await Promise.all([
        backendService.getSettings(),
        backendService.getWorldBackups(),
        backendService.getInstalledContent("map"),
        backendService.getLogsIndex(),
        backendService.getMonitorSnapshot(),
        backendService.getModConflictReport("fabric"),
      ])
      setSettings(loadedSettings)
      setBackups(loadedBackups)
      setLogs(loadedLogs)
      setMonitor(loadedMonitor)
      setConflicts(loadedConflicts)

      const worldsFromMaps = installedMaps
        .filter(item => item.isDirectory)
        .map(item => item.name)
      const mergedWorlds = Array.from(new Set(["all", ...worldsFromMaps])).sort((left, right) => left.localeCompare(right, "ru-RU"))
      setWorlds(mergedWorlds)
      setSelectedWorld(prev => (mergedWorlds.includes(prev) ? prev : "all"))

      if (loadedLogs.length > 0) {
        const first = loadedLogs[0].name
        setSelectedLog(prev => prev || first)
      }
    } catch (error) {
      toast.error(fail(error, "Не удалось загрузить инструменты"))
    } finally {
      setIsLoading(false)
    }
  }, [])

  const loadLog = useCallback(async (name: string) => {
    if (!name) return
    try {
      const payload = await backendService.readLog(name, 1200)
      setLogLines(payload.lines)
      setSelectedLog(name)
    } catch (error) {
      setLogLines([])
      toast.error(fail(error, "Не удалось прочитать лог"))
    }
  }, [])

  const refreshMonitor = useCallback(async () => {
    try {
      setMonitor(await backendService.getMonitorSnapshot())
    } catch {
      
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  useEffect(() => {
    if (!selectedLog) return
    void loadLog(selectedLog)
  }, [selectedLog, loadLog])

  useEffect(() => {
    const id = window.setInterval(() => {
      void refreshMonitor()
    }, 3000)
    return () => window.clearInterval(id)
  }, [refreshMonitor])

  const backupSchedule = useMemo(() => ({
    backupEnabled: Boolean(settings.backupEnabled),
    backupIntervalMinutes: Number(settings.backupIntervalMinutes || 60),
    backupKeepCount: Number(settings.backupKeepCount || 30),
  }), [settings])

  const saveSchedule = useCallback(async () => {
    setIsSavingSchedule(true)
    try {
      await backendService.updateSettings({
        backupEnabled: backupSchedule.backupEnabled,
        backupIntervalMinutes: backupSchedule.backupIntervalMinutes,
        backupKeepCount: backupSchedule.backupKeepCount,
      })
      toast.success("Настройки бэкапов сохранены")
    } catch (error) {
      toast.error(fail(error, "Не удалось сохранить настройки бэкапа"))
    } finally {
      setIsSavingSchedule(false)
    }
  }, [backupSchedule])

  const createBackup = useCallback(async () => {
    setIsCreatingBackup(true)
    try {
      await backendService.createWorldBackup(selectedWorld === "all" ? undefined : selectedWorld)
      setBackups(await backendService.getWorldBackups())
      toast.success("Бэкап создан")
    } catch (error) {
      toast.error(fail(error, "Не удалось создать бэкап"))
    } finally {
      setIsCreatingBackup(false)
    }
  }, [selectedWorld])

  const restoreBackup = useCallback(async (backupId: string) => {
    try {
      const result = await backendService.restoreWorldBackup(backupId)
      toast.success(`Восстановлено миров: ${result.restoredWorlds.length}`)
    } catch (error) {
      toast.error(fail(error, "Не удалось восстановить мир"))
    }
  }, [])

  const runLogSearch = useCallback(async () => {
    try {
      const data = await backendService.searchLogs(logQuery, logLevel, 300)
      setLogMatches(data)
    } catch (error) {
      toast.error(fail(error, "Не удалось выполнить поиск по логам"))
    }
  }, [logLevel, logQuery])

  const copySupportReport = useCallback(async () => {
    try {
      const report = await backendService.buildSupportReport()
      await navigator.clipboard.writeText(report.content || report.path)
      toast.success("Отчет для техподдержки скопирован")
    } catch (error) {
      toast.error(fail(error, "Не удалось создать отчет"))
    }
  }, [])

  const rebuildIntegrity = useCallback(async () => {
    try {
      await backendService.createIntegrityBaseline()
      setIntegrity(null)
      toast.success("Базовый снимок целостности создан")
    } catch (error) {
      toast.error(fail(error, "Не удалось создать baseline"))
    }
  }, [])

  const verifyIntegrity = useCallback(async () => {
    try {
      const result = await backendService.verifyIntegrity()
      setIntegrity(result)
      toast.success(result.isClean ? "Сборка чистая" : "Обнаружены изменения")
    } catch (error) {
      toast.error(fail(error, "Не удалось проверить целостность"))
    }
  }, [])

  const refreshConflicts = useCallback(async () => {
    try {
      setConflicts(await backendService.getModConflictReport("fabric"))
    } catch (error) {
      toast.error(fail(error, "Не удалось проверить моды"))
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
        <h2 className="text-2xl font-bold mb-2">Инструменты</h2>
        <p className="text-muted-foreground">Бэкапы, проверка модов, лог-центр, мониторинг и целостность сборки</p>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><DatabaseBackup className="size-4" />Бэкап миров</CardTitle>
            <CardDescription>Расписание + ручное восстановление миров</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="settings-row">
              <Label htmlFor="backupEnabled">Включить расписание</Label>
              <Switch
                id="backupEnabled"
                checked={backupSchedule.backupEnabled}
                onCheckedChange={value => setSettings(prev => ({ ...prev, backupEnabled: value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-2">
                <Label>Интервал (мин)</Label>
                <Input
                  value={String(backupSchedule.backupIntervalMinutes)}
                  onChange={event => setSettings(prev => ({ ...prev, backupIntervalMinutes: Number(event.target.value.replace(/[^\d]/g, "") || 60) }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Хранить архивов</Label>
                <Input
                  value={String(backupSchedule.backupKeepCount)}
                  onChange={event => setSettings(prev => ({ ...prev, backupKeepCount: Number(event.target.value.replace(/[^\d]/g, "") || 30) }))}
                />
              </div>
            </div>

            <div className="flex gap-2 flex-wrap">
              <Select value={selectedWorld} onValueChange={setSelectedWorld}>
                <SelectTrigger className="w-56">
                  <SelectValue placeholder="Выберите мир" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все миры</SelectItem>
                  {worlds.filter(item => item !== "all").map(world => (
                    <SelectItem key={world} value={world}>{world}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={() => void createBackup()} disabled={isCreatingBackup}>
                {isCreatingBackup ? <Loader2 className="size-4 mr-2 animate-spin" /> : <DatabaseBackup className="size-4 mr-2" />}
                Создать бэкап
              </Button>
              <Button variant="outline" onClick={() => void saveSchedule()} disabled={isSavingSchedule}>
                {isSavingSchedule ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Save className="size-4 mr-2" />}
                Сохранить расписание
              </Button>
            </div>

            <div className="space-y-2 max-h-64 overflow-y-auto no-scrollbar pr-1">
              {backups.map(item => (
                <Card key={item.id} className="p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{item.name}</p>
                      <p className="text-xs text-muted-foreground">{new Date(item.createdAt).toLocaleString("ru-RU")}</p>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => void restoreBackup(item.id)}>Восстановить</Button>
                  </div>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><ActivitySquare className="size-4" />Мониторинг</CardTitle>
            <CardDescription>CPU/RAM/Java-память в реальном времени</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p>CPU: <b>{monitor?.cpuPercent ?? 0}%</b></p>
            <p>RAM: <b>{toMb(monitor?.ramUsedMb ?? 0)}</b> / {toMb(monitor?.ramTotalMb ?? 0)}</p>
            <p>Java: <b>{toMb(monitor?.javaProcessMb ?? 0)}</b></p>
            <p>FPS: <b>{monitor?.fps ?? "N/A"}</b></p>
            <Button variant="outline" onClick={() => void refreshMonitor()}>
              <RefreshCw className="size-4 mr-2" />
              Обновить
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><ShieldAlert className="size-4" />Проверка модов и целостности</CardTitle>
            <CardDescription>Конфликты модов, missing libs, античит-снимок файлов</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2 flex-wrap">
              <Button variant="outline" onClick={() => void refreshConflicts()}>Проверить конфликты</Button>
              <Button variant="outline" onClick={() => void rebuildIntegrity()}>Создать baseline</Button>
              <Button onClick={() => void verifyIntegrity()}>Проверить целостность</Button>
            </div>

            <Card className="p-3">
              <p className="text-sm font-medium mb-2">Конфликты модов</p>
              <p className="text-sm text-muted-foreground">Сканировано: {conflicts?.scanned ?? 0}</p>
              <p className="text-sm text-muted-foreground">Дубликаты: {conflicts?.duplicates.length ?? 0}</p>
              <p className="text-sm text-muted-foreground">Несовместимые loader: {conflicts?.loaderMismatches.length ?? 0}</p>
              <p className="text-sm text-muted-foreground">Missing libs: {conflicts?.missingLibraries.length ?? 0}</p>
            </Card>

            <Card className="p-3">
              <p className="text-sm font-medium mb-2">Целостность сборки</p>
              {integrity ? (
                <>
                  <p className="text-sm text-muted-foreground">Файлов: {integrity.scanned}</p>
                  <p className="text-sm text-muted-foreground">Missing: {integrity.missing.length}</p>
                  <p className="text-sm text-muted-foreground">Changed: {integrity.changed.length}</p>
                  <p className="text-sm text-muted-foreground">Added: {integrity.added.length}</p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Снимок ещё не проверялся</p>
              )}
            </Card>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Лог-центр</CardTitle>
            <CardDescription>Фильтры, просмотр логов, копирование отчета для техподдержки</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2 flex-wrap">
              <Select value={selectedLog} onValueChange={setSelectedLog}>
                <SelectTrigger className="w-64"><SelectValue placeholder="Лог файл" /></SelectTrigger>
                <SelectContent className="max-h-64">
                  {logs.map(item => (
                    <SelectItem key={item.id} value={item.name}>{item.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" onClick={() => void loadLog(selectedLog)}>
                <RefreshCw className="size-4 mr-2" />Читать
              </Button>
              <Button onClick={() => void copySupportReport()}>
                <Copy className="size-4 mr-2" />Отчет для ТП
              </Button>
            </div>

            <div className="flex gap-2">
              <Input value={logQuery} onChange={event => setLogQuery(event.target.value)} placeholder="Поиск по логам..." />
              <Select value={logLevel} onValueChange={value => setLogLevel(value as typeof logLevel)}>
                <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все</SelectItem>
                  <SelectItem value="error">Error</SelectItem>
                  <SelectItem value="warn">Warn</SelectItem>
                  <SelectItem value="info">Info</SelectItem>
                  <SelectItem value="debug">Debug</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" onClick={() => void runLogSearch()}><Search className="size-4 mr-2" />Найти</Button>
            </div>

            {logMatches.length > 0 && (
              <Card className="p-3 max-h-44 overflow-y-auto no-scrollbar">
                {logMatches.slice(0, 120).map((entry, index) => (
                  <p key={`${entry.file}-${entry.line}-${index}`} className="text-xs mb-1">
                    <span className="text-muted-foreground">[{entry.file}:{entry.line}] [{entry.level}]</span> {entry.message}
                  </p>
                ))}
              </Card>
            )}

            <Card className="p-3 max-h-64 overflow-y-auto no-scrollbar">
              {logLines.length === 0 ? (
                <p className="text-sm text-muted-foreground">Лог пуст или не выбран</p>
              ) : (
                logLines.map((line, index) => (
                  <p key={`${index}-${line.slice(0, 10)}`} className="text-xs leading-relaxed break-all">{line}</p>
                ))
              )}
            </Card>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
