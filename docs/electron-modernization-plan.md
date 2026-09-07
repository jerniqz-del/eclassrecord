# Electron Modernization Implementation Tracker

This document is the durable implementation plan and source of truth for Electron modernization in E-Class Record.

Last reviewed: 2026-09-07
Target application baseline: E-Class Record v1.9.6
Original Electron baseline: 33.4.11
Current Electron runtime: 44.2.0
Overall status: In progress
Current phase: Phase 4 - Sleep, resume, lock, and network lifecycle
Next action: On a disposable Windows 10/11 laptop and one Android device, verify Bluetooth v2 QR pairing, APK FileProvider install, Windows lock/sleep profile lock, and trusted LAN reconnection after resume. Do not mark Phase 2 or Phase 4 Complete from this code pass.

## Tracker maintenance rules

1. Read this file before starting any Electron modernization task.
2. Update this file in the same change that implements a tracked item.
3. A phase may be marked Complete only after every task and acceptance criterion in that phase passes.
4. Record concrete evidence: test commands, relevant files, build artifact, and manual verification.
5. Use these status values only: Not started, In progress, Blocked, Complete.
6. Never mark a phase Complete based only on code review or compilation.
7. If requirements change, update the plan before or with the implementation.
8. Add a dated entry to the change log for every status change.

## Phase dashboard

| Phase | Description | Status | Evidence |
|---|---|---|---|
| 0 | Inventory, baselines, and release safeguards | Complete | Automated inventory, fixtures, performance baseline, schema freeze, source/package smoke, rollback build, regression suite, and the user-accepted Windows/manual matrix are complete. |
| 1 | Electron and packaging dependency upgrades | Complete | Electron 34-44 checkpoints, exact pins, full regression suite, performance gates, final obfuscated package, and the user-accepted installer/device/update matrix are complete. |
| 2 | Hardened Electron security boundary | In progress | Sandboxed internal origin, guarded navigation/permissions/IPC, compute-service extraction, CSP, production fuses, main-process profile PIN/session, markup `electronAPI` block, unit tests, source smoke, and packaged smoke pass. Inline style migration and physical workflow checks remain. |
| 3 | Crash handling, diagnostics, and safe recovery | Complete | Local-only crash collection, redacted rotating diagnostics, bounded locked recovery, safe mode, support bundles, unit tests, source/package recovery smokes, production package, and the user-accepted manual recovery matrix are complete. |
| 4 | Sleep, resume, lock, and network lifecycle | In progress | `powerMonitor` lock/suspend/resume slice locks the profile session, checkpoints, pauses companion discovery, and rejects remote tool-commands. Wi-Fi/hotspot, firewall-category, and duplicate-timer physical gates remain. |
| 5 | Native Windows integration | Not started | |
| 6 | Utility-process workload isolation | Not started | |
| 7 | Native theme, accessibility, and reduced motion | Not started | |
| 8 | Signing, packaging, installer, and update integrity | Not started | |
| 9 | Automated testing and security gates | Not started | |
| 10 | Documentation and user-facing controls | Not started | |
| 11 | Staged release and post-release monitoring | Not started | |

## Consolidated manual gate task

- [x] Complete every Phase 0-3 manual gate and attach its evidence using `docs/electron-manual-gates-checklist.md`. Accepted complete by user direction on 2026-09-06; no external evidence bundle was attached.

## Existing capabilities outside the phase completion count

These capabilities already existed or were completed before this tracker. They do not make any modernization phase Complete:

- [x] Context isolation is enabled for the main window.
- [x] Node integration is disabled for the main window.
- [x] Printing uses a sandboxed auxiliary window.
- [x] A limited context bridge is used instead of exposing raw `ipcRenderer`.
- [x] Desktop automatic updates use `electron-updater`.
- [x] Sensitive School Cloud connection data uses Electron `safeStorage`.
- [x] Production launches use a single-instance lock.
- [x] A repeated launch restores, shows, and focuses the existing window.
- [x] Smoke tests use isolated data directories and bypass the production instance lock.

Existing single-instance evidence:

- `src/main/single-instance.js`
- `src/main/main.js`
- `scripts/test-single-instance.js`
- `npm run test:single-instance`

## Global constraints

- Existing profiles, PIN hashes, encrypted content, backups, mobile pairings, and Android update caches must remain compatible.
- Upgrades must never delete Electron `userData`.
- Core profile, grading, attendance, calendar, class, backup, and restore work must remain usable offline.
- WLAN and hotspot sync must not depend on a cloud service.
- Logs and crash reports must not contain learner names, grades, PINs, tokens, profile contents, or sensitive paths.
- Security authorization must be enforced in the main process, not only in renderer code.
- Each phase requires an independently reversible checkpoint.
- Destructive migrations require a verified restore point and rollback test.

# Phase 0 - Inventory, baselines, and release safeguards

Status: Complete

## Tasks

