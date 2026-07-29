# OneDrive Backup and Multi-PC Sync Guide

This guide applies to E-Class Record v1.7.2 and later. It explains how to keep
an encrypted profile backup in OneDrive and safely use the same profile on
another PC.

## Before you begin

- Install and sign in to the OneDrive desktop app on every PC.
- Use the latest E-Class Record version on every PC.
- Enable the six-digit PIN on the profile and keep that PIN available.
- Let OneDrive finish uploading or downloading before changing PCs.
- Create or select a dedicated folder inside OneDrive, such as:

```text
C:\Users\<Your Name>\OneDrive\E-Class Record Backups
```

Do not select the OneDrive root itself. The folder must be a writable subfolder
and must be available on the PC rather than an online-only placeholder. In File
Explorer, you can right-click the folder and choose **Always keep on this
device**.

For an explanation inside the app, open **Settings → OneDrive Backup & Sync**
and select **Start Interactive Tour**. This dedicated tour highlights only the
backup card and does not create an ID, select a folder, or change any data.

## Part 1: Set up the main PC

Use these steps only on the PC that already contains the profile records you
want to keep.

1. Open E-Class Record and unlock the correct profile.
2. Open **Settings**.
3. Find **OneDrive Backup & Sync**.
4. Confirm that the **Backup Recovery ID** box is empty.
5. Select **Create New ID**.
6. Verify the current profile PIN when requested.
7. Choose the dedicated folder inside OneDrive.
8. Wait while the app:
   - validates that the folder belongs to OneDrive;
   - creates the organized backup and synchronization folders;
   - generates the Backup Recovery ID;
   - creates a local restore point;
   - encrypts and verifies the first synchronized revision; and
   - enables synchronization only after setup succeeds.
9. Select **Copy** and store the Backup Recovery ID somewhere you can access
   from the other PC.
10. Keep the six-digit profile PIN separately. The Recovery ID locates the
    profile, but the PIN is still required to decrypt it.
11. Wait until E-Class Record shows **Folder Up to Date**.
12. Check the OneDrive icon and wait until OneDrive also reports that syncing is
    complete.

The app creates an organized structure similar to:

```text
<Selected OneDrive Folder>\
  E-Class Record\
    <Backup Recovery ID>\
      Backup\
      Restore Points\
      Sync\
```

Do not manually rename, move, edit, or combine files inside this structure.

## Part 2: Connect another PC

1. Sign in to the same OneDrive account on the second PC.
2. Wait for the E-Class Record backup folder to appear in File Explorer.
3. Make the folder locally available. If needed, right-click it and choose
   **Always keep on this device**.
4. Install or update E-Class Record.
5. Create or open the local profile that will receive the synchronized records.
   It must have PIN security enabled and must not already have a Backup Recovery
   ID. Using the same teacher name and PIN as the main PC makes setup clearer.
6. Open **Settings → OneDrive Backup & Sync**.
7. Paste the ID copied from the main PC into **Backup Recovery ID**.
8. Select **Connect Existing ID**.
9. Verify the current local profile PIN.
10. Select the same synchronized OneDrive parent folder on this PC. Its local
    Windows path may differ from the path on the main PC.
11. Enter the same six-digit profile PIN used on the main PC.
12. Wait while the app scans and validates the encrypted repository without
    writing to it.
13. If the local profile is empty, confirm that it may adopt the synchronized
    profile.
14. If both PCs contain records, review the comparison:
    - records present on only one PC are preserved;
    - non-conflicting changes are combined automatically; and
    - differing values require an explicit choice.
15. Complete the review. The app creates a pre-connection restore point before
    applying the synchronized profile.
16. Confirm that the status becomes **Folder Up to Date**.

The PIN from the main profile becomes the PIN for the connected profile. A
failed PIN, damaged file, canceled review, or interrupted connection leaves the
previous local profile unchanged.

## Using Profiles Found in OneDrive

The **Profiles Found in OneDrive** list scans detected OneDrive locations for
valid E-Class Record profiles.

