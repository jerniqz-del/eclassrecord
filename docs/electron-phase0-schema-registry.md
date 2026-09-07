# Phase 0 Data and Protocol Schema Registry

This registry records the compatibility surface before Electron modernization. Newer code must preserve unknown future versions and must not silently downgrade them.

| Surface | Current version | Format or discriminator | Authority | Compatibility requirement |
|---|---:|---|---|---|
| Root profile database | 7 | Root object with `profiles` | `src/renderer/js/database.js` | Preserve future root versions and unknown profile fields. |
| Active profile database | 7 | Profile data object | `src/renderer/js/database.js` | Normalize old versions idempotently; do not mutate encrypted payloads before authentication. |
| Full/secondary backup | 2 | `eclass-record-backup` | `src/renderer/js/security.js`, `src/main/file-io.js` | Accept supported legacy versions, verify v2 integrity, reject unsupported future versions safely. |
| Profile deletion backup | 1 | `eclass-record-profile-backup` | `src/renderer/js/profile-management.js` | Verify integrity before restore and never persist transient plaintext PINs. |
| Encrypted profile payload | 2 | AES-GCM with PBKDF2-SHA-256 metadata | `src/renderer/js/security.js` | Continue decrypting legacy payloads and reject authentication/tamper failure. |
| Advisory store | 2 | `advisory.schemaVersion` | `src/renderer/js/advisory-data.js` | Migration is idempotent and preserves future schema versions and unknown fields. |
| Teacher Tools store | 11 | `teacherTools.schemaVersion` | `src/renderer/js/teacher-tools-core.js` | Preserve future versions and migrate older checklist/activity structures. |
| Dashboard workplace | 1 | `workplace.version` | `src/renderer/js/dashboard-workplace.js` | Preserve tasks, preferences, and last context. |
| Grade transfer | 1.0 | `eclass-record-grade-export` | `src/renderer/js/advisory-grade-transfer.js` | Reject unsupported schemas without modifying current grades. |
| Shared-folder envelope | 1 | `eclass-record-sync` | `src/main/shared-folder-sync.js`, `src/renderer/js/shared-sync-crypto.js` | Verify envelope, recovery identity, revisions, and encryption before merge. |
| Companion discovery protocol | 1 | `eclass-discovery-result` | `src/main/companion-sync-service.js` | Maintain discovery compatibility until an explicitly versioned transition exists. |
| Companion authorization protocol | 2 | Pairing and authenticated request protocol | `src/main/companion-sync-service.js` | Reject replay, wrong profile, wrong certificate, or unsupported protocol. |
| Mobile snapshot | 4 | `eclass-companion-snapshot` | `src/renderer/js/mobile-sync-companion.js` | Android and desktop must negotiate supported snapshot formats. |
| Mobile update manifest | 1 | Android application ID plus APK metadata | `src/main/mobile-update-channel.js` | Verify application ID, version, SHA-256, file name, and companion protocol. |
| School Cloud vault | 1 | OS-encrypted vault envelope | `src/main/school-cloud-vault.js` | Never downgrade or expose decrypted credentials to renderer storage. |
| Usage analytics consent | 2026-07-18-analytics-v1 | Consent version string | `src/renderer/js/usage-analytics.js` | No collection without the matching explicit consent record. |

## Migration safeguards

- Modernization phases must not increment a data schema solely because Electron was upgraded.
- A schema change requires a separate migration design, compatibility fixture, restore point, forward test, rollback analysis, and tracker evidence.
- Normalizers must be idempotent.
- Future schema versions and unknown fields must be retained where the application already promises forward tolerance.
- Integrity verification must happen before normalization when an integrity descriptor exists.
- Encrypted data must remain encrypted at rest and must never be placed into logs or crash reports.
- Downgrade must be blocked when a newer build has performed an incompatible irreversible migration.
