package com.example.eclassrecordmobile.data

import android.content.Context
import android.util.Log
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.io.File

object DatabaseHelper {
    private const val TAG = "DatabaseHelper"
    private const val DB_FILE_NAME = "eclass_db.json"
    private const val UNSYNCED_FILE_NAME = "unsynced_scores.json"

    private val json = Json { 
        ignoreUnknownKeys = true
        prettyPrint = true
    }

    private var currentPayload: SyncPayload? = null
    private var storageBlocked = false
    private var storageError: String? = null
    
    // Key: assignmentId, Value: Map of (learnerId|assessmentId -> score)
    private var unsyncedScores: MutableMap<String, MutableMap<String, String>> = mutableMapOf()

    fun init(context: Context) {
        loadData(context)
    }

    private fun getDbFile(context: Context): File {
        return File(context.filesDir, DB_FILE_NAME)
    }

    private fun getUnsyncedFile(context: Context): File {
        return File(context.filesDir, UNSYNCED_FILE_NAME)
    }

    fun getPayload(): SyncPayload? {
        return currentPayload
    }

    fun getUnsyncedScores(): Map<String, Map<String, String>> {
        return unsyncedScores
    }

    fun hasUnsyncedChanges(): Boolean {
        return unsyncedScores.values.any { it.isNotEmpty() }
    }

    fun getStorageError(): String? = storageError

    private fun recordStorageError(message: String, error: Exception) {
        storageBlocked = true
        storageError = message
        Log.e(TAG, message, error)
    }

    @Synchronized
    fun loadData(context: Context) {
        storageBlocked = false
        storageError = null
        try {
            val dbFile = getDbFile(context)
            if (dbFile.exists()) {
                val stored = SecureFileStore.readText(dbFile)
                currentPayload = json.decodeFromString(SyncPayload.serializer(), stored.text)
                if (stored.wasPlaintext) SecureFileStore.writeText(dbFile, stored.text)
            }
        } catch (e: Exception) {
            recordStorageError("Encrypted local records could not be opened. Do not clear app data.", e)
        }

        try {
            val unsyncedFile = getUnsyncedFile(context)
            if (unsyncedFile.exists()) {
                val stored = SecureFileStore.readText(unsyncedFile)
                unsyncedScores = json.decodeFromString<MutableMap<String, MutableMap<String, String>>>(stored.text)
                if (stored.wasPlaintext) SecureFileStore.writeText(unsyncedFile, stored.text)
            } else {
                unsyncedScores = mutableMapOf()
            }
        } catch (e: Exception) {
            recordStorageError("Pending mobile entries could not be decrypted. They were not overwritten.", e)
        }
    }

    @Synchronized
    fun savePayload(context: Context, payload: SyncPayload) {
        if (storageBlocked) {
            Log.e(TAG, "Local encrypted storage is blocked; refusing to overwrite protected records.")
            return
        }
        try {
            currentPayload = payload
            val dbFile = getDbFile(context)
            SecureFileStore.writeText(dbFile, json.encodeToString(SyncPayload.serializer(), payload))
        } catch (e: Exception) {
            recordStorageError("Error saving encrypted local records.", e)
        }
    }

    @Synchronized
    fun saveUnsyncedScores(context: Context) {
        if (storageBlocked) {
            Log.e(TAG, "Local encrypted storage is blocked; refusing to overwrite pending entries.")
            return
        }
        try {
            val unsyncedFile = getUnsyncedFile(context)
            SecureFileStore.writeText(unsyncedFile, json.encodeToString(unsyncedScores))
        } catch (e: Exception) {
            recordStorageError("Error saving encrypted pending mobile entries.", e)
        }
    }

    @Synchronized
    fun clearUnsyncedScores(context: Context) {
        unsyncedScores.clear()
        saveUnsyncedScores(context)
    }

    @Synchronized
    fun updateScore(
        context: Context,
        assignmentId: String,
        learnerId: String,
        assessmentId: String,
        score: String
    ) {
        val payload = currentPayload ?: return
        val key = "$learnerId|$assessmentId"

        // 1. Update in-memory and saved payload
        val updatedAssignments = payload.assignments.map { assignment ->
            if (assignment.id == assignmentId) {
                val newScores = assignment.scores.toMutableMap()
                if (score.isEmpty()) {
                    newScores.remove(key)
                } else {
                    newScores[key] = score
                }
                assignment.copy(scores = newScores)
            } else {
                assignment
            }
        }
        val newPayload = payload.copy(assignments = updatedAssignments)
        savePayload(context, newPayload)

        // 2. Track as unsynced
        val classScores = unsyncedScores.getOrPut(assignmentId) { mutableMapOf() }
        classScores[key] = score
        saveUnsyncedScores(context)
    }
}
