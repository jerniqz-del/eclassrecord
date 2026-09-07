package com.example.eclassrecordmobile.data

import kotlinx.serialization.Serializable

@Serializable
data class SyncPayload(
    val protocolVersion: Int = 1,
    val desktopId: String = "",
    val profileId: String = "",
    val profileName: String = "",
    val teacherName: String = "",
    val schoolName: String = "",
    val schoolId: String = "",
    val region: String = "",
    val division: String = "",
    val district: String = "",
    val schoolYear: String = "",
    val assignments: List<Assignment> = emptyList(),
    val revision: Long = 0,
    val exportedAt: String = "",
    val sourceAppVersion: String = "",
    val pushPinRequired: Boolean = false,
    val calendar: List<CalendarEntry> = emptyList(),
    val checklist: List<ChecklistEntry> = emptyList(),
    val grades: List<LearnerGradeSummary> = emptyList()
)

@Serializable
data class Assignment(
    val id: String,
    val gradeLevel: String,
    val section: String,
    val subject: String,
    val subjectGroup: String = "",
    val policy: String = "",
    val schoolYear: String = "",
    val learners: List<Learner> = emptyList(),
    val assessments: List<Assessment> = emptyList(),
    val scores: Map<String, String> = emptyMap(),
    val attendance: List<AttendanceSession> = emptyList()
)

@Serializable
data class Learner(
    val id: String,
    val name: String,
    val sex: String,
    val lrn: String = "",
    val avatarPresetId: String = "",
    val avatarAssignment: String = "automatic"
)

@Serializable
data class Assessment(
    val id: String,
    val term: String,
    val component: String,
    val title: String,
    val maxScore: String,
    val date: String = "",
    val mapePart: String? = null
)

@Serializable
data class CalendarEntry(
    val id: String,
    val title: String,
    val date: String,
    val endDate: String = "",
    val type: String = "local",
    val details: String = "",
    val classId: String? = null
)

@Serializable
data class AttendanceSession(
    val date: String,
    val term: String = "1",
    val statuses: List<AttendanceStatus> = emptyList()
)

@Serializable
data class AttendanceStatus(
    val learnerId: String,
    val status: String = "present",
    val note: String = ""
)

@Serializable
data class ChecklistEntry(
    val id: String,
    val classId: String = "",
    val title: String,
    val category: String = "Performance Checklist",
    val completedLearners: Int = 0,
    val totalLearners: Int = 0,
    val completed: Boolean = false
)

@Serializable
data class LearnerGradeSummary(
    val learnerId: String,
    val classId: String,
    val term: String = "1",
    val initialGrade: Double? = null,
    val quarterlyGrade: String? = null,
    val remark: String = ""
)

@Serializable
data class BluetoothEnvelope(
    val kind: String,
    val protocolVersion: Int = 1,
    val desktopId: String = "",
    val profileId: String = "",
    val batchId: String = "",
    val revision: Long = 0,
    val snapshot: SyncPayload? = null,
    val success: Boolean = false,
    val accepted: Int = 0,
    val acceptedChangeIds: List<String> = emptyList(),
    val error: String = ""
)

@Serializable
data class MobileChange(
    val changeId: String = "",
    val type: String,
    val classId: String = "",
    val learnerId: String = "",
    val assessmentId: String? = null,
    val value: String? = null,
    val date: String? = null,
    val term: String? = null,
    val status: String? = null,
    val note: String? = null,
    val action: String? = null,
    val eventId: String? = null,
    val title: String? = null,
    val endDate: String? = null,
    val details: String? = null,
    val field: String? = null,
)

@Serializable
data class ProfilePatch(
    val teacherName: String = "",
    val schoolName: String = "",
    val schoolId: String = "",
    val region: String = "",
    val division: String = "",
    val district: String = "",
)

@Serializable
data class ToolCommand(
    val kind: String = "tool-command",
    val command: String,
    val args: Map<String, String> = emptyMap(),
)

@Serializable
data class MobileChangesEnvelope(
    val kind: String = "changes",
    val protocolVersion: Int = 2,
    val desktopId: String = "",
    val profileId: String = "",
    val batchId: String = "",
    val baseRevision: Long,
    val changes: List<MobileChange>,
    val authorizationPin: String = ""
)

@Serializable
data class SnapshotAcknowledgement(
    val kind: String = "snapshot-ack",
    val revision: Long,
    val success: Boolean,
    val error: String = ""
)

data class PendingChangeReviewItem(
    val changeId: String,
    val change: MobileChange,
    val affectsExisting: Boolean,
    val kindLabel: String,
    val title: String,
    val detail: String,
    val previousValue: String,
    val newValue: String,
)

data class PendingChangeReview(
    val items: List<PendingChangeReviewItem>,
    val hasAuthoritativeSnapshot: Boolean,
) {
    val safe: List<PendingChangeReviewItem> get() = items.filterNot { it.affectsExisting }
    val affecting: List<PendingChangeReviewItem> get() = items.filter { it.affectsExisting }
}
