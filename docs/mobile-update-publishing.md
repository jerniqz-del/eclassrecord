# Publishing Android updates without a desktop release

The desktop reads a permanent stable manifest from:

`https://raw.githubusercontent.com/jerniqz-del/eclassrecord/main/mobile-updates/stable/mobile-update.json`

While running, the desktop checks this channel immediately at startup and every 5 minutes afterward. It downloads and verifies the APK, then keeps the last valid package locally for WLAN or phone-hotspot delivery. Bluetooth is not used for APK delivery.

## Release a mobile update

1. Increase `versionCode` and `versionName` in `android/app/build.gradle.kts`. Android requires every update to use a higher version code.
2. Build the signed release APK with the same signing certificate as the installed mobile app.
3. Run `npm run mobile:update-package -- <path-to-signed-apk> <release notes>`. This creates the correctly named APK and `mobile-update.json` beside it.
4. Create a GitHub prerelease whose tag is `mobile-v<versionName>`, for example `mobile-v1.9.8`. Upload the generated APK as a release asset. Do not mark this as the repository's Latest desktop release.
5. Copy the generated manifest to `mobile-updates/stable/mobile-update.json`, commit it to `main`, and verify that its `downloadUrl`, byte `size`, and `sha256` match the uploaded asset.
6. In the desktop app, open Mobile Companion Synchronization and select **Check Updates Now**. Connected phones will be offered the cached update and can choose **Update Now** or **Later**.

Only the first desktop version containing this generic channel reader must be installed. Later compatible Android releases update the manifest and APK on GitHub, not the desktop executable. If a future mobile release needs a companion protocol above `2`, publish a compatible desktop update first.

## First install from the desktop (camera QR)

Teachers can share the cached APK with a phone that does not have the app yet:

1. Open Mobile Companion Synchronization (`Ctrl+Shift+M`).
2. Select **Check Updates Now** or **Import Mobile Update** so a verified APK is cached.
3. Select **Show install QR**.
4. On the phone, stay on the same Wi-Fi or connect the computer to the phone hotspot, then scan the QR with the **camera** (not the companion scanner).
5. On the landing page, tap **Download APK** and allow install from this source if Android asks.
6. After the app is installed, scan the separate WLAN pairing QR from inside the Android app.

The install QR encodes a short-lived `http://` LAN URL on TCP port `38474`. It is not the pairing QR and does not use the authenticated companion HTTPS port. The listener stops after 15 minutes, when the teacher selects **Stop install QR**, or when the desktop profile locks.

If pairing already works but the install download does not, allow E-Class Record on Private networks for TCP 38474.

Manual **Import Mobile Update** remains available when internet access is unavailable. Keep `mobile-update.json` beside its APK when importing.
