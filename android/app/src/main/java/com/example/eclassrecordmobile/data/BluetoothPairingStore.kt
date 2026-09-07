package com.example.eclassrecordmobile.data

import android.content.Context
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.io.File
import java.util.UUID

@Serializable
data class BluetoothPairing(
    val desktopId: String,
    val desktopName: String,
    val reconnectToken: String,
    val pairedAt: String,
    val profileId: String = "legacy-active-profile",
    val profileName: String = "Teacher profile",
    val schoolYear: String = "",
) {
    val profileKey: String get() = desktopId + ":" + profileId
}

@Serializable
private data class BluetoothPairingRegistry(
    val version: Int = 2,
    val activeProfileKey: String = "",
    val pairings: List<BluetoothPairing> = emptyList(),
)

object BluetoothPairingStore {
    private const val FILE_NAME = "bluetooth_pairing.json"
    private const val REGISTRY_FILE_NAME = "bluetooth_pairings_v2.json"
    private const val DEVICE_CODE_FILE = "bluetooth_device_code.txt"
    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }

    fun load(context: Context): BluetoothPairing? {
        val registry = readRegistry(context)
        return registry.pairings.find { it.profileKey == registry.activeProfileKey }
            ?: registry.pairings.firstOrNull()
    }

    fun save(context: Context, pairing: BluetoothPairing) {
        val registry = readRegistry(context)
        val pairings = registry.pairings.filterNot { it.profileKey == pairing.profileKey } + pairing
        writeRegistry(context, BluetoothPairingRegistry(2, pairing.profileKey, pairings))
    }

    fun clear(context: Context) {
        val registry = readRegistry(context)
        val active = load(context) ?: return
        clear(context, active.profileKey)
    }

    fun clear(context: Context, profileKey: String) {
        val registry = readRegistry(context)
        val remaining = registry.pairings.filterNot { it.profileKey == profileKey }
        val nextActiveKey = registry.activeProfileKey
            .takeIf { it != profileKey && remaining.any { pairing -> pairing.profileKey == it } }
            ?: remaining.firstOrNull()?.profileKey.orEmpty()
        writeRegistry(context, BluetoothPairingRegistry(
            activeProfileKey = nextActiveKey,
            pairings = remaining,
        ))
    }

    fun list(context: Context): List<BluetoothPairing> = readRegistry(context).pairings

    fun select(context: Context, profileKey: String): BluetoothPairing? {
        val registry = readRegistry(context)
        val selected = registry.pairings.find { it.profileKey == profileKey } ?: return null
        writeRegistry(context, registry.copy(activeProfileKey = selected.profileKey))
        return selected
    }

    private fun readRegistry(context: Context): BluetoothPairingRegistry = runCatching {
        val file = File(context.filesDir, REGISTRY_FILE_NAME)
        if (file.exists()) {
            json.decodeFromString<BluetoothPairingRegistry>(SecureFileStore.readText(file).text)
        } else {
            val legacyFile = File(context.filesDir, FILE_NAME)
            val legacy = if (legacyFile.exists()) {
                json.decodeFromString<BluetoothPairing>(SecureFileStore.readText(legacyFile).text)
            } else null
            BluetoothPairingRegistry(2, legacy?.profileKey.orEmpty(), listOfNotNull(legacy))
        }
    }.getOrElse { BluetoothPairingRegistry() }

    private fun writeRegistry(context: Context, registry: BluetoothPairingRegistry) {
        SecureFileStore.writeText(File(context.filesDir, REGISTRY_FILE_NAME), json.encodeToString(registry))
    }

    fun deviceCode(context: Context): String {
        val file = File(context.filesDir, DEVICE_CODE_FILE)
        if (file.exists()) {
            runCatching { SecureFileStore.readText(file).text.trim() }
                .getOrNull()
                ?.takeIf { it.matches(Regex("[A-Z0-9]{4}")) }
                ?.let { return it }
        }
        val alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
        val code = buildString {
            repeat(4) { append(alphabet.random()) }
        }
        SecureFileStore.writeText(file, code)
        return code
    }

    fun newReconnectToken(): String =
        UUID.randomUUID().toString() + UUID.randomUUID().toString()
}
