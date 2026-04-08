from __future__ import annotations

import html
import json
import os
import re
import socket
import hashlib
import shutil
import subprocess
import threading
import uuid
import zipfile
import base64
import random
import string
import time
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path
from typing import Any, Callable
from urllib.parse import quote, urljoin
from xml.etree import ElementTree

import minecraft_launcher_lib
import requests
from mcstatus import JavaServer

try:
    import psutil  # type: ignore
except Exception:  # pragma: no cover - optional dependency
    psutil = None

try:
    from pypresence import Presence  # type: ignore
except Exception:  # pragma: no cover - optional dependency
    Presence = None  # type: ignore[assignment]

from .models import (
    ContentInstallRequest,
    ContentInstallResponse,
    ContentKind,
    ContentProject,
    GameVersion,
    InstallTaskStatus,
    LaunchOptions,
    LaunchResponse,
    LaunchStatus,
    ModInstallRequest,
    ModInstallResponse,
    ModProject,
    NewsArticle,
    PlayerProfile,
    ProviderType,
    ServerStatus,
    VersionValidation,
    now_iso,
)

MODRINTH_BASE_URL = "https://api.modrinth.com/v2"
CURSEFORGE_BASE_URL = "https://api.curseforge.com/v1"
OPTIFINE_LIST_URL = "https://bmclapi2.bangbang93.com/optifine/versionList"
GOOGLE_TRANSLATE_URL = "https://translate.googleapis.com/translate_a/single"
PROXY_SCHEMES = {"http", "https", "socks4", "socks4a", "socks5", "socks5h"}
SIDEBAR_TAB_IDS = [
    "play",
    "news",
    "installations",
    "mods",
    "modpacks",
    "skins",
    "friends",
    "tools",
    "java",
    "settings",
]
SIDEBAR_NON_HIDEABLE_IDS = {"settings"}
MODPACK_VERSION_PREFIX = "modpack::"


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _contains_cyrillic(value: str) -> bool:
    return bool(re.search(r"[А-Яа-яЁё]", value))


