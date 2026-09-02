package com.example.eclassrecordmobile.data

import android.content.Context
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.io.File
import java.util.UUID

@Serializable
data class LanPairing(
    val host: String,
    val hosts: List<String> = emptyList(),
    val port: Int,
    val sessionId: String,
    val secret: String,
    val certificateFingerprint: String,
)

object LanPairingStore {
    private const val FILE_NAME = "lan_pairing.json"
    private val json = Json { ignoreUnknownKeys = true }

    fun parseQr(rawValue: String): LanPairing {
        val parts = rawValue.trim().split('|')
        require(parts.size == 9 && parts[0] == "ECLASS-COMPANION" && parts[1] == "1") {
            "This is not a current E-Class companion QR code."
        }
        require(parts[2] == "wlan") { "Scan the WLAN / Wi-Fi QR code shown on the desktop." }
        val hosts = parts[3].split(',').map(String::trim).filter(String::isNotBlank).distinct()
        require(hosts.isNotEmpty() && hosts.all { it.matches(Regex("[A-Za-z0-9.:-]{3,128}")) }) { "The desktop network addresses are invalid." }
        val port = parts[4].toIntOrNull()
        require(port != null && port in 1024..65535) { "The desktop network port is invalid." }
        require(runCatching { UUID.fromString(parts[5]) }.isSuccess) { "The desktop pairing session is invalid." }
        require(parts[6].matches(Regex("[A-Za-z0-9_-]{32,128}"))) { "The pairing secret is invalid." }
        require(parts[7].matches(Regex("[a-fA-F0-9]{64}"))) { "The desktop certificate fingerprint is invalid." }
        return LanPairing(hosts.first(), hosts, port, parts[5], parts[6], parts[7].lowercase())
    }

    fun load(context: Context): LanPairing? = runCatching {
        val file = File(context.filesDir, FILE_NAME)
        if (!file.exists()) null else json.decodeFromString<LanPairing>(SecureFileStore.readText(file).text)
    }.getOrNull()

    fun save(context: Context, pairing: LanPairing) {
        SecureFileStore.writeText(File(context.filesDir, FILE_NAME), json.encodeToString(pairing))
    }

    fun clear(context: Context) {
        File(context.filesDir, FILE_NAME).delete()
    }
}