- [x] Inventory every `BrowserWindow`, preload script, session, protocol, and web contents instance.
- [x] Inventory every `ipcMain.handle`, `ipcMain.on`, and renderer-to-main event.
- [x] For every IPC channel, document direction, sender, schema, size limit, authentication, side effects, timeout, and errors.
- [x] Inventory dialogs, file reads/writes, attachment roots, external URL handling, printing, Bluetooth, WLAN, update channels, timers, and cloud connections.
- [x] Create sanitized fixtures for empty, single-profile, multi-profile, encrypted, unprotected, paired-mobile, shared-folder, advisory, large-class, corrupted, and legacy-backup states.
- [x] Record database and backup schema versions.
- [x] Measure cold startup, time-to-interactive, idle memory, large-sheet memory, save, backup, restore, Excel import, PDF export, update transfer, and WLAN reconnection.
- [x] Establish Windows 10/11, standard/admin account, private/public network, hotspot, offline, sleep/resume, and mixed-DPI test environments.
- [x] Produce and retain a known-good v1.9.6 installer.
- [x] Document rollback and downgrade limits.
- [x] Prevent irreversible migrations during early modernization builds.

## Acceptance criteria

- [x] The capability and IPC inventories are reviewed and complete.
- [x] All fixtures pass the existing regression suite.
- [x] Performance baselines and permitted regression thresholds are recorded.
- [x] A tested v1.9.6 rollback artifact and procedure exist.
- [x] Fixtures and logs contain no real learner data.

## Evidence

- Baseline report: `docs/electron-phase0-baseline-report.md`
- Capability/IPC reports: `docs/electron-phase0-capability-inventory.md`, `docs/electron-phase0-ipc-inventory.md`, and `docs/electron-phase0-inventory.json`
- Schema registry and freeze: `docs/electron-phase0-schema-registry.md`, `config/electron-modernization-schema-baseline.json`, and `scripts/check-electron-modernization-migration-safety.js`
- Windows environments: `docs/electron-phase0-windows-test-matrix.md`
- Rollback manifest/procedure: `docs/electron-phase0-rollback-runbook.md`
- Machine-verifiable rollback hashes: `config/electron-phase0-rollback-artifact.json` and `npm run electron:phase0:rollback-verify`
- Performance evidence: `docs/electron-phase0-performance-baseline.md` and `docs/electron-phase0-performance-baseline.json`
- `npm run test:electron-phase0` passed: 82 IPC channels current, 8 persisted formats frozen, and 11 sanitized fixtures validated.
- `npm test` passed the complete existing regression suite, including database future-proofing, backup/recovery, shared-folder sync, desktop profile deletion/restore, mobile WLAN/hotspot sync, update channel, and Android UI contracts.
- Source `--offline-smoke-test` passed with `SMOKE_OK` and 22 modules.
- `npm run build -- --config.directories.output=dist/phase0-baseline` produced the isolated v1.9.6 rollback candidate.
- Packaged `dist/phase0-baseline/win-unpacked/E-Class Record.exe --offline-smoke-test` passed with `SMOKE_OK` and 22 modules.
- `npm run test:single-instance`, `node scripts/test-companion-sync-service.js`, and `node scripts/test-mobile-sync-bluetooth-qr.js` passed.
- The Windows, installer rollback, and uninstall-retain gates were accepted complete by user direction on 2026-09-06; no external evidence bundle was attached.

# Phase 1 - Electron and packaging dependency upgrades

Status: Complete

## Tasks

- [x] Recheck the latest three supported Electron majors immediately before implementation.
- [x] Confirm the chosen target still supports the required Windows versions.
- [x] Pin Electron, electron-builder, and electron-updater to exact versions during migration.
- [x] Upgrade Electron one major at a time from 33 to the target.
- [x] Review Electron breaking changes before every major increment.
- [x] At every increment, run unit, offline smoke, packaged launch, printing, dialog, Bluetooth, WLAN, updater, close, and single-instance tests.
- [x] Audit Node runtime changes affecting fs, TLS, crypto, Buffer, URL, HTTP, modules, and safeStorage.
- [x] Fix relevant deprecations before moving to the next major.
- [x] Upgrade electron-builder after the Electron runtime is stable.
- [x] Upgrade electron-updater and retest GitHub releases and differential updates.
- [x] Regenerate and review the dependency lockfile.
- [x] Create a checkpoint after every successful major upgrade.

## Acceptance criteria

- [x] Electron is within the officially supported three-major window.
- [x] No relevant Electron or Node deprecation warnings remain.
- [x] Existing profile and backup fixtures open successfully.
- [x] Desktop updates, Android updates, WLAN, hotspot, Bluetooth, printing, and recovery remain functional.
- [x] Clean install, v1.9.6 upgrade, uninstall-retain, and reinstall tests pass.

## Evidence

