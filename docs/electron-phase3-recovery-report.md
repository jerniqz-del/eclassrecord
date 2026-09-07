# Electron Phase 3 Crash, Diagnostics, and Recovery Report

Date: 2026-09-06

## Policy

Electron crash reporting starts before renderer creation and stores reports locally. Automatic upload is disabled. Diagnostic logging is enabled by default, limited to 1 MB per file and five rotated files, while local crash data has a 14-day retention policy. Users can disable future diagnostic collection, export a sanitized support bundle, or delete all local diagnostic data from Settings.

Support bundles contain sanitized text reports and policy metadata only; raw crash dumps are not included. Redaction covers tokens and credentials, PIN-like values, learner reference numbers, learner/profile/name/grade fields, Windows and UNC paths, cryptographic identifiers, and the test sensitivity marker.

## Recovery behavior

- Renderer crashes, failed loads, preload failures, child-process failures, and unresponsive/responsive transitions are recorded without silently unlocking a profile.
- Before an automatic renderer recovery, the app attempts a local restore point. A failed checkpoint does not trigger a reset or delete user data.
- The renderer returns to the trusted internal origin with the main-process profile session cleared and the profile overlay locked.
- The user can Wait, Reload safely, or Exit after an unresponsive-renderer prompt.
- Three renderer failures in five minutes enter Safe Mode. Automatic recovery is bounded at three attempts.
- Safe Mode suppresses animations, games, ads, cloud startup, and automatic shared-folder sync while retaining profile access, backup, restore, and export paths.

## Evidence

- `src/main/diagnostic-service.js`, `src/main/recovery-controller.js`, and `src/main/main.js`
- `src/renderer/js/diagnostics-ui.js`, `src/renderer/js/early-startup.js`, and `src/renderer/js/startup.js`
- `scripts/test-electron-phase3-recovery.js`
- `scripts/run-electron-phase3-recovery-smoke.js`
- `npm run test:electron-phase3`
- `npm run electron:phase3:recovery-smoke`
- The full `npm test` regression suite passed after the runtime, smoke-harness, and isolated-package fixes.
- Source and packaged recovery runs emitted `PHASE3_RECOVERY_OK {"safeMode":true,"profileLocked":true,"nodeUnavailable":true}`.
- Source and packaged offline runs emitted `SMOKE_OK` with all 22 required renderer modules.
- `dist/phase3-final/E-Class-Record-Setup-1.9.6.exe` has SHA-256 `36b6d27f357d6e67773c17941f19556cdc467b344d14a27f0a751e3f17dc2587`.
- The release builder now obfuscates an isolated staging copy and removes that staging tree in its cleanup path, so a failed or interrupted package run cannot leave workspace source obfuscated.
- Physical hang, real-dump retention/deletion, and Windows recovery UX checks are tracked in `docs/electron-manual-gates-checklist.md`.
