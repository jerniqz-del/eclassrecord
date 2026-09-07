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
    private const val UNSYNCED_EXTRAS_FILE_NAME = "unsynced_extras.json"
    private const val AUTHORITATIVE_FILE_NAME = "authoritative_db.json"

    private val json = Json { 
        ignoreUnknownKeys = true
        prettyPrint = true
    }

    private var currentPayload: SyncPayload? = null
    private var lastAuthoritative: SyncPayload? = null
    private var activeProfileKey: String = ""
    var observedProfileKey by mutableStateOf("")
        private set
    var observedRevision by mutableStateOf(0L)
        private set
    private var storageBlocked = false
    private var storageError: String? = null
    
    // Key: assignmentId, Value: Map of (learnerId|assessmentId -> score)
    private var unsyncedScores: MutableMap<String, MutableMap<String, String>> = mutableMapOf()
    private var unsyncedScoreIds: MutableMap<String, MutableMap<String, String>> = mutableMapOf()
    private var unsyncedAttendance: MutableList<MobileChange> = mutableListOf()
    private var unsyncedExtras: MutableList<MobileChange> = mutableListOf()

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

    private fun getUnsyncedExtrasFile(context: Context) =
        File(storageDirectory(context), UNSYNCED_EXTRAS_FILE_NAME)

    private fun getAuthoritativeFile(context: Context) =
        File(storageDirectory(context), AUTHORITATIVE_FILE_NAME)

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
        lastAuthoritative = null
        unsyncedScores = mutableMapOf()
        unsyncedScoreIds = mutableMapOf()
        unsyncedAttendance = mutableListOf()
        unsyncedExtras = mutableListOf()
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
            lastAuthoritative = null
            unsyncedScores = mutableMapOf()
            unsyncedScoreIds = mutableMapOf()
            unsyncedAttendance = mutableListOf()
            unsyncedExtras = mutableListOf()
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
            UNSYNCED_EXTRAS_FILE_NAME,
            AUTHORITATIVE_FILE_NAME,
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
        lastAuthoritative = payload
        saveAuthoritativeSnapshot(context)
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
        return applyPendingExtras(payload.copy(assignments = assignments))
    }

    private fun applyPendingExtras(payload: SyncPayload): SyncPayload {
        var next = payload
        unsyncedExtras.filter { it.type == "profile" }.forEach { change ->
            val patch = decodeProfilePatch(change) ?: return@forEach
            next = next.copy(
                teacherName = patch.teacherName.ifBlank { next.teacherName },
                schoolName = patch.schoolName.ifBlank { next.schoolName },
                schoolId = patch.schoolId.ifBlank { next.schoolId },
                region = patch.region.ifBlank { next.region },
                division = patch.division.ifBlank { next.division },
                district = patch.district.ifBlank { next.district },
            )
        }
        val calendar = next.calendar.toMutableList()
        unsyncedExtras.filter { it.type == "calendar" }.forEach { change ->
            val eventId = change.eventId.orEmpty().ifBlank { change.assessmentId.orEmpty() }
            if (eventId.isBlank()) return@forEach
            if (change.action == "delete") {
                calendar.removeAll { it.id == eventId }
                return@forEach
            }
            val date = change.date.orEmpty()
            if (!date.matches(Regex("""\d{4}-\d{2}-\d{2}"""))) return@forEach
            val entry = CalendarEntry(
                id = eventId,
                title = change.title?.ifBlank { change.value }.orEmpty().ifBlank { "School event" },
                date = date,
                endDate = change.endDate?.ifBlank { date } ?: date,
                type = change.status?.ifBlank { "local" } ?: "local",
                details = change.details?.ifBlank { change.note }.orEmpty(),
                classId = change.classId.takeIf { it.isNotBlank() },
            )
            val index = calendar.indexOfFirst { it.id == eventId }
            if (index >= 0) calendar[index] = entry else calendar.add(entry)
        }
        return next.copy(calendar = calendar.sortedBy { it.date })
    }

    private fun decodeProfilePatch(change: MobileChange): ProfilePatch? {
        val raw = change.value.orEmpty()
        if (raw.startsWith("{")) {
            return runCatching { json.decodeFromString(ProfilePatch.serializer(), raw) }.getOrNull()
        }
        return when (change.field) {
            "teacherName" -> ProfilePatch(teacherName = change.value.orEmpty())
            "schoolName" -> ProfilePatch(schoolName = change.value.orEmpty())
            "schoolId" -> ProfilePatch(schoolId = change.value.orEmpty())
            "region" -> ProfilePatch(region = change.value.orEmpty())
            "division" -> ProfilePatch(division = change.value.orEmpty())
            "district" -> ProfilePatch(district = change.value.orEmpty())
            else -> null
        }
    }

    fun pendingChanges(changeIds: Collection<String>? = null): List<MobileChange> {
        val all = unsyncedScores.flatMap { (classId, scores) ->
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
        } + unsyncedAttendance.map(::withChangeId) + unsyncedExtras.map(::withChangeId)
        if (changeIds == null) return all
        val wanted = changeIds.toSet()
        return all.filter { it.changeId in wanted }
    }

    fun reviewPendingChanges(): PendingChangeReview {
        val snapshot = lastAuthoritative
        val pending = pendingChanges()
        val items = pending.flatMap { change -> reviewItem(change, snapshot) }.toMutableList()
        val reviewedIds = items.map { it.changeId }.toSet()
        pending.filter { it.changeId !in reviewedIds }.forEach { change ->
            items += PendingChangeReviewItem(
                changeId = change.changeId,
                change = change,
                affectsExisting = true,
                kindLabel = change.type.replaceFirstChar { it.uppercaseChar() },
                title = "Pending ${change.type} change",
                detail = "This change could not be compared with the desktop copy, so it is listed as possibly affecting existing records.",
                previousValue = "Not compared yet",
                newValue = displayValue(change.value ?: change.status ?: change.title),
            )
        }
        return PendingChangeReview(
            items = items,
            hasAuthoritativeSnapshot = snapshot != null,
        )
    }

    private fun reviewItem(change: MobileChange, snapshot: SyncPayload?): List<PendingChangeReviewItem> {
        return when (change.type) {
            "score" -> listOf(reviewScore(change, snapshot))
            "attendance" -> listOf(reviewAttendance(change, snapshot))
            "calendar" -> listOf(reviewCalendar(change, snapshot))
            "profile" -> reviewProfile(change, snapshot)
            else -> listOf(
                PendingChangeReviewItem(
                    changeId = change.changeId,
                    change = change,
                    affectsExisting = true,
                    kindLabel = "Other",
                    title = "Unrecognized mobile change",
                    detail = "This change is listed as possibly affecting existing desktop data until it can be classified.",
                    previousValue = displayValue(""),
                    newValue = displayValue(change.value),
                )
            )
        }
    }

    private fun reviewScore(change: MobileChange, snapshot: SyncPayload?): PendingChangeReviewItem {
        val assignment = assignmentFor(change.classId, snapshot)
        val key = "${change.learnerId}|${change.assessmentId.orEmpty()}"
        val desktopAssignment = snapshot?.let { authoritativeAssignment(it, change.classId) }
        val previous = when {
            snapshot == null -> null
            desktopAssignment == null -> null
            else -> desktopAssignment.scores[key].orEmpty()
        }
        val next = change.value.orEmpty()
        val affects = previous == null || (previous.isNotBlank() && previous != next)
        val learner = learnerName(assignment, change.learnerId)
        val assessment = assessmentTitle(assignment, change.assessmentId.orEmpty())
        return PendingChangeReviewItem(
            changeId = change.changeId,
            change = change,
            affectsExisting = affects,
            kindLabel = "Score",
            title = "$learner · $assessment",
            detail = assignmentLabel(assignment),
            previousValue = if (previous == null) "Not compared yet" else displayValue(previous),
            newValue = displayValue(next),
        )
    }

    private fun reviewAttendance(change: MobileChange, snapshot: SyncPayload?): PendingChangeReviewItem {
        val assignment = assignmentFor(change.classId, snapshot)
        val date = change.date.orEmpty()
        val term = change.term ?: "1"
        val desktopAssignment = snapshot?.let { authoritativeAssignment(it, change.classId) }
        val previous = when {
            snapshot == null -> null
            desktopAssignment == null -> null
            else -> desktopAssignment.attendance
                .find { it.date == date && it.term == term }
                ?.statuses
                ?.find { it.learnerId == change.learnerId }
                ?.status
                .orEmpty()
        }
        val next = change.status.orEmpty()
        val affects = previous == null || (previous.isNotBlank() && previous != next)
        val learner = learnerName(assignment, change.learnerId)
        return PendingChangeReviewItem(
            changeId = change.changeId,
            change = change,
            affectsExisting = affects,
            kindLabel = "Attendance",
            title = "$learner · $date",
            detail = "${assignmentLabel(assignment)} · Term $term",
            previousValue = if (previous == null) "Not compared yet" else displayAttendance(previous),
            newValue = displayAttendance(next),
        )
    }

    private fun reviewCalendar(change: MobileChange, snapshot: SyncPayload?): PendingChangeReviewItem {
        val eventId = change.eventId.orEmpty().ifBlank { change.assessmentId.orEmpty() }
        val existing = snapshot?.calendar?.find { it.id == eventId }
        val deleting = change.action == "delete"
        val affects = snapshot == null || existing != null
        val title = when {
            deleting && existing != null -> "Delete “${existing.title}”"
            deleting -> "Delete calendar event"
            existing == null -> change.title?.ifBlank { change.value }.orEmpty().ifBlank { "New school event" }
            else -> "Update “${existing.title}”"
        }
        val next = if (deleting) {
            "Remove from desktop calendar"
        } else {
            listOf(
                change.title?.ifBlank { change.value }.orEmpty(),
                change.date.orEmpty(),
                change.endDate?.takeIf { it.isNotBlank() && it != change.date }?.let { "to $it" }.orEmpty(),
            ).filter { it.isNotBlank() }.joinToString(" · ")
        }
        return PendingChangeReviewItem(
            changeId = change.changeId,
            change = change,
            affectsExisting = affects,
            kindLabel = "Calendar",
            title = title,
            detail = if (existing == null && snapshot != null && !deleting) {
                "This event is not on the desktop yet."
            } else if (deleting) {
                "This will remove an event already stored on the desktop."
            } else {
                "This will replace the event already stored on the desktop."
            },
            previousValue = when {
                snapshot == null -> "Not compared yet"
                existing == null -> "None"
                else -> listOf(existing.title, existing.date).filter { it.isNotBlank() }.joinToString(" · ")
            },
            newValue = next.ifBlank { displayValue("") },
        )
    }

    private fun reviewProfile(change: MobileChange, snapshot: SyncPayload?): List<PendingChangeReviewItem> {
        val patch = decodeProfilePatch(change) ?: return emptyList()
        val diffs = profileFieldLabels().mapNotNull { (field, label) ->
            if (!change.field.isNullOrBlank() && change.field != field) return@mapNotNull null
            val next = profilePatchValue(patch, field)
            val previous = snapshot?.let { profilePayloadValue(it, field) }
            if (change.field.isNullOrBlank() && next.isBlank()) return@mapNotNull null
            if (previous != null && next == previous) return@mapNotNull null
            val affects = previous == null || (previous.isNotBlank() && previous != next)
            PendingChangeReviewItem(
                changeId = change.changeId,
                change = change,
                affectsExisting = affects,
                kindLabel = "Profile",
                title = label,
                detail = if (affects) {
                    "This value is already filled on the desktop."
                } else {
                    "This field is empty on the desktop."
                },
                previousValue = if (previous == null) "Not compared yet" else displayValue(previous),
                newValue = displayValue(next),
            )
        }
        if (diffs.isEmpty()) return emptyList()
        if (change.field.isNullOrBlank() && diffs.size > 1) {
            val affects = diffs.any { it.affectsExisting }
            return listOf(
                PendingChangeReviewItem(
                    changeId = change.changeId,
                    change = change,
                    affectsExisting = affects,
                    kindLabel = "Profile",
                    title = if (affects) "School identity fields already on the desktop" else "New school identity fields",
                    detail = diffs.joinToString("\n") { item ->
                        "${item.title}: ${item.previousValue} → ${item.newValue}"
                    },
                    previousValue = diffs.joinToString(", ") { "${it.title} ${it.previousValue}" },
                    newValue = diffs.joinToString(", ") { "${it.title} ${it.newValue}" },
                )
            )
        }
        return diffs
    }

    private fun displayValue(value: String?): String {
        val text = value?.trim().orEmpty()
        return if (text.isBlank()) "Empty" else text
    }

    private fun displayAttendance(value: String): String = when (value.trim().lowercase()) {
        "" -> "None recorded"
        "present" -> "Present"
        "absent" -> "Absent"
        "tardy" -> "Tardy"
        "excused" -> "Excused"
        else -> value
    }

    private fun assignmentFor(classId: String, snapshot: SyncPayload?): Assignment? =
        snapshot?.let { authoritativeAssignment(it, classId) }
            ?: currentPayload?.assignments?.find { it.id == classId }

    private fun authoritativeAssignment(snapshot: SyncPayload, classId: String): Assignment? =
        snapshot.assignments.find { it.id == classId }

    private fun assignmentLabel(assignment: Assignment?): String {
        if (assignment == null) return "Unknown class"
        return listOf(assignment.gradeLevel, assignment.section, assignment.subject)
            .filter { it.isNotBlank() }
            .joinToString(" · ")
            .ifBlank { "Class" }
    }

    private fun learnerName(assignment: Assignment?, learnerId: String): String =
        assignment?.learners?.find { it.id == learnerId }?.name?.ifBlank { learnerId } ?: learnerId

    private fun assessmentTitle(assignment: Assignment?, assessmentId: String): String =
        assignment?.assessments?.find { it.id == assessmentId }?.title?.ifBlank { assessmentId } ?: assessmentId

    private fun profileFieldLabels(): List<Pair<String, String>> = listOf(
        "teacherName" to "Teacher name",
        "schoolName" to "School name",
        "schoolId" to "School ID",
        "region" to "Region",
        "division" to "Division",
        "district" to "District",
    )

    private fun profilePayloadValue(payload: SyncPayload, field: String): String = when (field) {
        "teacherName" -> payload.teacherName
        "schoolName" -> payload.schoolName
        "schoolId" -> payload.schoolId
        "region" -> payload.region
        "division" -> payload.division
        "district" -> payload.district
        else -> ""
    }

    private fun profilePatchValue(patch: ProfilePatch, field: String): String = when (field) {
        "teacherName" -> patch.teacherName
        "schoolName" -> patch.schoolName
        "schoolId" -> patch.schoolId
        "region" -> patch.region
        "division" -> patch.division
        "district" -> patch.district
        else -> ""
    }

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
            change.action.orEmpty(),
            change.eventId.orEmpty(),
            change.title.orEmpty(),
            change.endDate.orEmpty(),
            change.details.orEmpty(),
            change.field.orEmpty(),
        ).joinToString(":")
        return change.copy(changeId = UUID.nameUUIDFromBytes(identity.toByteArray(StandardCharsets.UTF_8)).toString())
    }

    fun getUnsyncedScores(): Map<String, Map<String, String>> {
        return unsyncedScores
    }

    fun hasUnsyncedChanges(): Boolean {
        return unsyncedScores.values.any { it.isNotEmpty() } ||
            unsyncedAttendance.isNotEmpty() ||
            unsyncedExtras.isNotEmpty()
    }

    fun pendingChangeCount(): Int =
        unsyncedScores.values.sumOf { it.size } + unsyncedAttendance.size + unsyncedExtras.size

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
        try {
            val extrasFile = getUnsyncedExtrasFile(context)
            unsyncedExtras = if (extrasFile.exists()) {
                val stored = SecureFileStore.readText(extrasFile)
                if (stored.wasPlaintext) SecureFileStore.writeText(extrasFile, stored.text)
                json.decodeFromString<MutableList<MobileChange>>(stored.text)
            } else {
                mutableListOf()
            }
        } catch (e: Exception) {
            recordStorageError("Pending profile and calendar changes could not be decrypted. They were not overwritten.", e)
        }
        try {
            val authoritativeFile = getAuthoritativeFile(context)
            lastAuthoritative = if (authoritativeFile.exists()) {
                val stored = SecureFileStore.readText(authoritativeFile)
                if (stored.wasPlaintext) SecureFileStore.writeText(authoritativeFile, stored.text)
                json.decodeFromString(SyncPayload.serializer(), stored.text)
            } else {
                null
            }
        } catch (e: Exception) {
            lastAuthoritative = null
            Log.e(TAG, "The stored desktop snapshot could not be opened for change review.", e)
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
            observedRevision += 1
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
    fun saveUnsyncedExtras(context: Context) {
        if (storageBlocked) return
        try {
            SecureFileStore.writeText(
                getUnsyncedExtrasFile(context),
                json.encodeToString(unsyncedExtras),
            )
        } catch (e: Exception) {
            recordStorageError("Error saving encrypted pending profile and calendar changes.", e)
        }
    }

    private fun saveAuthoritativeSnapshot(context: Context) {
        val payload = lastAuthoritative ?: return
        try {
            SecureFileStore.writeText(
                getAuthoritativeFile(context),
                json.encodeToString(SyncPayload.serializer(), payload),
            )
        } catch (e: Exception) {
            Log.e(TAG, "The desktop snapshot for change review could not be saved.", e)
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
        unsyncedExtras.clear()
        saveUnsyncedExtras(context)
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
        unsyncedExtras.removeAll { withChangeId(it).changeId in accepted }
        saveUnsyncedScores(context)
        saveUnsyncedScoreIds(context)
        saveUnsyncedAttendance(context)
        saveUnsyncedExtras(context)
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

    @Synchronized
    fun updateProfile(context: Context, patch: ProfilePatch) {
        val payload = currentPayload ?: return
        val baseline = lastAuthoritative ?: payload
        unsyncedExtras.removeAll { it.type == "profile" }
        profileFieldLabels().forEach { (field, _) ->
            val next = profilePatchValue(patch, field)
            val previous = profilePayloadValue(baseline, field)
            if (next == previous) return@forEach
            unsyncedExtras.add(
                MobileChange(
                    changeId = UUID.randomUUID().toString(),
                    type = "profile",
                    field = field,
                    value = next,
                ),
            )
        }
        saveUnsyncedExtras(context)
        savePayload(
            context,
            payload.copy(
                teacherName = patch.teacherName,
                schoolName = patch.schoolName,
                schoolId = patch.schoolId,
                region = patch.region,
                division = patch.division,
                district = patch.district,
            ),
        )
    }

    @Synchronized
    fun upsertCalendarEvent(context: Context, entry: CalendarEntry) {
        val payload = currentPayload ?: return
        if (entry.id.startsWith("official-") || entry.title.isBlank() || !entry.date.matches(Regex("""\d{4}-\d{2}-\d{2}"""))) return
        unsyncedExtras.removeAll { it.type == "calendar" && it.eventId == entry.id }
        unsyncedExtras.add(
            MobileChange(
                changeId = UUID.randomUUID().toString(),
                type = "calendar",
                action = "upsert",
                eventId = entry.id,
                title = entry.title,
                value = entry.title,
                date = entry.date,
                endDate = entry.endDate.ifBlank { entry.date },
                status = entry.type.ifBlank { "local" },
                details = entry.details,
                note = entry.details,
                classId = entry.classId.orEmpty(),
            ),
        )
        saveUnsyncedExtras(context)
        val calendar = payload.calendar.toMutableList()
        val index = calendar.indexOfFirst { it.id == entry.id }
        if (index >= 0) calendar[index] = entry else calendar.add(entry)
        savePayload(context, payload.copy(calendar = calendar.sortedBy { it.date }))
    }

    @Synchronized
    fun deleteCalendarEvent(context: Context, eventId: String) {
        val payload = currentPayload ?: return
        if (eventId.isBlank() || eventId.startsWith("official-")) return
        unsyncedExtras.removeAll { it.type == "calendar" && it.eventId == eventId }
        unsyncedExtras.add(
            MobileChange(
                changeId = UUID.randomUUID().toString(),
                type = "calendar",
                action = "delete",
                eventId = eventId,
            ),
        )
        saveUnsyncedExtras(context)
        savePayload(context, payload.copy(calendar = payload.calendar.filterNot { it.id == eventId }))
    }
}