- Upgrade report and breaking-change review: `docs/electron-phase1-upgrade-report.md`
- Per-major machine-readable evidence: `docs/electron-phase1-checkpoints.json`
- Performance evidence: `docs/electron-phase1-performance-baseline.md`, `docs/electron-phase1-performance-baseline.json`, and `docs/electron-phase1-performance-comparison.md`
- Exact resolved versions: Electron 44.2.0, electron-builder 26.15.3, electron-updater 6.8.9.
- Every latest-patch major from 34.5.8 through 44.2.0 passed 11 automated checks, including source and packaged smoke.
- `npm test` passed the complete desktop and mobile regression suite on the final toolchain.
- `npm run electron:phase1:baseline` passed all 15 permitted performance thresholds.
- Final production-style package: `dist/phase1-final/E-Class-Record-Setup-1.9.6.exe`, SHA-256 `aab02b007c8ed27df6be7583e95a44bc2eb7073465f630bdddedea7991d09801`.
- Final obfuscated packaged smoke emitted `SMOKE_OK` with 22 modules and no Electron/Node deprecation warning.
- GitHub update checks and updater unit tests pass; the published differential-update and installer/device gates were accepted complete by user direction on 2026-09-06.
- npm audit retains six documented advisories, including the direct `xlsx` advisories for which npm reports no fix. See the upgrade report for dependency chains and the rejected unsafe blanket-fix rationale.

# Phase 2 - Hardened Electron security boundary

Status: In progress

## Tasks

### Process boundaries and sandbox

- [x] Document renderer, preload, main, utility-process, and companion-service responsibilities.
- [x] Move QR generation, QR pixel decoding, and Sudoku generation out of the privileged preload environment.
- [x] Reduce preload to typed, narrowly scoped IPC methods.
- [x] Add unsubscribe functions for main-to-renderer subscriptions.
- [x] Enable `sandbox: true` on the main window.
- [x] Evaluate and then enable `app.enableSandbox()` for all renderers.
- [x] Confirm Node globals and module loading are unavailable to renderer content.

### Navigation, windows, and external URLs

- [x] Add `will-navigate` guards to every web contents instance.
- [x] Add `setWindowOpenHandler` and deny new windows by default.
- [x] Apply equivalent restrictions to print and auxiliary windows.
- [x] Replace unrestricted `shell.openExternal` with parsed and validated URLs.
- [x] Allow HTTPS only by default and reject credentials embedded in URLs.
- [x] Reject javascript, data, file, ftp, smb, executable, and unknown protocols.
- [x] Move fixed Windows Settings actions to dedicated IPC commands.

### Permissions

- [x] Install permission check and permission request handlers on every relevant session.
- [x] Define explicit policy for Bluetooth, microphone, notifications, clipboard, camera, HID, USB, serial, MIDI, geolocation, and screen capture.
- [x] Default-deny capabilities the app does not use.
- [x] Require trusted origin and user intent for Bluetooth and microphone access.
- [x] Add Settings controls to review and revoke app-level permission preferences.

### IPC authorization and validation

- [x] Create a central trusted-renderer and trusted-main-frame validator.
- [x] Apply sender validation to every privileged IPC handler.
- [x] Require appropriate profile or admin authentication state for sensitive channels.
- [x] Add schemas, unknown-property handling, string limits, array limits, and payload-size limits.
- [x] Add prototype-pollution defenses and identifier normalization.
- [x] Validate paths against explicit approved roots.
- [x] Add rate limits to authentication and pairing.
- [x] Add cancellation and timeouts to network and long-running IPC operations.

### CSP and protocols

- [x] Move inline scripts in `index.html` into application script files.
- [x] Add a restrictive Content Security Policy.
- [x] Restrict default, script, object, base, frame, image, font, style, and connection sources.
- [x] Account explicitly for local WLAN and hotspot connections in `connect-src`.
- [ ] Migrate inline style attributes into CSS classes.
- [ ] Remove unsafe inline script immediately and unsafe inline style after migration.
- [x] Register a secure internal application protocol before Electron becomes ready.
- [x] Serve only normalized packaged assets through the internal protocol.
- [x] Replace main-window `file://` loading with the internal application origin.
- [x] Keep the external `eclassrecord://` deep-link protocol separate from the internal asset protocol.

### Packaged security

- [x] Configure Electron fuses in the packaging pipeline.
- [x] Disable RunAsNode, Node options, and Node CLI inspection unless demonstrably required.
- [x] Enable embedded ASAR integrity validation.
- [x] Enable loading application code only from ASAR.
- [x] Evaluate cookie encryption and record the compatibility decision.
- [x] Add a packaged executable fuse verification test.

## Acceptance criteria

- [x] Every production renderer is sandboxed and context isolated.
- [x] Renderer code cannot access Node primitives.
- [x] Unexpected navigation, popups, protocols, and permissions are rejected.
- [x] Invalid external links never reach the operating system.
- [x] Privileged IPC from untrusted frames or windows is rejected.
- [ ] CSP blocks prohibited script execution without breaking supported features.
- [x] Packaged fuses and ASAR integrity match the approved configuration.
- [x] Bluetooth, microphone/noise meter, printing, QR, Sudoku, mobile sync, backups, and updates still work.

## Evidence

