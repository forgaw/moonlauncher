from __future__ import annotations

from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, PlainTextResponse

from .models import ContentInstallRequest, LaunchOptions, ModInstallRequest
from .service import MoonlaunchrService

app = FastAPI(title="moonlauncher backend", version="1.1.0")
service = MoonlaunchrService()

project_root = Path(__file__).resolve().parents[2]
frontend_build = project_root / "build"
privacy_policy_path = project_root / "PRIVACY_POLICY.md"

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, Any]:
    return {"ok": True}


@app.get("/api/profiles")
def get_profiles() -> list[dict[str, Any]]:
    return [profile.model_dump() for profile in service.get_profiles()]


@app.get("/api/profiles/presence")
def get_profiles_presence() -> dict[str, dict[str, Any]]:
    return service.get_profile_presence()


@app.post("/api/profiles")
def create_profile(payload: dict[str, Any]) -> dict[str, Any]:
    return service.create_profile(payload).model_dump()


@app.put("/api/profiles/{profile_id}")
def update_profile(profile_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    try:
        return service.update_profile(profile_id, payload).model_dump()
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.delete("/api/profiles/{profile_id}")
def delete_profile(profile_id: str) -> dict[str, bool]:
    try:
        service.delete_profile(profile_id)
        return {"ok": True}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/api/elyby/profile/{nickname}")
def elyby_profile(nickname: str) -> dict[str, Any]:
    try:
        return service.get_ely_skin_profile(nickname)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/api/elyby/link")
def link_elyby(payload: dict[str, Any]) -> dict[str, Any]:
    profile_id = str(payload.get("profileId") or "").strip()
    nickname = str(payload.get("nickname") or "").strip()
    sync_name = bool(payload.get("syncName", True))
    if not profile_id:
        raise HTTPException(status_code=400, detail="profileId is required")
    if not nickname:
        raise HTTPException(status_code=400, detail="nickname is required")
    try:
        profile = service.link_profile_ely(profile_id=profile_id, nickname=nickname, sync_name=sync_name)
        return profile.model_dump()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/api/friends")
def get_friends() -> list[dict[str, Any]]:
    return service.get_friends()


@app.post("/api/friends")
def add_friend(payload: dict[str, Any]) -> dict[str, Any]:
    try:
        return service.add_friend(payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.delete("/api/friends/{friend_id}")
def delete_friend(friend_id: str) -> dict[str, bool]:
    try:
        service.remove_friend(friend_id)
        return {"ok": True}
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/api/friends/radmin-helper")
def create_radmin_helper(payload: dict[str, Any]) -> dict[str, Any]:
    try:
        return service.create_radmin_helper(payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/api/radmin/status")
def radmin_status() -> dict[str, Any]:
    return service.get_radmin_status()


@app.post("/api/radmin/install")
def radmin_install() -> dict[str, Any]:
    try:
        return service.install_radmin()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/api/radmin/launch")
def radmin_launch() -> dict[str, bool]:
    try:
        service.launch_radmin()
        return {"ok": True}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/api/coop/server/status")
def coop_server_status() -> dict[str, Any]:
    return service.get_coop_server_status()


@app.post("/api/coop/server/start")
def coop_server_start(payload: dict[str, Any]) -> dict[str, Any]:
    try:
        return service.start_coop_server(payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/api/coop/session/start")
def coop_session_start(payload: dict[str, Any]) -> dict[str, Any]:
    try:
        return service.start_coop_session(payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/api/coop/server/stop")
def coop_server_stop() -> dict[str, bool]:
    service.stop_coop_server()
    return {"ok": True}


@app.get("/api/updates/status")
def updates_status() -> dict[str, Any]:
    return service.get_launcher_update_status()


@app.post("/api/updates/apply")
def updates_apply(payload: dict[str, Any]) -> dict[str, Any]:
    try:
        target_version = str(payload.get("targetVersion") or "").strip()
        return service.apply_launcher_update(target_version)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/api/updates/rollback")
def updates_rollback() -> dict[str, Any]:
    try:
        return service.rollback_launcher()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/api/backups/worlds")
def backups_worlds_list() -> list[dict[str, Any]]:
    return service.list_world_backups()


@app.post("/api/backups/worlds")
def backups_worlds_create(payload: dict[str, Any]) -> dict[str, Any]:
    try:
        world_name = payload.get("worldName")
        world_name_value = str(world_name).strip() if isinstance(world_name, str) else None
        return service.create_world_backup(world_name=world_name_value, source="manual")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/api/backups/worlds/{backup_id}/restore")
def backups_worlds_restore(backup_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    try:
        target_world = payload.get("targetWorld")
        target_world_value = str(target_world).strip() if isinstance(target_world, str) else None
        return service.restore_world_backup(backup_id=backup_id, target_world=target_world_value)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/api/mods/conflicts")
def mods_conflicts(loader: str = Query(default="fabric")) -> dict[str, Any]:
    try:
        return service.analyze_mod_conflicts(loader=loader)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/api/logs/index")
def logs_index() -> list[dict[str, Any]]:
    return service.get_log_index()


@app.get("/api/logs/read/{log_name}")
def logs_read(log_name: str, maxLines: int = Query(default=1200, ge=50, le=5000)) -> dict[str, Any]:
    try:
        return service.read_log_file(log_name=log_name, max_lines=maxLines)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/api/logs/search")
def logs_search(
    query: str = Query(default=""),
    level: str = Query(default="all"),
    limit: int = Query(default=300, ge=20, le=1000),
) -> list[dict[str, Any]]:
    return service.search_logs(query=query, level=level, limit=limit)


@app.post("/api/logs/support-report")
def logs_support_report() -> dict[str, Any]:
    try:
        return service.build_support_report()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/api/monitor/system")
def monitor_system() -> dict[str, Any]:
    return service.get_monitor_snapshot()


@app.post("/api/integrity/baseline")
def integrity_baseline() -> dict[str, Any]:
    try:
        return service.create_integrity_baseline()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/api/integrity/verify")
def integrity_verify() -> dict[str, Any]:
    try:
        return service.verify_integrity()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/api/java/profiles")
def java_profiles() -> dict[str, Any]:
    return service.get_java_profiles()


@app.put("/api/java/profiles")
def java_profiles_update(payload: dict[str, Any]) -> dict[str, Any]:
    return service.update_java_profiles(payload)


@app.get("/api/discord/status")
def discord_status() -> dict[str, Any]:
    return service.get_discord_presence_status()


@app.get("/api/modpacks/moon")
def moon_modpacks() -> list[dict[str, Any]]:
    return service.get_moon_packs()


@app.post("/api/modpacks/moon/{pack_id}/install")
def moon_modpacks_install(pack_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    try:
        game_version = str(payload.get("gameVersion") or "").strip()
        loader = str(payload.get("loader") or "fabric").strip() or "fabric"
        if not game_version:
            raise ValueError("gameVersion is required")
        return service.install_moon_pack(pack_id=pack_id, game_version=game_version, loader=loader)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/api/modpacks/custom")
def custom_modpacks_list() -> list[dict[str, Any]]:
    return service.list_custom_packs()


@app.post("/api/modpacks/custom")
def custom_modpacks_create(payload: dict[str, Any]) -> dict[str, Any]:
    try:
        name = str(payload.get("name") or "").strip()
        include_config = bool(payload.get("includeConfig", True))
        include_roots_raw = payload.get("includeRoots")
        include_roots = [str(item) for item in include_roots_raw] if isinstance(include_roots_raw, list) else None
        pack_version = str(payload.get("packVersion") or "").strip() or None
        avatar_data_url = str(payload.get("avatarDataUrl") or "").strip() or None
        if not name:
            raise ValueError("name is required")
        return service.create_custom_pack(
            name=name,
            include_config=include_config,
            include_roots=include_roots,
            pack_version=pack_version,
            avatar_data_url=avatar_data_url,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/api/modpacks/custom/{pack_id}/apply")
def custom_modpacks_apply(pack_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    try:
        wipe_existing = bool(payload.get("wipeExisting", False))
        return service.apply_custom_pack(pack_id=pack_id, wipe_existing=wipe_existing)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/api/modpacks/import")
def custom_modpacks_import(payload: dict[str, Any]) -> dict[str, Any]:
    try:
        name = str(payload.get("name") or "").strip()
        data_base64 = str(payload.get("dataBase64") or "").strip()
        apply_after_import = bool(payload.get("applyAfterImport", False))
        if not name:
            raise ValueError("name is required")
        if not data_base64:
            raise ValueError("dataBase64 is required")
        return service.import_custom_pack(name=name, data_base64=data_base64, apply_after_import=apply_after_import)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/api/versions")
def get_versions() -> list[dict[str, Any]]:
    return [version.model_dump() for version in service.get_versions()]


@app.post("/api/versions/{version_id}/install")
def install_version(version_id: str) -> dict[str, Any]:
    try:
        task = service.start_install_version(version_id)
        return task.model_dump()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/api/versions/install/{task_id}/status")
def install_status(task_id: str) -> dict[str, Any]:
    try:
        return service.get_install_task(task_id).model_dump()
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.delete("/api/versions/{version_id}/uninstall")
def uninstall_version(version_id: str) -> dict[str, bool]:
    try:
        service.uninstall_version(version_id)
        return {"ok": True}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/api/launch")
def launch_game(payload: LaunchOptions) -> dict[str, Any]:
    try:
        return service.launch_game(payload).model_dump()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail="Не удалось запустить игру. Проверьте установленную Java и файлы выбранной версии.",
        ) from exc


@app.get("/api/launch/{process_id}/status")
def game_status(process_id: str) -> dict[str, Any]:
    return service.get_game_status(process_id).model_dump()


@app.post("/api/launch/{process_id}/stop")
def stop_game(process_id: str) -> dict[str, bool]:
    service.stop_game(process_id)
    return {"ok": True}


@app.get("/api/player/stats")
def get_player_stats() -> dict[str, Any]:
    return service.get_player_stats()


@app.get("/api/server/status")
def get_server_status() -> dict[str, Any]:
    return service.get_server_status().model_dump()


@app.get("/api/news")
def get_news() -> list[dict[str, Any]]:
    return [article.model_dump() for article in service.get_news()]


@app.get("/api/settings")
def get_settings() -> dict[str, Any]:
    return service.get_settings()


@app.put("/api/settings")
def update_settings(payload: dict[str, Any]) -> dict[str, Any]:
    return service.update_settings(payload)


@app.get("/api/folders")
def get_folders() -> dict[str, str]:
    return service.get_directory_paths()


@app.post("/api/folders/open/{target}")
def open_folder(target: str) -> dict[str, str]:
    try:
        opened = service.open_directory(target)
        return {"path": opened}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/api/validate/{version_id}")
def validate_version(version_id: str) -> dict[str, Any]:
    return service.validate_version(version_id).model_dump()


@app.get("/api/mods/search")
def search_mods(
    query: str = Query(""),
    gameVersion: str | None = Query(default=None),
    loader: str = Query(default="fabric"),
    limit: int = Query(default=15, ge=1, le=50),
) -> list[dict[str, Any]]:
    try:
        mods = service.search_mods(query=query, game_version=gameVersion, loader=loader, limit=limit)
        return [project.model_dump() for project in mods]
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/api/mods/install")
def install_mod(payload: ModInstallRequest) -> dict[str, Any]:
    try:
        return service.install_mod(payload).model_dump()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/api/content/search")
def search_content(
    query: str = Query(""),
    kind: str = Query(default="mod"),
    provider: str = Query(default="modrinth"),
    gameVersion: str | None = Query(default=None),
    loader: str = Query(default="fabric"),
    limit: int = Query(default=15, ge=1, le=120),
) -> list[dict[str, Any]]:
    try:
        projects = service.search_content(
            query=query,
            kind=kind,  # type: ignore[arg-type]
            provider=provider,  # type: ignore[arg-type]
            game_version=gameVersion,
            loader=loader,
            limit=limit,
        )
        return [project.model_dump() for project in projects]
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/api/content/recommendations")
def content_recommendations(
    kind: str = Query(default="mod"),
    provider: str = Query(default="modrinth"),
    gameVersion: str | None = Query(default=None),
    loader: str = Query(default="fabric"),
    limit: int = Query(default=12, ge=1, le=120),
) -> list[dict[str, Any]]:
    try:
        projects = service.get_recommended_content(
            kind=kind,  # type: ignore[arg-type]
            provider=provider,
            game_version=gameVersion,
            loader=loader,
            limit=limit,
        )
        return [project.model_dump() for project in projects]
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/api/content/details")
def content_details(
    projectId: str = Query(...),
    provider: str = Query(default="modrinth"),
    kind: str = Query(default="mod"),
) -> dict[str, Any]:
    try:
        return service.get_content_details(
            project_id=projectId,
            provider=provider,
            kind=kind,  # type: ignore[arg-type]
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/api/content/installed")
def installed_content(kind: str = Query(default="mod")) -> list[dict[str, Any]]:
    try:
        return service.get_installed_content(kind=kind)  # type: ignore[arg-type]
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.delete("/api/content/installed/{kind}/{entry_name}")
def delete_installed_content(kind: str, entry_name: str) -> dict[str, Any]:
    try:
        deleted = service.remove_installed_content(
            kind=kind,  # type: ignore[arg-type]
            entry_name=entry_name,
        )
        return {"ok": True, "deleted": deleted}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/api/content/install")
def install_content(payload: ContentInstallRequest) -> dict[str, Any]:
    try:
        return service.install_content(payload).model_dump()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/api/privacy-policy")
def privacy_policy() -> dict[str, Any]:
    if not privacy_policy_path.exists():
        return {"title": "Политика конфиденциальности", "content": "Файл политики не найден."}
    return {"title": "Политика конфиденциальности", "content": privacy_policy_path.read_text(encoding="utf-8")}


@app.get("/privacy-policy", response_class=PlainTextResponse)
def privacy_policy_plain() -> str:
    if not privacy_policy_path.exists():
        return "Файл политики не найден."
    return privacy_policy_path.read_text(encoding="utf-8")


@app.get("/")
def serve_index() -> FileResponse:
    if not frontend_build.exists():
        raise HTTPException(status_code=404, detail="Сборка фронтенда не найдена")
    return FileResponse(frontend_build / "index.html")


@app.get("/{full_path:path}")
def serve_frontend_assets(full_path: str) -> FileResponse:
    if full_path.startswith("api/") or full_path.startswith("health"):
        raise HTTPException(status_code=404, detail="Not found")

    if frontend_build.exists():
        target = frontend_build / full_path
        if target.exists() and target.is_file():
            return FileResponse(target)
        return FileResponse(frontend_build / "index.html")

    raise HTTPException(status_code=404, detail="Сборка фронтенда не найдена")
