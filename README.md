# Moonlauncher

## RU
Moonlauncher — локальный лаунчер Minecraft с современным UI, backend на FastAPI и desktop-хостом на C#.

### Лицензия
- Проект лицензирован под `GNU General Public License v3.0 (GPL-3.0)`.
- Полный текст лицензии: файл `LICENSE`.

### Возможности
- Установка и удаление версий Minecraft.
- Запуск игры из лаунчера.
- Работа с модами, ресурс-паками, шейдерами, картами и сборками.
- Поиск и рекомендации контента через `Modrinth`, `CurseForge`, `RF`.
- Игровая директория по умолчанию: `%USERPROFILE%\MoonMine`.
- Политика конфиденциальности:
: файл `PRIVACY_POLICY.md`
: API `GET /api/privacy-policy` и `GET /privacy-policy`

### Системные требования
- Кратко: Windows 10/11 x64, WebView2 Runtime, 4 GB RAM минимум.
- Подробно:
: файл `SYSTEM_REQUIREMENTS.md`

### Быстрый запуск (dev)
```powershell
.\moonlaunchr_loader.ps1
```

### Desktop режим
```powershell
.\moonlaunchr_loader.ps1 -DesktopMode
```

### Сборка релиза (EXE payload)
```powershell
.\installer\prepare_release.ps1 -Configuration Release
```
Результат: `installer\release\moonlauncher`

### Сборка MSI
```powershell
.\installer\build_msi.ps1 -Configuration Release -Version 1.0.22
```
Результат: `installer\dist\moonlauncher-1.0.22-x64.msi`

### Java Agent (опционально)
```powershell
cd .\java-agent
mvn -DskipTests package
```

---

## EN
Moonlauncher is a local Minecraft launcher with a modern UI, FastAPI backend, and a C# desktop host.

### License
- This project is licensed under `GNU General Public License v3.0 (GPL-3.0)`.
- Full license text: `LICENSE`.

### Features
- Install/uninstall Minecraft versions.
- Launch the game directly from the launcher.
- Manage mods, resource packs, shaders, maps, and modpacks.
- Search and recommendations via `Modrinth`, `CurseForge`, `RF`.
- Default game directory: `%USERPROFILE%\MoonMine`.
- Privacy policy:
: file `PRIVACY_POLICY.md`
: API `GET /api/privacy-policy` and `GET /privacy-policy`

### Quick start (dev)
```powershell
.\moonlaunchr_loader.ps1
```

### Desktop mode
```powershell
.\moonlaunchr_loader.ps1 -DesktopMode
```

### Build release (EXE payload)
```powershell
.\installer\prepare_release.ps1 -Configuration Release
```
Output: `installer\release\moonlauncher`

### Build MSI
```powershell
.\installer\build_msi.ps1 -Configuration Release -Version 1.0.26
```
Output: `installer\dist\moonlauncher-1.0.26-x64.msi`

### System requirements
- Short: Windows 10/11 x64, WebView2 Runtime, 4 GB RAM minimum.
- Full details:
: file `SYSTEM_REQUIREMENTS.md`

### Java Agent (optional)
```powershell
cd .\java-agent
mvn -DskipTests package
```