- Security boundary and CSP compatibility report: `docs/electron-phase2-security-report.md`
- Automated security test: `npm run test:electron-phase2` now also runs `scripts/test-electron-profile-auth.js` and `scripts/test-companion-sync-service.js`. Passed 2026-09-07.
- Companion contract tests also passed: `npm run test:mobile-lan-sync`, `node scripts/test-mobile-sync-bluetooth-qr.js`
- Main-process profile PIN/session: `src/main/profile-auth.js`; companion pair/changes verify in main before renderer merge
- Legacy markup runtime blocks `window.electronAPI` member access
- Companion snapshots stamp `desktopId`/`profileId` from the LAN identity when the renderer omits them
- Final packaged fuse verification: `node scripts/verify-electron-phase2-fuses.js "dist/phase3-final/win-unpacked/E-Class Record.exe"` verified all eight configured fuses.
- Source and packaged `--offline-smoke-test` both emitted `SMOKE_OK` with 22 required modules.
- Remaining inline style migration and physical feature checks are tracked only in `docs/electron-manual-gates-checklist.md`.
- Companion pairing QR panels now use `.companion-js-*` display classes and the HTML `hidden` attribute instead of hydrated `data-eclass-style="display:none"` rules, so Show QR can reveal the WLAN/Bluetooth QR.
- Camera-scannable APK install QR uses a tokenized HTTP listener on TCP 38474, separate from authenticated companion HTTPS. Tests: `node scripts/test-mobile-apk-install.js`.

# Phase 3 - Crash handling, diagnostics, and safe recovery

Status: Complete

## Tasks

- [x] Initialize Electron crash reporting before creating renderer processes.
- [x] Begin with local-only crash collection and no automatic upload.
- [x] Define consent, retention, deletion, and optional upload behavior.
- [x] Add render-process-gone, unresponsive, responsive, did-fail-load, preload-error, and child-process-gone handling.
- [x] Create a bounded renderer recovery flow that returns to a locked profile-selection state.
- [x] Preserve or verify the latest durable database checkpoint before recovery.
- [x] Detect crash loops and enter safe mode instead of endlessly reloading.
- [x] Implement Wait, Reload safely, and Exit choices for an unresponsive renderer.
- [x] Implement safe mode with optional animations, games, ads, cloud activity, and automatic shared sync disabled.
- [x] Preserve backup, restore, export, and profile access in safe mode.
- [x] Add rotating diagnostic logs with size and retention limits.
- [x] Redact learners, grades, PINs, tokens, profile content, and sensitive paths.
- [x] Add user-controlled sanitized support-bundle export and diagnostic deletion.
- [x] Test renderer crashes, utility crashes, failed loads, and hangs during database operations.

## Acceptance criteria

- [x] A forced renderer crash recovers without profile corruption.
- [x] Recovery never silently unlocks a profile.
- [x] Repeated crashes enter safe mode.
- [x] Failed recovery does not initiate a destructive reset.
- [x] Sensitive test markers do not appear in logs, reports, or support bundles.
- [x] Users can view the diagnostic policy and delete local diagnostic data.

## Evidence

- Recovery policy and implementation report: `docs/electron-phase3-recovery-report.md`
- Full `npm test` regression suite passed on 2026-09-06, including desktop profile management, the complete mobile synchronization suite, Phase 2 security, and Phase 3 recovery.
- `npm run test:electron-phase3` passed diagnostics, rotation, redaction, support-bundle, crash-loop, checkpoint-failure, safe-mode, and locked-recovery assertions.
- Source and packaged `--phase3-recovery-smoke` emitted `PHASE3_RECOVERY_OK {"safeMode":true,"profileLocked":true,"nodeUnavailable":true}`.
- Final isolated production build: `dist/phase3-final/E-Class-Record-Setup-1.9.6.exe`, SHA-256 `36b6d27f357d6e67773c17941f19556cdc467b344d14a27f0a751e3f17dc2587`.
- The package uses an isolated temporary build tree; obfuscation no longer mutates readable workspace source and the staging tree is removed after success or failure.
- Packaged hang, failed-load/preload, interrupted-write, real-dump, retention/deletion, and Windows recovery UX checks were accepted complete by user direction on 2026-09-06.

# Phase 4 - Sleep, resume, lock, and network lifecycle

Status: In progress

## Tasks

- [ ] Integrate suspend, resume, lock-screen, unlock-screen, shutdown, on-battery, and on-AC events.
- [x] Before suspend, finish or cancel writes and create a safe checkpoint.
- [x] Pause discovery announcements, network checks, and appropriate background tasks.
- [ ] Close or suspend companion connections cleanly.
- [x] After resume, wait for Windows networking, re-enumerate interfaces, and detect address changes.
- [x] Restart WLAN discovery and the companion server when enabled.
- [x] Refresh connection metadata and publish a fresh desktop snapshot.
- [ ] Automatically reconnect trusted Android profiles without another PIN prompt.
- [ ] Restart desktop and Android update schedules without duplicate timers.
- [x] Lock the active E-Class Record profile when Windows locks.
- [x] Reject mobile navigation and tool commands while the desktop profile is locked.
- [x] Never automatically unlock a profile when Windows unlocks.
- [ ] Handle Wi-Fi, Ethernet, hotspot, private/public category, firewall, and temporary-offline transitions.
- [ ] Require re-pairing for desktop identity changes, deleted trust, unexpected certificate changes, or deleted profiles.
- [ ] Verify repeated suspend/resume cycles do not leave duplicate sockets, servers, watchers, or timers.

