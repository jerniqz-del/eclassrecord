# Standalone Android repository merge

The former local repository at `D:\Projects\eclassrecord-android` was consolidated into this repository on 2026-08-27.

## Source provenance

- Standalone branch: `main`
- Standalone base commit: `d453d95 feat: initialize offline Android companion`
- Standalone Git remote: none
- Unified destination: `android/`
- Active application namespace: `com.example.eclassrecordmobile`

## Capability mapping

| Standalone capability | Unified implementation |
| --- | --- |
| Bottom mobile navigation and dashboard | `ui/main/PremiumMainScreen.kt` |
| Bluetooth GATT peripheral and pairing | `data/BleServerManager.kt`, `data/BluetoothPairingStore.kt` |
| QR onboarding | `data/BluetoothPairingQrParser.kt`, `ui/SyncScreen.kt` |
| Score and attendance drafts | `data/DatabaseHelper.kt` with encrypted `SecureFileStore` persistence |
| Snapshot models and import | `data/DataModel.kt`, authoritative snapshot handling in `BleServerManager.kt` |
| Personal performance checklist | `data/PersonalChecklistRepository.kt`, `ui/PersonalChecklistPanel.kt` |
| Classroom tools and desktop controls | `ui/DesktopFeatureScreen.kt`, `ui/main/PremiumMainScreen.kt` |
| Connection strength and progress | `data/BleServerManager.kt`, `ui/SyncScreen.kt` |

The standalone eight-field QR/WLAN client was not copied into the active application because the unified protocol uses the newer nine-field QR payload with automatic PIN loading and Bluetooth as the primary transport. Keeping both would create conflicting pairing formats and two sources of connection state.

The unified Android implementation uses encrypted app-private files for authoritative snapshots, drafts, trusted pairing data, and personal checklist data. The desktop app remains the final source of truth.

