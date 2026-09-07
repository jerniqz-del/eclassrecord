package com.example.eclassrecordmobile.data

import android.content.Context
import android.util.Log
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.io.File
import java.nio.charset.StandardCharsets
import java.util.UUID

object DatabaseHelper {
    private const val TAG = "DatabaseHelper"
    private const val DB_FILE_NAME = "eclass_db.json"
    private const val UNSYNCED_FILE_NAME = "unsynced_scores.json"
    private const val UNSYNCED_SCORE_IDS_FILE_NAME = "unsynced_score_ids.json"
    private const val UNSYNCED_ATTENDANCE_FILE_NAME = "unsynced_attendance.json"

    private val json = Json { 
        ignoreUnknownKeys = true
        prettyPrint = true
    }

    private var currentPayload: SyncPayload? = null
    private var activeProfileKey: String = ""
    var observedProfileKey by mutableStateOf("")
        private set
    private var storageBlocked = false
    private var storageError: String? = null
    
    // Key: assignmentId, Value: Map of (learnerId|assessmentId -> score)
    private var unsyncedScores: MutableMap<String, MutableMap<String, String>> = mutableMapOf()
    private var unsyncedScoreIds: MutableMap<String, MutableMap<String, String>> = mutableMapOf()
    private var unsyncedAttendance: MutableList<MobileChange> = mutableListOf()

    fun init(context: Context) {
        loadData(context)
    }

    private fun profileDirectory(context: Context, profileKey: String): File {
        val safeKey = UUID.nameUUIDFromBytes(profileKey.toByteArray(StandardCharsets.UTF_8)).toString()
        return File(context.filesDir, "companion_profiles/$safeKey")
    }

    private fun storageDirectory(context: Context): File =
        if (activeProfileKey.isBlank()) context.filesDir else profileDirectory(context, activeProfileKey)

    private fun getDbFile(context: Context) = File(storageDirectory(context), DB_FILE_NAME)

    private fun getUnsyncedFile(context: Context) = File(storageDirectory(context), UNSYNCED_FILE_NAME)

    private fun getUnsyncedScoreIdsFile(context: Context) =
        File(storageDirectory(context), UNSYNCED_SCORE_IDS_FILE_NAME)

    private fun getUnsyncedAttendanceFile(context: Context): File {
        return File(storageDirectory(context), UNSYNCED_ATTENDANCE_FILE_NAME)
    }

    @Synchronized
    fun selectProfile(context: Context, profileKey: String) {
        require(profileKey.isNotBlank()) { "A desktop profile identity is required." }
        if (profileKey == activeProfileKey) return
        activeProfileKey = profileKey
        observedProfileKey = profileKey
        migrateLegacyFiles(context)
        currentPayload = null
        unsyncedScores = mutableMapOf()
        unsyncedScoreIds = mutableMapOf()
        unsyncedAttendance = mutableListOf()
        loadData(context)
    }

    fun getActiveProfileKey(): String = activeProfileKey

    @Synchronized
    fun deleteProfile(context: Context, profileKey: String): Boolean {
        if (profileKey.isBlank()) return false
        val directory = profileDirectory(context, profileKey)
        val deleted = !directory.exists() || directory.deleteRecursively()
        if (!deleted) return false
        if (activeProfileKey == profileKey) {
            activeProfileKey = ""
            observedProfileKey = ""
            currentPayload = null
            unsyncedScores = mutableMapOf()
            unsyncedScoreIds = mutableMapOf()
            unsyncedAttendance = mutableListOf()
            storageBlocked = false
            storageError = null
        }
        return true
    }

