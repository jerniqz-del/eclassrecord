# Phase 1 Performance Baseline

Recorded: 2026-09-05T14:42:12.094Z

This is a development-machine baseline, not a hardware requirement. Compare later phases on the same machine and power profile. Each threshold allows the larger of the percentage or fixed tolerance shown.

## Environment

- App: 1.9.6
- Electron: 44.2.0
- OS: win32 10.0.19045 (x64)
- CPU: AMD Ryzen 3 3100 4-Core Processor              
- Logical processors: 8
- Memory: 7.94 GiB
- Large fixture: 250 learners, 42560 serialized bytes

## Measurements and permitted regression thresholds

| Measurement | Baseline | Phase 1+ gate |
|---|---:|---:|
| Electron ready | 200.9 ms | <= baseline + max(25%, 250 ms) |
| Probe renderer ready | 385.1 ms | <= baseline + max(25%, 250 ms) |
| Main working set | 87332 KiB | <= baseline + max(20%, 50 MiB) |
| Renderer working set | 75668 KiB | <= baseline + max(20%, 50 MiB) |
| Retained 250-learner sheet heap delta | 67.52 KiB | <= baseline + max(25%, 10 MiB) |
| PDF generation, 250 rows | 285.79 ms | <= baseline + max(30%, 500 ms) |
| Full offline smoke process | 15048.5 ms | <= baseline + max(25%, 2000 ms) |
| Atomic large database save, median | 4.78 ms | <= baseline + max(25%, 50 ms) |
| Backup creation and integrity, median | 0.06 ms | <= baseline + max(25%, 20 ms) |
| Legacy restore/migration, median | 0.01 ms | <= baseline + max(25%, 20 ms) |
| Large-sheet JSON round trip, median | 0.16 ms | <= baseline + max(25%, 20 ms) |
| Excel write, median | 9.03 ms | <= baseline + max(30%, 250 ms) |
| Excel read, median | 8.03 ms | <= baseline + max(30%, 250 ms) |
| 16 MiB update copy and SHA-256, median | 28.39 ms | <= baseline + max(30%, 250 ms) |
| WLAN stop/start reconnect, median | 11.4 ms | <= baseline + max(30%, 250 ms) |

PDF and Electron readiness use a hidden sandboxed runtime probe. The full offline smoke measurement launches the actual application with network requests blocked and waits for its built-in renderer validation to complete.


## Measurement commands

- `node scripts/measure-electron-phase0-baseline.js --write`
- `node scripts/electron-phase0-runtime-probe.js` through Electron
- `electron . --offline-smoke-test` through the baseline runner
