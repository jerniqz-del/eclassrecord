$ErrorActionPreference = "Stop"

$appName = "E-Class Record"
$publisher = "E-Class Record App"
$version = "1.0.0"
$installDir = Join-Path $env:LOCALAPPDATA "Programs\E-Class Record"
$startMenuDir = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\E-Class Record"
$desktopDir = [Environment]::GetFolderPath("DesktopDirectory")
$appFile = Join-Path $installDir "eclass-record.hta"
$uninstallFile = Join-Path $installDir "uninstall.ps1"
$mshta = Join-Path $env:WINDIR "System32\mshta.exe"

function New-AppShortcut {
  param(
    [string]$ShortcutPath,
    [string]$TargetPath,
    [string]$Arguments,
    [string]$WorkingDirectory,
    [string]$Description
  )

  $shell = New-Object -ComObject WScript.Shell
  $shortcut = $shell.CreateShortcut($ShortcutPath)
  $shortcut.TargetPath = $TargetPath
  $shortcut.Arguments = $Arguments
  $shortcut.WorkingDirectory = $WorkingDirectory
  $shortcut.Description = $Description
  $shortcut.IconLocation = "$mshta,0"
  $shortcut.Save()
}

New-Item -ItemType Directory -Path $installDir -Force | Out-Null
New-Item -ItemType Directory -Path $startMenuDir -Force | Out-Null

Copy-Item -Path (Join-Path $PSScriptRoot "eclass-record.hta") -Destination $appFile -Force
Copy-Item -Path (Join-Path $PSScriptRoot "uninstall.ps1") -Destination $uninstallFile -Force

$appArgs = "`"$appFile`""
New-AppShortcut `
  -ShortcutPath (Join-Path $startMenuDir "$appName.lnk") `
  -TargetPath $mshta `
  -Arguments $appArgs `
  -WorkingDirectory $installDir `
  -Description "Open $appName"

New-AppShortcut `
  -ShortcutPath (Join-Path $desktopDir "$appName.lnk") `
  -TargetPath $mshta `
  -Arguments $appArgs `
  -WorkingDirectory $installDir `
  -Description "Open $appName"

$powershell = Join-Path $env:WINDIR "System32\WindowsPowerShell\v1.0\powershell.exe"
New-AppShortcut `
  -ShortcutPath (Join-Path $startMenuDir "Uninstall $appName.lnk") `
  -TargetPath $powershell `
  -Arguments "-NoProfile -ExecutionPolicy Bypass -File `"$uninstallFile`"" `
  -WorkingDirectory $env:TEMP `
  -Description "Uninstall $appName"

$uninstallKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\E-Class Record"
New-Item -Path $uninstallKey -Force | Out-Null
New-ItemProperty -Path $uninstallKey -Name "DisplayName" -Value $appName -PropertyType String -Force | Out-Null
New-ItemProperty -Path $uninstallKey -Name "DisplayVersion" -Value $version -PropertyType String -Force | Out-Null
New-ItemProperty -Path $uninstallKey -Name "Publisher" -Value $publisher -PropertyType String -Force | Out-Null
New-ItemProperty -Path $uninstallKey -Name "InstallLocation" -Value $installDir -PropertyType String -Force | Out-Null
New-ItemProperty -Path $uninstallKey -Name "DisplayIcon" -Value "$mshta,0" -PropertyType String -Force | Out-Null
New-ItemProperty -Path $uninstallKey -Name "UninstallString" -Value "`"$powershell`" -NoProfile -ExecutionPolicy Bypass -File `"$uninstallFile`"" -PropertyType String -Force | Out-Null
New-ItemProperty -Path $uninstallKey -Name "QuietUninstallString" -Value "`"$powershell`" -NoProfile -ExecutionPolicy Bypass -File `"$uninstallFile`" -Silent" -PropertyType String -Force | Out-Null
New-ItemProperty -Path $uninstallKey -Name "NoModify" -Value 1 -PropertyType DWord -Force | Out-Null
New-ItemProperty -Path $uninstallKey -Name "NoRepair" -Value 1 -PropertyType DWord -Force | Out-Null

$sizeKb = [Math]::Ceiling(((Get-Item $appFile).Length + (Get-Item $uninstallFile).Length) / 1KB)
New-ItemProperty -Path $uninstallKey -Name "EstimatedSize" -Value $sizeKb -PropertyType DWord -Force | Out-Null

Start-Process -FilePath $mshta -ArgumentList $appArgs -WorkingDirectory $installDir
