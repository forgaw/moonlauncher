from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


VersionType = Literal["release", "snapshot", "beta", "forge", "fabric", "quilt", "neoforge", "optifine", "modpack"]
ProviderType = Literal["modrinth", "curseforge", "rf"]
ContentKind = Literal["mod", "resourcepack", "shader", "map", "modpack"]


class PlayerProfile(BaseModel):
    id: str
    name: str
    uuid: str | None = None
    lastPlayed: str | None = None
    gameTime: int | None = 0
    version: str | None = None
    isOnline: bool | None = False
    skinUrl: str | None = None
    capeUrl: str | None = None
    elyNickname: str | None = None
    elyUuid: str | None = None


class GameVersion(BaseModel):
    id: str
    name: str
    type: VersionType
    version: str
    releaseDate: str
    installed: bool
    downloadUrl: str | None = None


class LaunchOptions(BaseModel):
    profileId: str
    versionId: str
    javaArgs: list[str] | None = None
    gameArgs: list[str] | None = None
    windowWidth: int | None = None
    windowHeight: int | None = None
    fullscreen: bool | None = False


class LaunchResponse(BaseModel):
    processId: str


class LaunchStatus(BaseModel):
    status: Literal["running", "stopped", "error"]
    logs: list[str] = Field(default_factory=list)


class ServerStatus(BaseModel):
    online: bool
    playerCount: int
    maxPlayers: int
    players: list[str]
    ping: int
    version: str
    motd: str


class NewsArticle(BaseModel):
    id: str
    title: str
    content: str
    excerpt: str
    author: str
    publishDate: str
    category: str
    tags: list[str] = Field(default_factory=list)
    imageUrl: str | None = None
    featured: bool = False


class VersionValidation(BaseModel):
    valid: bool
    missingFiles: list[str] = Field(default_factory=list)


class ModProject(BaseModel):
    id: str
    slug: str
    title: str
    description: str
    iconUrl: str | None = None
    downloads: int = 0
    followers: int = 0
    categories: list[str] = Field(default_factory=list)
    versions: list[str] = Field(default_factory=list)


class ModInstallRequest(BaseModel):
    projectId: str
    gameVersion: str | None = None
    loader: str = "fabric"


class ModInstallResponse(BaseModel):
    fileName: str
    installedTo: str
    sourceUrl: str


class InstallTaskStatus(BaseModel):
    taskId: str
    versionId: str
    status: str
    progress: int = 0
    completed: bool = False
    error: str | None = None


class ContentProject(BaseModel):
    id: str
    slug: str
    title: str
    description: str
    provider: ProviderType
    kind: ContentKind
    iconUrl: str | None = None
    downloads: int = 0
    followers: int = 0
    categories: list[str] = Field(default_factory=list)
    versions: list[str] = Field(default_factory=list)
    installed: bool = False


class ContentInstallRequest(BaseModel):
    projectId: str
    provider: ProviderType = "modrinth"
    kind: ContentKind = "mod"
    gameVersion: str | None = None
    loader: str = "fabric"


class ContentInstallResponse(BaseModel):
    fileName: str
    installedTo: str
    sourceUrl: str
    provider: ProviderType
    kind: ContentKind


class SettingsPayload(BaseModel):
    data: dict[str, Any] = Field(default_factory=dict)


def now_iso() -> str:
    return datetime.utcnow().replace(microsecond=0).isoformat() + "Z"