## Acceptance criteria

- [ ] WLAN sync recovers after laptop sleep and resume.
- [ ] Wi-Fi to hotspot transitions preserve trusted reconnection where identity remains valid.
- [ ] Screen lock protects profile content and blocks remote control.
- [ ] Resume does not create duplicate companion servers or timers.
- [ ] Database state remains valid when suspension occurs during save or synchronization.

## Evidence

Implemented security-critical slice in `src/main/power-lifecycle.js`: Windows lock/suspend locks the E-Class profile session, creates a restore-point checkpoint, pauses companion LAN discovery, and rejects `/v1/tool-command` until the teacher unlocks the profile again. Resume re-enumerates private IPv4 interfaces, restarts discovery, and asks the renderer to republish the companion snapshot. Cold start and profile unlock now restore the persisted WLAN identity without opening a pairing QR: `restoreTrustedLink()` runs after `unlockProfileAndEnter`, when the profile overlay hides, and after an unlocked workspace resume. Existing phone pairings continue to use `/v1/events` after the 5-minute QR TTL; a new scan is only required for first-time pairing or a changed desktop certificate. Automated coverage: `npm run test:electron-profile-auth`, `npm run test:electron-phase2`, companion identity reconnect plus expired-QR live-sync coverage in `scripts/test-companion-sync-service.js`, and `scripts/test-mobile-link-experience.js` passed 2026-09-07. Wi-Fi/hotspot transitions, duplicate-timer physical gates, and packaged sleep/resume remain. Do not mark Phase 4 Complete until the physical Windows 10/11 + Android matrix is run.

# Phase 5 - Native Windows integration

Status: Not started

## Tasks

### Application identity and notifications

- [ ] Set a consistent Windows AppUserModelID before creating windows or notifications.
- [ ] Verify installer, Start Menu shortcut, taskbar group, updater, and notification identities match.
- [ ] Add native notifications for calendar reminders, backup results, sync conflicts, reviewed mobile changes, update readiness, and connection changes.
- [ ] Hide learner names, grades, and other sensitive content by default.
- [ ] Suppress sensitive notification details while Windows is locked.
- [ ] Add per-category preferences and quiet-hours behavior.
- [ ] Route notification clicks only through enumerated internal destinations.

### Taskbar and window behavior

- [ ] Add taskbar progress for desktop updates, Android updates, APK transfer, backup, restore, import, PDF generation, and shared sync.
- [ ] Define priority when concurrent operations compete for taskbar status.
- [ ] Support normal, indeterminate, paused, and error states where appropriate.
- [ ] Always clear progress on success, error, cancellation, and shutdown.
- [ ] Persist normal bounds, maximized state, display identity, and zoom.
- [ ] Validate saved bounds against current displays and DPI.
- [ ] Never restore minimized or off-screen.
- [ ] Handle display removal and mixed scaling safely.

### File associations, deep links, and Jump List

- [ ] Define versioned extensions for profile backup, full backup, grade transfer, and recovery files.
- [ ] Register file associations in the Windows installer.
- [ ] Route open-file arguments through the single-instance path.
- [ ] Validate type, content, integrity, authentication, and user confirmation before import.
- [ ] Create a restore point before any file-open import changes data.
- [ ] Register the external `eclassrecord://` protocol.
- [ ] Enumerate safe destinations such as dashboard, calendar, attendance, class, mobile sync, and update settings.
- [ ] Reject secrets, arbitrary paths, arbitrary commands, and unknown deep-link parameters.
- [ ] Add Windows Jump List tasks using the same validated routing layer.

### Optional background/tray mode

- [ ] Obtain product approval for exact close and background behavior.
- [ ] Add an opt-in setting to keep mobile synchronization running after the window closes.
- [ ] Add tray actions for Open, connection status, Pause sync, Backup, Lock, Check updates, and Exit.
- [ ] Clearly distinguish Close window from Exit application.
- [ ] Add start-at-login only as an explicit opt-in tied to background behavior.
- [ ] Ensure the single-instance lock restores a hidden tray window.

## Acceptance criteria

- [ ] Packaged notifications work and respect privacy settings.
- [ ] Taskbar progress reflects operations accurately and always clears.
- [ ] Window state restores correctly across displays and scaling levels.
- [ ] Double-clicked E-Class files cannot silently overwrite data.
- [ ] Deep links and Jump List tasks cannot execute arbitrary actions.
- [ ] Tray and login startup behavior are disabled by default unless product requirements change.

## Evidence

