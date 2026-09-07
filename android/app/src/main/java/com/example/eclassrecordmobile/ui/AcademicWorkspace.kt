package com.example.eclassrecordmobile.ui

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.animateContentSize
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.sizeIn
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Assignment
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Class
import androidx.compose.material.icons.filled.DateRange
import androidx.compose.material.icons.filled.Event
import androidx.compose.material.icons.filled.People
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.eclassrecordmobile.data.Assignment
import com.example.eclassrecordmobile.data.CalendarEntry
import com.example.eclassrecordmobile.data.DatabaseHelper
import com.example.eclassrecordmobile.ui.design.DepthIcon
import com.example.eclassrecordmobile.ui.design.LocalFluidLayout
import com.example.eclassrecordmobile.ui.design.NeonCard
import com.example.eclassrecordmobile.ui.design.SearchField
import com.example.eclassrecordmobile.ui.design.themePanel
import com.example.eclassrecordmobile.ui.main.SubjectIconTile
import com.example.eclassrecordmobile.ui.main.SubjectVisuals
import com.example.eclassrecordmobile.theme.NeonBlue
import com.example.eclassrecordmobile.theme.NeonGreen
import com.example.eclassrecordmobile.theme.NeonPanel
import com.example.eclassrecordmobile.theme.NeonPanelRaised
import com.example.eclassrecordmobile.theme.NeonPurple
import java.time.LocalDate
import java.time.Instant
import java.time.YearMonth
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.time.format.TextStyle
import java.time.temporal.WeekFields
import java.util.Locale

