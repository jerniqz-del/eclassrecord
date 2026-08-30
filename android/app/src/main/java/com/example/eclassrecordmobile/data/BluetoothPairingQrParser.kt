package com.example.eclassrecordmobile.data

import java.util.UUID

data class DesktopBluetoothPairingQr(
    val pin: String,
    val sessionId: String,
)

object BluetoothPairingQrParser {
    private const val PREFIX = "ECLASS-COMPANION"
    private const val VERSION = "1"
    private const val TRANSPORT = "bluetooth"

    fun parse(rawValue: String): DesktopBluetoothPairingQr {
        val value = rawValue.trim()
        require(value.length in 1..2048) { "This QR code is empty or too large." }
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
}

