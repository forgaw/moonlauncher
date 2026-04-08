param(
  [switch]$SkipInstall,
  [switch]$DesktopMode,
  [switch]$HostMode
)

$ErrorActionPreference = "Stop"

if ($HostMode -and -not $DesktopMode) {
  throw "HostMode requires DesktopMode."
}

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendPath = Join-Path $root "backend"
$userHomePath = [Environment]::GetFolderPath("UserProfile")
$launcherDataRoot = Join-Path $userHomePath "Moonlauncher"
$runtimeRoot = Join-Path $launcherDataRoot "runtime"
$venvPath = Join-Path $runtimeRoot ".venv"
$venvPython = Join-Path $venvPath "Scripts\\python.exe"
$requirementsPath = Join-Path $backendPath "requirements.txt"
$requirementsStampPath = Join-Path $runtimeRoot "requirements.sha256"
$frontendBuildPath = Join-Path $root "build"

New-Item -ItemType Directory -Force -Path $runtimeRoot | Out-Null

function Write-Status {
  param([string]$Message)
  if (-not $HostMode) {
    Write-Host $Message
  }
}

function Ensure-Command {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [string]$WingetId
  )

  $cmd = Get-Command $Name -ErrorAction SilentlyContinue
  if ($cmd) { return }

  if (-not $WingetId) {
    throw "Required command '$Name' is missing."
  }

  Write-Status "Installing $Name..."
  winget install --id $WingetId --source winget --silent --accept-source-agreements --accept-package-agreements --disable-interactivity
}

function Resolve-Executable {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [string[]]$FallbackPaths = @()
  )

  $cmd = Get-Command $Name -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }

  foreach ($path in $FallbackPaths) {
    if (Test-Path $path) { return $path }
  }

  return $null
}

function Get-FreeTcpPort {
  $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
  $listener.Start()
  $port = ([System.Net.IPEndPoint]$listener.LocalEndpoint).Port
  $listener.Stop()
  return $port
}

Ensure-Command -Name "python" -WingetId "Python.Python.3.12"

$pythonExe = Resolve-Executable -Name "python" -FallbackPaths @(
  "$env:LOCALAPPDATA\Programs\Python\Python312\python.exe",
  "$env:LOCALAPPDATA\Programs\Python\Python311\python.exe"
)

if (-not $pythonExe) {
  throw "Python executable was not found after installation."
}

if (-not (Test-Path $venvPath)) {
  Write-Status "Creating Python virtual environment..."
  & $pythonExe -m venv $venvPath
}

if (-not (Test-Path $venvPython)) {
  throw "Failed to initialize Python environment at '$venvPath'."
}

if (-not $SkipInstall) {
  if (-not (Test-Path $requirementsPath)) {
    throw "Backend requirements file not found: $requirementsPath"
  }

  $requirementsHash = (Get-FileHash -Path $requirementsPath -Algorithm SHA256).Hash
  $needsInstall = $true
  if (Test-Path $requirementsStampPath) {
    $savedHash = (Get-Content -Path $requirementsStampPath -Raw).Trim()
    if ($savedHash -eq $requirementsHash) {
      $needsInstall = $false
    }
  }

  if ($needsInstall) {
    Write-Status "Installing backend dependencies..."
    & $venvPython -m pip install --upgrade pip
    & $venvPython -m pip install -r $requirementsPath
    Set-Content -Path $requirementsStampPath -Value $requirementsHash -Encoding ASCII
  } else {
    Write-Status "Backend dependencies are already installed."
  }
}

if ($DesktopMode) {
  if (-not (Test-Path $frontendBuildPath)) {
    Ensure-Command -Name "node" -WingetId "OpenJS.NodeJS.LTS"
    $npmCmd = Resolve-Executable -Name "npm" -FallbackPaths @("C:\Program Files\nodejs\npm.cmd")
    if (-not $npmCmd) {
      throw "npm is required to build frontend assets."
    }

    Write-Status "Frontend build was not found. Building..."
    Push-Location $root
    & $npmCmd install
    & $npmCmd run build
    Pop-Location
  }

  $backendScript = Join-Path $backendPath "run.py"
  if (-not (Test-Path $backendScript)) {
    throw "Backend entrypoint was not found: $backendScript"
  }

  $backendPort = 8000
  if ($HostMode) {
    $backendPort = Get-FreeTcpPort
  }

  Write-Status "Starting backend on http://127.0.0.1:$backendPort ..."
  $env:MOONLAUNCHR_PORT = "$backendPort"
  $backendProcess = Start-Process -FilePath $venvPython -ArgumentList "`"$backendScript`"" -WorkingDirectory $backendPath -WindowStyle Hidden -PassThru
  Remove-Item Env:MOONLAUNCHR_PORT -ErrorAction SilentlyContinue

  $healthy = $false
  for ($i = 0; $i -lt 40; $i++) {
    Start-Sleep -Milliseconds 500
    try {
      $result = Invoke-RestMethod "http://127.0.0.1:$backendPort/health" -TimeoutSec 2
      if ($result.ok -eq $true) {
        $healthy = $true
        break
      }
    } catch {
    }
  }

  if (-not $healthy) {
    if ($backendProcess -and -not $backendProcess.HasExited) {
      Stop-Process -Id $backendProcess.Id -Force -ErrorAction SilentlyContinue
    }
    throw "Backend failed to start in Desktop mode."
  }

  if ($HostMode) {
    $payload = @{
      ok  = $true
      url = "http://127.0.0.1:$backendPort"
      pid = $backendProcess.Id
    }
    Write-Output ("MOONLAUNCHER_HOST_RESULT:" + ($payload | ConvertTo-Json -Compress))
    exit 0
  }

  Write-Status "Opening launcher UI..."
  Start-Process "http://127.0.0.1:$backendPort"
  Write-Status "moonlauncher started in Desktop mode."
  exit 0
}

Ensure-Command -Name "node" -WingetId "OpenJS.NodeJS.LTS"
$npmCmd = Resolve-Executable -Name "npm" -FallbackPaths @("C:\Program Files\nodejs\npm.cmd")
if (-not $npmCmd) {
  throw "Node.js executable was not found after installation."
}

if (-not $SkipInstall) {
  Write-Status "Installing frontend dependencies..."
  Push-Location $root
  & $npmCmd install
  Pop-Location
}

$backendScript = Join-Path $backendPath "run.py"
$backendCmd = "`"$venvPython`" `"$backendScript`""
$frontendCmd = "cd `"$root`"; `$env:Path = 'C:\Program Files\nodejs;' + `$env:Path; `"$npmCmd`" run dev"

Write-Status "Starting backend on http://127.0.0.1:8000 ..."
Start-Process powershell -ArgumentList "-NoExit", "-Command", $backendCmd -WorkingDirectory $backendPath

Write-Status "Starting frontend on http://127.0.0.1:3000 ..."
Start-Process powershell -ArgumentList "-NoExit", "-Command", $frontendCmd -WorkingDirectory $root

Write-Status "moonlauncher started."
