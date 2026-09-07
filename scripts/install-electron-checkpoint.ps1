param(
  [Parameter(Mandatory = $true)]
  [string]$Version
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$ElectronRoot = [System.IO.Path]::GetFullPath((Join-Path $ProjectRoot 'node_modules\electron'))
$ElectronDist = [System.IO.Path]::GetFullPath((Join-Path $ElectronRoot 'dist'))
$AllowedPrefix = $ProjectRoot.TrimEnd('\') + '\'

if (-not $ElectronRoot.StartsWith($AllowedPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "Electron dependency directory escapes the project root: $ElectronRoot"
}

$Package = Get-Content -LiteralPath (Join-Path $ElectronRoot 'package.json') -Raw | ConvertFrom-Json
if ([string]$Package.version -ne $Version) {
  throw "Installed Electron package $($Package.version) does not match requested checkpoint $Version."
}

$ArchiveName = "electron-v$Version-win32-x64.zip"
$CacheRoot = Join-Path $env:LOCALAPPDATA 'electron\Cache'
$Archive = Get-ChildItem -LiteralPath $CacheRoot -Recurse -File -Filter $ArchiveName |
  Sort-Object LastWriteTimeUtc -Descending |
  Select-Object -First 1
if (-not $Archive) {
  throw "Electron archive was not found in the official cache: $ArchiveName"
}

$Checksums = Get-Content -LiteralPath (Join-Path $ElectronRoot 'checksums.json') -Raw | ConvertFrom-Json
$ExpectedHash = [string]$Checksums.$ArchiveName
$ActualHash = (Get-FileHash -LiteralPath $Archive.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
if (-not $ExpectedHash -or $ActualHash -ne $ExpectedHash.ToLowerInvariant()) {
  throw "Electron archive checksum verification failed for $ArchiveName."
}

if (Test-Path -LiteralPath $ElectronDist) {
  $ResolvedDist = [System.IO.Path]::GetFullPath((Resolve-Path -LiteralPath $ElectronDist).Path)
  if (-not $ResolvedDist.StartsWith($ElectronRoot.TrimEnd('\') + '\', [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to replace Electron dist outside its dependency directory: $ResolvedDist"
  }
  Remove-Item -LiteralPath $ResolvedDist -Recurse -Force
}

New-Item -ItemType Directory -Path $ElectronDist -Force | Out-Null
Expand-Archive -LiteralPath $Archive.FullName -DestinationPath $ElectronDist -Force
[System.IO.File]::WriteAllText((Join-Path $ElectronRoot 'path.txt'), 'electron.exe', [System.Text.UTF8Encoding]::new($false))

$RuntimeVersion = (Get-Content -LiteralPath (Join-Path $ElectronDist 'version') -Raw).TrimStart('v').Trim()
if ($RuntimeVersion -ne $Version) {
  throw "Extracted Electron runtime $RuntimeVersion does not match checkpoint $Version."
}

Write-Host "Installed and verified Electron $Version checkpoint runtime."
