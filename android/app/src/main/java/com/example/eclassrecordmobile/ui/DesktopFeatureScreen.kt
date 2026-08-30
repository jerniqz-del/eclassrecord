package com.example.eclassrecordmobile.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.DateRange
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.FilterChip
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.eclassrecordmobile.data.Assignment
import com.example.eclassrecordmobile.data.DatabaseHelper
import com.example.eclassrecordmobile.data.Learner
import com.example.eclassrecordmobile.data.BleServerManager
import androidx.compose.ui.platform.LocalContext
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset

object DesktopFeatureNames {
    const val ADVISORY = "advisory"
    const val GRADING = "grading"
    const val ATTENDANCE = "attendance"
    const val CHECKLIST = "checklist"
    const val CALENDAR = "calendar"
    const val TOOLS = "tools"
    const val SETTINGS = "settings"

    val menu = listOf(
        ADVISORY to "Advisory Class",
        GRADING to "Grading Sheet",
        ATTENDANCE to "Attendance",
        CHECKLIST to "Performance Checklist",
        CALENDAR to "Calendar",
        TOOLS to "Teacher Tools",
        SETTINGS to "Settings",
    )

    fun title(name: String): String = menu.firstOrNull { it.first == name }?.second ?: "Desktop Features"
}

@OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
@Composable
fun DesktopFeatureScreen(
    feature: String,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val payload = DatabaseHelper.getPayload()
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(DesktopFeatureNames.title(feature), fontWeight = FontWeight.Bold) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.primary,
                    titleContentColor = MaterialTheme.colorScheme.onPrimary,
                    navigationIconContentColor = MaterialTheme.colorScheme.onPrimary,
                ),
            )
        },
        modifier = modifier,
    ) { padding ->
        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(padding),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item {
                AuthorityBanner(
                    revision = payload?.revision ?: 0,
                    appVersion = payload?.sourceAppVersion.orEmpty(),
                )
            }
            if (payload == null) {
                item { EmptyFeature("Connect to the desktop over Bluetooth to receive the official class record.") }
            } else {
                when (feature) {
                    DesktopFeatureNames.ADVISORY -> advisoryItems(payload.assignments)
                    DesktopFeatureNames.GRADING -> gradingItems(payload.assignments, payload.grades)
                    DesktopFeatureNames.ATTENDANCE -> {
                        item { AttendanceEditor(payload.assignments) }
                        attendanceItems(payload.assignments)
                    }
                    DesktopFeatureNames.CHECKLIST -> {
                        item { PersonalChecklistPanel() }
                        item { Text("Desktop Checklists", fontWeight = FontWeight.ExtraBold, fontSize = 18.sp) }
                        checklistItems(payload.checklist)
                    }
                    DesktopFeatureNames.CALENDAR -> calendarItems(payload.calendar)
                    DesktopFeatureNames.TOOLS -> item { TeacherToolsPanel(payload.assignments) }
                    DesktopFeatureNames.SETTINGS -> settingsItems(
                        payload.teacherName,
                        payload.schoolName,
                        payload.schoolYear,
                        payload.assignments.size,
                    )
                    else -> item { EmptyFeature("This feature is not available.") }
                }
            }
        }
    }
}

