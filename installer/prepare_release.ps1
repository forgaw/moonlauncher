param(
  [string]$Configuration = "Release"
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$releaseRoot = Join-Path $PSScriptRoot "release\\moonlauncher"
$hostProject = Join-Path $projectRoot "launcher-host\\Moonlauncher.Host\\Moonlauncher.Host.csproj"
$securityProject = Join-Path $projectRoot "security\\Moonlauncher.SecurityBroker\\Moonlauncher.SecurityBroker.csproj"

function Resolve-Tool {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [string[]]$Fallbacks = @()
  )

  $cmd = Get-Command $Name -ErrorAction SilentlyContinue
  if ($cmd) {
    return $cmd.Source
  }

  foreach ($candidate in $Fallbacks) {
    if ($candidate -and (Test-Path $candidate)) {
      return $candidate
    }
  }

  throw "Required tool '$Name' was not found."
}

$npmCmd = Resolve-Tool -Name "npm.cmd" -Fallbacks @("C:\\Program Files\\nodejs\\npm.cmd")
$dotnetCmd = Resolve-Tool -Name "dotnet" -Fallbacks @("C:\\Program Files\\dotnet\\dotnet.exe")

Write-Host "Preparing release folder..."
if (Test-Path $releaseRoot) {
  try {
    Remove-Item -LiteralPath $releaseRoot -Recurse -Force -ErrorAction Stop
  }
  catch {
    throw "Failed to clean release directory '$releaseRoot'. Close running moonlauncher/backend processes and retry."
  }
}
New-Item -ItemType Directory -Path $releaseRoot | Out-Null

Write-Host "Building frontend..."
Push-Location $projectRoot
& $npmCmd run build
Pop-Location

Write-Host "Publishing launcher host EXE..."
& $dotnetCmd publish $hostProject -c $Configuration -r win-x64 --self-contained true -p:PublishSingleFile=false

Write-Host "Publishing security broker..."
& $dotnetCmd publish $securityProject -c $Configuration -r win-x64 --self-contained true -p:PublishSingleFile=true

$hostPublish = Join-Path $projectRoot "launcher-host\\Moonlauncher.Host\\bin\\$Configuration\\net8.0-windows\\win-x64\\publish"
$securityPublish = Join-Path $projectRoot "security\\Moonlauncher.SecurityBroker\\bin\\$Configuration\\net8.0-windows\\win-x64\\publish"

Write-Host "Copying runtime files..."
Copy-Item -Recurse -Force (Join-Path $projectRoot "build") (Join-Path $releaseRoot "build")
Copy-Item -Recurse -Force (Join-Path $projectRoot "backend") (Join-Path $releaseRoot "backend")
if (Test-Path (Join-Path $releaseRoot "backend\\.venv")) {
  Remove-Item -Recurse -Force (Join-Path $releaseRoot "backend\\.venv")
}
Copy-Item -Force (Join-Path $projectRoot "moonlaunchr_loader.ps1") (Join-Path $releaseRoot "moonlaunchr_loader.ps1")
Copy-Item -Force (Join-Path $projectRoot "PRIVACY_POLICY.md") (Join-Path $releaseRoot "PRIVACY_POLICY.md")
Copy-Item -Force (Join-Path $projectRoot "backend\\requirements.txt") (Join-Path $releaseRoot "backend\\requirements.txt")
Copy-Item -Recurse -Force (Join-Path $hostPublish "*") $releaseRoot
if (-not (Test-Path (Join-Path $releaseRoot "moonlauncher.exe"))) {
  throw "moonlauncher host files were not copied correctly."
}

New-Item -ItemType Directory -Force -Path (Join-Path $releaseRoot "security") | Out-Null
Copy-Item -Recurse -Force $securityPublish (Join-Path $releaseRoot "security\\Moonlauncher.SecurityBroker")

$backendReleasePath = Join-Path $releaseRoot "backend"
Get-ChildItem -Path $backendReleasePath -Recurse -Directory -Filter "__pycache__" -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force
Get-ChildItem -Path $backendReleasePath -Recurse -File -Include "*.pyc", "*.pyo" -ErrorAction SilentlyContinue | Remove-Item -Force

Write-Host "Release is ready: $releaseRoot"
