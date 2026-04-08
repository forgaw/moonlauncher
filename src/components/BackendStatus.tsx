import { useState, useEffect } from "react"
import { Wifi, WifiOff, AlertCircle, Settings, Check, X } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card"
import { Button } from "./ui/button"
import { Badge } from "./ui/badge"
import { Input } from "./ui/input"
import { Label } from "./ui/label"
import { Switch } from "./ui/switch"
import { Alert, AlertDescription } from "./ui/alert"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "./ui/dialog"
import { backendService, configureBackend, useBackendStatus } from "../services/backend"

export function BackendStatus() {
  const { isConnected, isChecking, checkConnection, isMockMode } = useBackendStatus()
  const [isConfigOpen, setIsConfigOpen] = useState(false)
  const [config, setConfig] = useState(backendService.getConfig())
  const [testResult, setTestResult] = useState<{ success: boolean, message: string } | null>(null)

  useEffect(() => {
    void checkConnection()
  }, [])

  const handleConfigSave = () => {
    configureBackend(config)
    setIsConfigOpen(false)
    void checkConnection()
  }

  const testConnection = async () => {
    try {
      const connected = await backendService.checkBackendConnection()
      setTestResult({
        success: connected,
        message: connected ? "Подключение успешно" : "Не удалось подключиться к backend",
      })
    } catch (error) {
      setTestResult({
        success: false,
        message: `Ошибка: ${error instanceof Error ? error.message : "Неизвестная ошибка"}`,
      })
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {isConnected ? (
            <Wifi className="size-5 text-green-500" />
          ) : (
            <WifiOff className="size-5 text-yellow-500" />
          )}
          Статус backend
        </CardTitle>
        <CardDescription>
          Настройка подключения к локальному серверу лаунчера
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium">Состояние подключения</p>
            <p className="text-sm text-muted-foreground">
              {isMockMode ? "Включён режим симуляции" : `Сервер: ${config.baseUrl}`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={isConnected ? "default" : isMockMode ? "secondary" : "destructive"}>
              {isConnected ? (
                <>
                  <Check className="size-3 mr-1" />
                  Подключено
                </>
              ) : isMockMode ? (
                <>
                  <AlertCircle className="size-3 mr-1" />
                  Симуляция
                </>
              ) : (
                <>
                  <X className="size-3 mr-1" />
                  Отключено
                </>
              )}
            </Badge>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void checkConnection()}
              disabled={isChecking}
              className="gap-2"
            >
              <Wifi className={`size-4 ${isChecking ? "animate-spin" : ""}`} />
              Проверить
            </Button>
          </div>
        </div>

        {!isConnected && !isMockMode && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Нет связи с backend. Лаунчер может работать некорректно, пока сервер не запущен.
            </AlertDescription>
          </Alert>
        )}

        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium">Параметры</p>
            <p className="text-sm text-muted-foreground">
              Адрес: {config.baseUrl}
            </p>
          </div>
          <Dialog open={isConfigOpen} onOpenChange={setIsConfigOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <Settings className="size-4" />
                Изменить
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-card border-border">
              <DialogHeader>
                <DialogTitle>Настройка backend</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="baseUrl">Адрес сервера</Label>
                  <Input
                    id="baseUrl"
                    value={config.baseUrl}
                    onChange={(e) => setConfig(prev => ({ ...prev, baseUrl: e.target.value }))}
                    placeholder="http://127.0.0.1:8000"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="apiKey">API-ключ</Label>
                  <Input
                    id="apiKey"
                    type="password"
                    value={config.apiKey}
                    onChange={(e) => setConfig(prev => ({ ...prev, apiKey: e.target.value }))}
                    placeholder="API_KEY"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="timeout">Таймаут (мс)</Label>
                  <Input
                    id="timeout"
                    type="number"
                    value={config.timeout}
                    onChange={(e) => setConfig(prev => ({ ...prev, timeout: parseInt(e.target.value, 10) || 10000 }))}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label htmlFor="mockMode">Режим симуляции</Label>
                  <Switch
                    id="mockMode"
                    checked={config.mockMode}
                    onCheckedChange={(checked) => setConfig(prev => ({ ...prev, mockMode: checked }))}
                  />
                </div>

                <div className="flex gap-2">
                  <Button onClick={testConnection} variant="outline" className="gap-2">
                    <Wifi className="size-4" />
                    Тест
                  </Button>
                  <Button onClick={handleConfigSave} className="flex-1">
                    Сохранить
                  </Button>
                </div>

                {testResult && (
                  <Alert className={testResult.success ? "border-green-500 bg-green-500/10" : "border-red-500 bg-red-500/10"}>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      {testResult.message}
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardContent>
    </Card>
  )
}
