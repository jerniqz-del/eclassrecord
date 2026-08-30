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
    private const val UNSYNCED_ATTENDANCE_FILE_NAME = "unsynced_attendance.json"

    private val json = Json { 
        ignoreUnknownKeys = true
        prettyPrint = true
    }

    private var currentPayload: SyncPayload? = null
    private var storageBlocked = false
    private var storageError: String? = null
    
    // Key: assignmentId, Value: Map of (learnerId|assessmentId -> score)
    private var unsyncedScores: MutableMap<String, MutableMap<String, String>> = mutableMapOf()
    private var unsyncedAttendance: MutableList<MobileChange> = mutableListOf()

    fun init(context: Context) {
        loadData(context)
    }

    private fun getDbFile(context: Context): File {
        return File(context.filesDir, DB_FILE_NAME)
    }

    private fun getUnsyncedFile(context: Context): File {
        return File(context.filesDir, UNSYNCED_FILE_NAME)
    }
    private fun getUnsyncedAttendanceFile(context: Context): File {
        return File(context.filesDir, UNSYNCED_ATTENDANCE_FILE_NAME)
    }


    fun getPayload(): SyncPayload? {
        return currentPayload
    }

    fun getRevision(): Long = currentPayload?.revision ?: 0

    @Synchronized
    fun saveAuthoritativePayload(context: Context, payload: SyncPayload) {
        savePayload(context, mergePendingChanges(payload))
    }

    private fun mergePendingChanges(payload: SyncPayload): SyncPayload {
        val assignments = payload.assignments.map { assignment ->
            val pendingScores = unsyncedScores[assignment.id].orEmpty()
            val merged = assignment.copy(
                scores = assignment.scores.toMutableMap().apply {
                    pendingScores.forEach { (key, value) ->
                        if (value.isEmpty()) remove(key) else put(key, value)
                    }
                },
            )
            val attendance = merged.attendance.toMutableList()
            unsyncedAttendance.filter { it.classId == assignment.id }.forEach { change ->
                val date = change.date ?: return@forEach
                val term = change.term ?: "1"
                val sessionIndex = attendance.indexOfFirst { it.date == date && it.term == term }
                val session = if (sessionIndex >= 0) attendance[sessionIndex]
                    else AttendanceSession(date = date, term = term)
                val statuses = session.statuses.toMutableList().apply {
                    removeAll { it.learnerId == change.learnerId }
                    add(AttendanceStatus(change.learnerId, change.status ?: "present", change.note.orEmpty()))
                }
                val updated = session.copy(statuses = statuses)
                if (sessionIndex >= 0) attendance[sessionIndex] = updated else attendance.add(updated)
            }
            merged.copy(attendance = attendance)
        }
        return payload.copy(assignments = assignments)
    }

    fun pendingChanges(): List<MobileChange> = unsyncedScores.flatMap { (classId, scores) ->
        scores.mapNotNull { (key, value) ->
            val separator = key.indexOf('|')
            if (separator < 1) null else MobileChange(
                type = "score",
                classId = classId,
                learnerId = key.substring(0, separator),
                assessmentId = key.substring(separator + 1),
                value = value,
            )
        }
    } + unsyncedAttendance

    fun getUnsyncedScores(): Map<String, Map<String, String>> {
        return unsyncedScores
    }

    fun hasUnsyncedChanges(): Boolean {
        return unsyncedScores.values.any { it.isNotEmpty() } || unsyncedAttendance.isNotEmpty()
    }

    fun pendingChangeCount(): Int =
        unsyncedScores.values.sumOf { it.size } + unsyncedAttendance.size

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
        try {
            val file = getUnsyncedAttendanceFile(context)
            unsyncedAttendance = if (file.exists()) {
                val stored = SecureFileStore.readText(file)
                if (stored.wasPlaintext) SecureFileStore.writeText(file, stored.text)
                json.decodeFromString<MutableList<MobileChange>>(stored.text)
            } else {
                mutableListOf()
            }
        } catch (e: Exception) {
            recordStorageError("Pending attendance could not be decrypted. It was not overwritten.", e)
        }

        currentPayload = currentPayload?.let(::mergePendingChanges)
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
    fun saveUnsyncedAttendance(context: Context) {
        if (storageBlocked) return
        try {
            SecureFileStore.writeText(
                getUnsyncedAttendanceFile(context),
                json.encodeToString(unsyncedAttendance),
            )
        } catch (e: Exception) {
            recordStorageError("Error saving encrypted pending attendance.", e)
        }
    }

    @Synchronized
    fun clearUnsyncedScores(context: Context) {
        unsyncedScores.clear()
        saveUnsyncedScores(context)
        unsyncedAttendance.clear()
        saveUnsyncedAttendance(context)
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

        // Persist the pending desktop commit first so a process interruption cannot orphan the edit.
        val classScores = unsyncedScores.getOrPut(assignmentId) { mutableMapOf() }
        classScores[key] = score
        saveUnsyncedScores(context)

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

    }

    @Synchronized
    fun updateAttendance(
        context: Context,
        assignmentId: String,
        learnerId: String,
        date: String,
        term: String,
        status: String,
        note: String = "",
    ) {
        require(status in setOf("present", "absent", "tardy", "excused"))
        val payload = currentPayload ?: return

        // Persist the pending desktop commit before updating the cached snapshot.
        unsyncedAttendance.removeAll {
            it.classId == assignmentId && it.learnerId == learnerId &&
                it.date == date && it.term == term
        }
        unsyncedAttendance.add(
            MobileChange(
                type = "attendance",
                classId = assignmentId,
                learnerId = learnerId,
                date = date,
                term = term,
                status = status,
                note = note,
            )
        )
        saveUnsyncedAttendance(context)

        val updatedAssignments = payload.assignments.map { assignment ->
            if (assignment.id != assignmentId) return@map assignment
            val sessions = assignment.attendance.toMutableList()
            val index = sessions.indexOfFirst { it.date == date && it.term == term }
            val session = if (index >= 0) sessions[index] else AttendanceSession(date, term)
            val statuses = session.statuses.toMutableList().apply {
                removeAll { it.learnerId == learnerId }
                add(AttendanceStatus(learnerId, status, note))
            }
            val updated = session.copy(statuses = statuses)
            if (index >= 0) sessions[index] = updated else sessions.add(updated)
            assignment.copy(attendance = sessions)
        }
        savePayload(context, payload.copy(assignments = updatedAssignments))
    }
}
