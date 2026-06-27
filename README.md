# E-Class Record (Electron Desktop Edition)

A premium, modern offline desktop application designed for Filipino teachers to manage DepEd class grading records. Built with Electron, HTML5, Vanilla CSS (harmonised custom design system), and Node.js.

## Core Features

- **Standard DepEd Grading Rules**: Verification engine supporting DO 015 s.2026 (Transition & Zero-Based modes), DO 8 s.2015 (Legacy mode), and Key Stage 2 Trimester sheets.
- **Roster Management**: Roster uploads from LIS school records via native SF1 spreadsheet importer (`.xlsx`, `.xls`, `.csv`, `.txt` parsed using `xlsx` library) and direct CSV rosters paste.
- **Dense Score Grid**: Smooth score matrix with inline Arrow/Enter key navigation and HPS (Highest Possible Score) adjustment rows.
- **Final Grades Summary**: Auto-computed averages across terms with remarked pass/fail color-coded badges.
- **Native File Dialogs**: Backup and recovery in JSON backups, and grades reports exporting in standard CSV files.
- **Over-the-Air (OTA) Updates**: Automated startup updates check and download from GitHub Releases.
- **Change History & Patch Notes**: In-app Help Center documentation plus [implementation history](docs/implementation-history.md) covering changes from the first build through the latest restored updates.
- **Responsive & Printable Layouts**: Dedicated `@media print` styling for clean physical paper reporting.

## Directory Structure

```text
eclassrecord/
├── .github/workflows/       # GitHub Actions automated release building
├── src/
│   ├── assets/              # App graphics (icon.png)
│   ├── main/
│   │   ├── file-io.js       # Node FS filesystem backend
│   │   ├── main.js          # Electron main process window and IPC
│   │   ├── preload.js       # Secured context bridge
│   │   ├── sf1-reader.js    # Spreadsheet LIS parser engine
│   │   └── updater.js       # electron-updater configuration
│   └── renderer/
│       ├── css/             # Custom CSS design modules
│       ├── js/              # Client-side grading scripts and renderers
│       └── index.html       # Application shell viewport
├── package.json             # NPM dependencies and scripts
└── electron-builder.yml     # Desktop packaging options (NSIS installer)
```

## Getting Started & Development

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Run Application locally in Dev mode**:
   ```bash
   npm start
   # or
   npm run dev
   ```

3. **Build Installer locally**:
   Produces a Windows NSIS installer under `dist/E-Class-Record-Setup-<version>.exe`:
   ```bash
   npm run build
   ```

## Local Data Storage & Migration

Teacher records are stored locally on the computer:
- **Path**: `%APPDATA%\EClassRecordPortable\data.json`

This ensures that upgrading from the older single-file HTA version automatically preserves all existing teaching loads, rosters, and scores without needing manual exports.

## Release & OTA Publishing

To build and publish an OTA update:
1. Increment the version number in `package.json`.
2. Commit and push a Git release tag matching the pattern `v*` (e.g., `git tag v2.1.0` then `git push origin v2.1.0`).
3. GitHub Actions will build the NSIS executable and metadata files, pushing them directly to GitHub Releases.
4. Active users will automatically prompt to download and apply the update on relaunch.