class MoonlaunchrService:
    def __init__(self) -> None:
        user_home = Path.home()
        appdata = os.environ.get("APPDATA")
        self.appdata_root = Path(appdata) if appdata else user_home
        self.project_root = Path(__file__).resolve().parents[2]

        # Keep launcher data in a visible user folder instead of hidden AppData.
        self.state_root = user_home / "Moonlauncher"
        self.state_root.mkdir(parents=True, exist_ok=True)
        self.files_root = self.state_root / "state"
        self.files_root.mkdir(parents=True, exist_ok=True)

        self.default_game_directory = user_home / "MoonMine"

        self.settings_path = self.files_root / "settings.json"
        self.profiles_path = self.files_root / "profiles.json"
        self.sessions_path = self.files_root / "sessions.json"
        self.friends_path = self.files_root / "friends.json"
        self.installed_projects_path = self.files_root / "installed-projects.json"
        self.backups_root = self.state_root / "backups"
        self.backups_root.mkdir(parents=True, exist_ok=True)
        self.world_backups_root = self.backups_root / "worlds"
        self.world_backups_root.mkdir(parents=True, exist_ok=True)
        self.integrity_path = self.files_root / "integrity-baseline.json"
        self.launcher_history_path = self.files_root / "launcher-history.json"

        self.lock = threading.RLock()
        self.running_processes: dict[str, dict[str, Any]] = {}
        self.install_tasks: dict[str, dict[str, Any]] = {}
        self.coop_server: dict[str, Any] | None = None
        self.backup_worker_started = False
        self.last_scheduled_backup_at: str | None = None
        self.discord_rpc: Any = None
        self.discord_rpc_connected = False
        self.discord_last_error = ""
        self.translation_cache: dict[str, str] = {}
        self.optifine_cache: dict[str, Any] = {"fetchedAt": None, "data": {}}
        self.available_versions_cache: dict[str, Any] = {"fetchedAt": None, "data": []}
        self.version_manifest_cache: dict[str, Any] = {"fetchedAt": None, "payload": {}}
        self.news_cache: dict[str, Any] = {"fetchedAt": None, "data": []}

        self.settings = self._load_settings()
        self._apply_proxy_settings()
        self.minecraft_directory = self._normalize_game_directory(self.settings.get("gameDirectory"))
        self.settings["gameDirectory"] = str(self.minecraft_directory)
        self._save_settings()
        self._ensure_game_structure()
        self.installed_projects = self._load_installed_projects()

        self.profiles = self._load_profiles()
        self.sessions = self._load_sessions()
        self.friends = self._load_friends()
        self._start_background_workers()

    def _default_settings(self) -> dict[str, Any]:
        return {
            "gameDirectory": str(self.default_game_directory),
            "javaPath": "java",
            "javaArgs": "-Xms1G -Xmx4G",
            "maxMemory": 4096,
            "minMemory": 1024,
            "windowWidth": 1280,
            "windowHeight": 720,
            "fullscreen": False,
            "soundEnabled": True,
            "musicEnabled": True,
            "masterVolume": 80,
            "soundVolume": 80,
            "musicVolume": 60,
            "vsync": True,
            "maxFps": 120,
            "renderDistance": 16,
            "graphicsQuality": "high",
            "particleLevel": "all",
            "closeOnLaunch": False,
            "autoUpdate": True,
            "betaVersions": True,
            "analytics": False,
            "theme": "dark",
            "language": "ru",
            "proxyEnabled": False,
            "proxyScheme": "http",
            "proxyHost": "",
            "proxyPort": 8080,
            "proxyAuth": False,
            "proxyUsername": "",
            "proxyPassword": "",
            "proxyPasswordEncrypted": "",
            "proxyCustomUrl": "",
            "proxyBypass": "",
            "modrinthApiKey": "",
            "modrinthApiKeyEncrypted": "",
            "curseforgeApiKey": "",
            "curseforgeApiKeyEncrypted": "",
            "preferredServerAddress": "",
            "selectedProfileId": "default",
            "selectedVersionId": "",
            "coopServerMemoryMb": 2048,
            "coopServerPort": 25565,
            "elyBySkinSync": True,
            "java8Path": "",
            "java17Path": "",
            "java21Path": "",
            "useJavaProfiles": True,
            "runtimeOptimizerEnabled": False,
            "runtimeOptimizerAgentPath": "",
            "runtimeOptimizerArgs": "fastMath=true;entityTick=true;allocationCache=true;network=true;verbose=false",
            "backupEnabled": False,
            "backupIntervalMinutes": 60,
            "backupKeepCount": 30,
            "backupAutoOnLaunch": False,
            "discordRichPresence": False,
            "discordClientId": "1215873028268019712",
            "updateManifestUrl": "",
            "updateChannel": "stable",
            "themePreset": "moon-dark",
            "themeAccent": "#22c55e",
            "themeBackgroundOpacity": 0.45,
            "themeSidebarOpacity": 0.9,
            "themeAnimations": True,
            "playBackgroundUrl": "",
            "customFontName": "Montserrat",
            "customFontUrl": "",
            "hideMoonPacksSuggestion": False,
            "showPerformanceOverlay": True,
            "themeTextOutline": True,
            "themeTextOutlineStrength": 1.0,
            "themeTextOutlineOpacity": 0.35,
            "themeGlassBlur": 10,
            "themeCardRadius": 12,
            "hiddenSidebarTabs": [],
            "sidebarTabOrder": list(SIDEBAR_TAB_IDS),
        }

    def _read_json(self, path: Path, fallback: Any) -> Any:
        if not path.exists():
            return fallback
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            return fallback

    def _write_json(self, path: Path, payload: Any) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    def _load_settings(self) -> dict[str, Any]:
        raw = self._read_json(self.settings_path, {})
        settings = self._default_settings()
        if isinstance(raw, dict):
            settings.update(raw)
        font_name = str(settings.get("customFontName") or "").strip()
        if font_name.lower() in {"", "moonminecraftui", "monocraft"}:
            settings["customFontName"] = "Montserrat"
        settings["sidebarTabOrder"] = self._normalize_sidebar_tab_order(settings.get("sidebarTabOrder"))
        settings["hiddenSidebarTabs"] = self._normalize_hidden_sidebar_tabs(settings.get("hiddenSidebarTabs"))
        return settings

    def _normalize_sidebar_tab_order(self, value: Any) -> list[str]:
        if not isinstance(value, list):
            return list(SIDEBAR_TAB_IDS)

        ordered: list[str] = []
        seen: set[str] = set()
        for item in value:
            tab_id = str(item or "").strip()
            if not tab_id or tab_id not in SIDEBAR_TAB_IDS or tab_id in seen:
                continue
            ordered.append(tab_id)
            seen.add(tab_id)

        for tab_id in SIDEBAR_TAB_IDS:
            if tab_id not in seen:
                ordered.append(tab_id)
        return ordered

    def _normalize_hidden_sidebar_tabs(self, value: Any) -> list[str]:
        if not isinstance(value, list):
            return []
        hidden: list[str] = []
        seen: set[str] = set()
        for item in value:
            tab_id = str(item or "").strip()
            if not tab_id or tab_id not in SIDEBAR_TAB_IDS:
                continue
            if tab_id in SIDEBAR_NON_HIDEABLE_IDS:
                continue
            if tab_id in seen:
                continue
            hidden.append(tab_id)
            seen.add(tab_id)
        return hidden

    def _save_settings(self) -> None:
        self._write_json(self.settings_path, self.settings)

    def _normalize_path_key(self, value: str | Path) -> str:
        try:
            return os.path.normcase(str(Path(value).resolve()))
        except Exception:
            return os.path.normcase(str(value))

    def _load_installed_projects(self) -> dict[str, dict[str, Any]]:
        raw = self._read_json(self.installed_projects_path, {})
        if not isinstance(raw, dict):
            return {}
        normalized: dict[str, dict[str, Any]] = {}
        for key, item in raw.items():
            if not isinstance(item, dict):
                continue
            provider = str(item.get("provider") or "").strip().lower()
            kind = str(item.get("kind") or "").strip().lower()
            project_id = str(item.get("projectId") or "").strip()
            if not provider or not kind or not project_id:
                continue
            normalized[str(key)] = {
                "provider": provider,
                "kind": kind,
                "projectId": project_id,
                "fileName": str(item.get("fileName") or ""),
                "installedTo": str(item.get("installedTo") or ""),
                "pathKey": str(item.get("pathKey") or ""),
                "installedAt": str(item.get("installedAt") or now_iso()),
                "gameVersion": str(item.get("gameVersion") or ""),
                "loader": str(item.get("loader") or ""),
            }
        return normalized

    def _save_installed_projects(self) -> None:
        self._write_json(self.installed_projects_path, self.installed_projects)

    def _project_key(self, provider: str, kind: ContentKind, project_id: str) -> str:
        return f"{provider}:{kind}:{project_id}"

    def _mark_project_installed(
        self,
        *,
        provider: str,
        kind: ContentKind,
        project_id: str,
        file_name: str,
        installed_to: str,
        game_version: str | None = None,
        loader: str | None = None,
    ) -> None:
        key = self._project_key(provider=provider, kind=kind, project_id=project_id)
        self.installed_projects[key] = {
            "provider": provider,
            "kind": kind,
            "projectId": project_id,
            "fileName": file_name,
            "installedTo": installed_to,
            "pathKey": self._normalize_path_key(installed_to),
            "installedAt": now_iso(),
            "gameVersion": str(game_version or ""),
            "loader": str(loader or ""),
        }
        self._save_installed_projects()

    def _clear_installed_project_by_path(self, target_path: Path, recursive: bool = False) -> None:
        normalized_target = self._normalize_path_key(target_path)
        separator = os.sep
        changed = False
        for key, item in list(self.installed_projects.items()):
            path_key = str(item.get("pathKey") or "")
            if not path_key:
                continue
            if path_key == normalized_target:
                self.installed_projects.pop(key, None)
                changed = True
                continue
            if recursive and path_key.startswith(f"{normalized_target}{separator}"):
                self.installed_projects.pop(key, None)
                changed = True
        if changed:
            self._save_installed_projects()

    def _apply_installed_flags(self, projects: list[ContentProject]) -> list[ContentProject]:
        for project in projects:
            key = self._project_key(project.provider, project.kind, project.id)
            project.installed = key in self.installed_projects
        return projects

    def _proxy_url(self) -> str | None:
        if not bool(self.settings.get("proxyEnabled", False)):
            return None

        scheme = str(self.settings.get("proxyScheme") or "http").strip().lower()
        if scheme not in PROXY_SCHEMES:
            scheme = "http"

        custom_url = str(self.settings.get("proxyCustomUrl") or "").strip()
        if custom_url:
            if "://" not in custom_url:
                custom_url = f"{scheme}://{custom_url}"
            custom_scheme = custom_url.split("://", 1)[0].strip().lower()
            if custom_scheme in PROXY_SCHEMES:
                return custom_url

        host = str(self.settings.get("proxyHost") or "").strip()
        if not host:
            return None

        try:
            port = int(self.settings.get("proxyPort") or 0)
        except Exception:
            return None
        if port <= 0 or port > 65535:
            return None

        auth_part = ""
        if bool(self.settings.get("proxyAuth", False)):
            username = str(self.settings.get("proxyUsername") or "").strip()
            password = self._resolve_secret("proxyPassword", "proxyPasswordEncrypted")
            if username:
                username_escaped = quote(username, safe="")
                password_escaped = quote(password, safe="") if password else ""
                auth_part = f"{username_escaped}:{password_escaped}@" if password else f"{username_escaped}@"

        return f"{scheme}://{auth_part}{host}:{port}"

    def _apply_proxy_settings(self) -> None:
        proxy_url = self._proxy_url()
        for key in ("HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "http_proxy", "https_proxy", "all_proxy"):
            os.environ.pop(key, None)

        if proxy_url:
            os.environ["HTTP_PROXY"] = proxy_url
            os.environ["HTTPS_PROXY"] = proxy_url
            os.environ["ALL_PROXY"] = proxy_url
            os.environ["http_proxy"] = proxy_url
            os.environ["https_proxy"] = proxy_url
            os.environ["all_proxy"] = proxy_url

        bypass = {"127.0.0.1", "localhost", "::1"}
        existing = str(os.environ.get("NO_PROXY") or "")
        for item in existing.split(","):
            token = item.strip()
            if token:
                bypass.add(token)
        configured = str(self.settings.get("proxyBypass") or "")
        for item in configured.split(","):
            token = item.strip()
            if token:
                bypass.add(token)
        no_proxy = ",".join(sorted(bypass))
        os.environ["NO_PROXY"] = no_proxy
        os.environ["no_proxy"] = no_proxy

    def _start_background_workers(self) -> None:
        if self.backup_worker_started:
            return
        self.backup_worker_started = True
        worker = threading.Thread(target=self._scheduled_backup_loop, daemon=True)
        worker.start()

    def _scheduled_backup_loop(self) -> None:
        while True:
            try:
                enabled = bool(self.settings.get("backupEnabled", False))
                interval_minutes = int(self.settings.get("backupIntervalMinutes") or 60)
                interval_minutes = max(5, min(interval_minutes, 24 * 60))
                if enabled:
                    should_run = False
                    if not self.last_scheduled_backup_at:
                        should_run = True
                    else:
                        try:
                            last_dt = datetime.fromisoformat(self.last_scheduled_backup_at)
                            if (_utc_now() - last_dt).total_seconds() >= interval_minutes * 60:
                                should_run = True
                        except Exception:
                            should_run = True
                    if should_run:
                        self.create_world_backup(world_name=None, source="scheduler")
                        self.last_scheduled_backup_at = _utc_now().isoformat()
            except Exception:
                # Scheduler should never crash the backend.
                pass
            time.sleep(30)

    def _normalize_game_directory(self, value: Any) -> Path:
        if not isinstance(value, str) or not value.strip():
            path = self.default_game_directory
        else:
            path = Path(value).expanduser()
            if not path.is_absolute():
                path = self.default_game_directory
        path.mkdir(parents=True, exist_ok=True)
        return path

    def _ensure_game_structure(self) -> None:
        directories = [
            "assets",
            "libraries",
            "versions",
            "mods",
            "modpacks",
            "resourcepacks",
            "shaderpacks",
            "saves",
            "config",
            "logs",
        ]
        for directory in directories:
            (self.minecraft_directory / directory).mkdir(parents=True, exist_ok=True)

    def _directory_paths(self) -> dict[str, Path]:
        return {
            "root": self.minecraft_directory,
            "versions": self.minecraft_directory / "versions",
            "saves": self.minecraft_directory / "saves",
            "mods": self.minecraft_directory / "mods",
            "modpacks": self.minecraft_directory / "modpacks",
            "resourcepacks": self.minecraft_directory / "resourcepacks",
            "shaderpacks": self.minecraft_directory / "shaderpacks",
            "logs": self.minecraft_directory / "logs",
            "config": self.minecraft_directory / "config",
        }

    def get_directory_paths(self) -> dict[str, str]:
        paths = self._directory_paths()
        for path in paths.values():
            path.mkdir(parents=True, exist_ok=True)
        return {key: str(value) for key, value in paths.items()}

    def open_directory(self, target: str) -> str:
        paths = self._directory_paths()
        key = (target or "root").strip().lower()
        if key not in paths:
            raise ValueError("Unknown directory target")

        folder = paths[key]
        folder.mkdir(parents=True, exist_ok=True)

        try:
            if os.name == "nt":
                os.startfile(str(folder))  # type: ignore[attr-defined]
            elif shutil.which("xdg-open"):
                subprocess.Popen(["xdg-open", str(folder)])
            elif shutil.which("open"):
                subprocess.Popen(["open", str(folder)])
        except Exception:
            # Not fatal, we still return the resolved path.
            pass

        return str(folder)

    def _parse_java_major(self, raw_version: str) -> int | None:
        value = str(raw_version or "").strip()
        if not value:
            return None

        if value.startswith("1."):
            parts = value.split(".")
            if len(parts) > 1 and parts[1].isdigit():
                return int(parts[1])
            return None

        match = re.match(r"^(\d+)", value)
        if match:
            return int(match.group(1))
        return None

    def _detect_java_major(self, executable: str) -> int | None:
        try:
            result = subprocess.run(
                [executable, "-version"],
                capture_output=True,
                text=True,
                timeout=8,
                check=False,
            )
            output = "\n".join([result.stdout or "", result.stderr or ""])
            version_match = re.search(r'version "([^"]+)"', output)
            if version_match:
                return self._parse_java_major(version_match.group(1))

            # Some builds can print just "openjdk 21 ..."
            short_match = re.search(r"(?:openjdk|java)\s+(\d[\d._]*)", output, flags=re.IGNORECASE)
            if short_match:
                return self._parse_java_major(short_match.group(1))
        except Exception:
            return None
        return None

    def _collect_java_candidates(self) -> list[str]:
        candidates: list[str] = []
        seen: set[str] = set()

        def add_candidate(path: str | None) -> None:
            if not path:
                return
            value = str(path).strip().strip('"')
            if not value:
                return
            if not Path(value).exists():
                resolved = shutil.which(value)
                if not resolved:
                    return
                value = resolved
            key = value.lower()
            if key in seen:
                return
            seen.add(key)
            candidates.append(value)

        configured = str(self.settings.get("javaPath", "java")).strip()
        add_candidate(configured)
        add_candidate(shutil.which("java"))
        add_candidate(shutil.which("javaw"))

        try:
            infos = minecraft_launcher_lib.java_utils.find_system_java_versions_information()
            for info in infos:
                if not isinstance(info, dict):
                    continue
                add_candidate(str(info.get("java_path") or "").strip())
                add_candidate(str(info.get("javaw_path") or "").strip())
                home_path = str(info.get("path") or "").strip()
                if home_path:
                    add_candidate(str(Path(home_path) / "bin" / "java.exe"))
        except Exception:
            pass

        return candidates

    def _java_profile_for_major(self, required_major: int | None) -> str:
        if not bool(self.settings.get("useJavaProfiles", True)):
            return ""
        if required_major is None:
            return ""

        key_map = {
            8: "java8Path",
            16: "java17Path",
            17: "java17Path",
            18: "java17Path",
            19: "java21Path",
            20: "java21Path",
            21: "java21Path",
            22: "java21Path",
        }
        key = key_map.get(required_major)
        if not key:
            if required_major <= 8:
                key = "java8Path"
            elif required_major <= 17:
                key = "java17Path"
            else:
                key = "java21Path"
        return str(self.settings.get(key) or "").strip()

    def _resolve_java_executable(self, version_id: str | None = None) -> str:
        required_major: int | None = None
        runtime_name: str | None = None

        if version_id:
            try:
                runtime_info = minecraft_launcher_lib.runtime.get_version_runtime_information(
                    version_id,
                    str(self.minecraft_directory),
                )
                if runtime_info:
                    runtime_name_raw = runtime_info.get("name")
                    runtime_name = str(runtime_name_raw).strip() if runtime_name_raw else None
                    required_major_raw = runtime_info.get("javaMajorVersion")
                    try:
                        required_major = int(required_major_raw) if required_major_raw is not None else None
                    except (TypeError, ValueError):
                        required_major = None
            except Exception:
                required_major = None
                runtime_name = None

        if runtime_name:
            try:
                runtime_exec = minecraft_launcher_lib.runtime.get_executable_path(
                    runtime_name,
                    str(self.minecraft_directory),
                )
                if runtime_exec and Path(runtime_exec).exists():
                    return runtime_exec
            except Exception:
                pass

            try:
                minecraft_launcher_lib.runtime.install_jvm_runtime(runtime_name, str(self.minecraft_directory))
                runtime_exec = minecraft_launcher_lib.runtime.get_executable_path(
                    runtime_name,
                    str(self.minecraft_directory),
                )
                if runtime_exec and Path(runtime_exec).exists():
                    return runtime_exec
            except Exception:
                pass

        profile_java = self._java_profile_for_major(required_major)
        if profile_java:
            if Path(profile_java).exists() or shutil.which(profile_java):
                return profile_java

        candidates = self._collect_java_candidates()
        if not candidates:
            raise ValueError("Java не найдена. Установите Java 17+ или укажите путь в настройках лаунчера.")

        if required_major is None:
            return candidates[0]

        best_match: tuple[int, int, str] | None = None
        unknown_major_candidate: str | None = None
        for candidate in candidates:
            major = self._detect_java_major(candidate)
            if major is None:
                if unknown_major_candidate is None:
                    unknown_major_candidate = candidate
                continue
            if major < required_major:
                continue
            score = (major - required_major, -major, candidate)
            if best_match is None or score < best_match:
                best_match = score

        if best_match:
            return best_match[2]

        if unknown_major_candidate:
            return unknown_major_candidate

        raise ValueError(
            f"Для версии {version_id or 'игры'} требуется Java {required_major}+."
            " Установите подходящую Java или укажите путь в настройках лаунчера."
        )

    def _translate_to_russian(self, text: str) -> str:
        source = str(text or "").strip()
        if not source:
            return ""
        if _contains_cyrillic(source):
            return source

        cached = self.translation_cache.get(source)
        if cached:
            return cached

        try:
            response = requests.get(
                GOOGLE_TRANSLATE_URL,
                params={
                    "client": "gtx",
                    "sl": "auto",
                    "tl": "ru",
                    "dt": "t",
                    "q": source[:500],
                },
                timeout=8,
            )
            response.raise_for_status()
            payload = response.json()
            translated = ""
            if isinstance(payload, list) and payload and isinstance(payload[0], list):
                translated = "".join(
                    str(item[0]) for item in payload[0] if isinstance(item, list) and item and item[0]
                ).strip()
            if translated:
                self.translation_cache[source] = translated
                return translated
        except Exception:
            pass

        return source

    def _localize_project(self, project: ContentProject) -> ContentProject:
        localized_description = self._translate_to_russian(project.description)
        return ContentProject(
            id=project.id,
            slug=project.slug,
            title=project.title,
            description=localized_description,
            provider=project.provider,
            kind=project.kind,
            iconUrl=project.iconUrl,
            downloads=project.downloads,
            followers=project.followers,
            categories=project.categories,
            versions=project.versions,
        )

    def _optifine_versions_map(self) -> dict[str, dict[str, str]]:
        cached_at = self.optifine_cache.get("fetchedAt")
        cached_data = self.optifine_cache.get("data")
        if isinstance(cached_at, datetime) and isinstance(cached_data, dict):
            if (_utc_now() - cached_at) < timedelta(hours=6):
                return cached_data

        latest_by_mc: dict[str, dict[str, str]] = {}
        try:
            response = requests.get(OPTIFINE_LIST_URL, timeout=20)
            response.raise_for_status()
            payload = response.json()
            if isinstance(payload, list):
                for item in payload:
                    if not isinstance(item, dict):
                        continue
                    mc_version = str(item.get("mcversion") or "").strip()
                    type_part = str(item.get("type") or "").strip()
                    patch = str(item.get("patch") or "").strip()
                    if not mc_version or not type_part or not patch:
                        continue
                    if mc_version in latest_by_mc:
                        continue
                    latest_by_mc[mc_version] = {"type": type_part, "patch": patch}
        except Exception:
            latest_by_mc = {}

        self.optifine_cache = {"fetchedAt": _utc_now(), "data": latest_by_mc}
        return latest_by_mc

    def _security_tool_path(self) -> Path | None:
        env_path = os.environ.get("MOONLAUNCHR_SECURITY_TOOL")
        if env_path:
            candidate = Path(env_path)
            if candidate.exists():
                return candidate

        candidates = [
            self.project_root / "security" / "Moonlauncher.SecurityBroker" / "Moonlauncher.SecurityBroker.exe",
            self.project_root / "security" / "Moonlauncher.SecurityBroker" / "publish" / "Moonlauncher.SecurityBroker.exe",
            self.project_root / "security" / "Moonlauncher.SecurityBroker" / "bin" / "Release" / "net8.0-windows" / "win-x64" / "publish" / "Moonlauncher.SecurityBroker.exe",
            self.project_root / "security" / "Moonlauncher.SecurityBroker" / "bin" / "Release" / "net8.0-windows" / "win-x64" / "Moonlauncher.SecurityBroker.exe",
            self.project_root / "security" / "Moonlauncher.SecurityBroker" / "bin" / "Release" / "net8.0-windows" / "publish" / "Moonlauncher.SecurityBroker.exe",
            self.project_root / "security" / "Moonlauncher.SecurityBroker" / "bin" / "Debug" / "net8.0-windows" / "win-x64" / "publish" / "Moonlauncher.SecurityBroker.exe",
            self.project_root / "security" / "Moonlauncher.SecurityBroker" / "bin" / "Debug" / "net8.0-windows" / "win-x64" / "Moonlauncher.SecurityBroker.exe",
            self.project_root / "security" / "Moonlauncher.SecurityBroker" / "bin" / "Debug" / "net8.0-windows" / "Moonlauncher.SecurityBroker.exe",
        ]
        for candidate in candidates:
            if candidate.exists():
                return candidate
        return None

    def _run_security_tool(self, command: str, value: str) -> str | None:
        exe = self._security_tool_path()
        if not exe:
            return None

        try:
            result = subprocess.run(
                [str(exe), command, value],
                capture_output=True,
                text=True,
                check=False,
                timeout=8,
            )
            if result.returncode != 0:
                return None
            return result.stdout.strip()
        except Exception:
            return None

    def _protect_secret(self, value: str) -> str | None:
        if not value:
            return ""
        return self._run_security_tool("protect", value)

    def _unprotect_secret(self, value: str) -> str | None:
        if not value:
            return ""
        return self._run_security_tool("unprotect", value)

    def _resolve_secret(self, plain_key: str, encrypted_key: str) -> str:
        encrypted_value = str(self.settings.get(encrypted_key) or "").strip()
        if encrypted_value:
            decrypted = self._unprotect_secret(encrypted_value)
            if isinstance(decrypted, str) and decrypted:
                return decrypted
        return str(self.settings.get(plain_key) or "").strip()

    def _load_profiles(self) -> list[PlayerProfile]:
        raw = self._read_json(self.profiles_path, [])
        profiles: list[PlayerProfile] = []
        if isinstance(raw, list):
            for item in raw:
                try:
                    profiles.append(PlayerProfile(**item))
                except Exception:
                    continue

        if not profiles:
            profiles = [
                PlayerProfile(
                    id="default",
                    name="Player",
                    uuid=str(uuid.uuid4()),
                    lastPlayed=now_iso(),
                    gameTime=0,
                    version="latest-release",
                    isOnline=False,
                )
            ]
            self._save_profiles(profiles)
        return profiles

    def _save_profiles(self, profiles: list[PlayerProfile]) -> None:
        self._write_json(self.profiles_path, [p.model_dump() for p in profiles])

    def _load_sessions(self) -> list[dict[str, Any]]:
        raw = self._read_json(self.sessions_path, [])
        return raw if isinstance(raw, list) else []

    def _save_sessions(self) -> None:
        self._write_json(self.sessions_path, self.sessions)

    def _load_friends(self) -> list[dict[str, Any]]:
        raw = self._read_json(self.friends_path, [])
        if not isinstance(raw, list):
            return []

        normalized: list[dict[str, Any]] = []
        for item in raw:
            if not isinstance(item, dict):
                continue
            friend_id = str(item.get("id") or uuid.uuid4())
            nickname = str(item.get("nickname") or "").strip()
            if not nickname:
                continue
            normalized.append(
                {
                    "id": friend_id,
                    "nickname": nickname,
                    "source": str(item.get("source") or "manual"),
                    "avatarUrl": str(item.get("avatarUrl") or ""),
                    "skinUrl": str(item.get("skinUrl") or ""),
                    "capeUrl": str(item.get("capeUrl") or ""),
                    "status": str(item.get("status") or "offline"),
                    "addedAt": str(item.get("addedAt") or now_iso()),
                }
            )
        return normalized

    def _save_friends(self) -> None:
        self._write_json(self.friends_path, self.friends)
    def _fetch_mojang_manifest(self) -> dict[str, Any]:
        cached_at = self.version_manifest_cache.get("fetchedAt")
        cached_payload = self.version_manifest_cache.get("payload")
        if isinstance(cached_at, datetime) and isinstance(cached_payload, dict):
            if (_utc_now() - cached_at) < timedelta(minutes=20):
                return cached_payload

        url = "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json"
        attempts = 2
        last_payload: dict[str, Any] = {}
        for attempt in range(attempts):
            try:
                response = requests.get(url, timeout=20)
                response.raise_for_status()
                payload = response.json()
                if isinstance(payload, dict):
                    last_payload = payload
                    break
            except Exception:
                if attempt + 1 < attempts:
                    time.sleep(0.35)
                continue

        if last_payload:
            self.version_manifest_cache = {"fetchedAt": _utc_now(), "payload": last_payload}
            return last_payload
        if isinstance(cached_payload, dict):
            return cached_payload
        return {}

    def _version_dates(self) -> dict[str, str]:
        payload = self._fetch_mojang_manifest()
        dates: dict[str, str] = {}
        for version in payload.get("versions", []):
            if not isinstance(version, dict):
                continue
            version_id = version.get("id")
            release_time = version.get("releaseTime")
            if isinstance(version_id, str) and isinstance(release_time, str):
                dates[version_id] = release_time
        return dates

    def _installed_version_ids(self) -> set[str]:
        try:
            installed = minecraft_launcher_lib.utils.get_installed_versions(str(self.minecraft_directory))
            return {str(item["id"]) for item in installed if "id" in item}
        except Exception:
            return set()

    def _available_versions(self) -> list[dict[str, Any]]:
        cached_data = self.available_versions_cache.get("data")
        cached_list = cached_data if isinstance(cached_data, list) else []

        attempts = 2
        for attempt in range(attempts):
            try:
                result = minecraft_launcher_lib.utils.get_available_versions(str(self.minecraft_directory))
                versions = [item for item in result if isinstance(item, dict)]
                if versions:
                    self.available_versions_cache = {"fetchedAt": _utc_now(), "data": versions}
                    return versions
            except Exception:
                if attempt + 1 < attempts:
                    time.sleep(0.35)
                continue

        if cached_list:
            return cached_list
        return []

    def _manifest_versions(self) -> list[dict[str, Any]]:
        payload = self._fetch_mojang_manifest()
        versions = payload.get("versions")
        if isinstance(versions, list):
            return [item for item in versions if isinstance(item, dict)]
        return []

    def _parse_version_type(self, version_type: str) -> str:
        normalized = version_type.lower()
        if normalized in {"release", "snapshot", "forge", "fabric", "quilt", "neoforge", "optifine", "modpack"}:
            return normalized
        if normalized in {"old_beta", "old_alpha", "beta"}:
            return "beta"
        return "release"

    def _is_modpack_version_id(self, value: str) -> bool:
        return str(value or "").startswith(MODPACK_VERSION_PREFIX)

    def _pack_id_from_version_id(self, value: str) -> str:
        raw = str(value or "")
        if not self._is_modpack_version_id(raw):
            return ""
        return raw[len(MODPACK_VERSION_PREFIX) :].strip()

    def _version_id_from_pack_id(self, pack_id: str) -> str:
        return f"{MODPACK_VERSION_PREFIX}{pack_id}"

    def _is_loader_version(self, version_id: str, loader: str) -> bool:
        value = version_id.lower()
        if loader == "fabric":
            return "fabric-loader" in value or value.endswith("-fabric")
        if loader == "forge":
            return "-forge-" in value or value.endswith("-forge") or ".forge" in value
        if loader == "quilt":
            return "quilt-loader" in value or value.endswith("-quilt")
        if loader == "neoforge":
            return "neoforge" in value or value.endswith("-neoforge")
        if loader == "optifine":
            return "optifine" in value
        return False

    def _loader_installed(self, installed_ids: set[str], base_version: str, loader: str) -> bool:
        if loader == "optifine":
            for installed_id in installed_ids:
                if base_version in installed_id and "optifine" in installed_id.lower():
                    return True
            installers_dir = self.minecraft_directory / "optifine-installers"
            if installers_dir.exists():
                pattern = f"OptiFine_{base_version}_*.jar"
                if any(installers_dir.glob(pattern)):
                    return True
            return False

        for installed_id in installed_ids:
            if base_version in installed_id and self._is_loader_version(installed_id, loader):
                return True
        return False

    def _resolve_launch_version(self, requested: str) -> str:
        if self._is_modpack_version_id(requested):
            return requested

        optifine_match = re.match(r"^(.+)-optifine-[A-Za-z0-9_]+$", requested, flags=re.IGNORECASE)
        if optifine_match:
            base_version = optifine_match.group(1)
            installed_versions = self._installed_version_ids()
            optifine_candidates = [
                version_id for version_id in installed_versions if base_version in version_id and "optifine" in version_id.lower()
            ]
            if optifine_candidates:
                optifine_candidates.sort(reverse=True)
                return optifine_candidates[0]
            return base_version

        installed_versions = self._installed_version_ids()
        if requested in installed_versions:
            return requested

        if "-" not in requested:
            return requested

        base, suffix = requested.rsplit("-", 1)
        loader = suffix.lower()
        if loader not in {"fabric", "forge", "quilt", "neoforge", "optifine"}:
            return requested

        candidates = [
            version_id
            for version_id in installed_versions
            if base in version_id and self._is_loader_version(version_id, loader)
        ]
        if not candidates:
            return requested
        candidates.sort(reverse=True)
        return candidates[0]

    def _resolve_modpack_launch_version(self, pack_id: str, apply_pack: bool = True) -> tuple[str, str]:
        pack_key = Path(pack_id).name
        custom_packs = self.list_custom_packs()
        pack = next((item for item in custom_packs if str(item.get("id") or "") == pack_key), None)
        if not pack:
            raise ValueError("Сборка не найдена")

        base_version = str(pack.get("packVersion") or "").strip()
        if not base_version:
            raise ValueError("У сборки не указана версия Minecraft")

        if apply_pack:
            self.apply_custom_pack(pack_id=pack_key, wipe_existing=False)
        pack_name = str(pack.get("name") or pack_key).strip() or pack_key
        return base_version, pack_name

    def get_profiles(self) -> list[PlayerProfile]:
        with self.lock:
            return list(self.profiles)

    def get_profile_presence(self) -> dict[str, dict[str, Any]]:
        with self.lock:
            presence: dict[str, dict[str, Any]] = {
                profile.id: {
                    "profileId": profile.id,
                    "isPlaying": False,
                    "statusText": "Не в игре",
                    "versionId": profile.version or "",
                }
                for profile in self.profiles
            }

            finished_ids: list[str] = []
            for process_id, entry in self.running_processes.items():
                process: subprocess.Popen = entry["process"]
                if process.poll() is not None:
                    finished_ids.append(process_id)
                    continue

                profile_id = str(entry.get("profileId") or "")
                if not profile_id:
                    continue
                if profile_id not in presence:
                    presence[profile_id] = {
                        "profileId": profile_id,
                        "isPlaying": False,
                        "statusText": "Не в игре",
                        "versionId": "",
                    }

                presence[profile_id].update(
                    {
                        "isPlaying": True,
                        "statusText": "Играет в moonlauncher (Minecraft)",
                        "versionId": str(entry.get("requestedVersion") or entry.get("versionId") or ""),
                    }
                )

            for process_id in finished_ids:
                entry = self.running_processes.get(process_id)
                if entry:
                    self._close_finished_process(process_id, entry, forced=False)
                    self.running_processes.pop(process_id, None)

            return presence

    def create_profile(self, payload: dict[str, Any]) -> PlayerProfile:
        with self.lock:
            profile = PlayerProfile(
                id=str(uuid.uuid4()),
                name=str(payload.get("name") or f"Player-{len(self.profiles) + 1}"),
                uuid=str(payload.get("uuid") or uuid.uuid4()),
                lastPlayed=payload.get("lastPlayed") or now_iso(),
                gameTime=int(payload.get("gameTime") or 0),
                version=payload.get("version") or "latest-release",
                isOnline=bool(payload.get("isOnline") or False),
            )
            self.profiles.append(profile)
            self._save_profiles(self.profiles)
            if not self.settings.get("selectedProfileId"):
                self.settings["selectedProfileId"] = profile.id
                self._save_settings()
            return profile

    def update_profile(self, profile_id: str, payload: dict[str, Any]) -> PlayerProfile:
        with self.lock:
            for index, profile in enumerate(self.profiles):
                if profile.id != profile_id:
                    continue
                merged = profile.model_dump()
                merged.update(payload)
                nickname_to_sync = str(merged.get("elyNickname") or merged.get("name") or "").strip()
                if nickname_to_sync and bool(self.settings.get("elyBySkinSync", True)):
                    try:
                        ely_profile = self.get_ely_skin_profile(nickname_to_sync)
                        merged["elyNickname"] = str(ely_profile.get("name") or nickname_to_sync)
                        merged["elyUuid"] = str(ely_profile.get("id") or "")
                        merged["skinUrl"] = str(ely_profile.get("skinUrl") or "")
                        merged["capeUrl"] = str(ely_profile.get("capeUrl") or "")
                    except Exception:
                        pass
                updated = PlayerProfile(**merged)
                self.profiles[index] = updated
                self._save_profiles(self.profiles)
                return updated
        raise ValueError("Profile not found")

    def delete_profile(self, profile_id: str) -> None:
        with self.lock:
            next_profiles = [profile for profile in self.profiles if profile.id != profile_id]
            if not next_profiles:
                raise ValueError("Cannot delete last profile")
            self.profiles = next_profiles
            if self.settings.get("selectedProfileId") == profile_id:
                self.settings["selectedProfileId"] = next_profiles[0].id
                self._save_settings()
            self._save_profiles(self.profiles)

    def _ely_textures_from_properties(self, properties: Any) -> dict[str, str]:
        if not isinstance(properties, list):
            return {}

        for item in properties:
            if not isinstance(item, dict):
                continue
            if str(item.get("name") or "").strip().lower() != "textures":
                continue
            raw_value = str(item.get("value") or "").strip()
            if not raw_value:
                continue
            try:
                decoded = base64.b64decode(raw_value).decode("utf-8", errors="ignore")
                payload = json.loads(decoded)
            except Exception:
                continue
            if not isinstance(payload, dict):
                continue
            textures = payload.get("textures")
            if not isinstance(textures, dict):
                continue

            skin_url = ""
            cape_url = ""
            skin_payload = textures.get("SKIN")
            cape_payload = textures.get("CAPE")
            if isinstance(skin_payload, dict):
                skin_url = str(skin_payload.get("url") or "").strip()
            if isinstance(cape_payload, dict):
                cape_url = str(cape_payload.get("url") or "").strip()

            return {"skinUrl": skin_url, "capeUrl": cape_url}

        return {}

    def get_ely_skin_profile(self, nickname: str) -> dict[str, Any]:
        clean_nickname = str(nickname or "").strip()
        if not clean_nickname:
            raise ValueError("Введите ник Ely.by")

        response = requests.get(
            f"https://skinsystem.ely.by/profile/{clean_nickname}",
            params={"unsigned": "false"},
            timeout=15,
        )
        if response.status_code == 404:
            raise ValueError("Профиль Ely.by не найден")
        response.raise_for_status()
        payload = response.json()
        if not isinstance(payload, dict):
            raise ValueError("Некорректный ответ Ely.by")

        textures = self._ely_textures_from_properties(payload.get("properties"))
        profile_id = str(payload.get("id") or "").strip()
        profile_name = str(payload.get("name") or clean_nickname).strip()
        skin_url = str(textures.get("skinUrl") or "").strip()
        cape_url = str(textures.get("capeUrl") or "").strip()

        return {
            "id": profile_id,
            "name": profile_name,
            "skinUrl": skin_url,
            "capeUrl": cape_url,
            "avatarUrl": skin_url,
            "exists": True,
        }

    def link_profile_ely(self, profile_id: str, nickname: str, sync_name: bool = True) -> PlayerProfile:
        with self.lock:
            profile_index = -1
            for index, profile in enumerate(self.profiles):
                if profile.id == profile_id:
                    profile_index = index
                    break

            if profile_index < 0:
                raise ValueError("Profile not found")

            ely_profile = self.get_ely_skin_profile(nickname)
            merged = self.profiles[profile_index].model_dump()
            if sync_name:
                merged["name"] = str(ely_profile.get("name") or nickname)
            merged["elyNickname"] = str(ely_profile.get("name") or nickname)
            merged["elyUuid"] = str(ely_profile.get("id") or "")
            merged["skinUrl"] = str(ely_profile.get("skinUrl") or "")
            merged["capeUrl"] = str(ely_profile.get("capeUrl") or "")

            updated = PlayerProfile(**merged)
            self.profiles[profile_index] = updated
            self._save_profiles(self.profiles)
            return updated

    def get_friends(self) -> list[dict[str, Any]]:
        with self.lock:
            friends = list(self.friends)
        friends.sort(key=lambda item: str(item.get("addedAt") or ""), reverse=True)
        return friends

    def add_friend(self, payload: dict[str, Any]) -> dict[str, Any]:
        nickname = str(payload.get("nickname") or "").strip()
        if not nickname:
            raise ValueError("Введите ник друга")

        with self.lock:
            if any(str(friend.get("nickname") or "").lower() == nickname.lower() for friend in self.friends):
                raise ValueError("Этот друг уже добавлен")

            source = str(payload.get("source") or "manual").strip() or "manual"
            avatar_url = ""
            skin_url = ""
            cape_url = ""
            if source in {"ely", "elyby"}:
                try:
                    ely_profile = self.get_ely_skin_profile(nickname)
                    source = "elyby"
                    nickname = str(ely_profile.get("name") or nickname)
                    avatar_url = str(ely_profile.get("avatarUrl") or "")
                    skin_url = str(ely_profile.get("skinUrl") or "")
                    cape_url = str(ely_profile.get("capeUrl") or "")
                except Exception:
                    # Friend stays manual if Ely.by profile is unavailable.
                    source = "manual"

            friend = {
                "id": str(uuid.uuid4()),
                "nickname": nickname,
                "source": source,
                "avatarUrl": avatar_url,
                "skinUrl": skin_url,
                "capeUrl": cape_url,
                "status": "offline",
                "addedAt": now_iso(),
            }
            self.friends.append(friend)
            self._save_friends()
            return friend

    def remove_friend(self, friend_id: str) -> None:
        with self.lock:
            next_friends = [friend for friend in self.friends if str(friend.get("id")) != friend_id]
            if len(next_friends) == len(self.friends):
                raise ValueError("Друг не найден")
            self.friends = next_friends
            self._save_friends()

    def _random_token(self, length: int = 8) -> str:
        alphabet = string.ascii_uppercase + string.digits
        return "".join(random.choice(alphabet) for _ in range(length))

    def _radmin_candidates(self) -> list[Path]:
        return [
            Path("C:/Program Files (x86)/Radmin VPN/Radmin VPN.exe"),
            Path("C:/Program Files/Radmin VPN/Radmin VPN.exe"),
        ]

    def _radmin_executable_path(self) -> str:
        for candidate in self._radmin_candidates():
            if candidate.exists():
                return str(candidate)
        return ""

    def _radmin_adapter_ip(self) -> str:
        try:
            result = subprocess.run(
                ["ipconfig"],
                capture_output=True,
                text=True,
                timeout=8,
                check=False,
            )
            output = (result.stdout or "") + "\n" + (result.stderr or "")
            blocks = re.split(r"\r?\n\r?\n", output)
            for block in blocks:
                if "Radmin VPN" not in block:
                    continue
                line_match = re.search(r"IPv4[^:]*:\s*([0-9.]+)", block, flags=re.IGNORECASE)
                if line_match:
                    return str(line_match.group(1)).strip()
        except Exception:
            return ""
        return ""

    def get_radmin_status(self) -> dict[str, Any]:
        executable_path = self._radmin_executable_path()
        installed = bool(executable_path)
        running = False
        try:
            result = subprocess.run(
                ["tasklist"],
                capture_output=True,
                text=True,
                timeout=8,
                check=False,
            )
            output = (result.stdout or "").lower()
            running = "radmin vpn.exe" in output or "rvpnservice" in output
        except Exception:
            running = False

        return {
            "installed": installed,
            "running": running,
            "executablePath": executable_path,
            "adapterIp": self._radmin_adapter_ip(),
            "adapterName": "Famatech Radmin VPN Ethernet Adapter",
        }

    def install_radmin(self) -> dict[str, Any]:
        if self._radmin_executable_path():
            return self.get_radmin_status()

        winget = shutil.which("winget")
        if not winget:
            raise ValueError("winget не найден. Установите Radmin VPN вручную с официального сайта.")

        commands = [
            [
                winget,
                "install",
                "--id",
                "Famatech.RadminVPN",
                "--source",
                "winget",
                "--silent",
                "--accept-source-agreements",
                "--accept-package-agreements",
                "--disable-interactivity",
            ],
            [
                winget,
                "install",
                "Radmin VPN",
                "--source",
                "winget",
                "--silent",
                "--accept-source-agreements",
                "--accept-package-agreements",
                "--disable-interactivity",
            ],
        ]

        last_error = ""
        for command in commands:
            try:
                result = subprocess.run(command, capture_output=True, text=True, timeout=240, check=False)
                if result.returncode == 0 and self._radmin_executable_path():
                    return self.get_radmin_status()
                last_error = ((result.stdout or "") + "\n" + (result.stderr or "")).strip()
            except Exception as exc:
                last_error = str(exc)

        raise ValueError(last_error or "Не удалось установить Radmin VPN через winget")

    def launch_radmin(self) -> None:
        executable = self._radmin_executable_path()
        if not executable:
            raise ValueError("Radmin VPN не установлен")
        try:
            os.startfile(executable)  # type: ignore[attr-defined]
        except Exception as exc:
            raise ValueError(str(exc)) from exc

    def create_radmin_helper(self, payload: dict[str, Any]) -> dict[str, Any]:
        host_nick = str(payload.get("hostNickname") or "MoonHost").strip() or "MoonHost"
        network_name = f"Moon-{host_nick[:10]}-{self._random_token(4)}"
        password = f"moon-{self._random_token(8).lower()}"

        installed_path = self._radmin_executable_path()

        if installed_path:
            try:
                os.startfile(installed_path)  # type: ignore[attr-defined]
            except Exception:
                pass

        instructions = [
            "1. Запустите Radmin VPN на обоих ПК.",
            "2. На хосте нажмите: Сеть -> Создать сеть.",
            f"3. Название сети: {network_name}",
            f"4. Пароль сети: {password}",
            "5. Друг подключается: Сеть -> Присоединиться к сети.",
            "6. В Minecraft используйте IP Radmin хоста и порт мира.",
        ]
        return {
            "mode": "radmin",
            "networkName": network_name,
            "networkPassword": password,
            "radminInstalled": bool(installed_path),
            "radminPath": installed_path,
            "instructions": instructions,
        }

    def get_settings(self) -> dict[str, Any]:
        with self.lock:
            safe = dict(self.settings)
            selected_profile_id = str(safe.get("selectedProfileId") or "").strip()
            if not selected_profile_id or not any(profile.id == selected_profile_id for profile in self.profiles):
                fallback_profile_id = self.profiles[0].id if self.profiles else "default"
                safe["selectedProfileId"] = fallback_profile_id
                self.settings["selectedProfileId"] = fallback_profile_id
                self._save_settings()
            safe["modrinthApiKey"] = ""
            safe["curseforgeApiKey"] = ""
            safe["hasModrinthApiKey"] = bool(self._resolve_secret("modrinthApiKey", "modrinthApiKeyEncrypted"))
            safe["hasCurseforgeApiKey"] = bool(self._resolve_secret("curseforgeApiKey", "curseforgeApiKeyEncrypted"))
            return safe

    def update_settings(self, payload: dict[str, Any]) -> dict[str, Any]:
        with self.lock:
            incoming = dict(payload)

            if "modrinthApiKey" in incoming:
                value = str(incoming.get("modrinthApiKey") or "").strip()
                encrypted = self._protect_secret(value)
                if encrypted is not None:
                    self.settings["modrinthApiKeyEncrypted"] = encrypted
                    self.settings["modrinthApiKey"] = ""
                else:
                    self.settings["modrinthApiKey"] = value
                incoming.pop("modrinthApiKey", None)

            if "curseforgeApiKey" in incoming:
                value = str(incoming.get("curseforgeApiKey") or "").strip()
                encrypted = self._protect_secret(value)
                if encrypted is not None:
                    self.settings["curseforgeApiKeyEncrypted"] = encrypted
                    self.settings["curseforgeApiKey"] = ""
                else:
                    self.settings["curseforgeApiKey"] = value
                incoming.pop("curseforgeApiKey", None)

            if "proxyPassword" in incoming:
                value = str(incoming.get("proxyPassword") or "").strip()
                encrypted = self._protect_secret(value)
                if encrypted is not None:
                    self.settings["proxyPasswordEncrypted"] = encrypted
                    self.settings["proxyPassword"] = ""
                else:
                    self.settings["proxyPassword"] = value
                incoming.pop("proxyPassword", None)

            incoming.pop("modrinthApiKeyEncrypted", None)
            incoming.pop("curseforgeApiKeyEncrypted", None)
            incoming.pop("proxyPasswordEncrypted", None)
            incoming.pop("hasModrinthApiKey", None)
            incoming.pop("hasCurseforgeApiKey", None)

            if "proxyScheme" in incoming:
                proxy_scheme = str(incoming.get("proxyScheme") or "http").strip().lower()
                if proxy_scheme not in PROXY_SCHEMES:
                    proxy_scheme = "http"
                incoming["proxyScheme"] = proxy_scheme

            if "proxyCustomUrl" in incoming:
                incoming["proxyCustomUrl"] = str(incoming.get("proxyCustomUrl") or "").strip()

            if "proxyBypass" in incoming:
                incoming["proxyBypass"] = str(incoming.get("proxyBypass") or "").strip()

            if "proxyPort" in incoming:
                try:
                    proxy_port = int(incoming.get("proxyPort") or 0)
                except Exception:
                    proxy_port = 8080
                incoming["proxyPort"] = max(1, min(proxy_port, 65535))

            if "gameDirectory" in incoming:
                normalized = self._normalize_game_directory(incoming.get("gameDirectory"))
                self.minecraft_directory = normalized
                self.settings["gameDirectory"] = str(normalized)
                incoming.pop("gameDirectory", None)

            if "selectedProfileId" in incoming:
                selected_profile_id = str(incoming.get("selectedProfileId") or "").strip()
                if selected_profile_id and not any(profile.id == selected_profile_id for profile in self.profiles):
                    raise ValueError("Selected profile not found")
                if selected_profile_id:
                    self.settings["selectedProfileId"] = selected_profile_id
                incoming.pop("selectedProfileId", None)

            if "sidebarTabOrder" in incoming:
                incoming["sidebarTabOrder"] = self._normalize_sidebar_tab_order(incoming.get("sidebarTabOrder"))
            if "hiddenSidebarTabs" in incoming:
                incoming["hiddenSidebarTabs"] = self._normalize_hidden_sidebar_tabs(incoming.get("hiddenSidebarTabs"))

            self.settings.update(incoming)
            self._ensure_game_structure()
            self._apply_proxy_settings()
            self._save_settings()
            return self.get_settings()

    def get_versions(self) -> list[GameVersion]:
        available = self._available_versions()
        manifest_versions = self._manifest_versions()
        installed_ids = self._installed_version_ids()
        date_map = self._version_dates()

        versions: list[GameVersion] = []
        seen_ids: set[str] = set()

        merged: list[dict[str, Any]] = []
        merged.extend(available)
        merged.extend(manifest_versions)
        if not merged and installed_ids:
            for installed_id in sorted(installed_ids, reverse=True):
                lower_id = installed_id.lower()
                version_type = "release"
                if "snapshot" in lower_id:
                    version_type = "snapshot"
                elif "old_beta" in lower_id or "beta" in lower_id or "alpha" in lower_id:
                    version_type = "beta"
                elif "optifine" in lower_id:
                    version_type = "optifine"
                elif "neoforge" in lower_id:
                    version_type = "neoforge"
                elif "quilt" in lower_id:
                    version_type = "quilt"
                elif "fabric" in lower_id:
                    version_type = "fabric"
                elif "forge" in lower_id:
                    version_type = "forge"
                merged.append({"id": installed_id, "type": version_type, "releaseTime": now_iso()})

        for item in merged:
            version_id = str(item.get("id", "")).strip()
            if not version_id or version_id in seen_ids:
                continue

            seen_ids.add(version_id)
            version_type = self._parse_version_type(str(item.get("type", "release")))
            release_date = str(item.get("releaseTime") or date_map.get(version_id, now_iso()))

            versions.append(
                GameVersion(
                    id=version_id,
                    name=f"{version_type.title()} {version_id}",
                    type=version_type,
                    version=version_id,
                    releaseDate=release_date,
                    installed=version_id in installed_ids,
                )
            )

        release_versions = [version for version in versions if version.type == "release"][:40]
        optifine_by_version = self._optifine_versions_map()
        for release in release_versions:
            for loader in ("fabric", "forge"):
                synthetic_id = f"{release.id}-{loader}"
                if synthetic_id in seen_ids:
                    continue
                seen_ids.add(synthetic_id)
                versions.append(
                    GameVersion(
                        id=synthetic_id,
                        name=f"{loader.title()} {release.id}",
                        type=loader,
                        version=release.id,
                        releaseDate=release.releaseDate,
                        installed=self._loader_installed(installed_ids, release.id, loader),
                    )
                )

            optifine_meta = optifine_by_version.get(release.id)
            if optifine_meta:
                edition = f"{optifine_meta['type']}_{optifine_meta['patch']}"
                synthetic_optifine_id = f"{release.id}-optifine-{edition}"
                if synthetic_optifine_id not in seen_ids:
                    seen_ids.add(synthetic_optifine_id)
                    versions.append(
                        GameVersion(
                            id=synthetic_optifine_id,
                            name=f"OptiFine {release.id} {edition}",
                            type="optifine",
                            version=release.id,
                            releaseDate=release.releaseDate,
                            installed=self._loader_installed(installed_ids, release.id, "optifine"),
                        )
                    )

        try:
            custom_packs = self.list_custom_packs()
        except Exception:
            custom_packs = []
        for pack in custom_packs:
            pack_id = str(pack.get("id") or "").strip()
            if not pack_id:
                continue
            version_id = self._version_id_from_pack_id(pack_id)
            if version_id in seen_ids:
                continue
            seen_ids.add(version_id)

            pack_name = str(pack.get("name") or pack_id).strip() or pack_id
            pack_version = str(pack.get("packVersion") or "").strip()
            display_name = f"Сборка: {pack_name}"
            if pack_version:
                display_name = f"{display_name} ({pack_version})"

            release_date = str(pack.get("modifiedAt") or now_iso())
            versions.append(
                GameVersion(
                    id=version_id,
                    name=display_name,
                    type="modpack",
                    version=pack_version or version_id,
                    releaseDate=release_date,
                    installed=True,
                )
            )

        versions.sort(key=lambda item: item.releaseDate, reverse=True)
        return versions
    def _update_install_task(self, task_id: str, updates: dict[str, Any]) -> None:
        with self.lock:
            task = self.install_tasks.get(task_id)
            if task:
                task.update(updates)

    def _create_install_callback(self, task_id: str) -> dict[str, Callable[..., None]]:
        progress_state = {"max": 0}

        def set_status(value: str) -> None:
            self._update_install_task(task_id, {"status": str(value)})

        def set_max(value: int) -> None:
            progress_state["max"] = max(int(value), 0)

        def set_progress(value: int) -> None:
            max_value = progress_state.get("max", 0)
            progress_value = int(value)
            if max_value > 0:
                percentage = int((progress_value / max_value) * 100)
            else:
                percentage = max(1, min(95, progress_value % 100))
            self._update_install_task(task_id, {"progress": max(0, min(percentage, 100))})

        return {"setStatus": set_status, "setProgress": set_progress, "setMax": set_max}

    def _install_loader(self, loader: str, base_version: str, callback: dict[str, Callable[..., None]]) -> None:
        try:
            mod_loader = minecraft_launcher_lib.mod_loader.get_mod_loader(loader)
            mod_loader.install(base_version, str(self.minecraft_directory), callback=callback)
            return
        except Exception:
            pass

        if loader == "fabric":
            minecraft_launcher_lib.fabric.install_fabric(base_version, str(self.minecraft_directory), callback=callback)
            return
        if loader == "quilt":
            minecraft_launcher_lib.quilt.install_quilt(base_version, str(self.minecraft_directory), callback=callback)
            return
        if loader == "forge":
            forge_version = minecraft_launcher_lib.forge.find_forge_version(base_version)
            if not forge_version:
                raise ValueError(f"Forge does not support {base_version}")
            minecraft_launcher_lib.forge.install_forge_version(forge_version, str(self.minecraft_directory), callback=callback)
            return
        if loader == "neoforge" and hasattr(minecraft_launcher_lib, "neoforge"):
            neoforge_version = minecraft_launcher_lib.neoforge.find_version(base_version)
            if not neoforge_version:
                raise ValueError(f"NeoForge does not support {base_version}")
            minecraft_launcher_lib.neoforge.install_neoforge_version(neoforge_version, str(self.minecraft_directory), callback=callback)
            return
        if loader == "optifine":
            self._install_optifine(base_version, callback)
            return

        raise ValueError(f"Unsupported loader: {loader}")

    def _install_optifine(self, base_version: str, callback: dict[str, Callable[..., None]]) -> None:
        set_status = callback.get("setStatus")
        set_progress = callback.get("setProgress")

        if callable(set_status):
            set_status("Подготовка базы для OptiFine...")
        minecraft_launcher_lib.install.install_minecraft_version(
            base_version,
            str(self.minecraft_directory),
            callback=callback,
        )

        optifine_meta = self._optifine_versions_map().get(base_version)
        if not optifine_meta:
            raise ValueError(f"OptiFine не найден для версии {base_version}")

        optifine_type = optifine_meta["type"]
        optifine_patch = optifine_meta["patch"]
        if callable(set_status):
            set_status(f"Загрузка OptiFine {optifine_type}_{optifine_patch}...")
        if callable(set_progress):
            set_progress(96)

        installers_dir = self.minecraft_directory / "optifine-installers"
        installers_dir.mkdir(parents=True, exist_ok=True)
        target_file = installers_dir / f"OptiFine_{base_version}_{optifine_type}_{optifine_patch}.jar"
        source_url = f"https://bmclapi2.bangbang93.com/optifine/{base_version}/{optifine_type}/{optifine_patch}"
        self._download_file(source_url, target_file)

        if callable(set_status):
            set_status(
                f"OptiFine скачан в {target_file}. Для полной установки запустите JAR вручную."
            )
        if callable(set_progress):
            set_progress(100)

    def _install_version_blocking(self, version_id: str, callback: dict[str, Callable[..., None]] | None = None) -> None:
        install_callback = callback or {}

        if self._is_modpack_version_id(version_id):
            raise ValueError("Для сборок отдельная установка не требуется. Запускайте сборку из списка версий.")

        optifine_match = re.match(r"^(.+)-optifine-([A-Za-z0-9_]+)$", version_id, flags=re.IGNORECASE)
        if optifine_match:
            base_version = optifine_match.group(1)
            self._install_optifine(base_version, install_callback)
            return

        if "-" in version_id:
            base, suffix = version_id.rsplit("-", 1)
            loader = suffix.lower()
            if loader in {"fabric", "forge", "quilt", "neoforge"}:
                self._install_loader(loader, base, install_callback)
                return

        minecraft_launcher_lib.install.install_minecraft_version(
            version_id,
            str(self.minecraft_directory),
            callback=install_callback,
        )

    def _install_task_worker(self, task_id: str, version_id: str) -> None:
        callback = self._create_install_callback(task_id)
        self._update_install_task(task_id, {"status": "Установка...", "progress": 1})
        try:
            self._install_version_blocking(version_id, callback)
            self._update_install_task(task_id, {"status": "Установлено", "progress": 100, "completed": True, "error": None})
        except Exception as exc:
            self._update_install_task(task_id, {"status": "Ошибка", "completed": True, "error": str(exc)})

    def start_install_version(self, version_id: str) -> InstallTaskStatus:
        task_id = str(uuid.uuid4())
        task = {
            "taskId": task_id,
            "versionId": version_id,
            "status": "В очереди",
            "progress": 0,
            "completed": False,
            "error": None,
        }
        with self.lock:
            self.install_tasks[task_id] = task

        worker = threading.Thread(target=self._install_task_worker, args=(task_id, version_id), daemon=True)
        worker.start()
        return InstallTaskStatus(**task)

    def get_install_task(self, task_id: str) -> InstallTaskStatus:
        with self.lock:
            payload = self.install_tasks.get(task_id)
        if not payload:
            raise ValueError("Install task not found")
        return InstallTaskStatus(**payload)

    def install_version(self, version_id: str) -> None:
        self._install_version_blocking(version_id)

    def uninstall_version(self, version_id: str) -> None:
        if self._is_modpack_version_id(version_id):
            return

        targets: list[str] = []
        installed_ids = self._installed_version_ids()

        if version_id in installed_ids:
            targets.append(version_id)
        elif "-" in version_id:
            base, suffix = version_id.rsplit("-", 1)
            loader = suffix.lower()
            for installed_id in installed_ids:
                if base in installed_id and self._is_loader_version(installed_id, loader):
                    targets.append(installed_id)

        if not targets:
            targets.append(version_id)

        versions_root = self.minecraft_directory / "versions"
        for target in targets:
            directory = versions_root / target
            if directory.exists():
                shutil.rmtree(directory, ignore_errors=True)

    def _java_args(self, launch_options: LaunchOptions) -> list[str]:
        args: list[str] = []
        configured = str(self.settings.get("javaArgs", "")).split()
        args.extend([arg for arg in configured if arg.strip()])
        if launch_options.javaArgs:
            args.extend([arg for arg in launch_options.javaArgs if arg.strip()])

        min_memory = int(self.settings.get("minMemory", 1024))
        max_memory = int(self.settings.get("maxMemory", 4096))
        if not any(arg.startswith("-Xms") for arg in args):
            args.append(f"-Xms{min_memory}M")
        if not any(arg.startswith("-Xmx") for arg in args):
            args.append(f"-Xmx{max_memory}M")

        if bool(self.settings.get("runtimeOptimizerEnabled", False)):
            configured_agent_path = str(self.settings.get("runtimeOptimizerAgentPath") or "").strip()
            default_agent_path = self.project_root / "java-agent" / "target" / "moon-optimizer-agent-1.0.0.jar"
            candidate_agent_path = Path(configured_agent_path) if configured_agent_path else default_agent_path
            if candidate_agent_path.exists() and candidate_agent_path.is_file():
                normalized_agent_path = str(candidate_agent_path.resolve())
                if not any(arg.startswith("-javaagent:") and normalized_agent_path in arg for arg in args):
                    agent_arg = f"-javaagent:{normalized_agent_path}"
                    runtime_args = str(self.settings.get("runtimeOptimizerArgs") or "").strip()
                    if runtime_args:
                        agent_arg = f"{agent_arg}={runtime_args}"
                    args.append(agent_arg)
        return args

    def _get_profile(self, profile_id: str) -> PlayerProfile | None:
        for profile in self.profiles:
            if profile.id == profile_id:
                return profile
        return self.profiles[0] if self.profiles else None

    def _mark_profile_play(self, profile_id: str, version_id: str) -> None:
        for index, profile in enumerate(self.profiles):
            if profile.id != profile_id:
                continue
            merged = profile.model_dump()
            merged["lastPlayed"] = now_iso()
            merged["version"] = version_id
            self.profiles[index] = PlayerProfile(**merged)
            self._save_profiles(self.profiles)
            return

    def launch_game(self, options: LaunchOptions) -> LaunchResponse:
        with self.lock:
            requested_version = str(options.versionId or "").strip()
            requested_label = requested_version
            if self._is_modpack_version_id(requested_version):
                pack_id = self._pack_id_from_version_id(requested_version)
                if not pack_id:
                    raise ValueError("Не удалось определить выбранную сборку")
                resolved_version, pack_name = self._resolve_modpack_launch_version(pack_id)
                requested_version = resolved_version
                requested_label = f"Сборка: {pack_name}"

            self._install_version_blocking(requested_version)
            launch_version = self._resolve_launch_version(requested_version)

            requested_profile_id = str(options.profileId or "").strip()
            selected_profile_id = str(self.settings.get("selectedProfileId") or "").strip()

            profile = None
            if requested_profile_id:
                profile = next((item for item in self.profiles if item.id == requested_profile_id), None)
            if profile is None and selected_profile_id:
                profile = next((item for item in self.profiles if item.id == selected_profile_id), None)
            if profile is None and self.profiles:
                profile = self.profiles[0]

            active_profile_id = profile.id if profile else "default"
            if profile and self.settings.get("selectedProfileId") != active_profile_id:
                self.settings["selectedProfileId"] = active_profile_id
                self._save_settings()

            username = profile.name if profile else "Player"
            player_uuid = profile.uuid if profile and profile.uuid else str(uuid.uuid4())

            launch_payload: dict[str, Any] = {
                "username": username,
                "uuid": player_uuid,
                "token": "",
                "launcherName": "moonlauncher",
                "launcherVersion": "1.0.0",
                "jvmArguments": self._java_args(options),
            }

            launch_payload["executablePath"] = self._resolve_java_executable(launch_version)

            fullscreen = bool(options.fullscreen if options.fullscreen is not None else self.settings.get("fullscreen", False))
            if not fullscreen:
                width = int(options.windowWidth or self.settings.get("windowWidth", 1280))
                height = int(options.windowHeight or self.settings.get("windowHeight", 720))
                launch_payload["customResolution"] = True
                launch_payload["resolutionWidth"] = str(width)
                launch_payload["resolutionHeight"] = str(height)

            if options.gameArgs:
                launch_payload["gameArguments"] = options.gameArgs

            command = minecraft_launcher_lib.command.get_minecraft_command(
                launch_version,
                str(self.minecraft_directory),
                launch_payload,
            )

            process = subprocess.Popen(command, cwd=str(self.minecraft_directory))
            process_id = str(uuid.uuid4())
            self.running_processes[process_id] = {
                "process": process,
                "profileId": active_profile_id,
                "versionId": launch_version,
                "requestedVersion": requested_label,
                "startedAt": _utc_now().isoformat(),
                "logs": [f"Started process {process.pid} for version {launch_version}"],
            }
            self._mark_profile_play(active_profile_id, launch_version)
            self._update_discord_presence(
                details=f"Играет в Minecraft {requested_label}",
                state=f"Профиль: {username}",
            )
            return LaunchResponse(processId=process_id)

    def _close_finished_process(self, process_id: str, entry: dict[str, Any], forced: bool = False) -> None:
        started_raw = entry.get("startedAt")
        duration_minutes = 0
        try:
            if isinstance(started_raw, str):
                started = datetime.fromisoformat(started_raw)
                duration_minutes = max(1, int((_utc_now() - started).total_seconds() / 60))
        except Exception:
            duration_minutes = 0

        session = {
            "processId": process_id,
            "profileId": entry.get("profileId"),
            "versionId": entry.get("versionId"),
            "startedAt": started_raw,
            "finishedAt": _utc_now().isoformat(),
            "durationMinutes": duration_minutes,
            "forced": forced,
        }
        self.sessions.append(session)
        self._save_sessions()

        profile_id = entry.get("profileId")
        if isinstance(profile_id, str):
            for index, profile in enumerate(self.profiles):
                if profile.id != profile_id:
                    continue
                merged = profile.model_dump()
                merged["gameTime"] = int(merged.get("gameTime") or 0) + duration_minutes
                self.profiles[index] = PlayerProfile(**merged)
                self._save_profiles(self.profiles)
                break

    def get_game_status(self, process_id: str) -> LaunchStatus:
        with self.lock:
            entry = self.running_processes.get(process_id)
            if not entry:
                return LaunchStatus(status="stopped", logs=["Process not found"])

            process: subprocess.Popen = entry["process"]
            if process.poll() is None:
                return LaunchStatus(status="running", logs=entry.get("logs", []))

            self._close_finished_process(process_id, entry, forced=False)
            self.running_processes.pop(process_id, None)
            if not self.running_processes:
                self._clear_discord_presence()
            return LaunchStatus(status="stopped", logs=entry.get("logs", []))

    def stop_game(self, process_id: str) -> None:
        with self.lock:
            entry = self.running_processes.get(process_id)
            if not entry:
                return
            process: subprocess.Popen = entry["process"]
            if process.poll() is None:
                process.terminate()
                try:
                    process.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    process.kill()
            self._close_finished_process(process_id, entry, forced=True)
            self.running_processes.pop(process_id, None)
            if not self.running_processes:
                self._clear_discord_presence()

    def _local_ip_address(self) -> str:
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
                sock.connect(("8.8.8.8", 80))
                return str(sock.getsockname()[0])
        except Exception:
            return "127.0.0.1"

    def _public_ip_address(self) -> str:
        try:
            response = requests.get("https://api.ipify.org?format=json", timeout=6)
            response.raise_for_status()
            payload = response.json()
            ip = str(payload.get("ip") or "").strip()
            return ip
        except Exception:
            return ""

    def _resolve_vanilla_server_download(self, version_id: str) -> tuple[str, str]:
        manifest = self._manifest_versions()
        metadata_url = ""
        for item in manifest:
            if str(item.get("id") or "").strip() == version_id:
                metadata_url = str(item.get("url") or "").strip()
                break
        if not metadata_url:
            raise ValueError(f"Не найдена мета-информация версии {version_id}")

        metadata_response = requests.get(metadata_url, timeout=20)
        metadata_response.raise_for_status()
        metadata_payload = metadata_response.json()
        downloads = metadata_payload.get("downloads")
        if not isinstance(downloads, dict):
            raise ValueError("Не удалось получить ссылки на сервер Minecraft")

        server_payload = downloads.get("server")
        if not isinstance(server_payload, dict):
            raise ValueError("Для этой версии отсутствует официальный server.jar")

        server_url = str(server_payload.get("url") or "").strip()
        server_sha1 = str(server_payload.get("sha1") or "").strip().lower()
        if not server_url:
            raise ValueError("Пустая ссылка server.jar")
        return server_url, server_sha1

    def _write_server_properties(self, path: Path, values: dict[str, Any]) -> None:
        lines = []
        for key, value in values.items():
            lines.append(f"{key}={value}")
        path.write_text("\n".join(lines) + "\n", encoding="utf-8")

    def _ensure_vanilla_server(self, server_dir: Path, version_id: str) -> Path:
        server_dir.mkdir(parents=True, exist_ok=True)
        jar_path = server_dir / "server.jar"
        if jar_path.exists() and jar_path.stat().st_size > 0:
            return jar_path

        server_url, server_sha1 = self._resolve_vanilla_server_download(version_id)
        self._download_file(server_url, jar_path)
        if server_sha1:
            actual_sha1 = hashlib.sha1(jar_path.read_bytes()).hexdigest().lower()
            if actual_sha1 != server_sha1:
                jar_path.unlink(missing_ok=True)
                raise ValueError("Проверка целостности server.jar не пройдена")
        return jar_path

    def _cleanup_coop_server_if_finished(self) -> None:
        if not self.coop_server:
            return
        process = self.coop_server.get("process")
        if not isinstance(process, subprocess.Popen):
            return
        if process.poll() is None:
            return

        log_handle = self.coop_server.get("logHandle")
        try:
            if log_handle and hasattr(log_handle, "close"):
                log_handle.close()
        except Exception:
            pass
        self.coop_server = None

    def start_coop_server(self, payload: dict[str, Any]) -> dict[str, Any]:
        with self.lock:
            self._cleanup_coop_server_if_finished()
            if self.coop_server:
                raise ValueError("Сервер уже запущен. Сначала остановите текущий сервер.")

            version_id = str(payload.get("versionId") or "latest-release").strip() or "latest-release"
            if version_id == "latest-release":
                releases = [item for item in self.get_versions() if item.type == "release"]
                if not releases:
                    raise ValueError("Не удалось определить последнюю релизную версию")
                version_id = releases[0].version

            world_name = str(payload.get("worldName") or "MoonWorld").strip() or "MoonWorld"
            port = int(payload.get("port") or self.settings.get("coopServerPort") or 25565)
            max_players = int(payload.get("maxPlayers") or 8)
            online_mode = bool(payload.get("onlineMode") if "onlineMode" in payload else False)
            pvp_enabled = bool(payload.get("pvp") if "pvp" in payload else True)
            motd = str(payload.get("motd") or "Moonlauncher Co-op Server").strip()
            memory_mb = int(payload.get("memoryMb") or self.settings.get("coopServerMemoryMb") or 2048)
            xms_mb = max(512, min(memory_mb, 8192))
            xmx_mb = max(xms_mb, min(memory_mb, 12288))

            self.settings["coopServerPort"] = port
            self.settings["coopServerMemoryMb"] = memory_mb
            self._save_settings()

            server_root = self.minecraft_directory / "moon-coop-server" / version_id
            jar_path = self._ensure_vanilla_server(server_root, version_id)

            eula_path = server_root / "eula.txt"
            eula_path.write_text("eula=true\n", encoding="utf-8")
            properties = {
                "server-port": port,
                "query.port": port,
                "motd": motd or "Moonlauncher Co-op Server",
                "gamemode": "survival",
                "difficulty": "normal",
                "max-players": max(1, min(max_players, 50)),
                "online-mode": "true" if online_mode else "false",
                "pvp": "true" if pvp_enabled else "false",
                "allow-flight": "true",
                "enable-command-block": "false",
                "spawn-protection": 0,
                "view-distance": 10,
                "simulation-distance": 10,
                "level-name": world_name,
            }
            self._write_server_properties(server_root / "server.properties", properties)

            java_exec = self._resolve_java_executable(version_id)
            log_path = server_root / "moonlauncher-server.log"
            log_handle = log_path.open("a", encoding="utf-8")

            creation_flags = 0
            if os.name == "nt" and hasattr(subprocess, "CREATE_NO_WINDOW"):
                creation_flags = int(getattr(subprocess, "CREATE_NO_WINDOW"))

            process = subprocess.Popen(
                [java_exec, f"-Xms{xms_mb}M", f"-Xmx{xmx_mb}M", "-jar", str(jar_path), "nogui"],
                cwd=str(server_root),
                stdout=log_handle,
                stderr=log_handle,
                creationflags=creation_flags,
            )

            local_ip = self._local_ip_address()
            public_ip = self._public_ip_address()
            started_at = _utc_now().isoformat()
            self.coop_server = {
                "process": process,
                "logHandle": log_handle,
                "versionId": version_id,
                "worldName": world_name,
                "port": port,
                "localIp": local_ip,
                "publicIp": public_ip,
                "serverDir": str(server_root),
                "logPath": str(log_path),
                "startedAt": started_at,
            }

            return {
                "running": True,
                "mode": "auto-server",
                "versionId": version_id,
                "worldName": world_name,
                "port": port,
                "localAddress": f"{local_ip}:{port}",
                "publicAddress": f"{public_ip}:{port}" if public_ip else "",
                "serverDir": str(server_root),
                "logPath": str(log_path),
                "startedAt": started_at,
                "instructions": [
                    "1. В лаунчере запущен локальный сервер в фоне.",
                    "2. В вашем Minecraft: Сетевая игра -> Добавить сервер.",
                    f"3. Для игры в одной сети используйте: {local_ip}:{port}",
                    f"4. Для игры через интернет откройте порт {port} в роутере/NAT.",
                    "5. Друг подключается по внешнему адресу (PublicAddress).",
                    f"6. Мир сервера находится в: {server_root / world_name}",
                ],
            }

    def start_coop_session(self, payload: dict[str, Any]) -> dict[str, Any]:
        profile_id = str(payload.get("profileId") or "").strip()
        server_info = self.start_coop_server(payload)
        version_id = str(server_info.get("versionId") or payload.get("versionId") or "latest-release")
        local_address = str(server_info.get("localAddress") or "")
        server_host = "127.0.0.1"
        server_port = int(server_info.get("port") or payload.get("port") or 25565)
        if local_address and ":" in local_address:
            server_host = local_address.split(":", 1)[0] or "127.0.0.1"

        launch_options = LaunchOptions(
            profileId=profile_id,
            versionId=version_id,
            javaArgs=[],
            gameArgs=["--server", server_host, "--port", str(server_port)],
            windowWidth=None,
            windowHeight=None,
            fullscreen=False,
        )

        try:
            launch_response = self.launch_game(launch_options)
        except Exception:
            try:
                self.stop_coop_server()
            except Exception:
                pass
            raise

        instructions = list(server_info.get("instructions") or [])
        instructions.extend(
            [
                "7. Лаунчер автоматически запустил Minecraft и подключил вас к созданному серверу.",
                "8. Другу нужен тот же модпак/версия и подключение по адресу сервера.",
            ]
        )
        return {
            "server": server_info,
            "processId": launch_response.processId,
            "instructions": instructions,
        }

    def get_coop_server_status(self) -> dict[str, Any]:
        with self.lock:
            self._cleanup_coop_server_if_finished()
            if not self.coop_server:
                return {"running": False}

            process = self.coop_server.get("process")
            if not isinstance(process, subprocess.Popen):
                return {"running": False}

            port = int(self.coop_server.get("port") or 25565)
            local_ip = str(self.coop_server.get("localIp") or "127.0.0.1")
            public_ip = str(self.coop_server.get("publicIp") or "")
            return {
                "running": process.poll() is None,
                "mode": "auto-server",
                "versionId": str(self.coop_server.get("versionId") or ""),
                "worldName": str(self.coop_server.get("worldName") or ""),
                "port": port,
                "localAddress": f"{local_ip}:{port}",
                "publicAddress": f"{public_ip}:{port}" if public_ip else "",
                "serverDir": str(self.coop_server.get("serverDir") or ""),
                "logPath": str(self.coop_server.get("logPath") or ""),
                "startedAt": str(self.coop_server.get("startedAt") or ""),
            }

    def stop_coop_server(self) -> None:
        with self.lock:
            if not self.coop_server:
                return

            process = self.coop_server.get("process")
            if isinstance(process, subprocess.Popen) and process.poll() is None:
                process.terminate()
                try:
                    process.wait(timeout=12)
                except subprocess.TimeoutExpired:
                    process.kill()

            log_handle = self.coop_server.get("logHandle")
            try:
                if log_handle and hasattr(log_handle, "close"):
                    log_handle.close()
            except Exception:
                pass

            self.coop_server = None

    def validate_version(self, version_id: str) -> VersionValidation:
        requested = str(version_id or "").strip()
        if self._is_modpack_version_id(requested):
            pack_id = self._pack_id_from_version_id(requested)
            if not pack_id:
                return VersionValidation(valid=False, missingFiles=["Сборка не найдена"])
            try:
                base_version, _ = self._resolve_modpack_launch_version(pack_id, apply_pack=False)
                version_to_check = self._resolve_launch_version(base_version)
            except Exception as exc:
                return VersionValidation(valid=False, missingFiles=[str(exc)])
        else:
            version_to_check = self._resolve_launch_version(requested)
        missing_files: list[str] = []

        if not minecraft_launcher_lib.utils.is_version_valid(version_to_check, str(self.minecraft_directory)):
            missing_files.append("version.json")
            return VersionValidation(valid=False, missingFiles=missing_files)

        version_dir = self.minecraft_directory / "versions" / version_to_check
        if not version_dir.exists():
            missing_files.append("versions/<id>")
            return VersionValidation(valid=False, missingFiles=missing_files)

        version_json = version_dir / f"{version_to_check}.json"
        if not version_json.exists():
            missing_files.append(f"{version_to_check}.json")

        has_client_jar = (version_dir / f"{version_to_check}.jar").exists()
        if not has_client_jar:
            try:
                payload = json.loads(version_json.read_text(encoding="utf-8"))
                if payload.get("inheritsFrom") is None:
                    missing_files.append(f"{version_to_check}.jar")
            except Exception:
                missing_files.append(f"{version_to_check}.jar")

        return VersionValidation(valid=len(missing_files) == 0, missingFiles=missing_files)

    def get_player_stats(self) -> dict[str, Any]:
        total_play_time = sum(int(profile.gameTime or 0) for profile in self.profiles)
        total_sessions = len(self.sessions)

        last_play = None
        for profile in self.profiles:
            if profile.lastPlayed and (last_play is None or profile.lastPlayed > last_play):
                last_play = profile.lastPlayed

        average_session = int(total_play_time / total_sessions) if total_sessions else 0

        streak = 0
        days = set()
        for session in self.sessions:
            finished_at = session.get("finishedAt")
            if isinstance(finished_at, str):
                days.add(finished_at[:10])
        if days:
            sorted_days = sorted(days, reverse=True)
            streak = 1
            prev = datetime.fromisoformat(sorted_days[0]).date()
            for current_day_str in sorted_days[1:]:
                current_day = datetime.fromisoformat(current_day_str).date()
                delta = (prev - current_day).days
                if delta == 1:
                    streak += 1
                    prev = current_day
                elif delta > 1:
                    break

        return {
            "totalPlayTime": total_play_time,
            "playStreak": streak,
            "lastPlayDate": last_play or now_iso(),
            "totalSessions": total_sessions,
            "averageSessionTime": average_session,
        }

    def get_server_status(self) -> ServerStatus:
        server_address = str(self.settings.get("preferredServerAddress") or "").strip()
        if not server_address:
            return ServerStatus(
                online=False,
                playerCount=0,
                maxPlayers=0,
                players=[],
                ping=0,
                version="Unknown",
                motd="Адрес сервера не настроен",
            )

        try:
            java_server = JavaServer.lookup(server_address)
            status = java_server.status()
            players: list[str] = []
            if status.players.sample:
                players = [player.name for player in status.players.sample if getattr(player, "name", None)]
            return ServerStatus(
                online=True,
                playerCount=status.players.online,
                maxPlayers=status.players.max,
                players=players,
                ping=int(status.latency),
                version=str(status.version.name),
                motd=str(status.description),
            )
        except Exception:
            return ServerStatus(
                online=False,
                playerCount=0,
                maxPlayers=0,
                players=[],
                ping=0,
                version="Unknown",
                motd="Сервер недоступен",
            )

    def _normalize_news_url(self, value: Any, base_url: str = "https://www.minecraft.net") -> str | None:
        candidate = str(value or "").strip()
        if not candidate:
            return None
        if candidate.startswith("//"):
            return f"https:{candidate}"
        lowered = candidate.lower()
        if lowered.startswith("http://") or lowered.startswith("https://"):
            return candidate
        return urljoin(base_url if base_url.endswith("/") else f"{base_url}/", candidate)

    def _news_image_fallback(self, title: str, category: str) -> str:
        # Local deterministic fallback to avoid random/non-themed images when remote hosts fail.
        title_clean = re.sub(r"\s+", " ", str(title or "").strip())[:42] or "Minecraft News"
        category_clean = re.sub(r"\s+", " ", str(category or "").strip())[:24] or "Minecraft"
        palette = [
            ("#0b1220", "#1f3b73"),
            ("#0f172a", "#1e3a8a"),
            ("#101828", "#134e4a"),
            ("#111827", "#3f6212"),
        ]
        color_index = int(hashlib.sha1(f"{title_clean}|{category_clean}".encode("utf-8", errors="ignore")).hexdigest()[:2], 16) % len(palette)
        bg_start, bg_end = palette[color_index]
        svg = (
            "<svg xmlns='http://www.w3.org/2000/svg' width='1280' height='720' viewBox='0 0 1280 720'>"
            "<defs>"
            f"<linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>"
            f"<stop offset='0%' stop-color='{bg_start}'/>"
            f"<stop offset='100%' stop-color='{bg_end}'/>"
            "</linearGradient>"
            "</defs>"
            "<rect width='1280' height='720' fill='url(#g)'/>"
            "<rect x='64' y='64' width='1152' height='592' rx='24' fill='rgba(0,0,0,0.30)' stroke='rgba(255,255,255,0.16)'/>"
            "<text x='96' y='162' fill='rgba(255,255,255,0.84)' font-family='Segoe UI, Arial' font-size='34'>Minecraft News</text>"
            f"<text x='96' y='232' fill='white' font-family='Segoe UI, Arial' font-size='52' font-weight='700'>{html.escape(category_clean)}</text>"
            f"<text x='96' y='310' fill='rgba(255,255,255,0.92)' font-family='Segoe UI, Arial' font-size='36'>{html.escape(title_clean)}</text>"
            "</svg>"
        )
        return f"data:image/svg+xml;utf8,{quote(svg)}"

    def _strip_html(self, value: str) -> str:
        if not value:
            return ""
        cleaned = re.sub(r"<br\s*/?>", "\n", value, flags=re.IGNORECASE)
        cleaned = re.sub(r"</p>", "\n", cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r"<[^>]+>", " ", cleaned)
        cleaned = html.unescape(cleaned)
        cleaned = re.sub(r"[ \t]+", " ", cleaned)
        cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
        return cleaned.strip()

    def _extract_news_image_from_html(self, html_text: str) -> str | None:
        if not html_text:
            return None
        patterns = (
            r'<meta[^>]+(?:property|name)=["\']og:image["\'][^>]+content=["\']([^"\']+)["\']',
            r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+(?:property|name)=["\']og:image["\']',
            r'<meta[^>]+(?:property|name)=["\']twitter:image["\'][^>]+content=["\']([^"\']+)["\']',
            r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+(?:property|name)=["\']twitter:image["\']',
            r'<img[^>]+src=["\']([^"\']+)["\'][^>]*>',
        )
        for pattern in patterns:
            match = re.search(pattern, html_text, flags=re.IGNORECASE)
            if match:
                candidate = html.unescape(str(match.group(1) or "").strip())
                if candidate:
                    return candidate
        return None

    def _resolve_news_image(self, image_url: Any, article_url: str | None, title: str, category: str) -> str:
        normalized_direct = self._normalize_news_url(image_url, base_url=article_url or "https://www.minecraft.net")
        if normalized_direct:
            return normalized_direct

        if article_url:
            try:
                response = requests.get(
                    article_url,
                    timeout=20,
                    headers={"User-Agent": "moonlauncher/1.0 (+https://github.com/forgaw/moonlauncher)"},
                )
                response.raise_for_status()
                extracted = self._extract_news_image_from_html(response.text)
                normalized_extracted = self._normalize_news_url(extracted, base_url=article_url)
                if normalized_extracted:
                    return normalized_extracted
            except Exception:
                pass

        return self._news_image_fallback(title=title, category=category)

    def _news_from_mojang_payload(self, payload: dict[str, Any], limit: int = 12) -> list[NewsArticle]:
        raw_items: list[dict[str, Any]] = []
        for key in ("article_grid", "entries", "news", "items"):
            value = payload.get(key)
            if isinstance(value, list):
                raw_items = [item for item in value if isinstance(item, dict)]
                if raw_items:
                    break

        output: list[NewsArticle] = []
        for index, item in enumerate(raw_items[:limit]):
            tile = item.get("default_tile") if isinstance(item.get("default_tile"), dict) else {}
            title = str(tile.get("title") or item.get("title") or "Minecraft News").strip() or "Minecraft News"
            body = str(tile.get("sub_header") or item.get("description") or item.get("summary") or "").strip()
            excerpt = (body or title)[:280]
            direct_image_url = (
                tile.get("image", {}).get("url") if isinstance(tile.get("image"), dict)
                else item.get("image") or item.get("imageUrl") or tile.get("imageUrl")
            )
            url = self._normalize_news_url(tile.get("url") or item.get("url") or item.get("read_more_link")) or "https://www.minecraft.net"
            category = str(item.get("article_type") or item.get("category") or "Minecraft").strip() or "Minecraft"
            published = str(item.get("publish_date") or item.get("published") or now_iso())
            image_url = self._resolve_news_image(direct_image_url, url, title, category)
            output.append(
                NewsArticle(
                    id=str(item.get("id") or f"mc-news-{index}"),
                    title=title,
                    content=body or title,
                    excerpt=excerpt,
                    author="Minecraft",
                    publishDate=published,
                    category=category,
                    tags=[category],
                    imageUrl=image_url,
                    url=url,
                    featured=index == 0,
                )
            )
        return output

    def _news_from_rss(self, xml_text: str, limit: int = 12) -> list[NewsArticle]:
        xml_text = str(xml_text or "").strip()
        if not xml_text:
            return []
        root = ElementTree.fromstring(xml_text)

        output: list[NewsArticle] = []
        for index, item in enumerate(root.findall(".//item")[:limit]):
            title = (item.findtext("title") or "").strip() or "Minecraft News"
            description = (item.findtext("description") or "").strip()
            encoded = (
                item.findtext("{http://purl.org/rss/1.0/modules/content/}encoded")
                or item.findtext("content:encoded")
                or ""
            ).strip()
            raw_content = encoded or description or title
            plain_content = self._strip_html(raw_content) or title
            link = self._normalize_news_url(item.findtext("link"))
            author = (item.findtext("author") or item.findtext("{http://purl.org/dc/elements/1.1/}creator") or "Minecraft").strip()
            pub_date_raw = (item.findtext("pubDate") or "").strip()
            category = (item.findtext("category") or "Minecraft").strip() or "Minecraft"
            guid = (item.findtext("guid") or "").strip() or f"rss-news-{index}"

            publish_date = now_iso()
            if pub_date_raw:
                try:
                    publish_date = parsedate_to_datetime(pub_date_raw).astimezone(timezone.utc).isoformat()
                except Exception:
                    publish_date = pub_date_raw

            image_url = None
            enclosure = item.find("enclosure")
            if enclosure is not None and isinstance(enclosure.attrib, dict):
                candidate = str(enclosure.attrib.get("url") or "").strip()
                if candidate:
                    image_url = candidate

            if not image_url:
                media = item.find("{http://search.yahoo.com/mrss/}content")
                if media is not None and isinstance(media.attrib, dict):
                    candidate = str(media.attrib.get("url") or "").strip()
                    if candidate:
                        image_url = candidate

            if not image_url:
                media_thumbnail = item.find("{http://search.yahoo.com/mrss/}thumbnail")
                if media_thumbnail is not None and isinstance(media_thumbnail.attrib, dict):
                    candidate = str(media_thumbnail.attrib.get("url") or "").strip()
                    if candidate:
                        image_url = candidate

            if not image_url and description:
                description_image = self._extract_news_image_from_html(description)
                if description_image:
                    image_url = description_image

            resolved_image = self._resolve_news_image(image_url, link, title, category)

            output.append(
                NewsArticle(
                    id=guid,
                    title=title,
                    content=plain_content,
                    excerpt=plain_content[:280],
                    author=author or "Minecraft",
                    publishDate=publish_date,
                    category=category,
                    tags=[category],
                    imageUrl=resolved_image,
                    url=link,
                    featured=index == 0,
                )
            )
        return output

    def get_news(self) -> list[NewsArticle]:
        cached_at = self.news_cache.get("fetchedAt")
        cached_data = self.news_cache.get("data")
        if isinstance(cached_at, datetime) and isinstance(cached_data, list):
            if (_utc_now() - cached_at).total_seconds() < 900 and cached_data:
                return [item for item in cached_data if isinstance(item, NewsArticle)]

        # 1) RF-friendly RSS source (has themed images and links).
        try:
            response = requests.get("https://minecraft-inside.ru/feed/", timeout=20)
            response.raise_for_status()
            articles = self._news_from_rss(response.text, limit=12)
            if articles:
                self.news_cache = {"fetchedAt": _utc_now(), "data": articles}
                return articles
        except Exception:
            pass

        # 2) Official Mojang launcher news endpoint.
        try:
            response = requests.get("https://launchercontent.mojang.com/news.json", timeout=15)
            response.raise_for_status()
            payload = response.json()
            if isinstance(payload, dict):
                articles = self._news_from_mojang_payload(payload, limit=12)
                if articles:
                    self.news_cache = {"fetchedAt": _utc_now(), "data": articles}
                    return articles
        except Exception:
            pass

        # 3) minecraft-launcher-lib helper.
        try:
            payload = minecraft_launcher_lib.utils.get_minecraft_news(page_size=12)
            if isinstance(payload, dict):
                articles = self._news_from_mojang_payload(payload, limit=12)
                if articles:
                    self.news_cache = {"fetchedAt": _utc_now(), "data": articles}
                    return articles
        except Exception:
            pass

        # 4) Public RSS fallbacks.
        rss_candidates = [
            "https://www.minecraft.net/en-us/feeds/community-content/rss",
            "https://www.minecraft.net/en-us/rss",
        ]
        for rss_url in rss_candidates:
            try:
                response = requests.get(rss_url, timeout=20)
                response.raise_for_status()
                articles = self._news_from_rss(response.text, limit=12)
                if articles:
                    self.news_cache = {"fetchedAt": _utc_now(), "data": articles}
                    return articles
            except Exception:
                continue

        fallback = [
            NewsArticle(
                id="fallback-news",
                title="Новости Minecraft временно недоступны",
                content="Не удалось загрузить новости из внешних источников. Попробуйте обновить позже.",
                excerpt="Не удалось загрузить новости из внешних источников. Попробуйте обновить позже.",
                author="moonlauncher",
                publishDate=now_iso(),
                category="Новости",
                tags=["launcher"],
                imageUrl=None,
                url="https://www.minecraft.net",
                featured=True,
            )
        ]
        self.news_cache = {"fetchedAt": _utc_now(), "data": fallback}
        return fallback
    def _modrinth_headers(self) -> dict[str, str]:
        token = self._resolve_secret("modrinthApiKey", "modrinthApiKeyEncrypted")
        headers = {"User-Agent": "moonlauncher/1.0.0 (support@moonlauncher.local)"}
        if token:
            headers["Authorization"] = token
        return headers

    def _curseforge_headers(self) -> dict[str, str]:
        token = self._resolve_secret("curseforgeApiKey", "curseforgeApiKeyEncrypted")
        if not token:
            raise ValueError("Не настроен API-ключ CurseForge")
        return {"x-api-key": token, "Accept": "application/json"}

    def _modrinth_project_type(self, kind: ContentKind) -> str:
        mapping = {
            "mod": "mod",
            "resourcepack": "resourcepack",
            "shader": "shader",
            "map": "modpack",
            "modpack": "modpack",
        }
        return mapping[kind]

    def _content_directory(self, kind: ContentKind) -> Path:
        mapping = {
            "mod": self.minecraft_directory / "mods",
            "modpack": self.minecraft_directory / "modpacks",
            "resourcepack": self.minecraft_directory / "resourcepacks",
            "shader": self.minecraft_directory / "shaderpacks",
            "map": self.minecraft_directory / "saves",
        }
        target = mapping[kind]
        target.mkdir(parents=True, exist_ok=True)
        return target

    def _unique_path(self, candidate: Path) -> Path:
        if not candidate.exists():
            return candidate

        parent = candidate.parent
        stem = candidate.stem
        suffix = candidate.suffix
        index = 1
        while True:
            if suffix:
                next_candidate = parent / f"{stem}-{index}{suffix}"
            else:
                next_candidate = parent / f"{candidate.name}-{index}"
            if not next_candidate.exists():
                return next_candidate
            index += 1

    def _download_file(self, source_url: str, target_path: Path) -> None:
        with requests.get(source_url, stream=True, timeout=120) as stream:
            stream.raise_for_status()
            with target_path.open("wb") as file_handle:
                for chunk in stream.iter_content(chunk_size=1024 * 128):
                    if chunk:
                        file_handle.write(chunk)

    def _safe_extract_zip(self, archive_path: Path, destination: Path) -> None:
        destination.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(archive_path, "r") as zip_file:
            for member in zip_file.infolist():
                member_path = destination / member.filename
                resolved = member_path.resolve()
                if destination.resolve() not in resolved.parents and resolved != destination.resolve():
                    raise ValueError("Архив содержит небезопасные пути")
            zip_file.extractall(destination)

    def _install_downloaded_content(self, source_url: str, file_name: str, kind: ContentKind) -> tuple[str, str]:
        target_directory = self._content_directory(kind)
        safe_name = Path(file_name).name or f"{kind}-{uuid.uuid4().hex}.bin"
        archive_path = self._unique_path(target_directory / safe_name)
        self._download_file(source_url, archive_path)

        if kind != "map":
            return archive_path.name, str(archive_path)

        if archive_path.suffix.lower() != ".zip":
            return archive_path.name, str(archive_path)

        extract_root = self._unique_path(target_directory / archive_path.stem)
        self._safe_extract_zip(archive_path, extract_root)
        archive_path.unlink(missing_ok=True)

        children = [child for child in extract_root.iterdir()]
        if len(children) == 1 and children[0].is_dir():
            candidate_world = children[0]
            final_world_path = self._unique_path(target_directory / candidate_world.name)
            shutil.move(str(candidate_world), str(final_world_path))
            shutil.rmtree(extract_root, ignore_errors=True)
            return final_world_path.name, str(final_world_path)

        return extract_root.name, str(extract_root)

    def _entry_size_bytes(self, path: Path) -> int:
        if path.is_file():
            try:
                return path.stat().st_size
            except OSError:
                return 0
        return 0

    def get_installed_content(self, kind: ContentKind) -> list[dict[str, Any]]:
        target_directory = self._content_directory(kind)
        entries: list[dict[str, Any]] = []
        def _mtime(entry: Path) -> float:
            try:
                return entry.stat().st_mtime
            except OSError:
                return 0.0

        for item in sorted(target_directory.iterdir(), key=_mtime, reverse=True):
            if item.name.startswith("."):
                continue
            modified = datetime.fromtimestamp(_mtime(item), tz=timezone.utc).isoformat()
            entries.append(
                {
                    "id": item.name,
                    "name": item.name,
                    "kind": kind,
                    "isDirectory": item.is_dir(),
                    "path": str(item),
                    "sizeBytes": self._entry_size_bytes(item),
                    "modifiedAt": modified,
                }
            )
        return entries

    def remove_installed_content(self, kind: ContentKind, entry_name: str) -> str:
        target_directory = self._content_directory(kind).resolve()
        clean_name = Path(entry_name).name
        if clean_name != entry_name:
            raise ValueError("Некорректное имя элемента")

        target = (target_directory / clean_name).resolve()
        if target_directory not in target.parents and target != target_directory:
            raise ValueError("Некорректный путь удаления")
        if not target.exists():
            raise ValueError("Файл или папка не найдены")

        is_directory = target.is_dir()
        if is_directory:
            shutil.rmtree(target, ignore_errors=False)
        else:
            target.unlink(missing_ok=False)
        self._clear_installed_project_by_path(target, recursive=is_directory)
        return str(target)

    def _curseforge_class_id(self, kind: ContentKind) -> int | None:
        # 6 = mods, 4471 = modpacks, 12 = resource packs, 6552 = shaders, 17 = worlds/maps.
        mapping: dict[ContentKind, int] = {
            "mod": 6,
            "modpack": 4471,
            "resourcepack": 12,
            "shader": 6552,
            "map": 17,
        }
        return mapping.get(kind)

    def _search_modrinth_content(
        self,
        query: str,
        kind: ContentKind,
        provider: ProviderType,
        game_version: str | None,
        loader: str,
        limit: int,
    ) -> list[ContentProject]:
        facets: list[list[str]] = [[f"project_type:{self._modrinth_project_type(kind)}"]]
        if game_version:
            facets.append([f"versions:{game_version}"])
        if kind == "mod" and loader:
            facets.append([f"categories:{loader}"])
        if kind == "map":
            # Reduce irrelevant modpack results in map mode.
            facets.append(
                [
                    "categories:adventure",
                    "categories:parkour",
                    "categories:puzzle",
                    "categories:survival",
                    "categories:worldgen",
                ]
            )

        response = requests.get(
            f"{MODRINTH_BASE_URL}/search",
            params={
                "query": (query.strip() if query.strip() else ("map world" if kind == "map" else "")),
                "limit": max(1, min(limit, 100)),
                "facets": json.dumps(facets),
            },
            headers=self._modrinth_headers(),
            timeout=20,
        )
        response.raise_for_status()

        hits = response.json().get("hits", [])
        projects: list[ContentProject] = []
        map_keywords = [
            "map",
            "world",
            "adventure",
            "survival",
            "puzzle",
            "parkour",
            "ctm",
            "spawn",
        ]

        def _looks_like_map(hit: dict[str, Any]) -> bool:
            title = str(hit.get("title") or "").lower()
            description = str(hit.get("description") or "").lower()
            categories = " ".join(str(item).lower() for item in (hit.get("categories") or []))
            blob = f"{title} {description} {categories}"
            return any(keyword in blob for keyword in map_keywords)

        for hit in hits:
            if kind == "map" and not _looks_like_map(hit):
                continue
            projects.append(
                ContentProject(
                    id=str(hit.get("project_id") or hit.get("slug")),
                    slug=str(hit.get("slug") or ""),
                    title=str(hit.get("title") or hit.get("slug") or "Unknown"),
                    description=str(hit.get("description") or ""),
                    provider=provider,
                    kind=kind,
                    iconUrl=hit.get("icon_url"),
                    downloads=int(hit.get("downloads") or 0),
                    followers=int(hit.get("follows") or 0),
                    categories=list(hit.get("categories") or []),
                    versions=list(hit.get("versions") or []),
                )
            )

        if provider == "rf":
            russian = [project for project in projects if _contains_cyrillic(f"{project.title} {project.description}")]
            if russian:
                return [self._localize_project(project) for project in russian]

        return [self._localize_project(project) for project in projects]

    def _search_curseforge_content(
        self,
        query: str,
        kind: ContentKind,
        game_version: str | None,
        loader: str,
        limit: int,
    ) -> list[ContentProject]:
        params: dict[str, Any] = {
            "gameId": 432,
            "pageSize": max(1, min(limit, 50)),
            "sortField": 2,
            "sortOrder": "desc",
        }
        class_id = self._curseforge_class_id(kind)
        if class_id is not None:
            params["classId"] = class_id
        if query.strip():
            params["searchFilter"] = query.strip()
        if game_version:
            params["gameVersion"] = game_version

        loader_map = {"forge": 1, "fabric": 4, "quilt": 5, "neoforge": 6}
        if kind == "mod" and loader in loader_map:
            params["modLoaderType"] = loader_map[loader]

        response = requests.get(
            f"{CURSEFORGE_BASE_URL}/mods/search",
            params=params,
            headers=self._curseforge_headers(),
            timeout=25,
        )
        response.raise_for_status()

        data = response.json().get("data", [])

        def matches_kind(item: dict[str, Any]) -> bool:
            item_class_id = item.get("classId")
            if isinstance(item_class_id, int):
                expected = self._curseforge_class_id(kind)
                if expected is not None and item_class_id == expected:
                    return True

            categories = [str(category.get("name", "")).lower() for category in item.get("categories", [])]
            joined = " ".join(categories)
            if kind == "resourcepack":
                return "resource" in joined or "texture" in joined
            if kind == "shader":
                return "shader" in joined
            if kind == "map":
                return "map" in joined or "world" in joined or "adventure" in joined
            if kind == "modpack":
                return "modpack" in joined or "mod pack" in joined or "quests" in joined
            return not ("resource" in joined or "texture" in joined or "shader" in joined)

        projects: list[ContentProject] = []
        for item in data:
            if not matches_kind(item):
                continue
            projects.append(
                ContentProject(
                    id=str(item.get("id")),
                    slug=str(item.get("slug") or item.get("name") or ""),
                    title=str(item.get("name") or "Unknown"),
                    description=str(item.get("summary") or ""),
                    provider="curseforge",
                    kind=kind,
                    iconUrl=(item.get("logo") or {}).get("thumbnailUrl"),
                    downloads=int(item.get("downloadCount") or 0),
                    followers=int(item.get("thumbsUpCount") or 0),
                    categories=[str(category.get("name", "")) for category in item.get("categories", [])],
                    versions=[],
                )
            )
        return [self._localize_project(project) for project in projects]

    def _merge_content_projects(self, *groups: list[ContentProject]) -> list[ContentProject]:
        merged: list[ContentProject] = []
        seen: set[tuple[str, str, str]] = set()
        for group in groups:
            for project in group:
                key = (project.provider, project.kind, project.id)
                if key in seen:
                    continue
                seen.add(key)
                merged.append(project)
        return merged

    def search_content(
        self,
        query: str,
        kind: ContentKind,
        provider: str,
        game_version: str | None,
        loader: str,
        limit: int,
    ) -> list[ContentProject]:
        normalized_provider = str(provider or "modrinth").strip().lower()
        if normalized_provider == "modrinth":
            projects = self._search_modrinth_content(query, kind, "modrinth", game_version, loader, limit)
            return self._apply_installed_flags(projects)
        if normalized_provider == "rf":
            projects = self._search_modrinth_content(query, kind, "rf", game_version, loader, limit)
            return self._apply_installed_flags(projects)
        if normalized_provider == "curseforge":
            projects = self._search_curseforge_content(query, kind, game_version, loader, limit)
            return self._apply_installed_flags(projects)
        if normalized_provider == "all":
            per_provider_limit = max(6, min(limit, 50))
            try:
                modrinth_items = self._search_modrinth_content(query, kind, "modrinth", game_version, loader, per_provider_limit)
            except Exception:
                modrinth_items = []
            try:
                rf_items = self._search_modrinth_content(query, kind, "rf", game_version, loader, per_provider_limit)
            except Exception:
                rf_items = []
            curseforge_items: list[ContentProject] = []
            try:
                curseforge_items = self._search_curseforge_content(query, kind, game_version, loader, per_provider_limit)
            except Exception:
                curseforge_items = []
            if kind == "map":
                merged = self._merge_content_projects(curseforge_items, modrinth_items, rf_items)
            else:
                merged = self._merge_content_projects(modrinth_items, curseforge_items, rf_items)
            merged.sort(key=lambda item: (item.downloads, item.followers), reverse=True)
            return self._apply_installed_flags(merged[: max(1, min(limit, 150))])
        return []

    def get_recommended_content(
        self,
        kind: ContentKind,
        provider: str,
        game_version: str | None,
        loader: str,
        limit: int,
    ) -> list[ContentProject]:
        projects = self.search_content(
            query="",
            kind=kind,
            provider=provider,
            game_version=game_version,
            loader=loader,
            limit=max(1, min(limit, 120)),
        )
        projects.sort(key=lambda item: (item.downloads, item.followers), reverse=True)
        return projects[: max(1, min(limit, 120))]

    def get_content_details(self, project_id: str, provider: str, kind: ContentKind) -> dict[str, Any]:
        normalized_provider = str(provider or "").strip().lower()
        if normalized_provider in {"modrinth", "rf"}:
            response = requests.get(
                f"{MODRINTH_BASE_URL}/project/{project_id}",
                headers=self._modrinth_headers(),
                timeout=25,
            )
            response.raise_for_status()
            data = response.json()
            gallery_urls = []
            gallery = data.get("gallery")
            if isinstance(gallery, list):
                gallery_urls.extend(
                    str(item.get("url"))
                    for item in gallery
                    if isinstance(item, dict) and item.get("url")
                )
            icon_url = str(data.get("icon_url") or "").strip()
            if icon_url and icon_url not in gallery_urls:
                gallery_urls.insert(0, icon_url)

            description = str(data.get("body") or data.get("description") or "")
            return {
                "id": str(data.get("id") or project_id),
                "slug": str(data.get("slug") or ""),
                "provider": "rf" if normalized_provider == "rf" else "modrinth",
                "kind": kind,
                "title": str(data.get("title") or data.get("slug") or "Unknown"),
                "description": self._translate_to_russian(description[:6000]),
                "summary": self._translate_to_russian(str(data.get("description") or "")),
                "iconUrl": icon_url or None,
                "gallery": gallery_urls[:18],
                "categories": list(data.get("categories") or []),
                "downloads": int(data.get("downloads") or 0),
                "followers": int(data.get("followers") or 0),
                "websiteUrl": str(data.get("source_url") or data.get("wiki_url") or data.get("issues_url") or ""),
            }

        if normalized_provider == "curseforge":
            headers = self._curseforge_headers()
            details_response = requests.get(
                f"{CURSEFORGE_BASE_URL}/mods/{project_id}",
                headers=headers,
                timeout=25,
            )
            details_response.raise_for_status()
            details = details_response.json().get("data", {}) or {}

            description_text = str(details.get("summary") or "")
            try:
                description_response = requests.get(
                    f"{CURSEFORGE_BASE_URL}/mods/{project_id}/description",
                    headers=headers,
                    timeout=25,
                )
                description_response.raise_for_status()
                description_html = str(description_response.json().get("data") or "")
                # Compact HTML-to-text fallback.
                plain = re.sub(r"<[^>]+>", " ", description_html)
                plain = re.sub(r"\s+", " ", plain).strip()
                if plain:
                    description_text = plain
            except Exception:
                pass

            logo_url = str((details.get("logo") or {}).get("thumbnailUrl") or "").strip()
            gallery_urls = []
            if logo_url:
                gallery_urls.append(logo_url)
            screenshots = details.get("screenshots")
            if isinstance(screenshots, list):
                gallery_urls.extend(
                    str(item.get("thumbnailUrl") or item.get("url"))
                    for item in screenshots
                    if isinstance(item, dict) and (item.get("thumbnailUrl") or item.get("url"))
                )

            return {
                "id": str(details.get("id") or project_id),
                "slug": str(details.get("slug") or details.get("name") or ""),
                "provider": "curseforge",
                "kind": kind,
                "title": str(details.get("name") or "Unknown"),
                "description": self._translate_to_russian(description_text[:6000]),
                "summary": self._translate_to_russian(str(details.get("summary") or "")),
                "iconUrl": logo_url or None,
                "gallery": gallery_urls[:18],
                "categories": [str(category.get("name", "")) for category in details.get("categories", [])],
                "downloads": int(details.get("downloadCount") or 0),
                "followers": int(details.get("thumbsUpCount") or 0),
                "websiteUrl": str((details.get("links") or {}).get("websiteUrl") or ""),
            }

        raise ValueError("Неподдерживаемый провайдер")

    def _install_from_modrinth(
        self,
        project_id: str,
        kind: ContentKind,
        provider: ProviderType,
        game_version: str | None,
        loader: str,
    ) -> ContentInstallResponse:
        params: dict[str, Any] = {}
        if game_version:
            params["game_versions"] = json.dumps([game_version])
        if kind == "mod" and loader:
            params["loaders"] = json.dumps([loader])

        response = requests.get(
            f"{MODRINTH_BASE_URL}/project/{project_id}/version",
            params=params,
            headers=self._modrinth_headers(),
            timeout=25,
        )
        response.raise_for_status()
        versions = response.json()
        if not versions:
            raise ValueError("Не найдена совместимая версия контента")

        version_payload = versions[0]
        files = version_payload.get("files", [])
        if not files:
            raise ValueError("В выбранном контенте нет файла для загрузки")

        file_payload = next((item for item in files if item.get("primary")), files[0])
        source_url = file_payload.get("url")
        file_name = file_payload.get("filename")
        if not isinstance(source_url, str) or not isinstance(file_name, str):
            raise ValueError("Некорректные данные загрузки")

        installed_name, installed_path = self._install_downloaded_content(source_url, file_name, kind)

        return ContentInstallResponse(
            fileName=installed_name,
            installedTo=installed_path,
            sourceUrl=source_url,
            provider=provider,
            kind=kind,
        )

    def _install_from_curseforge(
        self,
        project_id: str,
        kind: ContentKind,
        game_version: str | None,
        loader: str,
    ) -> ContentInstallResponse:
        loader_map = {"forge": 1, "fabric": 4, "quilt": 5, "neoforge": 6}
        params: dict[str, Any] = {"pageSize": 50}
        if game_version:
            params["gameVersion"] = game_version
        if kind == "mod" and loader in loader_map:
            params["modLoaderType"] = loader_map[loader]

        files_response = requests.get(
            f"{CURSEFORGE_BASE_URL}/mods/{project_id}/files",
            params=params,
            headers=self._curseforge_headers(),
            timeout=25,
        )
        files_response.raise_for_status()
        files = files_response.json().get("data", [])
        if not files:
            raise ValueError("Для выбранного проекта CurseForge файлы не найдены")

        selected_file = files[0]
        file_id = selected_file.get("id")
        if not file_id:
            raise ValueError("Не найден идентификатор файла CurseForge")

        url_response = requests.get(
            f"{CURSEFORGE_BASE_URL}/mods/{project_id}/files/{file_id}/download-url",
            headers=self._curseforge_headers(),
            timeout=25,
        )
        url_response.raise_for_status()
        source_url = (url_response.json().get("data") or "").strip()
        if not source_url:
            raise ValueError("Недоступна ссылка загрузки CurseForge")

        file_name = str(selected_file.get("fileName") or f"{project_id}-{file_id}.jar")
        installed_name, installed_path = self._install_downloaded_content(source_url, file_name, kind)

        return ContentInstallResponse(
            fileName=installed_name,
            installedTo=installed_path,
            sourceUrl=source_url,
            provider="curseforge",
            kind=kind,
        )

    def install_content(self, payload: ContentInstallRequest) -> ContentInstallResponse:
        if payload.provider in {"modrinth", "rf"}:
            result = self._install_from_modrinth(
                project_id=payload.projectId,
                kind=payload.kind,
                provider=payload.provider,
                game_version=payload.gameVersion,
                loader=payload.loader,
            )
            self._mark_project_installed(
                provider=payload.provider,
                kind=payload.kind,
                project_id=payload.projectId,
                file_name=result.fileName,
                installed_to=result.installedTo,
                game_version=payload.gameVersion,
                loader=payload.loader,
            )
            return result

        if payload.provider == "curseforge":
            result = self._install_from_curseforge(
                project_id=payload.projectId,
                kind=payload.kind,
                game_version=payload.gameVersion,
                loader=payload.loader,
            )
            self._mark_project_installed(
                provider="curseforge",
                kind=payload.kind,
                project_id=payload.projectId,
                file_name=result.fileName,
                installed_to=result.installedTo,
                game_version=payload.gameVersion,
                loader=payload.loader,
            )
            return result

        raise ValueError("Неподдерживаемый провайдер")

    def search_mods(self, query: str, game_version: str | None = None, loader: str = "fabric", limit: int = 15) -> list[ModProject]:
        projects = self.search_content(query, "mod", "modrinth", game_version, loader, limit)
        return [
            ModProject(
                id=project.id,
                slug=project.slug,
                title=project.title,
                description=project.description,
                iconUrl=project.iconUrl,
                downloads=project.downloads,
                followers=project.followers,
                categories=project.categories,
                versions=project.versions,
            )
            for project in projects
        ]

    def install_mod(self, payload: ModInstallRequest) -> ModInstallResponse:
        response = self.install_content(
            ContentInstallRequest(
                projectId=payload.projectId,
                provider="modrinth",
                kind="mod",
                gameVersion=payload.gameVersion,
                loader=payload.loader,
            )
        )
        return ModInstallResponse(fileName=response.fileName, installedTo=response.installedTo, sourceUrl=response.sourceUrl)

    # ----- Backup / Restore -----
    def _sanitize_name(self, value: str, fallback: str = "item") -> str:
        cleaned = re.sub(r"[^a-zA-Z0-9._ -]+", "_", str(value or "").strip())
        cleaned = cleaned.strip(" .")
        return cleaned or fallback

    def _collect_worlds(self) -> list[Path]:
        saves = self.minecraft_directory / "saves"
        saves.mkdir(parents=True, exist_ok=True)
        worlds = [item for item in saves.iterdir() if item.is_dir() and not item.name.startswith(".")]
        worlds.sort(key=lambda item: item.name.lower())
        return worlds

    def _prune_world_backups(self) -> None:
        keep_count = int(self.settings.get("backupKeepCount") or 30)
        keep_count = max(5, min(keep_count, 500))
        backups = sorted(self.world_backups_root.glob("*.zip"), key=lambda item: item.stat().st_mtime, reverse=True)
        for stale in backups[keep_count:]:
            stale.unlink(missing_ok=True)

    def create_world_backup(self, world_name: str | None, source: str = "manual") -> dict[str, Any]:
        worlds = self._collect_worlds()
        if world_name:
            target = next((world for world in worlds if world.name == world_name), None)
            if target is None:
                raise ValueError("Мир не найден")
            selected_worlds = [target]
            backup_scope = self._sanitize_name(target.name, "world")
        else:
            if not worlds:
                raise ValueError("Нет миров для резервного копирования")
            selected_worlds = worlds
            backup_scope = "all-worlds"

        timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        backup_name = f"{backup_scope}-{timestamp}.zip"
        backup_path = self.world_backups_root / backup_name

        with zipfile.ZipFile(backup_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            for world in selected_worlds:
                for file_path in world.rglob("*"):
                    if not file_path.is_file():
                        continue
                    relative = file_path.relative_to(self.minecraft_directory / "saves")
                    archive.write(file_path, arcname=str(relative))

        self._prune_world_backups()
        return {
            "id": backup_path.name,
            "name": backup_path.name,
            "path": str(backup_path),
            "sizeBytes": backup_path.stat().st_size,
            "source": source,
            "createdAt": datetime.fromtimestamp(backup_path.stat().st_mtime, tz=timezone.utc).isoformat(),
            "worlds": [world.name for world in selected_worlds],
        }

    def list_world_backups(self) -> list[dict[str, Any]]:
        backups = sorted(self.world_backups_root.glob("*.zip"), key=lambda item: item.stat().st_mtime, reverse=True)
        output: list[dict[str, Any]] = []
        for item in backups:
            output.append(
                {
                    "id": item.name,
                    "name": item.name,
                    "path": str(item),
                    "sizeBytes": item.stat().st_size,
                    "createdAt": datetime.fromtimestamp(item.stat().st_mtime, tz=timezone.utc).isoformat(),
                }
            )
        return output

    def restore_world_backup(self, backup_id: str, target_world: str | None = None) -> dict[str, Any]:
        backup_file = self.world_backups_root / Path(backup_id).name
        if not backup_file.exists():
            raise ValueError("Резервная копия не найдена")

        saves_root = self.minecraft_directory / "saves"
        saves_root.mkdir(parents=True, exist_ok=True)

        temp_root = saves_root / f".restore-{uuid.uuid4().hex}"
        temp_root.mkdir(parents=True, exist_ok=True)
        restored_worlds: list[str] = []
        try:
            self._safe_extract_zip(backup_file, temp_root)
            worlds = [item for item in temp_root.iterdir() if item.is_dir()]
            if not worlds:
                raise ValueError("Архив резервной копии не содержит миров")

            for index, world_dir in enumerate(worlds):
                world_target_name = world_dir.name
                if target_world and index == 0:
                    world_target_name = self._sanitize_name(target_world, world_dir.name)
                final_world = saves_root / world_target_name
                if final_world.exists():
                    archive_old = saves_root / f"{world_target_name}.pre-restore-{datetime.now().strftime('%Y%m%d-%H%M%S')}"
                    shutil.move(str(final_world), str(archive_old))
                shutil.move(str(world_dir), str(final_world))
                restored_worlds.append(world_target_name)
        finally:
            shutil.rmtree(temp_root, ignore_errors=True)

        return {"ok": True, "backupId": backup_file.name, "restoredWorlds": restored_worlds}

    # ----- Logs -----
    def _candidate_log_paths(self) -> list[Path]:
        candidates: list[Path] = []
        patterns = [
            self.minecraft_directory / "logs" / "*.log",
            self.minecraft_directory / "crash-reports" / "*.txt",
            self.state_root / "*.log",
            self.state_root / "runtime" / "*.log",
        ]
        for pattern in patterns:
            candidates.extend(pattern.parent.glob(pattern.name))
        unique: dict[str, Path] = {}
        for item in candidates:
            if item.exists() and item.is_file():
                unique[str(item.resolve())] = item
        return sorted(unique.values(), key=lambda value: value.stat().st_mtime, reverse=True)

    def get_log_index(self) -> list[dict[str, Any]]:
        output: list[dict[str, Any]] = []
        for path in self._candidate_log_paths():
            try:
                stat = path.stat()
                output.append(
                    {
                        "id": path.name,
                        "name": path.name,
                        "path": str(path),
                        "sizeBytes": stat.st_size,
                        "modifiedAt": datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat(),
                    }
                )
            except OSError:
                continue
        return output

    def read_log_file(self, log_name: str, max_lines: int = 1200) -> dict[str, Any]:
        selected_name = Path(log_name).name
        target = next((path for path in self._candidate_log_paths() if path.name == selected_name), None)
        if target is None:
            raise ValueError("Лог не найден")

        try:
            text = target.read_text(encoding="utf-8", errors="ignore")
        except OSError as exc:
            raise ValueError(str(exc)) from exc

        lines = text.splitlines()
        if len(lines) > max_lines:
            lines = lines[-max_lines:]
        return {"name": target.name, "path": str(target), "lines": lines}

    def search_logs(self, query: str, level: str = "all", limit: int = 300) -> list[dict[str, Any]]:
        query_value = str(query or "").strip().lower()
        level_value = str(level or "all").strip().lower()
        matches: list[dict[str, Any]] = []

        def _level_of(line: str) -> str:
            lowered = line.lower()
            if " error " in lowered or lowered.startswith("error") or "exception" in lowered:
                return "error"
            if " warn " in lowered or lowered.startswith("warn"):
                return "warn"
            if " debug " in lowered or lowered.startswith("debug"):
                return "debug"
            return "info"

        for log_path in self._candidate_log_paths():
            try:
                lines = log_path.read_text(encoding="utf-8", errors="ignore").splitlines()
            except OSError:
                continue
            for line_index, line in enumerate(lines, start=1):
                parsed_level = _level_of(line)
                if level_value != "all" and parsed_level != level_value:
                    continue
                if query_value and query_value not in line.lower():
                    continue
                matches.append(
                    {
                        "file": log_path.name,
                        "line": line_index,
                        "level": parsed_level,
                        "message": line.strip(),
                    }
                )
                if len(matches) >= limit:
                    return matches
        return matches

    def build_support_report(self) -> dict[str, Any]:
        now = datetime.now().strftime("%Y%m%d-%H%M%S")
        reports_root = self.state_root / "support-reports"
        reports_root.mkdir(parents=True, exist_ok=True)
        report_path = reports_root / f"moonlauncher-support-{now}.txt"

        settings_safe = dict(self.settings)
        settings_safe["modrinthApiKey"] = "***"
        settings_safe["curseforgeApiKey"] = "***"
        settings_safe["proxyPassword"] = "***"
        settings_safe["modrinthApiKeyEncrypted"] = "***"
        settings_safe["curseforgeApiKeyEncrypted"] = "***"
        settings_safe["proxyPasswordEncrypted"] = "***"

        lines: list[str] = []
        lines.append("Moonlauncher Support Report")
        lines.append(f"Generated: {now_iso()}")
        lines.append("")
        lines.append("Settings:")
        lines.append(json.dumps(settings_safe, ensure_ascii=False, indent=2))
        lines.append("")
        lines.append("Running processes:")
        lines.append(json.dumps({key: {"versionId": value.get("versionId"), "profileId": value.get("profileId")} for key, value in self.running_processes.items()}, ensure_ascii=False, indent=2))
        lines.append("")
        lines.append("Recent log matches (error/warn, limit 200):")
        recent = self.search_logs(query="", level="all", limit=200)
        for entry in recent:
            if entry["level"] not in {"error", "warn"}:
                continue
            lines.append(f"[{entry['file']}:{entry['line']}] [{entry['level']}] {entry['message']}")

        report_text = "\n".join(lines)
        report_path.write_text(report_text, encoding="utf-8")
        return {"path": str(report_path), "name": report_path.name, "content": report_text}

    # ----- Monitor -----
    def _memory_snapshot(self) -> tuple[int, int]:
        if psutil:
            try:
                vm = psutil.virtual_memory()
                used_mb = int((vm.total - vm.available) / (1024 * 1024))
                total_mb = int(vm.total / (1024 * 1024))
                return used_mb, total_mb
            except Exception:
                pass
        return 0, 0

    def _cpu_percent(self) -> float:
        if psutil:
            try:
                return float(psutil.cpu_percent(interval=0.1))
            except Exception:
                pass
        try:
            result = subprocess.run(["wmic", "cpu", "get", "loadpercentage"], capture_output=True, text=True, timeout=4, check=False)
            output = result.stdout or ""
            match = re.search(r"(\d+)", output)
            if match:
                return float(int(match.group(1)))
        except Exception:
            pass
        return 0.0

    def get_monitor_snapshot(self) -> dict[str, Any]:
        ram_used_mb, ram_total_mb = self._memory_snapshot()
        java_process_mb = 0
        if psutil:
            try:
                for proc in psutil.process_iter(["name", "memory_info"]):
                    name = str(proc.info.get("name") or "").lower()
                    if "java" not in name:
                        continue
                    memory_info = proc.info.get("memory_info")
                    if memory_info:
                        java_process_mb += int(memory_info.rss / (1024 * 1024))
            except Exception:
                pass

        return {
            "timestamp": now_iso(),
            "cpuPercent": round(self._cpu_percent(), 1),
            "ramUsedMb": ram_used_mb,
            "ramTotalMb": ram_total_mb,
            "javaProcessMb": java_process_mb,
            "fps": None,
        }

    # ----- Mods Integrity / Conflicts -----
    def analyze_mod_conflicts(self, loader: str = "fabric") -> dict[str, Any]:
        mods_dir = self.minecraft_directory / "mods"
        mods_dir.mkdir(parents=True, exist_ok=True)
        jar_files = [item for item in mods_dir.iterdir() if item.is_file() and item.suffix.lower() in {".jar", ".zip"}]
        names = [item.stem.lower() for item in jar_files]

        duplicates: list[list[str]] = []
        by_base: dict[str, list[str]] = {}
        for item in jar_files:
            base = re.sub(r"[-_]?v?\d+(?:\.\d+){0,4}.*$", "", item.stem.lower())
            base = base.strip("-_ .") or item.stem.lower()
            by_base.setdefault(base, []).append(item.name)
        for values in by_base.values():
            if len(values) > 1:
                duplicates.append(values)

        loader_mismatches: list[str] = []
        for name in names:
            if loader == "fabric" and ("forge" in name or "neoforge" in name):
                loader_mismatches.append(name)
            if loader in {"forge", "neoforge"} and "fabric" in name:
                loader_mismatches.append(name)

        missing_libraries: list[str] = []
        if loader == "fabric":
            if not any("fabric-api" in name for name in names):
                missing_libraries.append("fabric-api")
            if any("sodium" in name for name in names) and not any("indium" in name for name in names):
                missing_libraries.append("indium (рекомендуется для совместимости)")
        if any("iris" in name for name in names) and not any("sodium" in name for name in names):
            missing_libraries.append("sodium (для Iris)")

        return {
            "scanned": len(jar_files),
            "duplicates": duplicates,
            "loaderMismatches": sorted(set(loader_mismatches)),
            "missingLibraries": sorted(set(missing_libraries)),
            "hasIssues": bool(duplicates or loader_mismatches or missing_libraries),
        }

    def _hash_file(self, path: Path) -> str:
        digest = hashlib.sha256()
        with path.open("rb") as file_handle:
            for chunk in iter(lambda: file_handle.read(1024 * 1024), b""):
                digest.update(chunk)
        return digest.hexdigest()

    def _integrity_targets(self) -> list[Path]:
        roots = [
            self.minecraft_directory / "mods",
            self.minecraft_directory / "resourcepacks",
            self.minecraft_directory / "shaderpacks",
            self.minecraft_directory / "versions",
        ]
        targets: list[Path] = []
        for root in roots:
            if not root.exists():
                continue
            for file_path in root.rglob("*"):
                if file_path.is_file():
                    targets.append(file_path)
        return targets

    def create_integrity_baseline(self) -> dict[str, Any]:
        baseline: dict[str, dict[str, Any]] = {}
        for file_path in self._integrity_targets():
            relative = str(file_path.relative_to(self.minecraft_directory))
            try:
                stat = file_path.stat()
                baseline[relative] = {
                    "size": stat.st_size,
                    "sha256": self._hash_file(file_path),
                }
            except OSError:
                continue
        payload = {"createdAt": now_iso(), "files": baseline}
        self._write_json(self.integrity_path, payload)
        return {"ok": True, "files": len(baseline), "createdAt": payload["createdAt"]}

    def verify_integrity(self) -> dict[str, Any]:
        baseline_payload = self._read_json(self.integrity_path, {})
        baseline_files = baseline_payload.get("files") if isinstance(baseline_payload, dict) else {}
        if not isinstance(baseline_files, dict) or not baseline_files:
            raise ValueError("Базовый снимок целостности не найден. Сначала создайте baseline.")

        current_map: dict[str, dict[str, Any]] = {}
        for file_path in self._integrity_targets():
            relative = str(file_path.relative_to(self.minecraft_directory))
            try:
                stat = file_path.stat()
                current_map[relative] = {"size": stat.st_size, "sha256": self._hash_file(file_path)}
            except OSError:
                continue

        missing = [path for path in baseline_files.keys() if path not in current_map]
        added = [path for path in current_map.keys() if path not in baseline_files]
        changed: list[str] = []
        for path, meta in baseline_files.items():
            current = current_map.get(path)
            if not current:
                continue
            baseline_hash = str(meta.get("sha256") or "")
            if baseline_hash and baseline_hash != str(current.get("sha256") or ""):
                changed.append(path)

        return {
            "baselineCreatedAt": str(baseline_payload.get("createdAt") or ""),
            "scanned": len(current_map),
            "missing": missing,
            "added": added,
            "changed": changed,
            "isClean": not (missing or added or changed),
        }

    # ----- Updater -----
    def _launcher_history(self) -> list[dict[str, Any]]:
        raw = self._read_json(self.launcher_history_path, [])
        return raw if isinstance(raw, list) else []

    def _save_launcher_history(self, history: list[dict[str, Any]]) -> None:
        self._write_json(self.launcher_history_path, history)

    def _current_launcher_version(self) -> str:
        return str(self.settings.get("launcherVersion") or "1.0.17")

    def get_launcher_update_status(self) -> dict[str, Any]:
        current_version = self._current_launcher_version()
        manifest_url = str(self.settings.get("updateManifestUrl") or "").strip()
        latest_version = current_version
        releases: list[dict[str, Any]] = []
        error = ""

        if manifest_url:
            try:
                response = requests.get(manifest_url, timeout=12)
                response.raise_for_status()
                payload = response.json()
                latest_version = str(payload.get("latestVersion") or current_version)
                raw_releases = payload.get("releases")
                if isinstance(raw_releases, list):
                    releases = [item for item in raw_releases if isinstance(item, dict)]
            except Exception as exc:
                error = str(exc)

        history = self._launcher_history()
        if not releases and history:
            releases = history
            latest_version = str(releases[0].get("version") or current_version)

        return {
            "currentVersion": current_version,
            "latestVersion": latest_version,
            "isUpdateAvailable": latest_version != current_version,
            "manifestUrl": manifest_url,
            "releases": releases[:20],
            "history": history[:20],
            "error": error,
        }

    def apply_launcher_update(self, target_version: str) -> dict[str, Any]:
        status = self.get_launcher_update_status()
        target = str(target_version or "").strip()
        if not target:
            target = str(status.get("latestVersion") or "")
        if not target:
            raise ValueError("Не удалось определить целевую версию")

        releases = status.get("releases") if isinstance(status, dict) else []
        selected_release = None
        if isinstance(releases, list):
            for item in releases:
                if not isinstance(item, dict):
                    continue
                if str(item.get("version") or "") == target:
                    selected_release = item
                    break
        if not isinstance(selected_release, dict):
            raise ValueError("Релиз для обновления не найден")

        download_url = str(selected_release.get("url") or selected_release.get("downloadUrl") or "").strip()
        if not download_url:
            raise ValueError("В релизе отсутствует ссылка на установщик")

        updates_root = self.state_root / "updates"
        updates_root.mkdir(parents=True, exist_ok=True)
        installer_name = self._sanitize_name(Path(download_url).name or f"moonlauncher-{target}.msi", f"moonlauncher-{target}.msi")
        installer_path = updates_root / installer_name
        self._download_file(download_url, installer_path)

        current_version = self._current_launcher_version()
        history = self._launcher_history()
        history.insert(
            0,
            {
                "version": current_version,
                "installedAt": now_iso(),
                "installerPath": str(installer_path),
                "notes": str(selected_release.get("notes") or ""),
            },
        )
        self._save_launcher_history(history[:50])
        self.settings["launcherVersion"] = target
        self._save_settings()

        if os.name == "nt":
            subprocess.Popen(["msiexec", "/i", str(installer_path)], cwd=str(installer_path.parent))

        return {"ok": True, "targetVersion": target, "installerPath": str(installer_path)}

    def rollback_launcher(self) -> dict[str, Any]:
        history = self._launcher_history()
        if not history:
            raise ValueError("История версий пуста")

        previous = history[0]
        installer_path = str(previous.get("installerPath") or "").strip()
        previous_version = str(previous.get("version") or "").strip()
        if not installer_path or not Path(installer_path).exists():
            raise ValueError("Установщик предыдущей версии не найден")

        self.settings["launcherVersion"] = previous_version or self._current_launcher_version()
        self._save_settings()

        if os.name == "nt":
            subprocess.Popen(["msiexec", "/i", installer_path], cwd=str(Path(installer_path).parent))
        return {"ok": True, "rollbackVersion": previous_version, "installerPath": installer_path}

    # ----- Java Profiles -----
    def get_java_profiles(self) -> dict[str, Any]:
        return {
            "useJavaProfiles": bool(self.settings.get("useJavaProfiles", True)),
            "java8Path": str(self.settings.get("java8Path") or ""),
            "java17Path": str(self.settings.get("java17Path") or ""),
            "java21Path": str(self.settings.get("java21Path") or ""),
        }

    def update_java_profiles(self, payload: dict[str, Any]) -> dict[str, Any]:
        allowed = {"useJavaProfiles", "java8Path", "java17Path", "java21Path"}
        for key in allowed:
            if key in payload:
                self.settings[key] = payload.get(key)
        self._save_settings()
        return self.get_java_profiles()

    # ----- Moon Packs / Custom Modpacks -----
    def get_moon_packs(self) -> list[dict[str, Any]]:
        return [
            {
                "id": "moon-optimize",
                "title": "Moon Optimize",
                "description": "Максимальная оптимизация FPS без лишних модов.",
                "mods": ["sodium", "lithium", "ferrite-core", "indium", "starlight"],
            },
            {
                "id": "moon-comfort",
                "title": "Moon Comfort",
                "description": "Комфортный геймплей и полезные функции без перегруза.",
                "mods": ["sodium", "lithium", "modmenu", "appleskin", "xaeros-minimap"],
            },
            {
                "id": "moon-duo",
                "title": "Moon Duo",
                "description": "Комфорт + оптимизация в одном наборе.",
                "mods": ["sodium", "lithium", "ferrite-core", "modmenu", "appleskin", "xaeros-minimap"],
            },
        ]

    def _modrinth_project_id_by_slug(self, slug: str) -> str:
        response = requests.get(f"{MODRINTH_BASE_URL}/project/{slug}", headers=self._modrinth_headers(), timeout=20)
        response.raise_for_status()
        payload = response.json()
        project_id = str(payload.get("id") or "").strip()
        if not project_id:
            raise ValueError(f"Project id not found for slug {slug}")
        return project_id

    def install_moon_pack(self, pack_id: str, game_version: str, loader: str = "fabric") -> dict[str, Any]:
        pack = next((item for item in self.get_moon_packs() if item["id"] == pack_id), None)
        if not pack:
            raise ValueError("Сборка не найдена")

        installed: list[str] = []
        skipped: list[str] = []
        for slug in pack["mods"]:
            try:
                project_id = self._modrinth_project_id_by_slug(slug)
                self._install_from_modrinth(project_id=project_id, kind="mod", provider="modrinth", game_version=game_version, loader=loader)
                installed.append(slug)
            except Exception:
                skipped.append(slug)
        return {"packId": pack_id, "installed": installed, "skipped": skipped, "ok": len(installed) > 0}

    def _allowed_pack_roots(self) -> list[str]:
        return ["mods", "resourcepacks", "shaderpacks", "saves", "config"]

    def _normalize_pack_roots(self, include_roots: list[str] | None, include_config: bool | None = None) -> list[str]:
        allowed = set(self._allowed_pack_roots())
        if include_roots:
            normalized = [str(item or "").strip().lower() for item in include_roots]
            selected = [item for item in normalized if item in allowed]
            if selected:
                return list(dict.fromkeys(selected))

        fallback = ["mods", "resourcepacks", "shaderpacks"]
        if include_config:
            fallback.append("config")
        return fallback

    def create_custom_pack(
        self,
        name: str,
        include_config: bool = True,
        include_roots: list[str] | None = None,
        pack_version: str | None = None,
        avatar_data_url: str | None = None,
    ) -> dict[str, Any]:
        pack_name = self._sanitize_name(name, "moon-pack")
        pack_dir = self.minecraft_directory / "modpacks"
        pack_dir.mkdir(parents=True, exist_ok=True)
        output_zip = pack_dir / f"{pack_name}-{datetime.now().strftime('%Y%m%d-%H%M%S')}.zip"

        selected_roots = self._normalize_pack_roots(include_roots, include_config=include_config)
        normalized_version = str(pack_version or "").strip()
        normalized_avatar = str(avatar_data_url or "").strip()
        if normalized_avatar and not normalized_avatar.startswith("data:image/"):
            normalized_avatar = ""

        with zipfile.ZipFile(output_zip, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            manifest = {
                "name": pack_name,
                "createdAt": now_iso(),
                "include": selected_roots,
                "version": normalized_version,
                "avatarDataUrl": normalized_avatar,
            }
            archive.writestr("moon-pack.json", json.dumps(manifest, ensure_ascii=False, indent=2))
            for root_name in selected_roots:
                root = self.minecraft_directory / root_name
                if not root.exists():
                    continue
                for item in root.rglob("*"):
                    if item.is_file():
                        archive.write(item, arcname=str(item.relative_to(self.minecraft_directory)))

        return {
            "ok": True,
            "name": output_zip.name,
            "path": str(output_zip),
            "include": selected_roots,
            "version": normalized_version,
            "avatarDataUrl": normalized_avatar,
        }

    def _read_pack_manifest(self, pack_file: Path) -> dict[str, Any]:
        try:
            with zipfile.ZipFile(pack_file, "r") as archive:
                if "moon-pack.json" not in archive.namelist():
                    return {}
                raw = archive.read("moon-pack.json")
            payload = json.loads(raw.decode("utf-8", errors="ignore"))
            if not isinstance(payload, dict):
                return {}
            return payload
        except Exception:
            return {}

    def list_custom_packs(self) -> list[dict[str, Any]]:
        pack_dir = self.minecraft_directory / "modpacks"
        pack_dir.mkdir(parents=True, exist_ok=True)
        packs = sorted(pack_dir.glob("*.zip"), key=lambda item: item.stat().st_mtime, reverse=True)
        entries: list[dict[str, Any]] = []
        for item in packs:
            manifest = self._read_pack_manifest(item)
            avatar_data_url = str(manifest.get("avatarDataUrl") or "").strip()
            if avatar_data_url and not avatar_data_url.startswith("data:image/"):
                avatar_data_url = ""
            entries.append(
                {
                    "id": item.name,
                    "name": str(manifest.get("name") or item.name),
                    "fileName": item.name,
                    "packVersion": str(manifest.get("version") or ""),
                    "avatarDataUrl": avatar_data_url,
                    "createdAt": str(manifest.get("createdAt") or ""),
                    "path": str(item),
                    "sizeBytes": item.stat().st_size,
                    "modifiedAt": datetime.fromtimestamp(item.stat().st_mtime, tz=timezone.utc).isoformat(),
                    "include": manifest.get("include") if isinstance(manifest.get("include"), list) else [],
                }
            )
        return entries

    def _resolve_pack_components(self, extracted_root: Path) -> list[str]:
        manifest_path = extracted_root / "moon-pack.json"
        if manifest_path.exists():
            try:
                payload = json.loads(manifest_path.read_text(encoding="utf-8"))
                include = payload.get("include")
                if isinstance(include, list):
                    normalized = self._normalize_pack_roots(include_roots=[str(item) for item in include], include_config=False)
                    if normalized:
                        return normalized
            except Exception:
                pass

        discovered: list[str] = []
        for root_name in self._allowed_pack_roots():
            if (extracted_root / root_name).exists():
                discovered.append(root_name)
        return discovered

    def apply_custom_pack(self, pack_id: str, wipe_existing: bool = False) -> dict[str, Any]:
        pack_dir = self.minecraft_directory / "modpacks"
        pack_file = pack_dir / Path(pack_id).name
        if not pack_file.exists() or not pack_file.is_file():
            raise ValueError("Файл сборки не найден")

        temp_root = self.state_root / "tmp" / f"pack-{uuid.uuid4().hex}"
        temp_root.mkdir(parents=True, exist_ok=True)
        applied_counts: dict[str, int] = {}

        try:
            self._safe_extract_zip(pack_file, temp_root)
            components = self._resolve_pack_components(temp_root)
            if not components:
                raise ValueError("Сборка не содержит поддерживаемых компонентов")

            for component in components:
                source_root = temp_root / component
                if not source_root.exists():
                    continue
                target_root = self.minecraft_directory / component
                target_root.mkdir(parents=True, exist_ok=True)
                applied_counts[component] = 0

                if wipe_existing:
                    for existing in target_root.iterdir():
                        if existing.is_dir():
                            shutil.rmtree(existing, ignore_errors=True)
                        else:
                            existing.unlink(missing_ok=True)

                for item in source_root.iterdir():
                    destination = target_root / item.name
                    if destination.exists():
                        if destination.is_dir():
                            shutil.rmtree(destination, ignore_errors=True)
                        else:
                            destination.unlink(missing_ok=True)
                    shutil.move(str(item), str(destination))
                    applied_counts[component] += 1
        finally:
            shutil.rmtree(temp_root, ignore_errors=True)

        total_items = sum(applied_counts.values())
        return {"ok": True, "packId": pack_file.name, "applied": applied_counts, "totalItems": total_items}

    def import_custom_pack(self, name: str, data_base64: str, apply_after_import: bool = False) -> dict[str, Any]:
        if not data_base64:
            raise ValueError("pack data is required")

        try:
            raw = base64.b64decode(data_base64, validate=True)
        except Exception as exc:
            raise ValueError("Неверный формат base64 для сборки") from exc

        if not raw:
            raise ValueError("Пустой файл сборки")

        pack_dir = self.minecraft_directory / "modpacks"
        pack_dir.mkdir(parents=True, exist_ok=True)
        safe_name = self._sanitize_name(name, "imported-pack")
        if not safe_name.lower().endswith(".zip"):
            safe_name = f"{safe_name}.zip"
        output = self._unique_path(pack_dir / safe_name)
        output.write_bytes(raw)

        result: dict[str, Any] = {"ok": True, "name": output.name, "path": str(output)}
        if apply_after_import:
            result["applyResult"] = self.apply_custom_pack(output.name, wipe_existing=False)
        return result

    # ----- Discord Rich Presence -----
    def _ensure_discord_rpc(self) -> None:
        if not bool(self.settings.get("discordRichPresence", False)):
            return
        if Presence is None:
            self.discord_last_error = "pypresence не установлен"
            return
        if self.discord_rpc_connected and self.discord_rpc is not None:
            return

        client_id = str(self.settings.get("discordClientId") or "").strip()
        if not client_id:
            self.discord_last_error = "Не задан discordClientId"
            return
        try:
            self.discord_rpc = Presence(client_id)
            self.discord_rpc.connect()
            self.discord_rpc_connected = True
            self.discord_last_error = ""
        except Exception as exc:
            self.discord_rpc_connected = False
            self.discord_last_error = str(exc)

    def _update_discord_presence(self, details: str, state: str) -> None:
        if not bool(self.settings.get("discordRichPresence", False)):
            return
        self._ensure_discord_rpc()
        if not self.discord_rpc_connected or self.discord_rpc is None:
            return
        try:
            self.discord_rpc.update(
                details=details[:120],
                state=state[:120],
                large_image="moon",
                large_text="Moonlauncher",
                start=int(time.time()),
            )
        except Exception as exc:
            self.discord_last_error = str(exc)
            self.discord_rpc_connected = False

    def _clear_discord_presence(self) -> None:
        if self.discord_rpc is None:
            return
        try:
            self.discord_rpc.clear()
        except Exception:
            pass

    def get_discord_presence_status(self) -> dict[str, Any]:
        return {
            "enabled": bool(self.settings.get("discordRichPresence", False)),
            "connected": bool(self.discord_rpc_connected),
            "error": self.discord_last_error,
            "clientId": str(self.settings.get("discordClientId") or ""),
        }

