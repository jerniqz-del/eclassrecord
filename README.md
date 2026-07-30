# E-Class Record (Electron Desktop Edition)

A premium, modern offline desktop application designed for Filipino teachers to manage DepEd class grading records. Built with Electron, HTML5, Vanilla CSS (harmonised custom design system), and Node.js.

## Core Features

- **Standard DepEd Grading Rules**: Verification engine supporting DO 015 s.2026 (Transition & Zero-Based modes), DO 8 s.2015 (Legacy mode), and Key Stage 2 Trimester sheets.
- **Senior High Teaching Loads**: Grades 11–12 class setup with strengthened-SHS Core, Academic Elective, Sports/Arts, Field Experience, Research/Design, TechPro, and Work Immersion grading presets.
- **Roster Management**: Roster uploads from LIS school records via native SF1 spreadsheet importer (`.xlsx`, `.xls`, `.csv`, `.txt` parsed using `xlsx` library) and direct CSV rosters paste.
- **Learner Avatars**: 50 locally bundled male and 50 female human avatar presets are assigned automatically from learner sex, remain stable across classes and backups, and can be changed manually without storing learner photos.
- **Dense Score Grid**: Smooth score matrix with inline Arrow/Enter key navigation and HPS (Highest Possible Score) adjustment rows.
- **Group Randomizer**: Securely randomized complete or sex-balanced groups with animated learner movement before the final grouping settles, distinct per-group color schemes, copy support, and color-marked print output.
- **Name Picker**: A no-repeat learner roulette that shuffles names and avatars together, gradually slows to the final selection, and celebrates the selected learner with brief confetti.
- **Performance Checklist**: Repeatable numerical Recitation, Notebook, Assignment, and custom activity columns with independent dates, HPS-aware minus/plus controls, Bulk Mark, notes, safe undo/reset, a mini Name Picker, and reviewed, PIN-confirmed addition to compatible WW or PT scores with empty-target recommendations, HPS-overflow blocking, and locked published activities that can only be safely unpublished and edited after PIN verification.
- **Final Grades Summary**: Auto-computed averages across terms with remarked pass/fail color-coded badges.
- **Advisory Class Consolidation**: A fixed adviser dashboard with official roster management, subject completion tracking, and audited offline Grade Transfer File import/export.
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

## Advisory Class Documentation

- [Advisory Class user guide](docs/advisory-class-guide.md)
- [Advisory database compatibility contract](docs/advisory-database-compatibility.md)
- [Database, backup, and PIN recovery compatibility](docs/database-backup-pin-recovery.md)
- [Grade Transfer File schema v1.0](docs/grade-transfer-schema-v1.0.md)
- [Manual smoke-test checklist](docs/manual-smoke-test-advisory.md)

## Release & OTA Publishing

To build and publish an OTA update:
1. Increment the version number in `package.json`.
2. Commit and push a Git release tag matching the pattern `v*` (e.g., `git tag v2.1.0` then `git push origin v2.1.0`).
3. GitHub Actions will build the NSIS executable and metadata files, pushing them directly to GitHub Releases.
4. Active users will automatically prompt to download and apply the update on relaunch.

## Security notes

- Link-preview fetches performed by the app are restricted to public hosts. The main process blocks requests to loopback, RFC1918, link-local (169.254.*) and IPv6 link-local/ULA ranges to mitigate SSRF risks when renderer code requests previews.
- A new test script is available to validate the host blocking logic locally:
  - npm run test:link-preview
  - It checks example.com, github.com, localhost, 127.0.0.1, and 169.254.169.254 and prints whether each host is blocked.

If you maintain CI workflows, ensure tests are run before publishing releases (recommended).