@Composable
private fun AuthorityBanner(revision: Long, appVersion: String) {
    Card(
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(Modifier.padding(14.dp)) {
            Text("Desktop is the source of truth", fontWeight = FontWeight.Bold)
            Text(
                "Android shows the latest approved desktop snapshot. Mobile entries remain drafts until the desktop accepts them.",
                fontSize = 12.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Text(
                "Revision $revision" + if (appVersion.isBlank()) "" else " - Desktop v$appVersion",
                fontSize = 11.sp,
                fontWeight = FontWeight.SemiBold,
            )
        }
    }
}

private fun androidx.compose.foundation.lazy.LazyListScope.advisoryItems(assignments: List<Assignment>) {
    if (assignments.isEmpty()) {
        item { EmptyFeature("No advisory or teaching load has been synced.") }
        return
    }
    items(assignments) { assignment ->
        FeatureCard(
            title = "Grade ${assignment.gradeLevel} - ${assignment.section}",
            subtitle = assignment.subject,
            lines = listOf(
                "${assignment.learners.size} learners",
                "${assignment.assessments.size} assessments",
                "${assignment.attendance.size} attendance dates",
            ),
        )
    }
}

private fun androidx.compose.foundation.lazy.LazyListScope.gradingItems(
    assignments: List<Assignment>,
    grades: List<com.example.eclassrecordmobile.data.LearnerGradeSummary>,
) {
    if (grades.isEmpty()) {
        item { EmptyFeature("No computed term grades are available in the desktop snapshot yet.") }
        return
    }
    items(grades) { grade ->
        val assignment = assignments.firstOrNull { it.id == grade.classId }
        val learner = assignment?.learners?.firstOrNull { it.id == grade.learnerId }
        FeatureCard(
            title = learner?.name ?: "Learner",
            subtitle = "${assignment?.subject.orEmpty()} - Term ${grade.term}",
            lines = listOf(
                "Initial grade: ${grade.initialGrade?.toString() ?: "-"}",
                "Term grade: ${grade.quarterlyGrade ?: "-"}",
                "Remark: ${grade.remark.ifBlank { "-" }}",
            ),
        )
    }
}

@Composable
private fun AttendanceEditor(assignments: List<Assignment>) {
    val context = LocalContext.current
    var refresh by remember { mutableStateOf(0) }
    val currentAssignments = remember(refresh) {
        DatabaseHelper.getPayload()?.assignments ?: assignments
    }
    var classIndex by remember { mutableStateOf(0) }
    val assignment = currentAssignments.getOrNull(
        classIndex.coerceIn(0, (currentAssignments.size - 1).coerceAtLeast(0)),
    )
    var date by remember(assignment?.id) { mutableStateOf(LocalDate.now().toString()) }
    var term by remember(assignment?.id) {
        mutableStateOf(assignment?.attendance?.maxByOrNull { it.date }?.term ?: "1")
    }
    var showDatePicker by remember { mutableStateOf(false) }

    if (assignment == null) {
        EmptyFeature("Sync a teaching load before recording attendance.")
        return
    }

    Card(modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text("Attendance Entry", fontWeight = FontWeight.Bold, fontSize = 17.sp)
            Text(
                "Grade ${assignment.gradeLevel} - ${assignment.section} / ${assignment.subject}",
                color = MaterialTheme.colorScheme.primary,
                fontSize = 13.sp,
            )
            if (currentAssignments.size > 1) {
                Button(
                    onClick = { classIndex = (classIndex + 1) % currentAssignments.size },
                    modifier = Modifier.fillMaxWidth(),
                ) { Text("Next class") }
            }
            Button(
                onClick = { showDatePicker = true },
                modifier = Modifier.fillMaxWidth(),
            ) {
                Icon(Icons.Default.DateRange, contentDescription = null)
                Spacer(Modifier.width(8.dp))
                Text("Date: $date")
            }
            Text("Term", fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                listOf("1", "2", "3").forEach { value ->
                    FilterChip(
                        selected = term == value,
                        onClick = { term = value },
                        label = { Text("Term $value") },
                        modifier = Modifier.weight(1f),
                    )
                }
            }
            assignment.learners.forEach { learner ->
                val session = assignment.attendance.firstOrNull { it.date == date && it.term == term }
                val selected = session?.statuses?.firstOrNull { it.learnerId == learner.id }?.status ?: "present"
                Text(learner.name, fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
                listOf(
                    "present" to "Present",
                    "absent" to "Absent",
                    "tardy" to "Tardy",
                    "excused" to "Excused",
                ).chunked(2).forEach { choices ->
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        choices.forEach { (value, label) ->
                            FilterChip(
                                selected = selected == value,
                                onClick = {
                                    DatabaseHelper.updateAttendance(
                                        context = context,
                                        assignmentId = assignment.id,
                                        learnerId = learner.id,
                                        date = date,
                                        term = term,
                                        status = value,
                                    )
                                    refresh += 1
                                },
                                label = { Text(label) },
                                modifier = Modifier.width(150.dp),
                            )
                        }
                    }
                }
                HorizontalDivider()
            }
            Text(
                "Changes stay encrypted on this phone until the desktop validates and commits them.",
                fontSize = 11.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }

    if (showDatePicker) {
        val initialMillis = LocalDate.parse(date)
            .atStartOfDay()
            .toInstant(ZoneOffset.UTC)
            .toEpochMilli()
        val pickerState = rememberDatePickerState(initialSelectedDateMillis = initialMillis)
        DatePickerDialog(
            onDismissRequest = { showDatePicker = false },
            confirmButton = {
                TextButton(
                    onClick = {
                        pickerState.selectedDateMillis?.let { selected ->
                            date = Instant.ofEpochMilli(selected)
                                .atZone(ZoneOffset.UTC)
                                .toLocalDate()
                                .toString()
                        }
                        showDatePicker = false
                    },
                ) { Text("Use date") }
            },
            dismissButton = {
                TextButton(onClick = { showDatePicker = false }) { Text("Cancel") }
            },
        ) {
            DatePicker(state = pickerState)
        }
    }
}

private fun androidx.compose.foundation.lazy.LazyListScope.attendanceItems(assignments: List<Assignment>) {
    val sessions = assignments.flatMap { assignment -> assignment.attendance.map { assignment to it } }
    if (sessions.isEmpty()) {
        item { EmptyFeature("No attendance dates have been recorded on the desktop.") }
        return
    }
    items(sessions) { (assignment, session) ->
        val totals = session.statuses.groupingBy { it.status }.eachCount()
        FeatureCard(
            title = session.date,
            subtitle = "Grade ${assignment.gradeLevel} - ${assignment.section} / Term ${session.term}",
            lines = listOf(
                "Present: ${totals["present"] ?: 0}",
                "Absent: ${totals["absent"] ?: 0}",
                "Tardy: ${totals["tardy"] ?: 0}  Excused: ${totals["excused"] ?: 0}",
            ),
        )
    }
}

private fun androidx.compose.foundation.lazy.LazyListScope.checklistItems(
    checklist: List<com.example.eclassrecordmobile.data.ChecklistEntry>,
) {
    if (checklist.isEmpty()) {
        item { EmptyFeature("No performance checklist has been created on the desktop.") }
        return
    }
    checklist.groupBy { it.category }.forEach { (category, entries) ->
        item {
            Text(category, fontWeight = FontWeight.Bold, fontSize = 17.sp)
        }
        items(entries) { entry ->
            FeatureCard(
                title = entry.title,
                subtitle = "",
                lines = listOf("${entry.completedLearners} of ${entry.totalLearners} learners completed"),
            )
        }
    }
}

private fun androidx.compose.foundation.lazy.LazyListScope.calendarItems(
    calendar: List<com.example.eclassrecordmobile.data.CalendarEntry>,
) {
    if (calendar.isEmpty()) {
        item { EmptyFeature("No school calendar events are available in the desktop record.") }
        return
    }
    items(calendar.sortedBy { it.date }) { event ->
        FeatureCard(
            title = event.title,
            subtitle = if (event.endDate.isBlank() || event.endDate == event.date) event.date else "${event.date} to ${event.endDate}",
            lines = listOfNotNull(event.type.takeIf { it.isNotBlank() }, event.details.takeIf { it.isNotBlank() }),
        )
    }
}

private fun androidx.compose.foundation.lazy.LazyListScope.settingsItems(
    teacher: String,
    school: String,
    schoolYear: String,
    classes: Int,
) {
    item {
        FeatureCard(
            title = teacher.ifBlank { "Teacher" },
            subtitle = school.ifBlank { "School profile" },
            lines = listOf("School year: $schoolYear", "Teaching loads: $classes"),
        )
    }
    item {
        FeatureCard(
            title = "Sync policy",
            subtitle = "Bluetooth primary",
            lines = listOf(
                "Reconnects to the trusted desktop after first pairing",
                "Desktop validates and commits all mobile edits",
                "Local records are encrypted on this device",
            ),
        )
    }
}

@Composable
private fun TeacherToolsPanel(assignments: List<Assignment>) {
    val learners = assignments.flatMap { it.learners }.distinctBy { it.id }
    var picked by remember { mutableStateOf<Learner?>(null) }
    var groups by remember { mutableStateOf<List<List<Learner>>>(emptyList()) }

    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        FeatureCard(
            title = "Desktop Tool Controls",
            subtitle = "Runs on the authoritative desktop",
            lines = listOf(
                if (BleServerManager.isAuthorized) "Bluetooth control link ready"
                else "Connect Bluetooth to enable these controls",
            ),
        )
        Button(
            onClick = { BleServerManager.openDesktopLearnerPicker() },
            enabled = BleServerManager.isAuthorized,
            modifier = Modifier.fillMaxWidth(),
        ) { Text("Open learner picker on desktop") }
        Button(
            onClick = { BleServerManager.pickLearnerOnDesktop() },
            enabled = BleServerManager.isAuthorized,
            modifier = Modifier.fillMaxWidth(),
        ) { Text("Pick learner on desktop") }
        Button(
            onClick = { BleServerManager.openDesktopGroupMaker() },
            enabled = BleServerManager.isAuthorized,
            modifier = Modifier.fillMaxWidth(),
        ) { Text("Open group maker on desktop") }
        Button(
            onClick = { BleServerManager.randomizeGroupsOnDesktop() },
            enabled = BleServerManager.isAuthorized,
            modifier = Modifier.fillMaxWidth(),
        ) { Text("Randomize desktop groups") }
        Button(
            onClick = { BleServerManager.openDesktopChecklist() },
            enabled = BleServerManager.isAuthorized,
            modifier = Modifier.fillMaxWidth(),
        ) { Text("Open checklist on desktop") }
        HorizontalDivider()

        FeatureCard(
            title = "Random Learner Picker",
            subtitle = "Uses the synced desktop roster",
            lines = listOf(picked?.name ?: "No learner selected"),
        )
        Button(
            onClick = { picked = learners.randomOrNull() },
            enabled = learners.isNotEmpty(),
            modifier = Modifier.fillMaxWidth(),
        ) { Text("Pick a learner") }

        HorizontalDivider()
        FeatureCard(
            title = "Random Group Maker",
            subtitle = "Four balanced groups",
            lines = if (groups.isEmpty()) listOf("Generate groups from all synced learners")
                else groups.mapIndexed { index, members ->
                    "Group ${index + 1}: ${members.joinToString { it.name }}"
                },
        )
        Button(
            onClick = { groups = learners.shuffled().chunked(((learners.size + 3) / 4).coerceAtLeast(1)) },
            enabled = learners.isNotEmpty(),
            modifier = Modifier.fillMaxWidth(),
        ) { Text("Randomize groups") }
    }
}

@Composable
private fun FeatureCard(title: String, subtitle: String, lines: List<String>) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(14.dp)) {
            Text(title, fontWeight = FontWeight.Bold, fontSize = 16.sp)
            if (subtitle.isNotBlank()) {
                Text(subtitle, color = MaterialTheme.colorScheme.primary, fontSize = 12.sp)
                Spacer(Modifier.height(6.dp))
            }
            lines.forEach { line ->
                Text(line, fontSize = 13.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

@Composable
private fun EmptyFeature(message: String) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Text(
            message,
            modifier = Modifier.padding(20.dp),
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

