param(
  [switch]$Silent
)

$ErrorActionPreference = "Stop"

$appName = "E-Class Record"
$installDir = Join-Path $env:LOCALAPPDATA "Programs\E-Class Record"
$startMenuDir = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\E-Class Record"
$desktopShortcut = Join-Path ([Environment]::GetFolderPath("DesktopDirectory")) "$appName.lnk"
$uninstallKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\E-Class Record"

try {
  Set-Location $env:TEMP
  Remove-Item -Path $desktopShortcut -Force -ErrorAction SilentlyContinue
  Remove-Item -Path $startMenuDir -Recurse -Force -ErrorAction SilentlyContinue
  Remove-Item -Path $uninstallKey -Recurse -Force -ErrorAction SilentlyContinue
  Remove-Item -Path $installDir -Recurse -Force -ErrorAction SilentlyContinue

  if (-not $Silent) {
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.MessageBox]::Show(
      "$appName has been uninstalled. Your saved class records were left in your Windows profile.",
      "$appName",
      [System.Windows.Forms.MessageBoxButtons]::OK,
      [System.Windows.Forms.MessageBoxIcon]::Information
    ) | Out-Null
  }
} catch {
  if (-not $Silent) {
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.MessageBox]::Show(
      "Uninstall failed: $($_.Exception.Message)",
      "$appName",
      [System.Windows.Forms.MessageBoxButtons]::OK,
      [System.Windows.Forms.MessageBoxIcon]::Error
    ) | Out-Null
  }
  exit 1
}
