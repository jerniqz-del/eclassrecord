# Mobile Companion Sync v2

## Outcome

An Android device can save several desktop-profile connections and keep an isolated, encrypted offline workspace for each one. A profile is paired by scanning the desktop QR and entering its six-digit PIN. The same profile identity and pending-change journal are used over local Wi-Fi, an Android phone hotspot, or Bluetooth.

## Connection model

- The desktop owns a stable `desktopId`; each teacher workspace supplies its stable `profileId`.
- Android keys saved connections and local storage by `desktopId/profileId`.
- The desktop QR contains protocol version 2, desktop/profile labels, a short-lived pairing expiry, transport coordinates, and cryptographic bootstrap material. It never contains the teacher profile PIN.
- Android calls the authenticated `/v2/pair` endpoint and saves the connection only after the active desktop profile validates the PIN.
- Failed PIN attempts are rate-limited. A QR expires after five minutes and can be refreshed from the desktop.
- Protocol version 1 remains readable for migration and compatibility, but new pairings use version 2.

## Transport behavior

### Wi-Fi or phone hotspot

The desktop HTTPS service publishes all usable private IPv4 addresses in the QR. Android tries those direct addresses before multicast discovery, so it works when the computer joins the Android phone's hotspot even if multicast is unavailable. The desktop's Refresh Network QR action re-reads network interfaces after switching between a router and hotspot.

TLS certificate fingerprint pinning, HMAC request authentication, AES-GCM payload encryption, session validation, and profile validation are applied to snapshot, event, pairing, and change requests.

### Bluetooth

Bluetooth uses the same desktop/profile identity as LAN. Its QR supplies the discovery tag and transport PIN needed to establish the BLE session. Saved Bluetooth pairings are stored per profile, reconnect to the correct profile workspace, and reject snapshots for another profile.

Bluetooth is the lower-throughput fallback. Wi-Fi or hotspot should remain the primary transport for initial or large snapshots.

## Offline and retry rules

- Authoritative snapshots, pending scores, pending attendance, and pending change IDs live in a separate encrypted directory for every desktop/profile pair.
- A user can switch saved profiles without mixing their rosters, grades, attendance, or queues.
- Mobile edits are written to the encrypted pending journal before the cached snapshot is updated.
- Every pending mutation has a stable `changeId`. Retrying after a timeout or lost acknowledgement sends the same ID.
- The desktop keeps a bounded applied-ID ledger and acknowledges accepted IDs. Android deletes only those acknowledged entries.
- A new edit to an already-pending score receives a new ID, preventing an earlier successful retry from hiding the new value.
- Incoming desktop snapshots are merged with still-pending mobile edits, keeping offline work visible until it is accepted.
- Desktop application of a batch is transactional in memory: validation or persistence failure restores the prior database.

## Profile selection and safety

Android shows saved desktop profiles and lets the teacher select or forget one. Selection aligns LAN, Bluetooth, and the local encrypted database. Forgetting one connection does not erase other profiles. Changes are refused when the active Android profile and active desktop profile differ; the teacher must open the matching desktop profile first.

Legacy single-profile files are copied into the first selected v2 profile once. The originals are retained during migration to avoid destructive recovery behavior.

## Operational flow

1. Open the intended desktop teacher profile.
2. Start Wi-Fi/Hotspot or Bluetooth pairing on the desktop.
3. If using a phone hotspot, connect the computer to it and select Refresh Network QR.
4. On Android, scan the QR and enter the displayed pairing/profile PIN.
5. Select the saved profile when moving between desktop workspaces.
6. Work offline as needed. Pending records remain encrypted on the phone.
7. Reconnect with any paired transport and authorize Push Grades. Only acknowledged changes leave the queue.

## Verification and rollout

Automated coverage includes QR v1/v2 parsing, PIN acceptance/rejection, stable desktop/profile identity, hotspot wording and direct-host behavior, Bluetooth sessions, encrypted pairing registries, profile-isolated storage, stable change IDs, selective acknowledgements, duplicate suppression, and snapshot identity checks.

Release validation should also exercise two physical desktop profiles and one Android device across these scenarios:

1. Pair profile A on router Wi-Fi and profile B on a phone hotspot.
2. Record different offline changes in both profiles, restart Android, and verify both queues remain isolated.
3. Push profile A, interrupt the acknowledgement once, retry, and confirm the desktop applies it only once.
4. Switch the desktop to profile B and push B; confirm A's records are unchanged.
5. Disable WLAN, reconnect B over Bluetooth, and verify a small snapshot and change batch.
6. Try an expired QR, incorrect PIN, and mismatched active profile; each must fail without saving or deleting mobile data.

For rollout, ship desktop and Android v2 together, keep v1 compatibility during the transition, monitor pairing failures and queue age without collecting grade content, then retire new v1 pairing only after the supported installed base has upgraded.
