import { useState } from "react"

export interface PlayerProfile {
  id: string
  name: string
  uuid?: string
  lastPlayed?: string
  gameTime?: number
  version?: string
  isOnline?: boolean
  skinUrl?: string
  capeUrl?: string
  elyNickname?: string
  elyUuid?: string
}

export interface PlayerStats {
  totalPlayTime: number
  playStreak: number
  lastPlayDate: string
  totalSessions: number
  averageSessionTime: number
}

export interface GameVersion {
  id: string
  name: string
  type: "release" | "snapshot" | "beta" | "forge" | "fabric" | "quilt" | "neoforge" | "optifine" | "modpack"
  version: string
  releaseDate: string
  installed: boolean
  downloadUrl?: string
}

export interface LaunchOptions {
  profileId: string
  versionId: string
  javaArgs?: string[]
  gameArgs?: string[]
  windowWidth?: number
  windowHeight?: number
  fullscreen?: boolean
}

export interface ServerInfo {
  id: string
  name: string
  address: string
  port: number
  playerCount: number
  maxPlayers: number
  ping: number
  online: boolean
  motd?: string
  version?: string
}

export interface ServerStatus {
  online: boolean
  playerCount: number
  maxPlayers: number
  players: string[]
  ping: number
  version: string
  motd: string
}

export interface NewsArticle {
  id: string
  title: string
  content: string
  excerpt: string
  author: string
  publishDate: string
  category: string
  tags: string[]
  imageUrl?: string
  featured: boolean
}

export type ProviderType = "modrinth" | "curseforge" | "rf"
export type ProviderFilter = ProviderType | "all"
export type ContentKind = "mod" | "resourcepack" | "shader" | "map" | "modpack"

export interface ContentProject {
  id: string
  slug: string
  title: string
  description: string
  provider: ProviderType
  kind: ContentKind
  iconUrl?: string
  downloads: number
  followers: number
  categories: string[]
  versions: string[]
  installed?: boolean
}

export interface InstalledContentEntry {
  id: string
  name: string
  kind: ContentKind
  isDirectory: boolean
  path: string
  sizeBytes: number
  modifiedAt: string
}

export interface ContentDetails {
  id: string
  slug: string
  provider: ProviderType
  kind: ContentKind
  title: string
  description: string
  summary?: string
  iconUrl?: string
  gallery: string[]
  categories: string[]
  downloads: number
  followers: number
  websiteUrl?: string
}

export interface ContentInstallRequest {
  projectId: string
  provider: ProviderType
  kind: ContentKind
  gameVersion?: string
  loader: string
}

export interface ContentInstallResponse {
  fileName: string
  installedTo: string
  sourceUrl: string
  provider: ProviderType
  kind: ContentKind
}

export interface ElyProfile {
  id: string
  name: string
  skinUrl?: string
  capeUrl?: string
  avatarUrl?: string
  exists: boolean
}

export interface FriendEntry {
  id: string
  nickname: string
  source: string
  avatarUrl?: string
  skinUrl?: string
  capeUrl?: string
  status: string
  addedAt: string
}



export interface RadminStatus {
  installed: boolean
  running: boolean
  executablePath?: string
  adapterIp?: string
  adapterName?: string
}
export interface RadminHelperResponse {
  mode: "radmin"
  networkName: string
  networkPassword: string
  radminInstalled: boolean
  radminPath?: string
  instructions: string[]
}

export interface CoopServerStatus {
  running: boolean
  mode?: string
  versionId?: string
  worldName?: string
  port?: number
  localAddress?: string
  publicAddress?: string
  serverDir?: string
  logPath?: string
  startedAt?: string
  instructions?: string[]
}

export interface UpdateReleaseInfo {
  version: string
  notes?: string
  url?: string
  downloadUrl?: string
  installerPath?: string
  installedAt?: string
}

export interface UpdateStatus {
  currentVersion: string
  latestVersion: string
  isUpdateAvailable: boolean
  manifestUrl?: string
  releases: UpdateReleaseInfo[]
  history: UpdateReleaseInfo[]
  error?: string
}

export interface WorldBackupEntry {
  id: string
  name: string
  path: string
  sizeBytes: number
  createdAt: string
}

