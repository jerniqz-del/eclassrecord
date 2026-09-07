# Electron Phase 1 Performance Comparison

Baseline: Electron 33.4.11 (2026-09-05T13:49:39.864Z)  
Current: Electron 44.2.0 (2026-09-05T14:42:12.094Z)

| Measurement | Phase 0 | Phase 1 | Limit | Result |
|---|---:|---:|---:|---|
| Electron ready | 32.08 | 200.9 | 282.08 | Pass |
| Probe renderer ready | 906.91 | 385.1 | 1156.91 | Pass |
| Main working set | 83600 | 87332 | 134800 | Pass |
| Renderer working set | 73712 | 75668 | 124912 | Pass |
| Retained large-sheet heap | 69144 | 69144 | 10554904 | Pass |
| PDF generation | 155.44 | 285.79 | 655.44 | Pass |
| Full offline smoke | 16637.46 | 15048.5 | 20796.82 | Pass |
| Database save | 9.98 | 4.78 | 59.98 | Pass |
| Backup create/verify | 0.05 | 0.06 | 20.05 | Pass |
| Legacy restore | 0.01 | 0.01 | 20.01 | Pass |
| Large-sheet JSON round trip | 0.16 | 0.16 | 20.16 | Pass |
| Excel write | 10.1 | 9.03 | 260.1 | Pass |
| Excel read | 7.16 | 8.03 | 257.16 | Pass |
| 16 MiB update transfer | 30.63 | 28.39 | 280.63 | Pass |
| WLAN reconnect | 12.16 | 11.4 | 262.16 | Pass |

The thresholds are the permitted Phase 0 regression gates. Timing measurements remain sensitive to machine load and should be repeated on the same power profile when a result fails narrowly.