@Composable
fun ModernCalendarScreen(calendar: List<CalendarEntry>, modifier: Modifier = Modifier) {
    val today = LocalDate.now()
    var monthText by rememberSaveable { mutableStateOf(YearMonth.from(today).toString()) }
    var selectedText by rememberSaveable { mutableStateOf(today.toString()) }
    val month = remember(monthText) { YearMonth.parse(monthText) }
    val selected = remember(selectedText) { LocalDate.parse(selectedText) }
    val parsed = remember(calendar) { calendar.mapNotNull { event -> runCatching { Triple(event, LocalDate.parse(event.date), LocalDate.parse(event.endDate.ifBlank { event.date })) }.getOrNull() } }
    val selectedEvents = parsed.filter { (_, start, end) -> !selected.isBefore(start) && !selected.isAfter(end) }.map { it.first }
    val monthEvents = parsed.count { (_, start, end) -> YearMonth.from(start) == month || YearMonth.from(end) == month }
    val firstDay = WeekFields.of(Locale.getDefault()).firstDayOfWeek
    val offset = (month.atDay(1).dayOfWeek.value - firstDay.value + 7) % 7
    val gridStart = month.atDay(1).minusDays(offset.toLong())
    val days = (0 until 42).map { gridStart.plusDays(it.toLong()) }
    val formatter = DateTimeFormatter.ofPattern("MMMM yyyy")

    LazyColumn(modifier.fillMaxSize(), contentPadding = PaddingValues(LocalFluidLayout.current.gutter), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        item {
            Card(
                shape = RoundedCornerShape(28.dp),
                colors = CardDefaults.cardColors(containerColor = NeonPanel),
                border = BorderStroke(1.dp, NeonPurple.copy(alpha = .68f)),
                modifier = Modifier.fillMaxWidth().graphicsLayer { shadowElevation = 24f },
            ) {
                Column(
                    Modifier.background(Brush.horizontalGradient(listOf(NeonPanelRaised, NeonPanel))).padding(20.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                        DepthIcon(Icons.Default.CalendarMonth, "Calendar", selected = true, size = 50.dp)
                        Spacer(Modifier.width(12.dp))
                        Column(Modifier.weight(1f)) {
                            Text("School calendar", color = Color.White, fontSize = 22.sp, fontWeight = FontWeight.ExtraBold)
                            Text("$monthEvents events this month", color = NeonPurple, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                        }
                        AssistChip(onClick = { monthText = YearMonth.from(today).toString(); selectedText = today.toString() }, label = { Text("Today") })
                    }
                }
            }
        }
        item {
            Card(
                shape = RoundedCornerShape(24.dp),
                modifier = Modifier.fillMaxWidth().animateContentSize(),
                border = BorderStroke(1.dp, NeonPurple.copy(alpha = .34f)),
                colors = CardDefaults.cardColors(containerColor = NeonPanel),
            ) {
                Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                        IconButton(onClick = { monthText = month.minusMonths(1).toString() }, modifier = Modifier.sizeIn(minWidth = 48.dp, minHeight = 48.dp)) {
                            Icon(Icons.AutoMirrored.Filled.ArrowBack, "Previous month")
                        }
                        AnimatedContent(month, Modifier.weight(1f), transitionSpec = { fadeIn() togetherWith fadeOut() }, label = "calendar-month") { current ->
                            Text(current.format(formatter), textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth(), fontWeight = FontWeight.ExtraBold, fontSize = 18.sp)
                        }
                        IconButton(onClick = { monthText = month.plusMonths(1).toString() }, modifier = Modifier.sizeIn(minWidth = 48.dp, minHeight = 48.dp)) {
                            Icon(Icons.AutoMirrored.Filled.ArrowForward, "Next month")
                        }
                    }
                    Row(Modifier.fillMaxWidth()) {
                        (0 until 7).forEach { index ->
                            val day = firstDay.plus(index.toLong())
                            Text(day.getDisplayName(TextStyle.NARROW, Locale.getDefault()), Modifier.weight(1f), textAlign = TextAlign.Center, fontSize = 11.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                    days.chunked(7).forEach { week ->
                        Row(Modifier.fillMaxWidth()) {
                            week.forEach { day ->
                                val inMonth = YearMonth.from(day) == month
                                val isSelected = day == selected
                                val hasEvents = parsed.any { (_, start, end) -> !day.isBefore(start) && !day.isAfter(end) }
                                Box(
                                    Modifier.weight(1f).height(48.dp).padding(2.dp).clip(RoundedCornerShape(14.dp))
                                        .background(if (isSelected) NeonPurple else if (day == today) NeonPurple.copy(alpha = .18f) else Color.Transparent)
                                        .clickable { selectedText = day.toString(); if (!inMonth) monthText = YearMonth.from(day).toString() },
                                    contentAlignment = Alignment.Center,
                                ) {
                                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                        Text(day.dayOfMonth.toString(), color = when { isSelected -> Color.White; inMonth -> MaterialTheme.colorScheme.onSurface; else -> MaterialTheme.colorScheme.outline }, fontWeight = if (isSelected || day == today) FontWeight.ExtraBold else FontWeight.Normal)
                                        if (hasEvents) Box(Modifier.size(5.dp).clip(CircleShape).background(if (isSelected) Color.White else NeonGreen))
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        item {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                DepthIcon(Icons.Default.Event, "Agenda", size = 42.dp, selected = selectedEvents.isNotEmpty())
                Spacer(Modifier.width(10.dp))
                Column {
                    Text(selected.format(DateTimeFormatter.ofPattern("EEEE, MMMM d")), fontWeight = FontWeight.ExtraBold, fontSize = 17.sp)
                    Text(if (selectedEvents.isEmpty()) "No events scheduled" else "${selectedEvents.size} event${if (selectedEvents.size == 1) "" else "s"}", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
        if (selectedEvents.isEmpty()) item { AcademicEmptyCard("This date is clear. Select a date with an event dot to view its agenda.") }
        items(selectedEvents, key = { it.id }) { event -> CalendarEventCard(event) }
    }
}

@Composable
private fun CalendarEventCard(event: CalendarEntry) {
    val accent = when (event.type.lowercase()) { "national", "holiday" -> Color(0xFFDC2626); "school" -> Color(0xFF2563EB); else -> Color(0xFF0891B2) }
    Card(
        Modifier.fillMaxWidth().graphicsLayer { shadowElevation = 12f },
        shape = RoundedCornerShape(20.dp),
        border = BorderStroke(1.dp, accent.copy(alpha = .56f)),
        colors = CardDefaults.cardColors(containerColor = NeonPanelRaised),
    ) {
        Row(Modifier.fillMaxWidth()) {
            Box(Modifier.width(6.dp).height(112.dp).background(accent))
            Column(Modifier.padding(16.dp).weight(1f), verticalArrangement = Arrangement.spacedBy(5.dp)) {
                Text(event.title, fontWeight = FontWeight.ExtraBold, fontSize = 16.sp)
                Text(event.type.ifBlank { "School event" }, color = accent, fontWeight = FontWeight.Bold, fontSize = 11.sp)
                if (event.details.isNotBlank()) Text(event.details, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp)
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ModernAttendanceScreen(assignments: List<Assignment>, modifier: Modifier = Modifier) {
    val context = androidx.compose.ui.platform.LocalContext.current
    var revision by remember { mutableIntStateOf(0) }
    val currentAssignments = remember(revision) { DatabaseHelper.getPayload()?.assignments ?: assignments }
    var selectedClassId by rememberSaveable { mutableStateOf(currentAssignments.firstOrNull()?.id.orEmpty()) }
    val assignment = currentAssignments.find { it.id == selectedClassId } ?: currentAssignments.firstOrNull()
    var selectedDate by rememberSaveable(assignment?.id) { mutableStateOf(LocalDate.now().toString()) }
    var term by rememberSaveable(assignment?.id) { mutableStateOf("1") }
    var query by rememberSaveable { mutableStateOf("") }
    var showDatePicker by rememberSaveable { mutableStateOf(false) }
    if (assignment == null) { Box(modifier.fillMaxSize().padding(16.dp)) { AcademicEmptyCard("Sync a teaching load before recording attendance.") }; return }
    val session = assignment.attendance.firstOrNull { it.date == selectedDate && it.term == term }
    val statusFor: (String) -> String = { learnerId -> session?.statuses?.find { it.learnerId == learnerId }?.status ?: "present" }
    val shown = assignment.learners.filter { query.isBlank() || it.name.contains(query, true) }
    val totals = assignment.learners.groupingBy { statusFor(it.id) }.eachCount()
    val present = totals["present"] ?: 0
    val attendanceFraction = if (assignment.learners.isEmpty()) 0f else present.toFloat() / assignment.learners.size

    LazyColumn(modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item {
            Card(
                shape = RoundedCornerShape(28.dp),
                colors = CardDefaults.cardColors(containerColor = NeonPanel),
                border = BorderStroke(1.dp, NeonGreen.copy(alpha = .65f)),
                modifier = Modifier.graphicsLayer { shadowElevation = 22f },
            ) {
                Column(Modifier.background(Brush.horizontalGradient(listOf(NeonPanelRaised, NeonPanel))).padding(20.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        DepthIcon(Icons.Default.People, "Attendance", selected = true, size = 50.dp)
                        Spacer(Modifier.width(12.dp)); Column { Text("Attendance workspace", color = Color.White, fontSize = 21.sp, fontWeight = FontWeight.ExtraBold); Text("Fast entry with encrypted offline drafts", color = Color.White.copy(alpha = .8f), fontSize = 12.sp) }
                    }
                    LinearProgressIndicator({ attendanceFraction }, Modifier.fillMaxWidth().height(8.dp).clip(CircleShape), color = NeonGreen, trackColor = NeonGreen.copy(alpha = .16f))
                    Text("$present of ${assignment.learners.size} marked present", color = Color.White, fontWeight = FontWeight.Bold)
                }
            }
        }
        item {
            LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                items(currentAssignments, key = { it.id }) { item ->
                    FilterChip(selected = item.id == assignment.id, onClick = { selectedClassId = item.id }, label = { Text("${item.subject} · ${item.section}") })
                }
            }
        }
        item {
            Card(
                shape = RoundedCornerShape(22.dp),
                border = BorderStroke(1.dp, SubjectVisuals.forAssignment(assignment).color.copy(alpha = .48f)),
                colors = CardDefaults.cardColors(containerColor = NeonPanel),
            ) {
                Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text("${assignment.subject} · Grade ${assignment.gradeLevel} - ${assignment.section}", fontWeight = FontWeight.ExtraBold)
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        AssistChip(onClick = { selectedDate = LocalDate.parse(selectedDate).minusDays(1).toString() }, label = { Text("Previous") })
                        AssistChip(onClick = { showDatePicker = true }, leadingIcon = { Icon(Icons.Default.DateRange, null) }, label = { Text(if (selectedDate == LocalDate.now().toString()) "Today" else selectedDate) }, modifier = Modifier.weight(1f))
                        AssistChip(onClick = { selectedDate = LocalDate.parse(selectedDate).plusDays(1).toString() }, label = { Text("Next") })
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) { listOf("1", "2", "3").forEach { value -> FilterChip(term == value, { term = value }, { Text("Term $value") }, modifier = Modifier.weight(1f)) } }
                }
            }
        }
        item {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                AttendanceMetric("Present", present, Color(0xFF16A34A), Modifier.weight(1f)); AttendanceMetric("Absent", totals["absent"] ?: 0, Color(0xFFDC2626), Modifier.weight(1f)); AttendanceMetric("Late", totals["tardy"] ?: 0, Color(0xFFF59E0B), Modifier.weight(1f)); AttendanceMetric("Excused", totals["excused"] ?: 0, Color(0xFF2563EB), Modifier.weight(1f))
            }
        }
        item {
            Button(
                onClick = { assignment.learners.forEach { DatabaseHelper.updateAttendance(context, assignment.id, it.id, selectedDate, term, "present") }; revision += 1 },
                modifier = Modifier.fillMaxWidth().height(52.dp),
                shape = RoundedCornerShape(16.dp),
                colors = ButtonDefaults.buttonColors(containerColor = NeonGreen, contentColor = Color(0xFF03140A)),
            ) {
                Icon(Icons.Default.CheckCircle, null); Spacer(Modifier.width(8.dp)); Text("Mark everyone present", fontWeight = FontWeight.Bold)
            }
        }
        item { SearchField(query, { query = it }, "Find learner") }
        items(shown, key = { it.id }) { learner ->
            val selectedStatus = statusFor(learner.id)
            val statusColor = attendanceStatusColor(selectedStatus)
            Card(
                Modifier.fillMaxWidth().animateContentSize(),
                shape = RoundedCornerShape(20.dp),
                border = BorderStroke(1.dp, statusColor.copy(alpha = .42f)),
                colors = CardDefaults.cardColors(containerColor = NeonPanel),
            ) {
                Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(9.dp)) {
                    Text(learner.name, fontWeight = FontWeight.ExtraBold)
                    Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                        listOf("present" to "Present", "absent" to "Absent", "tardy" to "Late", "excused" to "Excused").forEach { (value, label) ->
                            FilterChip(selectedStatus == value, { DatabaseHelper.updateAttendance(context, assignment.id, learner.id, selectedDate, term, value); revision += 1 }, { Text(label) }, modifier = Modifier.height(48.dp))
                        }
                    }
                }
            }
        }
        if (shown.isEmpty()) item { AcademicEmptyCard("No learners match your search.") }
    }
    if (showDatePicker) {
        val initialMillis = LocalDate.parse(selectedDate).atStartOfDay().toInstant(ZoneOffset.UTC).toEpochMilli()
        val pickerState = rememberDatePickerState(initialSelectedDateMillis = initialMillis)
        DatePickerDialog(
            onDismissRequest = { showDatePicker = false },
            confirmButton = { TextButton(onClick = {
                pickerState.selectedDateMillis?.let { selectedDate = Instant.ofEpochMilli(it).atZone(ZoneOffset.UTC).toLocalDate().toString() }
                showDatePicker = false
            }) { Text("Use date") } },
            dismissButton = { TextButton(onClick = { showDatePicker = false }) { Text("Cancel") } },
        ) { DatePicker(state = pickerState) }
    }
}

@Composable private fun AttendanceMetric(label: String, value: Int, color: Color, modifier: Modifier = Modifier) {
    Card(modifier, shape = RoundedCornerShape(18.dp), border = BorderStroke(1.dp, color.copy(alpha = .44f)), colors = CardDefaults.cardColors(containerColor = NeonPanelRaised)) { Column(Modifier.fillMaxWidth().padding(vertical = 12.dp), horizontalAlignment = Alignment.CenterHorizontally) { Text(value.toString(), color = color, fontSize = 20.sp, fontWeight = FontWeight.ExtraBold); Text(label, fontSize = 9.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurfaceVariant) } }
}

@Composable private fun AcademicEmptyCard(message: String) {
    Card(Modifier.fillMaxWidth(), shape = RoundedCornerShape(22.dp), border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant), colors = CardDefaults.cardColors(containerColor = NeonPanelRaised)) { Text(message, Modifier.padding(22.dp), textAlign = TextAlign.Center, color = MaterialTheme.colorScheme.onSurfaceVariant) }
}

@Composable
fun ModernClassesTab(assignments: List<Assignment>, onOpen: (String) -> Unit) {
    var query by rememberSaveable { mutableStateOf("") }
    var gradeFilter by rememberSaveable { mutableStateOf("All") }
    val grades = listOf("All") + assignments.map { it.gradeLevel }.distinct().sorted()
    val shown = assignments.filter { item ->
        (gradeFilter == "All" || item.gradeLevel == gradeFilter) &&
            (query.isBlank() || "${item.subject} ${item.gradeLevel} ${item.section}".contains(query, true))
    }.sortedWith(compareBy<Assignment> { it.gradeLevel }.thenBy { it.section }.thenBy { it.subject })
    val learners = assignments.flatMap { it.learners }.distinctBy { it.id }.size

    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(LocalFluidLayout.current.gutter), verticalArrangement = Arrangement.spacedBy(13.dp)) {
        item { AcademicHero(Icons.Default.Class, "My classes", "${assignments.size} teaching loads · $learners learners", listOf(Color(0xFF312E81), Color(0xFF4338CA), Color(0xFF0891B2))) }
        item { SearchField(query, { query = it }, "Search subject, grade, or section") }
        item { LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) { items(grades) { grade -> FilterChip(gradeFilter == grade, { gradeFilter = grade }, { Text(if (grade == "All") "All grades" else "Grade $grade") }) } } }
        if (shown.isEmpty()) item { AcademicEmptyCard("No classes match these filters. Try another subject, grade, or section.") }
        items(shown, key = { it.id }) { assignment -> ModernClassCard(assignment, onOpen) }
    }
}

@Composable
private fun ModernClassCard(assignment: Assignment, onOpen: (String) -> Unit) {
    val accent = SubjectVisuals.forAssignment(assignment).color
    val totalExpected = assignment.learners.size * assignment.assessments.size
    val entered = assignment.scores.values.count { it.isNotBlank() }
    val progress = if (totalExpected == 0) 0f else entered.toFloat() / totalExpected
    val animated by animateFloatAsState(progress, label = "class-progress")
    val lastAttendance = assignment.attendance.maxByOrNull { it.date }
    Card(
        Modifier.fillMaxWidth().clickable { onOpen(assignment.id) }.graphicsLayer { shadowElevation = 14f },
        shape = RoundedCornerShape(24.dp),
        border = BorderStroke(1.dp, accent.copy(alpha = 0.34f)),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 5.dp),
    ) {
        Column {
            Box(Modifier.fillMaxWidth().height(6.dp).background(Brush.horizontalGradient(listOf(accent, accent.copy(alpha = .45f)))))
            Column(Modifier.padding(17.dp), verticalArrangement = Arrangement.spacedBy(11.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    SubjectIconTile(assignment, size = 56.dp)
                    Spacer(Modifier.width(12.dp))
                    Column(Modifier.weight(1f)) {
                        Text(assignment.subject, fontSize = 17.sp, fontWeight = FontWeight.ExtraBold)
                        Text("Grade ${assignment.gradeLevel} · ${assignment.section}", color = accent, fontWeight = FontWeight.Bold, fontSize = 12.sp)
                    }
                    Icon(Icons.AutoMirrored.Filled.ArrowForward, "Open class", tint = accent)
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    ClassMetric("Learners", assignment.learners.size.toString(), Modifier.weight(1f))
                    ClassMetric("Activities", assignment.assessments.size.toString(), Modifier.weight(1f))
                    ClassMetric("Attendance", assignment.attendance.size.toString(), Modifier.weight(1f))
                }
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) { Text("Grading completion", fontSize = 11.sp, fontWeight = FontWeight.Bold); Text("${(progress * 100).toInt()}%", color = accent, fontSize = 11.sp, fontWeight = FontWeight.ExtraBold) }
                LinearProgressIndicator({ animated }, Modifier.fillMaxWidth().height(8.dp).clip(CircleShape), color = accent)
                Text(lastAttendance?.let { "Latest attendance · ${it.date}" } ?: "No attendance session yet", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp)
            }
        }
    }
}

@Composable
fun ModernGradingTab(assignments: List<Assignment>, onOpen: (String) -> Unit) {
    var term by rememberSaveable { mutableStateOf("1") }
    var filter by rememberSaveable { mutableStateOf("All") }
    var query by rememberSaveable { mutableStateOf("") }
    val rows = assignments.map { it to academicCompletion(it, term) }
    val shown = rows.filter { (item, progress) ->
        (query.isBlank() || "${item.subject} ${item.section}".contains(query, true)) && when (filter) {
            "Complete" -> progress >= .999f
            "Needs attention" -> progress < .999f
            else -> true
        }
    }.sortedWith(compareBy<Pair<Assignment, Float>> { it.second }.thenBy { it.first.subject })
    val expected = assignments.sumOf { it.learners.size * it.assessments.count { assessment -> assessment.term == term } }
    val entered = assignments.sumOf { assignment -> assignment.learners.sumOf { learner -> assignment.assessments.count { assessment -> assessment.term == term && assignment.scores["${learner.id}|${assessment.id}"].orEmpty().isNotBlank() } } }
    val overall = if (expected == 0) 0f else entered.toFloat() / expected
    val overallAnimated by animateFloatAsState(overall, label = "overall-grading-progress")

    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(LocalFluidLayout.current.gutter), verticalArrangement = Arrangement.spacedBy(13.dp)) {
        item {
            AcademicHero(Icons.Default.Assignment, "Grading sheets", "Term $term · $entered of $expected scores entered", listOf(Color(0xFF4C1D95), Color(0xFF7C3AED), Color(0xFFDB2777)))
        }
        item {
            NeonCard(modifier = Modifier.fillMaxWidth(), accent = NeonPurple.copy(alpha = 0.32f), contentPadding = PaddingValues(15.dp)) {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text("Overall completion", fontWeight = FontWeight.Bold)
                        Text("${(overall * 100).toInt()}%", color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.ExtraBold)
                    }
                    LinearProgressIndicator({ overallAnimated }, Modifier.fillMaxWidth().height(10.dp).clip(CircleShape))
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        listOf("1", "2", "3").forEach { value ->
                            FilterChip(term == value, { term = value }, { Text("Term $value") }, modifier = Modifier.weight(1f).height(48.dp))
                        }
                    }
                }
            }
        }
        item { SearchField(query, { query = it }, "Search grading sheets") }
        item { LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) { items(listOf("All", "Needs attention", "Complete")) { option -> FilterChip(filter == option, { filter = option }, { Text(option) }) } } }
        if (shown.isEmpty()) item { AcademicEmptyCard("No grading sheets match this term and filter.") }
        items(shown, key = { it.first.id }) { (assignment, progress) -> GradingOverviewCard(assignment, term, progress, onOpen) }
    }
}

