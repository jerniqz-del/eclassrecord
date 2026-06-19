package com.example.eclassrecordmobile.data

import android.content.Context
import android.util.Log
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

    @Synchronized
    fun loadData(context: Context) {
        try {
            val dbFile = getDbFile(context)
            if (dbFile.exists()) {
                val content = dbFile.readText()
                currentPayload = json.decodeFromString(SyncPayload.serializer(), content)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error loading database", e)
        }

        try {
            val unsyncedFile = getUnsyncedFile(context)
            if (unsyncedFile.exists()) {
                val content = unsyncedFile.readText()
                unsyncedScores = json.decodeFromString<MutableMap<String, MutableMap<String, String>>>(content)
            } else {
                unsyncedScores = mutableMapOf()
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error loading unsynced scores", e)
            unsyncedScores = mutableMapOf()
        }
    }

    @Synchronized
    fun savePayload(context: Context, payload: SyncPayload) {
        try {
            currentPayload = payload
            val dbFile = getDbFile(context)
            dbFile.writeText(json.encodeToString(SyncPayload.serializer(), payload))
        } catch (e: Exception) {
            Log.e(TAG, "Error saving database", e)
        }
    }

    @Synchronized
    fun saveUnsyncedScores(context: Context) {
        try {
            val unsyncedFile = getUnsyncedFile(context)
            unsyncedFile.writeText(json.encodeToString(unsyncedScores))
        } catch (e: Exception) {
            Log.e(TAG, "Error saving unsynced scores", e)
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