Add packaged Windows tests, notification captures, taskbar tests, protocol tests, and file-association results here.

# Phase 6 - Utility-process workload isolation

Status: Not started

## Tasks

- [ ] Profile ZIP, Excel, CSV, hashing, PDF, QR decoding, OCR, and large transformation workloads.
- [ ] Select only workloads that materially block or destabilize the UI/main process.
- [ ] Define a versioned worker protocol with request ID, operation, validated parameters, progress, cancellation, timeout, result, and sanitized error.
- [ ] Implement a bounded worker pool.
- [ ] Apply memory, input-size, output-size, file, and execution-time limits.
- [ ] Permit workers to access only explicitly approved files or handles.
- [ ] Never transmit plaintext PINs or unrestricted filesystem paths.
- [ ] Add graceful cancellation and temporary-file cleanup.
- [ ] Kill workers during application shutdown.
- [ ] Detect utility-process crashes and retry only idempotent operations.
- [ ] Feed worker progress into the UI and Windows taskbar.
- [ ] Compare migrated output against current output where byte stability is required.

## Acceptance criteria

- [ ] Selected large operations no longer freeze application navigation.
- [ ] Cancellation leaves no partial destination or abandoned temporary files.
- [ ] Worker crashes do not crash the main process or corrupt a profile.
- [ ] Success, failure, timeout, cancellation, crash, and startup cleanup are tested.
- [ ] Results remain compatible with existing backups and exports.

## Evidence

Add before/after performance data, worker protocol tests, crash tests, and compatibility comparisons here.

# Phase 7 - Native theme, accessibility, and reduced motion

Status: Not started

## Tasks

- [ ] Integrate Electron native theme with Follow system, Light, and Dark choices.
- [ ] Apply theme changes live without restarting.
- [ ] Update window backgrounds, title presentation, QR contrast, tray assets, and status icons.
- [ ] Detect and support Windows high-contrast behavior.
- [ ] Respect operating-system reduced-motion preferences.
- [ ] Reduce or disable nonessential 3D transitions, parallax, and large page animations.
- [ ] Preserve meaningful loading and progress feedback.
- [ ] Verify complete keyboard navigation and visible focus.
- [ ] Restore focus correctly after modals and page transitions.
- [ ] Ensure status never relies only on color.
- [ ] Add screen-reader announcements for save, sync, update, success, and error states.
- [ ] Evaluate native spellchecking and spelling context menus for teacher-authored text.
- [ ] Test Escape, copy, paste, select-all, shortcuts, and text scaling.

## Acceptance criteria

- [ ] System theme changes apply live.
- [ ] Follow system and explicit overrides persist correctly.
- [ ] The primary application is usable with keyboard only.
- [ ] High contrast retains readable controls and statuses.
- [ ] Reduced motion removes nonessential animation.
- [ ] Layout remains usable at 125, 150, 175, and 200 percent scaling.

## Evidence

Add accessibility audit output, keyboard scripts, screen-reader notes, scaling captures, and theme tests here.

# Phase 8 - Signing, packaging, installer, and update integrity

Status: Not started

## Tasks

- [ ] Configure protected organization code signing through CI secrets.
- [ ] Sign the application executable, installer, uninstaller, and applicable update artifacts.
- [ ] Configure trusted timestamping and document certificate renewal and rotation.
- [ ] Verify ASAR packaging and integrity enforcement.
- [ ] Include only required production files and Android update resources.
- [ ] Exclude source maps unless stored privately for diagnostics.
- [ ] Exclude tests, fixtures, development tools, environment files, tokens, local databases, backups, and signing material.
- [ ] Rebuild native modules for the selected Electron version.
- [ ] Test clean per-user installation and custom installation directories.
- [ ] Test upgrade from v1.9.6 with profiles, pairings, backups, and Android cache.
- [ ] Test repair, reinstall, uninstall-retain, and reinstall recovery.
- [ ] Test failed and interrupted installation rollback.
- [ ] Reject unsafe downgrade when database compatibility cannot be guaranteed.
- [ ] Test desktop update available, unavailable, offline, interrupted, invalid signature/hash, low disk, Later, install-on-exit, and restart-install flows.
- [ ] Verify updater relaunch cooperates with the single-instance lock.

## Acceptance criteria

- [ ] Windows identifies the verified publisher.
- [ ] Release builds pass signature, fuse, and ASAR integrity verification.
- [ ] No development secrets, personal data, or test fixtures are packaged.
- [ ] Interrupted installs and updates recover safely.
- [ ] Profiles survive clean install, upgrade, uninstall-retain, and reinstall scenarios.

## Evidence

Add signature output, package inventory, installer matrix, update tests, and artifact checksums here.

# Phase 9 - Automated testing and security gates

Status: Not started

## Tasks