@Composable
private fun GradingOverviewCard(assignment: Assignment, term: String, progress: Float, onOpen: (String) -> Unit) {
    val accent = SubjectVisuals.forAssignment(assignment).color
    val assessments = assignment.assessments.filter { it.term == term }
    val componentCounts = assessments.groupingBy { it.component.ifBlank { "Other" } }.eachCount()
    Card(
        Modifier.fillMaxWidth().clickable { onOpen(assignment.id) }.graphicsLayer { shadowElevation = 13f },
        shape = RoundedCornerShape(23.dp),
        border = BorderStroke(1.dp, accent.copy(alpha = 0.34f)),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 5.dp),
    ) {
        Column {
        Box(Modifier.fillMaxWidth().height(5.dp).background(accent))
        Column(Modifier.padding(17.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                SubjectIconTile(assignment, size = 54.dp)
                Spacer(Modifier.width(11.dp)); Column(Modifier.weight(1f)) { Text(assignment.subject, fontWeight = FontWeight.ExtraBold, fontSize = 17.sp); Text("Grade ${assignment.gradeLevel} · ${assignment.section}", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                Text("${(progress * 100).toInt()}%", color = accent, fontWeight = FontWeight.ExtraBold, fontSize = 18.sp)
            }
            LinearProgressIndicator({ progress }, Modifier.fillMaxWidth().height(9.dp).clip(CircleShape), color = accent)
            if (componentCounts.isNotEmpty()) Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(7.dp)) { componentCounts.forEach { (component, count) -> AssistChip(onClick = {}, label = { Text("$component · $count") }) } }
            HorizontalDivider()
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                Text(if (progress >= .999f) "Ready for review" else "Continue unfinished scores", color = if (progress >= .999f) Color(0xFF15803D) else MaterialTheme.colorScheme.onSurfaceVariant, fontWeight = FontWeight.Bold, fontSize = 12.sp)
                Text("Open sheet", color = accent, fontWeight = FontWeight.ExtraBold)
            }
        }
        }
    }
}

