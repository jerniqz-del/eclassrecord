package com.example.eclassrecordmobile.data

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.json.encodeToJsonElement
import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.PBEKeySpec
import javax.crypto.spec.SecretKeySpec

@Serializable
data class SchoolCloudKdf(
    val name: String = "PBKDF2",
    val hash: String = "SHA-256",
    val iterations: Int
)

@Serializable
data class SchoolCloudEnvelope(
    val secureBackup: Boolean = true,
    val format: String = "eclass-record-encrypted-payload",
    val encryptionVersion: Int = 2,
    val purpose: String,
    val algorithm: String = "AES-256-GCM",
    val kdf: SchoolCloudKdf,
    val salt: String,
    val iv: String,
    val ciphertext: String
)

object SchoolCloudCrypto {
    private const val CURRENT_ITERATIONS = 310_000
    private const val MIN_ITERATIONS = 100_000
    private const val MAX_ITERATIONS = 2_000_000
    private val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
    }
    private val random = SecureRandom()

    fun encrypt(plaintext: String, secret: String, purpose: String): JsonObject {
        require(secret.matches(Regex("^[a-fA-F0-9]{64}$"))) { "Invalid school content key." }
        val salt = ByteArray(16).also(random::nextBytes)
        val iv = ByteArray(12).also(random::nextBytes)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, deriveKey(secret, salt, CURRENT_ITERATIONS), GCMParameterSpec(128, iv))
        val envelope = SchoolCloudEnvelope(
            purpose = purpose,
            kdf = SchoolCloudKdf(iterations = CURRENT_ITERATIONS),
            salt = salt.toHex(),
            iv = iv.toHex(),
            ciphertext = cipher.doFinal(plaintext.toByteArray(Charsets.UTF_8)).toHex()
        )
        return json.encodeToJsonElement(envelope) as JsonObject
    }

    fun decrypt(envelopeJson: JsonObject, secret: String): String {
        require(secret.matches(Regex("^[a-fA-F0-9]{64}$"))) { "Invalid school content key." }
        val envelope = json.decodeFromJsonElement<SchoolCloudEnvelope>(envelopeJson)
        require(envelope.format == "eclass-record-encrypted-payload"
            && envelope.encryptionVersion == 2
            && envelope.algorithm == "AES-256-GCM") { "Unsupported encrypted School Cloud payload." }
        require(envelope.kdf.name == "PBKDF2" && envelope.kdf.hash == "SHA-256"
            && envelope.kdf.iterations in MIN_ITERATIONS..MAX_ITERATIONS) {
            "Unsafe or unsupported School Cloud key derivation settings."
        }
        val salt = envelope.salt.hexBytes()
        val iv = envelope.iv.hexBytes()
        require(salt.size == 16 && iv.size == 12) { "Encrypted School Cloud payload has invalid parameters." }
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(
            Cipher.DECRYPT_MODE,
            deriveKey(secret, salt, envelope.kdf.iterations),
            GCMParameterSpec(128, iv)
        )
        return cipher.doFinal(envelope.ciphertext.hexBytes()).toString(Charsets.UTF_8)
    }

    private fun deriveKey(secret: String, salt: ByteArray, iterations: Int): SecretKeySpec {
        val spec = PBEKeySpec(secret.toCharArray(), salt, iterations, 256)
        val bytes = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).encoded
        spec.clearPassword()
        return SecretKeySpec(bytes, "AES")
    }

    private fun ByteArray.toHex() = joinToString("") { "%02x".format(it) }

    private fun String.hexBytes(): ByteArray {
        require(length % 2 == 0 && matches(Regex("^[a-fA-F0-9]+$"))) { "Invalid hexadecimal payload." }
        return ByteArray(length / 2) { index ->
            substring(index * 2, index * 2 + 2).toInt(16).toByte()
        }
    }
}
