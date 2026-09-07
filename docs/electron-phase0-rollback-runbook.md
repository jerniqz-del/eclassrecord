# Phase 0 v1.9.6 Rollback Runbook

## Retained rollback build

Build date: 2026-09-05

| Artifact | Size | SHA-256 |
|---|---:|---|
| `dist/phase0-baseline/E-Class-Record-Setup-1.9.6.exe` | 160,657,828 bytes | `1a2e9e961d27bb43fef7c5d3e0221108d18b80d7b3402d48d7b104409a0199fd` |
| `dist/phase0-baseline/E-Class-Record-Setup-1.9.6.exe.blockmap` | 165,843 bytes | `360d33baa45c04904aee3fd90813413c60fc25a115f185830242e5d6b5c3b8b6` |
| `dist/phase0-baseline/win-unpacked/resources/app.asar` | 157,542,949 bytes | `029964cd6bbfe3f91f2ad38619c6462f0dc70f27ac849ec232c4809ac7bd1942` |

The build uses Electron 33.4.11 and application version 1.9.6. Its unpacked payload passed the complete isolated offline smoke suite on Windows 10 22H2. The installer is currently **unsigned**; Windows may show an unknown-publisher warning. Signing is a Phase 8 release requirement, and the unsigned status must be disclosed during rollback tests.

The machine-readable manifest is `config/electron-phase0-rollback-artifact.json`. Run `npm run electron:phase0:rollback-verify` before using or copying the rollback files.

## Before rollback

1. Disconnect mobile clients and wait for any active save, backup, export, Android update transfer, or shared-folder sync to finish.
2. In the current app, download an entire-profile backup for every profile that must be preserved.
3. Verify each backup can be parsed and that its integrity check passes. Store a copy outside Electron `userData`.
4. Record the currently installed app version and persisted schema versions.
5. Compare the installer hash with the retained SHA-256 above. Stop if it differs.
6. Close the app and confirm no `E-Class Record.exe` process remains.

## Supported rollback boundary

- A rollback is supported only while root/profile database versions remain 7 and backup envelope version remains 2.
- Phase 0 and Phase 1 freeze the persisted formats listed in `config/electron-modernization-schema-baseline.json`.
- If a later build writes a newer schema, do not open that live data with v1.9.6 unless its migration plan explicitly proves backward compatibility.
- Never solve a downgrade error by deleting `userData`, profile folders, PIN material, pairing identities, or update caches.
- Android app binaries cannot be downgraded by the desktop rollback. Mobile data must be synchronized or exported separately before changing Android versions.

## Rollback procedure

1. Use a disposable Windows test account or VM for the first execution of each modernization checkpoint.
2. Run the retained v1.9.6 installer. Do not select an option that deletes application data.
3. Launch v1.9.6 and confirm the expected version before opening a profile.
4. Open only sanitized compatibility fixtures first: empty, single-profile, multi-profile, encrypted, unprotected, paired-mobile, shared-folder, advisory, large-class, corrupted, and legacy-backup.
5. Verify profile login, classes, attendance, grading, calendar, save, backup, restore, Excel, PDF, WLAN/hotspot pairing, and unlink behavior.
6. If the live database is rejected as newer, close the app. Restore the pre-rollback entire-profile backup through a compatible build; do not hand-edit schema numbers.
7. After verification, preserve the result record with OS build, account type, installer hash, schema versions, and sanitized pass/fail notes.

## Recovery if rollback fails

- Do not retry repeatedly against the same live files.
- Copy the untouched external backup to a second safe location.
- Reinstall the last compatible application build and restore through its normal restore workflow.
- If a backup integrity check fails, retain the file read-only and use the newest verified backup. Do not overwrite it with an automatic save.
- Record the failure in `docs/electron-modernization-plan.md` before further modernization work.

## Validation evidence

- Isolated package build completed: `npm run build -- --config.directories.output=dist/phase0-baseline`.
- Packaged executable emitted `SMOKE_OK` with 22 modules and passed database checksum, backup restore, PIN/QR recovery, offline, printing-related, and UI checks.
- Source smoke passed after aligning the hidden test with the public Group Randomizer settle action and current Performance Checklist selection workflow.
- Full NSIS install/rollback/uninstall-retain testing is still pending in disposable Windows 10 and Windows 11 environments; it must not be performed over a teacher's active installation.
