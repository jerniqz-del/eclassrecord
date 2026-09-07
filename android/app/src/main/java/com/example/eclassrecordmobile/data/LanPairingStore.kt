package com.example.eclassrecordmobile.data

import android.content.Context
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import org.json.JSONObject
import java.io.File
import java.nio.charset.StandardCharsets
import java.util.UUID

@Serializable
data class LanPairing(
    val host: String,
    val hosts: List<String> = emptyList(),
    val port: Int,
    val sessionId: String,
    val secret: String,
    val certificateFingerprint: String,
    val protocolVersion: Int = 1,
    val desktopId: String = "",
    val desktopName: String = "E-Class Record Desktop",
    val profileId: String = "legacy-active-profile",
    val profileName: String = "Teacher profile",
    val schoolYear: String = "",
    val pairedAt: String = "",
) {
    val profileKey: String
        get() = desktopId.ifBlank { "legacy-" + sessionId } + ":" + profileId.ifBlank { "legacy-active-profile" }
}

@Serializable
private data class LanPairingRegistry(
    val version: Int = 2,
    val activeProfileKey: String = "",
    val pairings: List<LanPairing> = emptyList(),
)

object LanPairingStore {
    private const val FILE_NAME = "lan_pairing.json"
    private const val REGISTRY_FILE_NAME = "lan_pairings_v2.json"
    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }

    fun parseQr(rawValue: String): LanPairing {
        val value = rawValue.trim()
        if (value.startsWith("{")) return parseV2Qr(value)
        val parts = value.split('|')
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
        val desktopId = UUID.nameUUIDFromBytes(("desktop:" + parts[5]).toByteArray(StandardCharsets.UTF_8)).toString()
        return LanPairing(hosts.first(), hosts, port, parts[5], parts[6], parts[7].lowercase(), desktopId = desktopId)
    }

    private fun parseV2Qr(value: String): LanPairing {
        val root = JSONObject(value)
        require(root.optString("type") == "eclass-companion-pairing" && root.optInt("version") == 2) {
            "This is not a current E-Class companion QR code."
        }
        require(root.optString("transport") == "wlan") { "Scan the Wi-Fi / hotspot QR code shown on the desktop." }
        val desktopId = root.optString("desktopId")
        val profileId = root.optString("profileId")
        val sessionId = root.optString("pairingSessionId")
        val secret = root.optString("bootstrapSecret")
        require(runCatching { UUID.fromString(desktopId) }.isSuccess) { "The desktop identity is invalid." }
        require(profileId.matches(Regex("[A-Za-z0-9_.:-]{3,160}"))) { "The desktop profile identity is invalid." }
        require(runCatching { UUID.fromString(sessionId) }.isSuccess) { "The desktop pairing session is invalid." }
        require(secret.matches(Regex("[A-Za-z0-9_-]{32,128}"))) { "The pairing secret is invalid." }
        require(java.time.Instant.parse(root.getString("expiresAt")).isAfter(java.time.Instant.now())) {
            "This pairing QR has expired. Generate a new QR on the desktop."
        }
        val lan = root.getJSONObject("lan")
        val addresses = lan.getJSONArray("hosts")
        val hosts = (0 until addresses.length()).map { addresses.getString(it).trim() }.filter(String::isNotBlank).distinct()
        val port = lan.optInt("port")
        val fingerprint = lan.optString("certificateFingerprint").lowercase()
        require(hosts.isNotEmpty() && hosts.all { it.matches(Regex("[A-Za-z0-9.:-]{3,128}")) }) { "The desktop network addresses are invalid." }
        require(port in 1024..65535) { "The desktop network port is invalid." }
        require(fingerprint.matches(Regex("[a-f0-9]{64}"))) { "The desktop certificate fingerprint is invalid." }
        return LanPairing(
            hosts.first(), hosts, port, sessionId, secret, fingerprint,
            protocolVersion = 2,
            desktopId = desktopId,
            desktopName = root.optString("desktopName", "E-Class Record Desktop").take(160),
            profileId = profileId,
            profileName = root.optString("profileName", "Teacher profile").take(160),
            schoolYear = root.optString("schoolYear").take(40),
            pairedAt = java.time.Instant.now().toString(),
        )
    }

    fun load(context: Context): LanPairing? {
        val registry = readRegistry(context)
        return registry.pairings.find { it.profileKey == registry.activeProfileKey }
            ?: registry.pairings.firstOrNull()
    }

    fun list(context: Context): List<LanPairing> = readRegistry(context).pairings

    fun save(context: Context, pairing: LanPairing) {
        val registry = readRegistry(context)
        val pairings = registry.pairings.filterNot { it.profileKey == pairing.profileKey } + pairing
        writeRegistry(context, LanPairingRegistry(activeProfileKey = pairing.profileKey, pairings = pairings))
    }

    fun select(context: Context, profileKey: String): LanPairing? {
        val registry = readRegistry(context)
        val selected = registry.pairings.find { it.profileKey == profileKey } ?: return null
        writeRegistry(context, registry.copy(activeProfileKey = selected.profileKey))
        return selected
    }

    fun clear(context: Context) {
        val active = load(context) ?: return
        remove(context, active.profileKey)
    }

    fun remove(context: Context, profileKey: String): LanPairing? {
        val registry = readRegistry(context)
        val removed = registry.pairings.find { it.profileKey == profileKey } ?: return null
        val remaining = registry.pairings.filterNot { it.profileKey == profileKey }
        val nextActiveKey = registry.activeProfileKey
            .takeIf { it != profileKey && remaining.any { pairing -> pairing.profileKey == it } }
            ?: remaining.firstOrNull()?.profileKey.orEmpty()
        writeRegistry(context, LanPairingRegistry(
            activeProfileKey = nextActiveKey,
            pairings = remaining,
        ))
        return removed
    }

    private fun readRegistry(context: Context): LanPairingRegistry = runCatching {
        val file = File(context.filesDir, REGISTRY_FILE_NAME)
        if (file.exists()) {
            json.decodeFromString<LanPairingRegistry>(SecureFileStore.readText(file).text)
        } else {
            val legacyFile = File(context.filesDir, FILE_NAME)
            val legacy = if (legacyFile.exists()) {
                json.decodeFromString<LanPairing>(SecureFileStore.readText(legacyFile).text)
            } else null
            LanPairingRegistry(2, legacy?.profileKey.orEmpty(), listOfNotNull(legacy))
        }
    }.getOrElse { LanPairingRegistry() }

    private fun writeRegistry(context: Context, registry: LanPairingRegistry) {
        SecureFileStore.writeText(File(context.filesDir, REGISTRY_FILE_NAME), json.encodeToString(registry))
    }
}
