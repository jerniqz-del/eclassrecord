package com.example.eclassrecordmobile.data

import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class SchoolCloudCryptoTest {
    private val secret = "a".repeat(64)

    @Test
    fun desktopCompatibleEnvelopeRoundTrips() {
        val plaintext = """{"title":"Faculty meeting","message":"Friday at 3 PM"}"""
        val envelope = SchoolCloudCrypto.encrypt(plaintext, secret, "school-cloud-announcement")
        assertEquals("AES-256-GCM", envelope["algorithm"]?.let { (it as JsonPrimitive).content })
        assertEquals(plaintext, SchoolCloudCrypto.decrypt(envelope, secret))
    }

    @Test
    fun wrongKeyOrUnsafeKdfIsRejected() {
        val envelope = SchoolCloudCrypto.encrypt("private", secret, "school-cloud-announcement")
        assertThrows(Exception::class.java) {
            SchoolCloudCrypto.decrypt(envelope, "b".repeat(64))
        }
        val unsafe = buildJsonObject {
            envelope.forEach { (key, value) -> put(key, value) }
            put("kdf", buildJsonObject {
                put("name", "PBKDF2")
                put("hash", "SHA-256")
                put("iterations", 1)
            })
        }
        assertThrows(IllegalArgumentException::class.java) {
            SchoolCloudCrypto.decrypt(unsafe, secret)
        }
    }
}
