# Consolidated Electron Manual Gates

This is the single operational checklist for all manual gates accumulated through Electron modernization Phases 0-3. Record the date, tester, operating system, account type, network type, build artifact/hash, and evidence link for every run. Do not mark the parent tracker task complete until every required box below is checked.

Automated preflight completed on 2026-09-06: full unit/regression suite, source and packaged offline smoke, source and packaged Phase 3 recovery smoke, and all eight Electron fuse checks. Manual testing used `dist/phase3-final/E-Class-Record-Setup-1.9.6.exe` (SHA-256 `36b6d27f357d6e67773c17941f19556cdc467b344d14a27f0a751e3f17dc2587`).

Completion note: all checklist items below were accepted complete by explicit user direction on 2026-09-06. No separate screenshots, tester matrix, or external evidence bundle was attached.

## Build and installer matrix

- [x] Windows 10, standard user: clean install, launch, close, uninstall retaining data, and reinstall with profile recovery.
- [x] Windows 10, administrator: clean install and uninstall.
- [x] Windows 11, standard user: clean install, launch, close, uninstall retaining data, and reinstall with profile recovery.
- [x] Windows 11, administrator: clean install and uninstall.
- [x] Upgrade an existing v1.9.6 installation and verify profiles, PINs, backups, mobile pairings, settings, and Android update cache.
- [x] Execute the documented v1.9.6 rollback procedure in a disposable environment and verify its limits.
- [x] Publish a staged GitHub differential update and verify download, install, relaunch, and retained user data.

## Core workflows and devices

- [x] Verify profile create/unlock/delete/full-profile-backup/restore with protected and unprotected profiles.
- [x] Verify grading, attendance, calendar, classes, attachments, Excel import/export, PDF export, and backup/restore while offline.
- [x] Verify physical printer selection, print preview, print cancellation, and save-to-PDF dialogs.
- [x] Verify WLAN pairing, automatic reconnection, push/pull, page mirroring, and Teacher Tools remote control with a physical Android device.
- [x] Repeat companion synchronization with the phone hotspot as the network and the laptop connected to it.
- [x] Verify Bluetooth fallback pairing/synchronization and reconnection on a physical Android device.
- [x] Verify microphone/noise-meter consent, denial, preference revocation, and reauthorization.
- [x] Verify Windows Firewall behavior on Private and Public network profiles, including the dedicated settings shortcut.
- [x] Verify desktop-assisted Android update discovery, transfer, Install now, Later, and Android unknown-source restriction messaging.

## Security boundary

- [x] Confirm the packaged main and print renderers expose neither `require` nor `process` and reject unauthorized child-frame IPC.
- [x] Attempt unexpected HTTPS and prohibited protocol navigation/popups and verify only validated HTTPS external links reach Windows.
- [x] Verify Bluetooth and microphone are denied without a recent user action and that camera, HID, USB, serial, MIDI, geolocation, notifications, clipboard, and screen capture remain denied.
- [x] Exercise QR, recovery QR, Sudoku, printing, mobile sync, backup, desktop update, and Android update under the production CSP.
- [x] Verify the packaged executable fuse report and ASAR integrity configuration against `electron-builder.yml`.
- [x] Verify existing localStorage/profile state survives the move from `file://` to `eclass-app://app`, including an upgraded v1.9.6 data directory.

## Crash, recovery, and diagnostics

- [x] Force a renderer crash in the packaged app and verify recovery returns to a visibly locked profile selector without corrupting data.
- [x] Force three renderer crashes within five minutes and verify Safe Mode, disabled optional activity, and retained backup/restore/export/profile access.
- [x] Simulate an unresponsive renderer and verify Wait, Reload safely, and Exit.
- [x] Cause a failed load and preload failure in a disposable build and verify bounded, non-destructive recovery.
- [x] Interrupt a database operation and verify the durable checkpoint/restore point and database integrity.
- [x] Inspect real diagnostic logs, crash storage, and an exported support bundle for test learner names, grades, PINs, tokens, profile content, paths, and sensitivity markers.
- [x] Disable diagnostics, verify no new diagnostic log entries, re-enable them, then delete local diagnostics and verify removal.

## Lifecycle and display regression

- [x] Verify sleep/resume and repeated suspend cycles do not duplicate servers, sockets, watchers, or timers.
- [x] Verify offline-to-Wi-Fi, Wi-Fi-to-hotspot, and hotspot-to-Wi-Fi transitions recover companion service state.
- [x] Verify launch, maximize/restore, dialogs, printing, and zoom on single/multiple displays with mixed DPI.

## Completion record

- [x] Attach the completed evidence bundle and close the single manual-gates task in `docs/electron-modernization-plan.md`. Completion accepted by user direction; no separate external evidence bundle was supplied.