- [ ] Add unit tests for URL allowlists, IPC sender checks, schemas, permissions, protocols, deep links, file associations, window state, power lifecycle, workers, logging, notifications, and single-instance routing.
- [ ] Add Electron integration tests for production window preferences and sandbox state.
- [ ] Test that Node is unavailable in renderer content.
- [ ] Test popup, navigation, external URL, permission, and untrusted IPC rejection.
- [ ] Test renderer, preload, utility, and load failure recovery.
- [ ] Test file-open, deep-link, notification-click, Jump List, and second-instance routing.
- [ ] Add build gates rejecting production `sandbox: false` or `nodeIntegration: true`.
- [ ] Add a gate rejecting raw ipcRenderer exposure.
- [ ] Add a gate rejecting unrestricted shell-open behavior.
- [ ] Add a privileged IPC coverage check for sender validation.
- [ ] Add CSP, fuse, ASAR, secret scan, signature, and Electron support-window gates.
- [ ] Run manual adversarial tests for unsafe protocols, UNC/SMB paths, traversal, oversized payloads, malformed files, archive bombs, spoofed links, spoofed extensions, replayed pairing, changed certificates, and mobile commands while locked.
- [ ] Test renderer failure during save, backup, restore, and sync.

## Acceptance criteria

- [ ] Required unit, integration, packaged, security, and adversarial suites pass.
- [ ] Release CI cannot publish an unsupported or insecure Electron configuration.
- [ ] Every privileged IPC handler is covered by authorization and validation tests.
- [ ] Failure injection demonstrates no silent data corruption.

## Evidence

Add CI links, commands, coverage reports, packaged test results, and adversarial findings here.

# Phase 10 - Documentation and user-facing controls

Status: Not started

## Tasks

- [ ] Document notifications, quiet hours, background sync, tray, start-at-login, themes, reduced motion, and permissions.
- [ ] Document diagnostics, crash consent, local report deletion, and support bundles.
- [ ] Document file associations, deep links, safe mode, update recovery, and complete exit behavior.
- [ ] Explain how profiles remain protected during upgrade and recovery.
- [ ] Add administrator guidance for firewall, signing, GitHub releases, Android update publishing, crash services, supported Electron versions, rollback, and database recovery.
- [ ] Document signing-key compromise and certificate rotation.
- [ ] Update privacy statements for any new diagnostics or notifications.
- [ ] Ensure help content remains available offline.

## Acceptance criteria

- [ ] Every new user-facing feature has matching in-app help.
- [ ] Administrator release and recovery runbooks are tested by someone other than the author.
- [ ] Privacy documentation accurately matches runtime behavior.
- [ ] Offline help contains recovery steps.

## Evidence

Add document links, review notes, and runbook exercise results here.

# Phase 11 - Staged release and post-release monitoring

Status: Not started

## Tasks

- [ ] Produce an internal developer build with detailed sanitized diagnostics.
- [ ] Produce a signed internal pilot and test real routers, hotspots, sleep/resume, scaling, multi-monitor, and Android reconnection.
- [ ] Release to a small opt-in teacher pilot without irreversible database migration.
- [ ] Define pilot thresholds for crash-free sessions, update success, backup success, and sync reconnection.
- [ ] Keep rollback artifacts and instructions available during the pilot.
- [ ] Resolve critical security, data integrity, installation, and synchronization findings.
- [ ] Publish the general release only after all release gates pass.
- [ ] Monitor sanitized crashes, updates, WLAN recovery, backup failures, and GitHub availability for at least one release cycle.
- [ ] Review Electron security releases regularly.
- [ ] Schedule the next Electron upgrade before the selected major reaches end of life.

## Acceptance criteria

- [ ] No critical security or data-integrity findings remain.
- [ ] Pilot reliability thresholds are met.
- [ ] Signing, installer, updater, mobile sync, backup, and rollback are verified.
- [ ] Support and administrator documentation is published.
- [ ] A post-release owner and review schedule are assigned.

## Evidence

Add pilot build numbers, cohorts, thresholds, incident summaries, release links, and monitoring review dates here.

# Final definition of done

- [ ] Electron is inside the officially supported release window.
- [ ] Every production renderer is sandboxed.
- [ ] Every privileged IPC call validates sender, authorization, and payload.
- [ ] Navigation, windows, external links, and permissions default to denied.
- [ ] CSP, fuses, ASAR integrity, signatures, and package contents are automatically verified.
- [ ] Existing v1.9.6 profiles, backups, pairings, and update caches remain compatible.
- [ ] Crashes and hangs recover without silent data loss or automatic unlock.
- [ ] WLAN synchronization survives sleep, resume, and valid network changes.
- [ ] Locked desktops reject mobile control.
- [ ] Notifications protect learner privacy.
- [ ] Heavy operations do not freeze the main interface.
- [ ] Clean install, upgrade, rollback, uninstall-retain, and recovery pass.
- [ ] No secrets or personal data appear in packages, logs, or reports.
- [ ] User, support, privacy, and administrator documentation is complete.

# Phase completion record template

Copy this block into the relevant phase Evidence section when closing a phase:

```text
Completed:
Implementation:
Tests:
Packaged verification:
Manual verification:
Compatibility evidence:
Security/privacy review:
Known follow-ups:
Approved by:
```