@Composable private fun AcademicHero(icon: androidx.compose.ui.graphics.vector.ImageVector, title: String, subtitle: String, colors: List<Color>) {
    val accent = colors.lastOrNull() ?: NeonBlue
    val fluid = LocalFluidLayout.current
    Card(shape = RoundedCornerShape(fluid.cornerRadius), colors = CardDefaults.cardColors(containerColor = NeonPanel), border = BorderStroke(1.dp, accent.copy(alpha = .66f)), modifier = Modifier.fillMaxWidth().heightIn(min = fluid.mediaHeight).graphicsLayer { shadowElevation = 24f }) {
        Column {
            Box(Modifier.fillMaxWidth().height(4.dp).background(Brush.horizontalGradient(colors)))
            Row(Modifier.background(Brush.horizontalGradient(listOf(NeonPanelRaised, NeonPanel))).padding(20.dp), verticalAlignment = Alignment.CenterVertically) { DepthIcon(icon, title, selected = true, size = 52.dp, accent = accent); Spacer(Modifier.width(13.dp)); Column { Text(title, color = Color.White, fontSize = 22.sp, fontWeight = FontWeight.ExtraBold); Text(subtitle, color = accent, fontSize = 12.sp, fontWeight = FontWeight.Bold) } }
        }
    }
}

@Composable private fun ClassMetric(label: String, value: String, modifier: Modifier = Modifier) { Card(modifier, shape = RoundedCornerShape(15.dp), border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant), colors = CardDefaults.cardColors(containerColor = themePanel(raised = true))) { Column(Modifier.fillMaxWidth().padding(9.dp), horizontalAlignment = Alignment.CenterHorizontally) { Text(value, fontWeight = FontWeight.ExtraBold); Text(label, fontSize = 9.sp, color = MaterialTheme.colorScheme.onSurfaceVariant) } } }
private fun attendanceStatusColor(status: String): Color = when (status) {
    "present" -> NeonGreen
    "absent" -> Color(0xFFEF4444)
    "tardy" -> Color(0xFFF59E0B)
    "excused" -> NeonBlue
    else -> NeonPurple
}
private fun academicCompletion(assignment: Assignment, term: String): Float { val assessments = assignment.assessments.filter { it.term == term }; val expected = assignment.learners.size * assessments.size; if (expected == 0) return 0f; val entered = assignment.learners.sumOf { learner -> assessments.count { assignment.scores["${learner.id}|${it.id}"].orEmpty().isNotBlank() } }; return entered.toFloat() / expected }