export interface LogIndexEntry {
  id: string
  name: string
  path: string
  sizeBytes: number
  modifiedAt: string
}

export interface LogSearchEntry {
  file: string
  line: number
  level: "error" | "warn" | "info" | "debug"
  message: string
}

export interface MonitorSnapshot {
  timestamp: string
  cpuPercent: number
  ramUsedMb: number
  ramTotalMb: number
  javaProcessMb: number
  fps?: number | null
}

export interface ModConflictReport {
  scanned: number
  duplicates: string[][]
  loaderMismatches: string[]
  missingLibraries: string[]
  hasIssues: boolean
}

export interface IntegrityVerifyResult {
  baselineCreatedAt: string
  scanned: number
  missing: string[]
  added: string[]
  changed: string[]
  isClean: boolean
}

export interface JavaProfilesPayload {
  useJavaProfiles: boolean
  java8Path: string
  java17Path: string
  java21Path: string
}

export interface MoonPack {
  id: string
  title: string
  description: string
  mods: string[]
}

export interface CustomPackEntry {
  id: string
  name: string
  fileName?: string
  packVersion?: string
  avatarDataUrl?: string
  createdAt?: string
  include?: string[]
  path: string
  sizeBytes: number
  modifiedAt: string
}

export interface CustomPackApplyResult {
  ok: boolean
  packId: string
  applied: Record<string, number>
  totalItems: number
}

export interface InstallTaskStatus {
  taskId: string
  versionId: string
  status: string
  progress: number
  completed: boolean
  error?: string | null
}

export interface ModProject {
  id: string
  slug: string
  title: string
  description: string
  iconUrl?: string
  downloads: number
  followers: number
  categories: string[]
  versions: string[]
}

export interface ModInstallRequest {
  projectId: string
  gameVersion?: string
  loader: string
}

interface BackendConfig {
  baseUrl: string
  apiKey: string
  timeout: number
  mockMode: boolean
}

function resolveDefaultBaseUrl(): string {
  if (typeof window !== "undefined") {
    const injected = (window as Window & { __MOONLAUNCHER_API_BASE__?: string }).__MOONLAUNCHER_API_BASE__
    if (typeof injected === "string" && injected.trim()) {
      return injected
    }

    if (window.location?.origin && /^https?:/i.test(window.location.origin)) {
      return window.location.origin
    }
  }

  return "http://127.0.0.1:8000"
}

class BackendService {
  private config: BackendConfig
  private versionsCache: GameVersion[] = []
  private versionsRequestPromise: Promise<GameVersion[]> | null = null
  private readonly versionsStorageKey = "moonlauncher:versions-cache"

  constructor() {
    this.config = {
      baseUrl: resolveDefaultBaseUrl(),
      apiKey: "",
      timeout: 30_000,
      mockMode: false,
    }
    this.versionsCache = this.readVersionsCacheFromStorage()
  }

  private readVersionsCacheFromStorage(): GameVersion[] {
    if (typeof window === "undefined") return []
    try {
      const raw = window.localStorage.getItem(this.versionsStorageKey)
      if (!raw) return []
      const parsed = JSON.parse(raw)
      if (!Array.isArray(parsed)) return []
      return parsed.filter(item => item && typeof item.id === "string" && typeof item.version === "string")
    } catch {
      return []
    }
  }

  private saveVersionsCache(versions: GameVersion[]) {
    this.versionsCache = versions
    if (typeof window === "undefined") return
    try {
      window.localStorage.setItem(this.versionsStorageKey, JSON.stringify(versions.slice(0, 500)))
    } catch {
      // ignore localStorage write errors
    }
  }

  private wait(ms: number): Promise<void> {
    return new Promise(resolve => window.setTimeout(resolve, ms))
  }

  public updateConfig(newConfig: Partial<BackendConfig>) {
    this.config = { ...this.config, ...newConfig }
  }

  public getConfig(): BackendConfig {
    return { ...this.config }
  }

  public isInMockMode(): boolean {
    return this.config.mockMode
  }