    private fun migrateLegacyFiles(context: Context) {
        val marker = File(context.filesDir, "companion_profiles/.legacy-migrated")
        if (marker.exists()) return
        val target = storageDirectory(context)
        target.mkdirs()
        listOf(
            DB_FILE_NAME,
            UNSYNCED_FILE_NAME,
            UNSYNCED_SCORE_IDS_FILE_NAME,
            UNSYNCED_ATTENDANCE_FILE_NAME,
        ).forEach { name ->
            val source = File(context.filesDir, name)
            val destination = File(target, name)
            if (source.exists() && !destination.exists()) source.copyTo(destination)
        }
        marker.parentFile?.mkdirs()
        marker.writeText(activeProfileKey)
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
                changeId = scoreChangeId(classId, key, value),
                type = "score",
                classId = classId,
                learnerId = key.substring(0, separator),
                assessmentId = key.substring(separator + 1),
                value = value,
            )
        }
    } + unsyncedAttendance.map(::withChangeId)

    private fun scoreChangeId(classId: String, key: String, value: String): String {
        unsyncedScoreIds[classId]?.get(key)?.takeIf { it.isNotBlank() }?.let { return it }
        val legacyIdentity = "$activeProfileKey:score:$classId:$key:$value"
        return UUID.nameUUIDFromBytes(legacyIdentity.toByteArray(StandardCharsets.UTF_8)).toString()
    }

    private fun withChangeId(change: MobileChange): MobileChange {
        if (change.changeId.isNotBlank()) return change
        val identity = listOf(
            activeProfileKey,
            currentPayload?.revision ?: 0,
            change.type,
            change.classId,
            change.learnerId,
            change.assessmentId.orEmpty(),
            change.date.orEmpty(),
            change.term.orEmpty(),
            change.value.orEmpty(),
            change.status.orEmpty(),
            change.note.orEmpty(),
        ).joinToString(":")
        return change.copy(changeId = UUID.nameUUIDFromBytes(identity.toByteArray(StandardCharsets.UTF_8)).toString())
    }

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
            val idsFile = getUnsyncedScoreIdsFile(context)
            unsyncedScoreIds = if (idsFile.exists()) {
                val stored = SecureFileStore.readText(idsFile)
                if (stored.wasPlaintext) SecureFileStore.writeText(idsFile, stored.text)
                json.decodeFromString<MutableMap<String, MutableMap<String, String>>>(stored.text)
            } else {
                mutableMapOf()
            }
            var generatedIds = false
            unsyncedScores.forEach { (classId, scores) ->
                val ids = unsyncedScoreIds.getOrPut(classId) { mutableMapOf() }
                scores.forEach { (key, value) ->
                    if (ids[key].isNullOrBlank()) {
                        ids[key] = scoreChangeId(classId, key, value)
                        generatedIds = true
                    }
                }
            }
            if (generatedIds) saveUnsyncedScoreIds(context)
        } catch (e: Exception) {
            recordStorageError("Pending mobile entry identifiers could not be decrypted. They were not overwritten.", e)
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
    fun saveUnsyncedScoreIds(context: Context) {
        if (storageBlocked) return
        try {
            SecureFileStore.writeText(
                getUnsyncedScoreIdsFile(context),
                json.encodeToString(unsyncedScoreIds),
            )
        } catch (e: Exception) {
            recordStorageError("Error saving encrypted pending mobile entry identifiers.", e)
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
        unsyncedScoreIds.clear()
        saveUnsyncedScoreIds(context)
        unsyncedAttendance.clear()
        saveUnsyncedAttendance(context)
    }

    @Synchronized
    fun acknowledgeChanges(context: Context, acceptedChangeIds: Collection<String>) {
        if (acceptedChangeIds.isEmpty()) return
        val accepted = acceptedChangeIds.toSet()
        unsyncedScores.forEach { (classId, scores) ->
            scores.entries.removeAll { (key, value) ->
                val separator = key.indexOf('|')
                val isAccepted = separator > 0 && scoreChangeId(classId, key, value) in accepted
                if (isAccepted) unsyncedScoreIds[classId]?.remove(key)
                isAccepted
            }
        }
        unsyncedScores.entries.removeAll { it.value.isEmpty() }
        unsyncedScoreIds.entries.removeAll { it.value.isEmpty() }
        unsyncedAttendance.removeAll { withChangeId(it).changeId in accepted }
        saveUnsyncedScores(context)
        saveUnsyncedScoreIds(context)
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
        val previousScore = classScores[key]
        val classScoreIds = unsyncedScoreIds.getOrPut(assignmentId) { mutableMapOf() }
        if (previousScore != score || classScoreIds[key].isNullOrBlank()) {
            classScoreIds[key] = UUID.randomUUID().toString()
        }
        classScores[key] = score
        saveUnsyncedScoreIds(context)
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
                changeId = UUID.randomUUID().toString(),
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