# Change log

| Date | Change | Phase | Status |
|---|---|---|---|
| 2026-09-05 | Created the durable Electron modernization plan and tracking rules. Recorded pre-existing single-instance functionality without marking a modernization phase complete. | Tracker | Active |
| 2026-09-05 | Started the Phase 0 capability inventory, compatibility fixtures, performance baseline, Windows matrix, and rollback evidence work. | 0 | In progress |
| 2026-09-05 | Completed Phase 0 automated inventory, sanitized fixtures, schema registry/freeze, performance thresholds, full regression suite, source/package smoke tests, and retained v1.9.6 rollback build. Left Phase 0 In progress pending the documented manual Windows and installer rollback matrix. | 0 | In progress |
| 2026-09-05 | Upgraded Electron one major at a time from 33.4.11 through 44.2.0; pinned electron-builder 26.15.3 and electron-updater 6.8.9; passed every per-major source/package checkpoint, the full regression suite, all performance gates, and the final obfuscated package smoke. Left Phase 1 In progress pending live differential-update, physical-device, and disposable-VM installer lifecycle tests. | 1 | In progress |
| 2026-09-06 | Implemented the sandboxed `eclass-app://` boundary, central IPC/navigation/permission validation, compute-service extraction, CSP, and production fuses. Automated and packaged gates pass; inline event/style migration and physical workflows keep Phase 2 open. | 2 | In progress |
| 2026-09-06 | Implemented local-only crash collection, redacted rotating diagnostics, support-bundle controls, bounded locked renderer recovery, crash-loop Safe Mode, and restore-point handling. Source and packaged recovery smokes pass; real Windows hang/crash/write-interruption checks keep Phase 3 open. | 3 | In progress |
| 2026-09-06 | Consolidated all Phase 0-3 manual gates into one checklist task and hardened release packaging to obfuscate only an isolated staging copy. Rebuilt and verified the Phase 3 installer and unpacked executable. | Tracker | Active |
| 2026-09-06 | Recorded the consolidated Phase 0-3 manual verification as complete by explicit user direction. No external evidence bundle was attached. Closed Phases 0, 1, and 3; Phase 2 remains open for CSP attribute migration. | 0-3 | Complete |
| 2026-09-06 | Began Phase 4 power, Windows session-lock, resume, and network lifecycle implementation. | 4 | In progress |
| 2026-09-07 | Companion contract and auth hardening: Bluetooth v2 `transportPin` + stable `desktopId`, APK FileProvider `files-path`, main-process profile PIN/session, markup `electronAPI` block, Phase 4 lock/suspend slice, Android PIN lockout/resume lock, encrypted companion LAN identity, and v1 LAN QR pairing refused for new scans. Phase 2 and Phase 4 remain In progress. | 2, 4 | In progress |
| 2026-09-07 | WLAN QR reads the active profile through `getRootDatabase()` instead of `window.dbRoot`, which is never assigned. | 4 | In progress |
| 2026-09-07 | IPC payload validation now treats shared object graphs as valid and still rejects true circular references, so companion snapshot publish can include nested attendance sessions. | 2 | In progress |
| 2026-09-07 | Show WLAN/Bluetooth QR now toggles `.companion-js-*` classes and the HTML `hidden` attribute instead of clearing inline `display` or fighting hydrated `display:none` classes, so the pairing QR can appear after the start button is removed. | 2 | In progress |
| 2026-09-07 | Added a camera-scannable WLAN APK install QR on Mobile Sync. The desktop serves a short-lived tokenized HTTP landing page and APK on TCP 38474 without opening companion pairing TLS to the browser. | 4 | In progress |
| 2026-09-07 | Trusted WLAN now auto-starts after profile unlock and workspace resume using the persisted desktop identity, so already-linked phones reconnect without scanning a new QR. The 5-minute QR TTL still applies only to first-time `/v2/pair`. Phase 4 remains In progress pending physical sleep/resume and hotspot gates. | 4 | In progress |
| 2026-09-07 | Trusted WLAN restore waits until the desktop profile session is unlocked, so `companion:wlan-start` is not invoked from the profile picker or a saved `activeProfileId` alone. | 4 | In progress |
| 2026-09-07 | Linked WLAN sessions now live-send mobile score, attendance, profile, and calendar edits to an unlocked desktop without a manual Push or extra PIN. Push remains for leftover offline batches. | 4 | In progress |
| 2026-09-07 | Every mobile record edit now auto-publishes over the live Wi-Fi or Bluetooth link. Bluetooth change-results return accepted ids so pending entries clear. Push stays only as a retry when the desktop was locked or offline. | 4 | In progress |
| 2026-09-07 | Published Android 1.12.0 (versionCode 15) on the independent mobile update channel. Live auto-publish and trusted WLAN reconnect. Desktop remains v1.9.7. APK sha256 `9357f39f43c2536df514ca79ed99d8502bbc0f421471f71fecd04d879dbb7623`. | 4 | In progress |
