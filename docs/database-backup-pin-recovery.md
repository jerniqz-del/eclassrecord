# Database, Backup, and PIN Recovery Compatibility

This contract applies from database schema version 4 onward. It is additive: databases and backups made by earlier E-Class Record releases remain readable.

## Compatibility guarantees

- Legacy single-profile databases are still detected and migrated through the existing profile-creation flow.
- Root/profile databases from versions 1–3 retain their profiles, teaching loads, learners, assessments, scores, Advisory records, and unknown fields. Missing version-4 metadata is added on the next successful save.
- Legacy PIN hashes (`SHA-256(PIN + salt)`) remain verifiable. After a successful legacy unlock, the next save transparently replaces the hash and salt with a tagged PBKDF2-SHA-256 hash using 310,000 iterations. Newly created or recovered PINs use the stronger format immediately, so future code can select the correct verifier without guessing.
- Legacy AES-256-GCM encrypted profiles and backups without encryption metadata continue to use the original 100,000-iteration PBKDF2 path. New encrypted payloads carry their algorithm, encryption version, KDF, hash, and iteration count.
- Raw older JSON backups and older `secureBackup` objects remain restorable. New manual exports and secondary-folder profile copies use the version-2 `eclass-record-backup` envelope. Local rolling backups retain the complete checksummed root database.
- A database or backup declaring a newer unsupported format is not silently downgraded or overwritten.

## Integrity behavior

Version-4 root databases receive a canonical SHA-256 integrity descriptor. The descriptor is checked against the raw file before normalization, migration, profile selection, or saving. A mismatch stops loading without replacing or repairing the file.

Primary database files, rolling backups, and secondary-folder backups are written to a verified temporary JSON file and atomically renamed into place. The previous primary database is copied to the pre-save rolling history before replacement.

Version-2 manual backup envelopes contain format/version metadata and a checksum covering their metadata and payload. Plain-backup corruption is detected before restore. Encrypted backups additionally use AES-GCM authentication, which detects ciphertext changes or an incorrect PIN.

The SHA-256 checksum detects accidental damage; it is not a digital signature and does not prove who created an unencrypted file. PIN-encrypted data receives authenticated-encryption protection.

Restore and PIN recovery build and validate detached copies. The active in-memory database is replaced only after validation and successful persistence. Failed decryption, malformed data, invalid Advisory references, checksum mismatch, or save failure leaves the source data unchanged.

## Offline PIN recovery

PIN recovery is opt-in for PIN-protected profiles:

1. Unlock the profile using its current PIN.
2. Open **Settings → PIN Recovery**.
3. Verify the current PIN and select **Set Up Recovery**.
4. Save or print the generated recovery QR card, or store the displayed recovery key separately, and confirm it was saved.

If the PIN is later forgotten, select the profile and choose **Forgot PIN? Use Recovery Key**. Upload the saved QR image or type the recovery key manually, then assign a new 6-digit PIN. The app locally decodes the image, unwraps and verifies the old PIN, decrypts and validates the profile, then writes a newly encrypted copy under the new PIN. No learner data or recovery secret leaves the device.

The QR payload is versioned and contains only a random recovery identifier, the high-entropy recovery key, and a checksum. It does not contain the PIN, profile/teacher name, learner records, grades, or database contents. QR generation and uploaded-image decoding use libraries bundled with the desktop app and require no network connection. The checksum catches incomplete or altered QR payloads; the encrypted recovery wrapper remains the security boundary.

Important limitations:

- A profile from an earlier release must be successfully unlocked once to enroll recovery. Existing encrypted data cannot be recovered retroactively without either its original PIN or a previously created usable backup.
- The recovery key and QR are shown only during enrollment. The app stores only an encrypted PIN wrapper, a random recovery identifier, and a four-character hint—not the readable recovery key or QR image.
- Replacing the recovery key generates a new recovery identifier and invalidates previous keys and QR cards. Changing the PIN through a valid recovery card keeps that card active.
- Anyone holding the QR card or recovery key can replace the profile PIN. Treat either as a physical master key and store it away from the computer and backups.
- Recovery changes the live profile PIN. Older separately exported encrypted backups still require the PIN that protected them when they were created.

## Verification

Run:

```powershell
npm run test:database-future-proof
npm test
npm run smoke:offline
```

The dedicated suite covers old PIN hashes, old encrypted payloads, old raw backups, current encryption, wrong credentials, tampering, unsupported future versions, legacy-profile recovery, recovery rollback, QR encoding/decoding, altered payloads, wrong-profile QR cards, unreadable images, and data preservation. The offline Electron test exercises real QR generation/decoding, recovery, versioned backup round trips, database checksum generation, renderer errors, and the existing Advisory workflows.

Automated Electron runs override both `appData` and `userData` before the file-I/O module is loaded. Test saves therefore use a process-specific temporary directory and cannot open or replace the installed app's real database.
