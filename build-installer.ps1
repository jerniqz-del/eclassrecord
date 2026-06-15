$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$dist = Join-Path $root "dist"
$installer = Join-Path $dist "E-ClassRecordSetup.exe"
$generatedSed = Join-Path $root "build-installer.generated.sed"

New-Item -ItemType Directory -Path $dist -Force | Out-Null
Remove-Item -Path $installer -Force -ErrorAction SilentlyContinue

$sedContent = @"
[Version]
Class=IEXPRESS
SEDVersion=3

[Options]
PackagePurpose=InstallApp
ShowInstallProgramWindow=0
HideExtractAnimation=1
UseLongFileName=1
InsideCompressed=1
CAB_FixedSize=0
CAB_ResvCodeSigning=0
RebootMode=N
InstallPrompt=%InstallPrompt%
DisplayLicense=%DisplayLicense%
FinishMessage=%FinishMessage%
TargetName=%TargetName%
FriendlyName=%FriendlyName%
AppLaunched=%AppLaunched%
PostInstallCmd=<None>
AdminQuietInstCmd=%AppLaunched%
UserQuietInstCmd=%AppLaunched%
SourceFiles=SourceFiles

[Strings]
InstallPrompt=
DisplayLicense=
FinishMessage="E-Class Record has been installed."
TargetName="$installer"
FriendlyName=E-Class Record Setup
AppLaunched=powershell.exe -NoProfile -ExecutionPolicy Bypass -File install.ps1
FILE0=eclass-record.hta
FILE1=install.ps1
FILE2=uninstall.ps1

[SourceFiles]
SourceFiles0="$root\"

[SourceFiles0]
%FILE0%=
%FILE1%=
%FILE2%=
"@

Set-Content -Path $generatedSed -Value $sedContent -Encoding ASCII
Push-Location $root
try {
  & $env:ComSpec /c "iexpress /N /Q build-installer.generated.sed"
} finally {
  Pop-Location
}
Remove-Item -Path $generatedSed -Force -ErrorAction SilentlyContinue

if (-not (Test-Path $installer)) {
  throw "Installer was not created at $installer"
}

Write-Host "Created $installer"
