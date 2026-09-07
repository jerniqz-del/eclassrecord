package com.example.eclassrecordmobile.data

import org.json.JSONObject
import java.util.UUID

data class DesktopBluetoothPairingQr(
    val pin: String,
    val sessionId: String,
    val desktopId: String = "",
    val desktopName: String = "E-Class Record Desktop",
    val profileId: String = "legacy-active-profile",
    val profileName: String = "Teacher profile",
    val schoolYear: String = "",
)

object BluetoothPairingQrParser {
    private const val PREFIX = "ECLASS-COMPANION"
    private const val VERSION = "1"
    private const val TRANSPORT = "bluetooth"

    fun parse(rawValue: String): DesktopBluetoothPairingQr {
        val value = rawValue.trim()
        require(value.length in 1..2048) { "This QR code is empty or too large." }
        if (value.startsWith("{")) return parseV2(value)
        val parts = value.split('|')
        require(parts.size == 9) { "This is not a current E-Class Bluetooth QR code." }
        require(parts[0] == PREFIX && parts[1] == VERSION) {
            "This QR code is for an unsupported E-Class version."
        }
        require(parts[2] == TRANSPORT) { "Scan the Bluetooth QR code, not the Wi-Fi QR code." }
        require(runCatching { UUID.fromString(parts[5]) }.isSuccess) {
            "The QR pairing session is invalid."
        }
        require(parts[6].matches(Regex("[A-Za-z0-9_-]{32,128}"))) {
            "The QR pairing secret is invalid."
        }
        require(parts[7].matches(Regex("[a-fA-F0-9]{64}"))) {
            "The QR fingerprint is invalid."
        }
        require(parts[8].matches(Regex("\\d{6}"))) {
            "The QR pairing PIN is invalid or missing."
        }
        return DesktopBluetoothPairingQr(pin = parts[8], sessionId = parts[5])
    }

    private fun parseV2(value: String): DesktopBluetoothPairingQr {
        val root = JSONObject(value)
        require(root.optString("type") == "eclass-companion-pairing" && root.optInt("version") == 2) {
            "This is not a current E-Class Bluetooth QR code."
        }
        require(root.optString("transport") == TRANSPORT) { "Scan the Bluetooth QR code, not the Wi-Fi QR code." }
        val sessionId = root.optString("pairingSessionId")
        val desktopId = root.optString("desktopId")
        val profileId = root.optString("profileId")
        val pin = root.getJSONObject("bluetooth").optString("transportPin")
        require(runCatching { UUID.fromString(sessionId) }.isSuccess) { "The QR pairing session is invalid." }
        require(runCatching { UUID.fromString(desktopId) }.isSuccess) { "The desktop identity is invalid." }
        require(profileId.isNotBlank()) { "The desktop profile identity is missing." }
        require(pin.matches(Regex("\\d{6}"))) { "The QR transport PIN is invalid." }
        require(java.time.Instant.parse(root.getString("expiresAt")).isAfter(java.time.Instant.now())) {
            "This pairing QR has expired. Generate a new QR on the desktop."
        }
        return DesktopBluetoothPairingQr(
            pin, sessionId, desktopId,
            root.optString("desktopName", "E-Class Record Desktop"),
            profileId,
            root.optString("profileName", "Teacher profile"),
            root.optString("schoolYear"),
        )
    }
}

