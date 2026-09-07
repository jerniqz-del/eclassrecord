package com.example.eclassrecordmobile.data

import android.content.Context
import android.util.Base64
import org.json.JSONObject
import java.io.File
import java.security.MessageDigest
import java.security.SecureRandom
import java.util.concurrent.ConcurrentHashMap
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.PBEKeySpec

object MobilePinLock {
    private const val FILE_NAME = "mobile_profile_locks.json"
    private const val ITERATIONS = 120_000
    private const val KEY_BITS = 256
    private const val MAX_FAILURES = 5
    private const val LOCKOUT_MS = 5 * 60 * 1000L
    private val unlockedThisSession = ConcurrentHashMap.newKeySet<String>()
    private val failures = ConcurrentHashMap<String, FailureRecord>()
    var lastError: String = ""
        private set

    private data class FailureRecord(var count: Int = 0, var blockedUntil: Long = 0L)

    fun enroll(context: Context, profileKey: String, pin: String) {
        require(profileKey.isNotBlank() && pin.matches(Regex("\\d{6}")))
        val salt = ByteArray(16).also { SecureRandom().nextBytes(it) }
        val records = read(context)
        records.put(profileKey, JSONObject()
            .put("salt", Base64.encodeToString(salt, Base64.NO_WRAP))
            .put("hash", Base64.encodeToString(derive(pin, salt), Base64.NO_WRAP))
            .put("iterations", ITERATIONS))
        write(context, records)
        unlockedThisSession.add(profileKey)
        failures.remove(profileKey)
        lastError = ""
    }

    fun isEnabled(context: Context, profileKey: String): Boolean =
        profileKey.isNotBlank() && read(context).has(profileKey)

    fun requiresUnlock(context: Context, profileKey: String): Boolean =
        isEnabled(context, profileKey) && !unlockedThisSession.contains(profileKey)

    fun lockSession(profileKey: String = "") {
        if (profileKey.isBlank()) unlockedThisSession.clear()
        else unlockedThisSession.remove(profileKey)
    }

    fun isBlocked(profileKey: String): Boolean {
        val record = failures[profileKey] ?: return false
        return record.blockedUntil > System.currentTimeMillis()
    }

    fun verify(context: Context, profileKey: String, pin: String): Boolean {
        lastError = ""
        if (isBlocked(profileKey)) {
            lastError = "Too many incorrect PIN attempts. Try again later."
            return false
        }
        if (!pin.matches(Regex("\\d{6}"))) {
            lastError = "Enter the six-digit desktop profile PIN."
            return false
        }
        val record = read(context).optJSONObject(profileKey) ?: return false
        val ok = runCatching {
            val salt = Base64.decode(record.getString("salt"), Base64.NO_WRAP)
            val expected = Base64.decode(record.getString("hash"), Base64.NO_WRAP)
            val actual = derive(pin, salt, record.optInt("iterations", ITERATIONS))
            MessageDigest.isEqual(expected, actual)
        }.getOrDefault(false)
        if (ok) {
            unlockedThisSession.add(profileKey)
            failures.remove(profileKey)
            return true
        }
        val failure = failures.getOrPut(profileKey) { FailureRecord() }
        failure.count += 1
        if (failure.count >= MAX_FAILURES) {
            failure.count = 0
            failure.blockedUntil = System.currentTimeMillis() + LOCKOUT_MS
            lastError = "Too many incorrect PIN attempts. Try again later."
        } else {
            lastError = "Incorrect PIN. Use the PIN for this desktop profile."
        }
        return false
    }

    fun remove(context: Context, profileKey: String) {
        if (profileKey.isBlank()) return
        val records = read(context)
        records.remove(profileKey)
        write(context, records)
        unlockedThisSession.remove(profileKey)
        failures.remove(profileKey)
    }

    private fun derive(pin: String, salt: ByteArray, iterations: Int = ITERATIONS): ByteArray {
        val spec = PBEKeySpec(pin.toCharArray(), salt, iterations.coerceIn(50_000, 500_000), KEY_BITS)
        return try {
            SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).encoded
        } finally {
            spec.clearPassword()
        }
    }

    private fun read(context: Context): JSONObject = runCatching {
        val file = File(context.filesDir, FILE_NAME)
        if (file.exists()) JSONObject(SecureFileStore.readText(file).text) else JSONObject()
    }.getOrDefault(JSONObject())

    private fun write(context: Context, records: JSONObject) {
        SecureFileStore.writeText(File(context.filesDir, FILE_NAME), records.toString())
    }
}