1. Open **Settings → OneDrive Backup & Sync**.
2. Select **Refresh**.
3. Find the profile name and Recovery ID.
4. Select **Connect** for a synchronized profile, or **View Backup** for an
   ordinary recovery copy.
5. Verify the displayed profile, date, and protection before continuing.

Use the Recovery ID to confirm that you selected the intended profile when
several profiles are available.

## Normal daily use

- Continue working normally. E-Class Record always saves and verifies the local
  database first.
- The app then updates this device's encrypted backup and synchronization head.
- Before switching PCs, wait for **Folder Up to Date** in E-Class Record and for
  OneDrive to finish syncing.
- On the next PC, wait for OneDrive to finish downloading, open E-Class Record,
  and use **Check Now** under **Advanced backup and device settings**.
- If **Review Changes** appears, inspect and resolve the changes before
  continuing.
- When OneDrive is unavailable, continue working locally. The app will mark
  synchronization as pending and scan again when the folder returns.

## Status messages

| Status | Meaning |
| --- | --- |
| Sync Off | This PC saves locally but is not publishing to the shared folder. |
| Checking OneDrive | The app is scanning and validating files. |
| Folder Up to Date | E-Class Record has written or read the latest valid revision visible on this PC. |
| Review Needed | Two PCs changed related data and a teacher decision is required. |
| Sync Problem | The folder is missing, unavailable, damaged, conflicting, or could not be validated. Local saving remains active. |

`Folder Up to Date` describes what E-Class Record can currently see in the local
OneDrive folder. Only the OneDrive app can confirm that the files have reached
Microsoft's cloud and the other PC.

## If the profile is not available yet

If the second PC reports that the profile is not yet available:

1. Check the OneDrive status on the main PC.
2. Check the OneDrive status on the second PC.
3. Confirm that the same OneDrive account and folder are being used.
4. Select **Wait and Check Again**.
5. If you need to work immediately, select **Continue Working Offline**.

Continuing offline does not assign the Recovery ID and does not write a new
repository. Use **Connect Existing ID** again after OneDrive finishes.

## Troubleshooting

### The folder is rejected

- Select a subfolder inside a detected OneDrive account, not the OneDrive root.
- Confirm that OneDrive is running and signed in.
- Confirm that the folder exists and is writable.
- Make the folder available offline with **Always keep on this device**.
- Do not select a shortcut or linked folder that leaves the OneDrive location.

### The Recovery ID is not found

- Copy the full ID again from the main PC.
- Select **Refresh** under **Profiles Found in OneDrive**.
- Confirm that OneDrive finished uploading on the main PC and downloading on
  this PC.
- Confirm that the selected folder is the corresponding local copy of the same
  OneDrive folder.

### The PIN is rejected

- Enter the six-digit PIN used by the synchronized profile on the main PC.
- The Backup Recovery ID does not replace or reset the PIN.
- If the PIN was forgotten, use the separately configured offline PIN Recovery
  Key or restore a backup whose PIN is known.

### Review Changes appears

- Open **Advanced backup and device settings**.
- Select **Review Changes**.
- Review each conflicting value. Do not choose a complete profile replacement
  unless the app explains that no shared merge base is available.

### OneDrive is offline or the folder was removed

- Keep working; local saving and local restore points remain active.
- Restore the OneDrive folder or reconnect the account.
- Select **Check Now** only after the folder becomes locally available.
- Do not create a new identity merely because OneDrive is temporarily delayed.

## Important safety rules

- Keep both the Backup Recovery ID and profile PIN available, but store them
  separately.
- Do not manually edit synchronization JSON files.
- Do not create a new synchronization identity on a second PC when joining an
  existing profile.
- Do not select **Start New Identity** unless you intentionally want to separate
  this PC from the identity used by the other PCs.
- Keep periodic manual JSON backups even when OneDrive synchronization is
  enabled.
- Never uninstall or clear local data until a recent backup has been verified.
