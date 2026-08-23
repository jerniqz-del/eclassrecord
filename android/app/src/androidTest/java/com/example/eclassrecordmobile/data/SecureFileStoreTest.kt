package com.example.eclassrecordmobile.data

import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File

@RunWith(AndroidJUnit4::class)
class SecureFileStoreTest {
    @Test
    fun encryptedFileDoesNotExposeSchoolRecordPlaintext() {
        val context = ApplicationProvider.getApplicationContext<android.content.Context>()
        val file = File(context.cacheDir, "secure-store-test-${System.nanoTime()}.json")
        try {
            val plaintext = "{\"learner\":\"TEST LEARNER\",\"score\":\"95\"}"
            SecureFileStore.writeText(file, plaintext)
            assertFalse(file.readText().contains("TEST LEARNER"))
            val result = SecureFileStore.readText(file)
            assertEquals(plaintext, result.text)
            assertFalse(result.wasPlaintext)
        } finally {
            file.delete()
            File(file.path + ".bak").delete()
        }
    }

    @Test
    fun existingPlaintextCanBeReadOnceForMigration() {
        val context = ApplicationProvider.getApplicationContext<android.content.Context>()
        val file = File(context.cacheDir, "secure-store-migration-${System.nanoTime()}.json")
        try {
            file.writeText("{\"legacy\":true}")
            val legacy = SecureFileStore.readText(file)
            assertTrue(legacy.wasPlaintext)
            SecureFileStore.writeText(file, legacy.text)
            assertFalse(SecureFileStore.readText(file).wasPlaintext)
        } finally {
            file.delete()
            File(file.path + ".bak").delete()
        }
    }
}
