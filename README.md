# E-Class Record

This project builds a local Windows desktop E-Class Record app. It can be packaged either as a full per-user installer or as the older portable executable.

## Features

- Multiple grade levels, sections, subjects, and teaching loads
- Sidebar navigation for Dashboard, Classes, E-Class Record, and Settings
- DepEd DO 015, s. 2026 transition grading mode
- DepEd DO 015, s. 2026 zero-based grading mode
- DepEd DO 8, s. 2015 legacy grading mode
- Term-based class record with WW, PT, ST1, ST2, and TE inputs
- Local auto-save under the teacher's Windows profile
- JSON backup export and import
- CSV learner import using `LRN,Last Name,First Name,Sex`
- SF1 upload/import for learner name and sex/gender extraction
- Learner sorting grouped by sex and alphabetized within each group
- Learner name formatting as `Last Name, First Name MI.`

SF1 `.xls` and `.xlsx` import uses Windows ACE/Jet OLEDB providers, not Excel automation. If a computer cannot read the workbook provider, save the SF1 as CSV and import it through the same upload flow.
- Printable class record and final grade summary

## Build Installer

Run:

```powershell
.\build-installer.ps1
```

The installer is created at:

```text
dist\E-ClassRecordSetup.exe
```

The installer copies the app to `%LOCALAPPDATA%\Programs\E-Class Record`, adds Start Menu and Desktop shortcuts, registers an Apps & Features uninstall entry, and launches the app after install.

## Build Portable

Run:

```powershell
iexpress /N /Q build-package.sed
```

The executable is created at:

```text
dist\E-ClassRecordPortable.exe
```

## Data

Teacher data is generated locally at runtime and can be exported as JSON for backup or transfer. Existing data remains under `%APPDATA%\EClassRecordPortable\data.json` so upgrades from the portable build keep working.
