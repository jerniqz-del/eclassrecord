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
TargetName="D:\Projects\E-Class Record App\dist\E-ClassRecordSetup.exe"
FriendlyName=E-Class Record Setup
AppLaunched=powershell.exe -NoProfile -ExecutionPolicy Bypass -File install.ps1
FILE0=eclass-record.hta
FILE1=install.ps1
FILE2=uninstall.ps1

[SourceFiles]
SourceFiles0="D:\Projects\E-Class Record App\"

[SourceFiles0]
%FILE0%=
%FILE1%=
%FILE2%=
