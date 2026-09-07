# Electron Phase 1 Upgrade Report

Recorded: 2026-09-05

## Outcome

The application runtime was upgraded incrementally from Electron 33.4.11 to Electron 44.2.0. Every intervening major was installed at its latest available patch and passed the same compatibility, Windows packaging, source smoke, and packaged smoke checkpoint.

Final exact pins:

| Package | Before | After |
|---|---:|---:|
| `electron` | 33.4.11 | 44.2.0 |
| `electron-builder` | 25.1.8 | 26.15.3 |
| `electron-updater` | 6.8.9 through the old range | 6.8.9 exact |

Both `package.json` and `package-lock.json` resolve these exact versions. The persisted database, backup, advisory, Teacher Tools, profile-deletion backup, mobile snapshot, and mobile-update schema versions did not change.

## Target selection

Electron officially supports its latest three stable major versions. On 2026-09-05 these were 42, 43, and 44; the official release index listed 42.11.2, 43.6.0, and 44.2.0. Electron 44.2.0 was selected to maximize the supported lifetime and receive the complete current fix stream.

Electron 44 no longer publishes Windows 32-bit binaries. E-Class Record's Windows target was already x64, and all Phase 1 packages were built and exercised on Windows 10 22H2 x64. The Windows 11 matrix remains a manual release gate.

Primary references:

- https://www.electronjs.org/docs/latest/tutorial/electron-timelines
- https://releases.electronjs.org/release
- https://www.electronjs.org/blog/electron-44-0
- https://www.electronjs.org/docs/latest/breaking-changes

## Incremental checkpoints

| Major | Exact checkpoint | Result |
|---:|---:|---|
| 34 | 34.5.8 | 11/11 checks passed |
| 35 | 35.7.5 | 11/11 checks passed |
| 36 | 36.9.5 | 11/11 checks passed |
| 37 | 37.10.3 | 11/11 checks passed |
| 38 | 38.8.6 | 11/11 checks passed |
| 39 | 39.8.10 | 11/11 checks passed |
| 40 | 40.10.6 | 11/11 checks passed |
| 41 | 41.10.7 | 11/11 checks passed |
| 42 | 42.11.2 | 11/11 checks passed |
| 43 | 43.6.0 | 11/11 checks passed |
| 44 | 44.2.0 | 11/11 checks passed |

Each checkpoint ran:

1. persisted-schema freeze verification;
2. all 11 sanitized compatibility fixtures;
3. database future-version and backup compatibility;
4. attendance PDF/print regression;
5. desktop updater regression;
6. WLAN companion-service regression;
7. Bluetooth fallback regression;
8. single-instance regression;
9. source offline Electron smoke;
10. an unpacked Windows x64 build; and
11. packaged offline Electron smoke.

Machine-readable durations and timestamps are in `docs/electron-phase1-checkpoints.json`.

## Breaking-change audit

- Electron 34: Windows fullscreen menu behavior changed. The app removes its application menu explicitly, so no code change was required.
- Electron 35: `console-message` arguments moved into the event object. The smoke diagnostic listener now uses the modern event-only signature.
- Electron 36: session extension APIs and storage quota options changed; the app uses neither. App-specific arguments already use `process.argv`.
- Electron 37: utility-process rejection and protocol response behavior changed; the app has no utility process or custom protocol response in Phase 1.
- Electron 38: legacy plugin-crash/routing APIs and platform support changed; none are used.
- Electron 39: popup/offscreen texture behavior changed and ASAR integrity stabilized; no affected APIs are used, and packaged ASAR launch passed.
- Electron 40: renderer access to Electron's clipboard module was deprecated. The app uses the web `navigator.clipboard` API.
- Electron 41: PDF rendering internals changed. The runtime PDF probe and attendance PDF/print regression passed.
- Electron 42: Electron binary download became lazy and offscreen scale defaults changed. The pinned runtime was verified and the app does not use offscreen windows.
- Electron 43: default download location and Linux window behavior changed. Desktop exports use explicit save dialogs.
- Electron 44: renderer Electron clipboard access and Windows 32-bit builds were removed; neither was used. ANGLE packaging and the final Windows x64 build passed.

## Final validation

- Complete `npm test` desktop/mobile regression suite: passed.
- `npm run electron:phase1:checkpoint`: passed on Electron 44.2.0.
- `npm run electron:phase1:baseline`: all 15 Phase 0 performance thresholds passed.
- Final production-style build: `npm run build -- --config.directories.output=dist/phase1-final`.
- Final obfuscated packaged smoke: `SMOKE_OK`, 22 modules, no Electron/Node deprecation warning.
- Rollback verification: retained Phase 0 v1.9.6 hashes remain independently verifiable.

Final build artifacts:

| Artifact | Bytes | SHA-256 |
|---|---:|---|
| `dist/phase1-final/E-Class-Record-Setup-1.9.6.exe` | 190,424,058 | `aab02b007c8ed27df6be7583e95a44bc2eb7073465f630bdddedea7991d09801` |
| `dist/phase1-final/E-Class-Record-Setup-1.9.6.exe.blockmap` | 198,995 | `32af160de60dc9cdec63c4ca004802839a049161d682183125a2162dea2b1b5d` |
| `dist/phase1-final/win-unpacked/resources/app.asar` | 157,534,670 | `0fb725279585a1430a01ca6a32218002553102018dd88112b4ff321d5ffa29ac` |

The installer remains unsigned. Signing and installer-integrity policy are Phase 8 tasks.

## Dependency audit

The final npm audit reports six advisories: one moderate, four high, and one critical. Five are transitive development/build graph advisories involving `tar`, `@mapbox/node-pre-gyp`, `brace-expansion`, `js-yaml`, and `undici`; the direct `xlsx` 0.18.5 dependency has two published advisories and no npm fix. A dry-run of `npm audit fix` attempted to add an obsolete optional `canvas`/`node-pre-gyp` chain, so it was not applied blindly. These findings are recorded for dependency-remediation and security-gate work rather than hidden by forced overrides.

## Remaining manual release gates

- Clean v1.9.6 install followed by an in-place Electron 44 upgrade on disposable Windows 10 and Windows 11 systems.
- Uninstall-retain/reinstall verification with sanitized profiles.
- Full v1.9.6 installer rollback after opening sanitized profiles in the Phase 1 build.
- Physical printer/dialog testing, GitHub release update installation, Windows public/private firewall behavior, Android hotspot synchronization, sleep/resume, and mixed-DPI displays.

Phase 1 remains **In progress** until these manual gates pass. Phase 2 must not begin by deleting the retained v1.9.6 rollback artifacts or changing a persisted schema.
