# Phase 0 Windows Test Matrix

This matrix defines the environments that must be exercised before Phase 0 can be closed. Automated checks use sanitized data and isolated Electron user-data directories. Manual rows must be run on disposable Windows accounts or virtual machines after creating a profile backup.

## Environment coverage

| ID | Windows | Account | Network | Display/power condition | Required checks | Current evidence | Status |
|---|---|---|---|---|---|---|---|
| W10-STD-PRIVATE | Windows 10 22H2 | Standard | Private Wi-Fi/WLAN | 100% DPI | Launch, profile login, save, backup/restore, WLAN pair/reconnect, update check, print/PDF | Development-machine unit, fixture, runtime, source smoke, and packaged smoke evidence | Automated pass; manual workflow pending |
| W10-ADM-PUBLIC | Windows 10 22H2 | Administrator | Public network | 125% DPI | Firewall-denied diagnostics, no unintended public listener access, offline core workflow | Not yet run in an isolated account | Pending |
| W10-HOTSPOT | Windows 10 22H2 | Standard | Android hotspot | Mixed 100%/150% DPI | QR pair, initial PIN, sync push/pull, automatic reconnect, address change | Not yet run with two physical devices | Pending |
| W11-STD-PRIVATE | Windows 11 23H2 or later supported release | Standard | Private Wi-Fi/WLAN | 100% and 150% DPI | Clean install, launch, profile login, save, backup/restore, WLAN sync, print/PDF | Environment not currently available | Pending |
| W11-ADM-PUBLIC | Windows 11 23H2 or later supported release | Administrator | Public network | 200% DPI | Firewall prompts, rejected pairing, updater, external links, uninstall-retain/reinstall | Environment not currently available | Pending |
| W11-HOTSPOT | Windows 11 23H2 or later supported release | Standard | Android hotspot | Laptop battery | Pair/reconnect, suspend/resume during sync, IP change, update transfer interruption | Environment not currently available | Pending |
| OFFLINE | Windows 10 and 11 | Standard | No network | 100% DPI | Classes, attendance, grades, calendar, save, backup, restore, Excel, PDF | Source and packaged offline smoke pass on Windows 10 | Partial |
| SLEEP-RESUME | Windows 10 and 11 | Standard | Private and hotspot | Sleep, resume, lock, unlock | Durable save, no duplicate timers, reconnect, locked-profile command rejection | Lifecycle implementation belongs to Phase 4; baseline manual observation pending | Pending |
| UPGRADE | Windows 10 and 11 | Standard | Offline then private | 100% DPI | Install v1.9.6, create synthetic data, upgrade candidate, verify all fixtures | v1.9.6 rollback build retained; upgrade candidate not yet applicable | Prepared |
| ROLLBACK | Windows 10 and 11 | Standard | Offline | 100% DPI | Back up, install candidate, restore v1.9.6, reopen compatible backup, verify no userData deletion | Packaged payload smoke passed; disposable-VM installer rollback pending | Partial |

## Test data and safety rules

- Use only `scripts/electron-phase0-fixtures.js` or data created specifically with `TEST-` / `Synthetic` markers.
- Never copy a teacher's production `userData` directory into a test VM.
- Record OS build, account type, network category, DPI, device names, app hashes, start/end time, and result.
- Before upgrade or rollback tests, export an entire-profile backup and verify its integrity.
- A failed test must retain sanitized logs and exact reproduction steps; it must not retain PINs, learner names, grades, tokens, or sensitive paths.

## Automated commands

```powershell
npm run test:electron-phase0
npm run electron:phase0:baseline
npm run smoke:offline
```

The packaged smoke command must launch `dist/phase0-baseline/win-unpacked/E-Class Record.exe --offline-smoke-test` with `ELECTRON_RUN_AS_NODE` removed from the child environment.

## Completion rule

Phase 0 remains **In progress** until the pending Windows 11, hotspot, mixed-DPI, and disposable-VM installer rollback rows are recorded as passing. Phase 1 must not remove the retained v1.9.6 artifact.