  public async checkBackendConnection(): Promise<boolean> {
    try {
      const response = await fetch(`${this.config.baseUrl}/health`, {
        method: "GET",
        signal: AbortSignal.timeout(this.config.timeout),
      })
      return response.ok
    } catch {
      return false
    }
  }

  private async makeRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    if (this.config.mockMode) {
      return this.getMockData(endpoint) as T
    }

    const headers: HeadersInit = {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(this.config.apiKey ? { Authorization: `Bearer ${this.config.apiKey}` } : {}),
      ...(options.headers || {}),
    }

    const response = await fetch(`${this.config.baseUrl}${endpoint}`, {
      ...options,
      headers,
      signal: AbortSignal.timeout(this.config.timeout),
    })

    if (!response.ok) {
      const body = await response.text().catch(() => "")
      let detail = body
      try {
        const parsed = JSON.parse(body)
        if (parsed && typeof parsed === "object" && typeof parsed.detail === "string") {
          detail = parsed.detail
        }
      } catch {
        // ignore JSON parse errors and keep raw text
      }
      throw new Error(`Request failed (${response.status}) ${detail}`)
    }

    if (response.status === 204) {
      return undefined as T
    }

    return (await response.json()) as T
  }

  private getMockData(endpoint: string): unknown {
    if (endpoint === "/api/profiles") {
      return [
        {
          id: "default",
          name: "Player",
          uuid: crypto.randomUUID(),
          lastPlayed: new Date().toISOString(),
          gameTime: 0,
          version: "1.21.4",
          isOnline: false,
        },
      ]
    }
    if (endpoint === "/api/player/stats") {
      return {
        totalPlayTime: 0,
        playStreak: 0,
        lastPlayDate: new Date().toISOString(),
        totalSessions: 0,
        averageSessionTime: 0,
      }
    }
    if (endpoint === "/api/versions") {
      return []
    }
    if (endpoint.startsWith("/api/validate/")) {
      return { valid: true, missingFiles: [] }
    }
    if (endpoint === "/api/server/status") {
      return {
        online: false,
        playerCount: 0,
        maxPlayers: 0,
        players: [],
        ping: 0,
        version: "Unknown",
        motd: "Server unavailable",
      }
    }
    if (endpoint === "/api/news") {
      return []
    }
    if (endpoint === "/api/settings") {
      return {}
    }
    if (endpoint === "/api/launch") {
      return { processId: `mock-${Date.now()}` }
    }
    if (endpoint.startsWith("/api/launch/")) {
      return { status: "running", logs: [] }
    }
    return {}
  }

  async getProfiles(): Promise<PlayerProfile[]> {
    return this.makeRequest<PlayerProfile[]>("/api/profiles")
  }

  async createProfile(profile: Omit<PlayerProfile, "id">): Promise<PlayerProfile> {
    return this.makeRequest<PlayerProfile>("/api/profiles", {
      method: "POST",
      body: JSON.stringify(profile),
    })
  }

  async updateProfile(id: string, profile: Partial<PlayerProfile>): Promise<PlayerProfile> {
    return this.makeRequest<PlayerProfile>(`/api/profiles/${id}`, {
      method: "PUT",
      body: JSON.stringify(profile),
    })
  }

  async deleteProfile(id: string): Promise<void> {
    await this.makeRequest(`/api/profiles/${id}`, { method: "DELETE" })
  }

  async getElyProfile(nickname: string): Promise<ElyProfile> {
    return this.makeRequest<ElyProfile>(`/api/elyby/profile/${encodeURIComponent(nickname)}`)
  }

  async linkElyProfile(profileId: string, nickname: string, syncName = true): Promise<PlayerProfile> {
    return this.makeRequest<PlayerProfile>("/api/elyby/link", {
      method: "POST",
      body: JSON.stringify({ profileId, nickname, syncName }),
    })
  }

  async getFriends(): Promise<FriendEntry[]> {
    return this.makeRequest<FriendEntry[]>("/api/friends")
  }

  async addFriend(nickname: string, source: "manual" | "elyby" = "elyby"): Promise<FriendEntry> {
    return this.makeRequest<FriendEntry>("/api/friends", {
      method: "POST",
      body: JSON.stringify({ nickname, source }),
    })
  }

  async removeFriend(friendId: string): Promise<void> {
    await this.makeRequest(`/api/friends/${encodeURIComponent(friendId)}`, { method: "DELETE" })
  }

  async getRadminStatus(): Promise<RadminStatus> {
    return this.makeRequest<RadminStatus>("/api/radmin/status")
  }

  async installRadmin(): Promise<RadminStatus> {
    return this.makeRequest<RadminStatus>("/api/radmin/install", { method: "POST" })
  }

  async launchRadmin(): Promise<{ ok: boolean }> {
    return this.makeRequest<{ ok: boolean }>("/api/radmin/launch", { method: "POST" })
  }

  async startCoopSession(payload: {
    profileId: string
    versionId: string
    worldName: string
    port?: number
    maxPlayers?: number
    memoryMb?: number
    onlineMode?: boolean
    pvp?: boolean
    motd?: string
  }): Promise<{ server: CoopServerStatus; processId: string; instructions: string[] }> {
    return this.makeRequest<{ server: CoopServerStatus; processId: string; instructions: string[] }>("/api/coop/session/start", {
      method: "POST",
      body: JSON.stringify(payload),
    })
  }

  async createRadminHelper(hostNickname: string): Promise<RadminHelperResponse> {
    return this.makeRequest<RadminHelperResponse>("/api/friends/radmin-helper", {
      method: "POST",
      body: JSON.stringify({ hostNickname }),
    })
  }

  async getCoopServerStatus(): Promise<CoopServerStatus> {
    return this.makeRequest<CoopServerStatus>("/api/coop/server/status")
  }

  async startCoopServer(payload: {
    versionId: string
    worldName: string
    port?: number
    maxPlayers?: number
    memoryMb?: number
    onlineMode?: boolean
    pvp?: boolean
    motd?: string
  }): Promise<CoopServerStatus> {
    return this.makeRequest<CoopServerStatus>("/api/coop/server/start", {
      method: "POST",
      body: JSON.stringify(payload),
    })
  }

  async stopCoopServer(): Promise<void> {
    await this.makeRequest("/api/coop/server/stop", { method: "POST" })
  }

  async getUpdateStatus(): Promise<UpdateStatus> {
    return this.makeRequest<UpdateStatus>("/api/updates/status")
  }

  async applyUpdate(targetVersion = ""): Promise<{ ok: boolean; targetVersion: string; installerPath: string }> {
    return this.makeRequest<{ ok: boolean; targetVersion: string; installerPath: string }>("/api/updates/apply", {
      method: "POST",
      body: JSON.stringify({ targetVersion }),
    })
  }

  async rollbackUpdate(): Promise<{ ok: boolean; rollbackVersion: string; installerPath: string }> {
    return this.makeRequest<{ ok: boolean; rollbackVersion: string; installerPath: string }>("/api/updates/rollback", {
      method: "POST",
    })
  }

  async getWorldBackups(): Promise<WorldBackupEntry[]> {
    return this.makeRequest<WorldBackupEntry[]>("/api/backups/worlds")
  }

  async createWorldBackup(worldName?: string): Promise<WorldBackupEntry> {
    return this.makeRequest<WorldBackupEntry>("/api/backups/worlds", {
      method: "POST",
      body: JSON.stringify({ worldName: worldName || null }),
    })
  }

  async restoreWorldBackup(backupId: string, targetWorld?: string): Promise<{ ok: boolean; backupId: string; restoredWorlds: string[] }> {
    return this.makeRequest<{ ok: boolean; backupId: string; restoredWorlds: string[] }>(
      `/api/backups/worlds/${encodeURIComponent(backupId)}/restore`,
      {
        method: "POST",
        body: JSON.stringify({ targetWorld: targetWorld || null }),
      },
    )
  }

  async getLogsIndex(): Promise<LogIndexEntry[]> {
    return this.makeRequest<LogIndexEntry[]>("/api/logs/index")
  }

  async readLog(logName: string, maxLines = 1200): Promise<{ name: string; path: string; lines: string[] }> {
    return this.makeRequest<{ name: string; path: string; lines: string[] }>(
      `/api/logs/read/${encodeURIComponent(logName)}?maxLines=${maxLines}`,
    )
  }

  async searchLogs(query: string, level: "all" | "error" | "warn" | "info" | "debug" = "all", limit = 300): Promise<LogSearchEntry[]> {
    const params = new URLSearchParams({
      query,
      level,
      limit: String(limit),
    })
    return this.makeRequest<LogSearchEntry[]>(`/api/logs/search?${params.toString()}`)
  }

  async buildSupportReport(): Promise<{ path: string; name: string; content: string }> {
    return this.makeRequest<{ path: string; name: string; content: string }>("/api/logs/support-report", { method: "POST" })
  }

  async getMonitorSnapshot(): Promise<MonitorSnapshot> {
    return this.makeRequest<MonitorSnapshot>("/api/monitor/system")
  }

  async getModConflictReport(loader = "fabric"): Promise<ModConflictReport> {
    return this.makeRequest<ModConflictReport>(`/api/mods/conflicts?loader=${encodeURIComponent(loader)}`)
  }

  async createIntegrityBaseline(): Promise<{ ok: boolean; files: number; createdAt: string }> {
    return this.makeRequest<{ ok: boolean; files: number; createdAt: string }>("/api/integrity/baseline", {
      method: "POST",
    })
  }

  async verifyIntegrity(): Promise<IntegrityVerifyResult> {
    return this.makeRequest<IntegrityVerifyResult>("/api/integrity/verify")
  }

  async getJavaProfiles(): Promise<JavaProfilesPayload> {
    return this.makeRequest<JavaProfilesPayload>("/api/java/profiles")
  }

  async updateJavaProfiles(payload: Partial<JavaProfilesPayload>): Promise<JavaProfilesPayload> {
    return this.makeRequest<JavaProfilesPayload>("/api/java/profiles", {
      method: "PUT",
      body: JSON.stringify(payload),
    })
  }

  async getDiscordStatus(): Promise<{ enabled: boolean; connected: boolean; error?: string; clientId?: string }> {
    return this.makeRequest<{ enabled: boolean; connected: boolean; error?: string; clientId?: string }>("/api/discord/status")
  }

  async getMoonPacks(): Promise<MoonPack[]> {
    return this.makeRequest<MoonPack[]>("/api/modpacks/moon")
  }

  async installMoonPack(packId: string, gameVersion: string, loader = "fabric"): Promise<{ ok: boolean; installed: string[]; skipped: string[] }> {
    return this.makeRequest<{ ok: boolean; installed: string[]; skipped: string[] }>(
      `/api/modpacks/moon/${encodeURIComponent(packId)}/install`,
      {
        method: "POST",
        body: JSON.stringify({ gameVersion, loader }),
      },
    )
  }

  async getCustomPacks(): Promise<CustomPackEntry[]> {
    return this.makeRequest<CustomPackEntry[]>(
      "/api/modpacks/custom",
    )
  }

  async createCustomPack(
    name: string,
    includeConfig = true,
    includeRoots?: string[],
    packVersion?: string,
    avatarDataUrl?: string,
  ): Promise<{ ok: boolean; name: string; path: string; include: string[]; version?: string; avatarDataUrl?: string }> {
    return this.makeRequest<{ ok: boolean; name: string; path: string; include: string[]; version?: string; avatarDataUrl?: string }>("/api/modpacks/custom", {
      method: "POST",
      body: JSON.stringify({
        name,
        includeConfig,
        includeRoots: includeRoots || null,
        packVersion: packVersion || "",
        avatarDataUrl: avatarDataUrl || "",
      }),
    })
  }

  async applyCustomPack(packId: string, wipeExisting = false): Promise<CustomPackApplyResult> {
    return this.makeRequest<CustomPackApplyResult>(`/api/modpacks/custom/${encodeURIComponent(packId)}/apply`, {
      method: "POST",
      body: JSON.stringify({ wipeExisting }),
    })
  }

  async importCustomPack(name: string, dataBase64: string, applyAfterImport = false): Promise<{
    ok: boolean
    name: string
    path: string
    applyResult?: CustomPackApplyResult
  }> {
    return this.makeRequest<{
      ok: boolean
      name: string
      path: string
      applyResult?: CustomPackApplyResult
    }>("/api/modpacks/import", {
      method: "POST",
      body: JSON.stringify({ name, dataBase64, applyAfterImport }),
    })
  }

  async getVersions(): Promise<GameVersion[]> {
    if (this.versionsRequestPromise) {
      return this.versionsRequestPromise
    }

    const run = async (): Promise<GameVersion[]> => {
      const attempts = 3
      let lastError: unknown = null
      for (let attempt = 0; attempt < attempts; attempt += 1) {
        try {
          const loaded = await this.makeRequest<GameVersion[]>("/api/versions")
          if (Array.isArray(loaded) && loaded.length > 0) {
            this.saveVersionsCache(loaded)
            return loaded
          }
          if (this.versionsCache.length > 0) {
            return this.versionsCache
          }
          return Array.isArray(loaded) ? loaded : []
        } catch (error) {
          lastError = error
          if (attempt + 1 < attempts) {
            await this.wait(350 * (attempt + 1))
          }
        }
      }

      if (this.versionsCache.length > 0) {
        return this.versionsCache
      }
      throw (lastError instanceof Error ? lastError : new Error("Не удалось загрузить список версий"))
    }

    this.versionsRequestPromise = run().finally(() => {
      this.versionsRequestPromise = null
    })
    return this.versionsRequestPromise
  }

  async installVersion(versionId: string): Promise<InstallTaskStatus> {
    return this.makeRequest<InstallTaskStatus>(`/api/versions/${encodeURIComponent(versionId)}/install`, {
      method: "POST",
    })
  }

  async getInstallTaskStatus(taskId: string): Promise<InstallTaskStatus> {
    return this.makeRequest<InstallTaskStatus>(`/api/versions/install/${encodeURIComponent(taskId)}/status`)
  }

  async uninstallVersion(versionId: string): Promise<void> {
    await this.makeRequest(`/api/versions/${encodeURIComponent(versionId)}/uninstall`, {
      method: "DELETE",
    })
    if (this.versionsCache.length > 0) {
      const next = this.versionsCache.map(version =>
        version.id === versionId ? { ...version, installed: false } : version,
      )
      this.saveVersionsCache(next)
    }
  }

  async launchGame(options: LaunchOptions): Promise<{ processId: string }> {
    return this.makeRequest<{ processId: string }>("/api/launch", {
      method: "POST",
      body: JSON.stringify(options),
    })
  }

  async getGameStatus(processId: string): Promise<{ status: "running" | "stopped" | "error"; logs?: string[] }> {
    return this.makeRequest(`/api/launch/${encodeURIComponent(processId)}/status`)
  }

  async stopGame(processId: string): Promise<void> {
    await this.makeRequest(`/api/launch/${encodeURIComponent(processId)}/stop`, {
      method: "POST",
    })
  }

  async getServerStatus(): Promise<ServerStatus> {
    return this.makeRequest<ServerStatus>("/api/server/status")
  }

  async getServerInfo(address: string): Promise<ServerInfo> {
    const [host, portRaw] = address.split(":")
    return {
      id: host,
      name: host,
      address: host,
      port: Number(portRaw || 25565),
      playerCount: 0,
      maxPlayers: 0,
      ping: 0,
      online: false,
      motd: "",
      version: "",
    }
  }

  async getNews(): Promise<NewsArticle[]> {
    return this.makeRequest<NewsArticle[]>("/api/news")
  }

  async getSettings(): Promise<Record<string, any>> {
    return this.makeRequest<Record<string, any>>("/api/settings")
  }

  async updateSettings(settings: Record<string, any>): Promise<void> {
    await this.makeRequest("/api/settings", {
      method: "PUT",
      body: JSON.stringify(settings),
    })
  }

  async getFolders(): Promise<Record<string, string>> {
    return this.makeRequest<Record<string, string>>("/api/folders")
  }

  async openFolder(target: string): Promise<{ path: string }> {
    return this.makeRequest<{ path: string }>(`/api/folders/open/${encodeURIComponent(target)}`, {
      method: "POST",
    })
  }

  async getPlayerStats(): Promise<PlayerStats> {
    return this.makeRequest<PlayerStats>("/api/player/stats")
  }

  async validateGameFiles(versionId: string): Promise<{ valid: boolean; missingFiles: string[] }> {
    return this.makeRequest<{ valid: boolean; missingFiles: string[] }>(
      `/api/validate/${encodeURIComponent(versionId)}`,
    )
  }

  async searchContent(
    query: string,
    kind: ContentKind,
    provider: ProviderFilter,
    gameVersion: string,
    loader: string,
    limit = 15,
  ): Promise<ContentProject[]> {
    const params = new URLSearchParams({
      query,
      kind,
      provider,
      gameVersion,
      loader,
      limit: String(limit),
    })
    return this.makeRequest<ContentProject[]>(`/api/content/search?${params.toString()}`)
  }

  async getContentRecommendations(
    kind: ContentKind,
    provider: ProviderFilter,
    gameVersion: string,
    loader: string,
    limit = 12,
  ): Promise<ContentProject[]> {
    const params = new URLSearchParams({
      kind,
      provider,
      gameVersion,
      loader,
      limit: String(limit),
    })
    return this.makeRequest<ContentProject[]>(`/api/content/recommendations?${params.toString()}`)
  }

  async installContent(payload: ContentInstallRequest): Promise<ContentInstallResponse> {
    return this.makeRequest<ContentInstallResponse>("/api/content/install", {
      method: "POST",
      body: JSON.stringify(payload),
    })
  }

  async getContentDetails(projectId: string, provider: ProviderType, kind: ContentKind): Promise<ContentDetails> {
    const params = new URLSearchParams({
      projectId,
      provider,
      kind,
    })
    return this.makeRequest<ContentDetails>(`/api/content/details?${params.toString()}`)
  }

  async getInstalledContent(kind: ContentKind): Promise<InstalledContentEntry[]> {
    const params = new URLSearchParams({ kind })
    return this.makeRequest<InstalledContentEntry[]>(`/api/content/installed?${params.toString()}`)
  }

  async removeInstalledContent(kind: ContentKind, entryName: string): Promise<{ ok: boolean; deleted: string }> {
    return this.makeRequest<{ ok: boolean; deleted: string }>(
      `/api/content/installed/${encodeURIComponent(kind)}/${encodeURIComponent(entryName)}`,
      {
        method: "DELETE",
      },
    )
  }

  async getProfilesPresence(): Promise<Record<string, { profileId: string; isPlaying: boolean; statusText: string; versionId?: string }>> {
    return this.makeRequest<Record<string, { profileId: string; isPlaying: boolean; statusText: string; versionId?: string }>>(
      "/api/profiles/presence",
    )
  }

  async searchMods(query: string, gameVersion: string, loader: string, limit = 15): Promise<ModProject[]> {
    return this.makeRequest<ModProject[]>(
      `/api/mods/search?query=${encodeURIComponent(query)}&gameVersion=${encodeURIComponent(gameVersion)}&loader=${encodeURIComponent(loader)}&limit=${limit}`,
    )
  }

  async installMod(payload: ModInstallRequest): Promise<{ fileName: string; installedTo: string; sourceUrl: string }> {
    return this.makeRequest("/api/mods/install", {
      method: "POST",
      body: JSON.stringify(payload),
    })
  }

  async getPrivacyPolicy(): Promise<{ title: string; content: string }> {
    return this.makeRequest<{ title: string; content: string }>("/api/privacy-policy")
  }
}

export const backendService = new BackendService()

export const configureBackend = (config: {
  baseUrl?: string
  apiKey?: string
  timeout?: number
  mockMode?: boolean
}) => {
  backendService.updateConfig(config)
}

export const useBackendStatus = () => {
  const [isConnected, setIsConnected] = useState(false)
  const [isChecking, setIsChecking] = useState(false)

  const checkConnection = async () => {
    setIsChecking(true)
    try {
      const connected = await backendService.checkBackendConnection()
      setIsConnected(connected)
    } catch {
      setIsConnected(false)
    } finally {
      setIsChecking(false)
    }
  }

  return {
    isConnected,
    isChecking,
    checkConnection,
    isMockMode: backendService.isInMockMode(),
  }
}
