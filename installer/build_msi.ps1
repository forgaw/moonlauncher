param(
  [string]$Configuration = "Release",
  [string]$Version = "1.0.17"
)

$ErrorActionPreference = "Stop"

$installerRoot = $PSScriptRoot
$prepareScript = Join-Path $installerRoot "prepare_release.ps1"
$wxsPath = Join-Path $installerRoot "MoonlauncherInstaller.wxs"
$releaseRoot = Join-Path $installerRoot "release\\moonlauncher"
$distRoot = Join-Path $installerRoot "dist"

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

$wixCmd = Resolve-Tool -Name "wix.exe" -Fallbacks @(
  "C:\\Program Files\\WiX Toolset v6.0\\bin\\wix.exe"
)

if (-not (Test-Path $prepareScript)) {
  throw "prepare_release.ps1 not found: $prepareScript"
}

if (-not (Test-Path $wxsPath)) {
  throw "MoonlauncherInstaller.wxs not found: $wxsPath"
}

Write-Host "Preparing release payload..."
& powershell -ExecutionPolicy Bypass -File $prepareScript -Configuration $Configuration

if (-not (Test-Path $releaseRoot)) {
  throw "Release root not found: $releaseRoot"
}

if (-not (Test-Path (Join-Path $releaseRoot "moonlauncher.exe"))) {
  throw "moonlauncher.exe was not found in release payload."
}

New-Item -ItemType Directory -Path $distRoot -Force | Out-Null
$oldArtifacts = Get-ChildItem -Path $distRoot -File -ErrorAction SilentlyContinue | Where-Object {
  $_.Name -like "moonlauncher-*-x64.msi" -or $_.Name -like "moonlauncher-*-x64.wixpdb"
}
foreach ($artifact in $oldArtifacts) {
  Remove-Item -Force $artifact.FullName
}

$outputMsi = Join-Path $distRoot "moonlauncher-$Version-x64.msi"
if (Test-Path $outputMsi) {
  Remove-Item -Force $outputMsi
}

Write-Host "Building MSI..."
& $wixCmd build $wxsPath `
  -arch x64 `
  -culture ru-ru `
  -ext WixToolset.UI.wixext `
  -b $installerRoot `
  -d "ReleaseDir=$releaseRoot" `
  -d "ProductVersion=$Version" `
  -o $outputMsi

if (-not (Test-Path $outputMsi)) {
  throw "MSI build failed. Output file was not created."
}

$wixPdbPath = [System.IO.Path]::ChangeExtension($outputMsi, ".wixpdb")
if (Test-Path $wixPdbPath) {
  Remove-Item -Force $wixPdbPath
}

Write-Host "Writing update manifest and loader script..."
$manifestPath = Join-Path $distRoot "update-manifest.json"
$manifestPayload = @{
  latestVersion = $Version
  releases = @(
    @{
      version = $Version
      notes = "Moonlauncher $Version"
      installerPath = $outputMsi
      url = ""
      downloadUrl = ""
      publishedAt = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ssK")
    }
  )
} | ConvertTo-Json -Depth 8
$manifestPayload | Out-File -FilePath $manifestPath -Encoding utf8

$loaderPath = Join-Path $distRoot "moonlauncher-loader.ps1"
$loaderScript = @"
param(
  [string]`$ManifestPath = "",
  [string]`$DownloadUrl = ""
)

`$ErrorActionPreference = "Stop"
`$distRoot = Split-Path -Parent `$MyInvocation.MyCommand.Path
if (-not `$ManifestPath) {
  `$ManifestPath = Join-Path `$distRoot "update-manifest.json"
}

`$targetInstaller = `$null
if (Test-Path `$ManifestPath) {
  try {
    `$manifest = Get-Content `$ManifestPath -Raw | ConvertFrom-Json
    if (`$manifest.releases -and `$manifest.releases.Count -gt 0) {
      `$release = `$manifest.releases[0]
      if (`$release.installerPath -and (Test-Path `$release.installerPath)) {
        `$targetInstaller = Get-Item `$release.installerPath
      } elseif (`$release.downloadUrl) {
        `$DownloadUrl = [string]`$release.downloadUrl
      }
    }
  } catch {
    Write-Host "Manifest parse failed: `$(`$_.Exception.Message)"
  }
}

if (-not `$targetInstaller) {
  `$latestLocal = Get-ChildItem `$distRoot -Filter "moonlauncher-*-x64.msi" -File -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if (`$latestLocal) {
    `$targetInstaller = `$latestLocal
  }
}

if (-not `$targetInstaller -and `$DownloadUrl) {
  `$downloadTarget = Join-Path `$env:TEMP "moonlauncher-latest.msi"
  Invoke-WebRequest -Uri `$DownloadUrl -OutFile `$downloadTarget
  `$targetInstaller = Get-Item `$downloadTarget
}

if (-not `$targetInstaller) {
  throw "Installer was not found in dist and download URL is empty."
}

Start-Process msiexec.exe -ArgumentList @("/i", `$targetInstaller.FullName) -Verb RunAs
"@
$loaderScript | Out-File -FilePath $loaderPath -Encoding utf8

Write-Host "MSI is ready: $outputMsi"
