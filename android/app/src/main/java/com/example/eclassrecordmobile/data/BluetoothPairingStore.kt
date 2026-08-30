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
)

object BluetoothPairingStore {
    private const val FILE_NAME = "bluetooth_pairing.json"
    private const val DEVICE_CODE_FILE = "bluetooth_device_code.txt"
    private val json = Json { ignoreUnknownKeys = true }

    fun load(context: Context): BluetoothPairing? {
        val file = File(context.filesDir, FILE_NAME)
        if (!file.exists()) return null
        return runCatching {
            json.decodeFromString<BluetoothPairing>(SecureFileStore.readText(file).text)
        }.getOrNull()
    }

    fun save(context: Context, pairing: BluetoothPairing) {
        SecureFileStore.writeText(
            File(context.filesDir, FILE_NAME),
            json.encodeToString(pairing),
        )
    }

    fun clear(context: Context) {
        File(context.filesDir, FILE_NAME).delete()
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
