package com.example.eclassrecordmobile.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items as gridItems
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.ScrollableTabRow
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation3.runtime.NavKey
import com.example.eclassrecordmobile.ScoreEntry
import com.example.eclassrecordmobile.data.Assessment
import com.example.eclassrecordmobile.data.Assignment
import com.example.eclassrecordmobile.data.DatabaseHelper
import com.example.eclassrecordmobile.data.LearnerGradeSummary
import com.example.eclassrecordmobile.ui.main.SubjectIcon
import com.example.eclassrecordmobile.ui.main.SubjectVisuals
import java.util.Locale

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ClassDetailScreen(
    assignmentId: String,
    onBack: () -> Unit,
    onNavigate: (NavKey) -> Unit,
    modifier: Modifier = Modifier,
) {
    val payload = DatabaseHelper.getPayload()
    val assignment = payload?.assignments?.find { it.id == assignmentId }

    if (assignment == null) {
        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Text("Class not found", fontWeight = FontWeight.Bold)
        }
        return
    }

    var selectedTerm by rememberSaveable { mutableStateOf("1") }
    var selectedSheetTab by rememberSaveable { mutableIntStateOf(0) }
    val isMapeh = assignment.subject.uppercase().contains("MAPEH")
    var selectedMapePart by rememberSaveable { mutableStateOf("music_arts") }
    val visual = SubjectVisuals.forAssignment(assignment)

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        SubjectIcon(assignment, size = 36.dp)
                        Spacer(Modifier.width(10.dp))
                        Column {
                            Text(
                                "Grade ${assignment.gradeLevel} - ${assignment.section}",
                                fontWeight = FontWeight.Bold,
                                fontSize = 16.sp,
                            )
                            Text(assignment.subject, fontSize = 13.sp)
                        }
                    }
                },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = visual.color.copy(alpha = 0.14f),
                    titleContentColor = MaterialTheme.colorScheme.onSurface,
                ),
            )
        },
        modifier = modifier,
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues),
        ) {
            TabRow(selectedTabIndex = selectedTerm.toInt() - 1) {
                listOf("1", "2", "3").forEach { term ->
                    Tab(
                        selected = selectedTerm == term,
                        onClick = { selectedTerm = term },
                        text = { Text("Term $term", fontWeight = FontWeight.Bold) },
                    )
                }
            }
            ScrollableTabRow(
                selectedTabIndex = selectedSheetTab,
                containerColor = MaterialTheme.colorScheme.surface,
                edgePadding = 8.dp,
            ) {
                listOf("Assessments", "Individual", "Grid", "Summary").forEachIndexed { index, label ->
                    Tab(
                        selected = selectedSheetTab == index,
                        onClick = { selectedSheetTab = index },
                        text = { Text(label, fontWeight = FontWeight.SemiBold) },
                    )
                }
            }

            if (isMapeh && selectedSheetTab < 3) {
                    TabRow(
                        selectedTabIndex = if (selectedMapePart == "music_arts") 0 else 1,
                        containerColor = MaterialTheme.colorScheme.surfaceVariant,
                        contentColor = MaterialTheme.colorScheme.onSurfaceVariant,
                    ) {
                        Tab(
                            selected = selectedMapePart == "music_arts",
                            onClick = { selectedMapePart = "music_arts" },
                            text = { Text("Music & Arts", fontSize = 12.sp, fontWeight = FontWeight.SemiBold) },
                        )
                        Tab(
                            selected = selectedMapePart == "pe_health",
                            onClick = { selectedMapePart = "pe_health" },
                            text = { Text("PE & Health", fontSize = 12.sp, fontWeight = FontWeight.SemiBold) },
                        )
                    }
            }
            when (selectedSheetTab) {
              0 -> {
                AssessmentList(
                    assignment = assignment,
                    term = selectedTerm,
                    mapePart = selectedMapePart.takeIf { isMapeh },
                    onOpen = { onNavigate(ScoreEntry(assignment.id, it)) },
                )
              }
              1 -> IndividualGradeView(
                  assignment = assignment,
                  term = selectedTerm,
                  mapePart = selectedMapePart.takeIf { isMapeh },
              )
              2 -> GridGradeSheet(
                  assignment = assignment,
                  term = selectedTerm,
                  mapePart = selectedMapePart.takeIf { isMapeh },
              )
              else -> {
                GradeSummary(
                    assignment = assignment,
                    term = selectedTerm,
                    grades = payload.grades,
                )
              }
            }
        }
    }
}

@Composable
private fun AssessmentList(
    assignment: Assignment,
    term: String,
    mapePart: String?,
    onOpen: (String) -> Unit,
) {
    val assessments = assignment.assessments.filter { assessment ->
        assessment.term == term && (mapePart == null || assessment.mapePart == mapePart)
    }
    if (assessments.isEmpty()) {
        Box(
            modifier = Modifier.fillMaxSize().padding(32.dp),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                "No assessments configured for this term.",
                color = MaterialTheme.colorScheme.outline,
                fontSize = 15.sp,
                fontWeight = FontWeight.Medium,
            )
        }
        return
    }
    LazyColumn(
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
        modifier = Modifier.fillMaxSize(),
    ) {
        items(assessments, key = { it.id }) { assessment ->
            val gradedCount = assignment.learners.count { learner ->
                assignment.scores["${learner.id}|${assessment.id}"].orEmpty().trim().isNotEmpty()
            }
            val totalLearners = assignment.learners.size
            val percent = if (totalLearners > 0) gradedCount * 100 / totalLearners else 0
            AssessmentItem(
                assessment = assessment,
                gradedCount = gradedCount,
                totalCount = totalLearners,
                percent = percent,
                onClick = { onOpen(assessment.id) },
            )
        }
    }
}

private fun visibleAssessments(assignment: Assignment, term: String, mapePart: String?): List<Assessment> =
    assignment.assessments.filter { assessment ->
        assessment.term == term && (mapePart == null || assessment.mapePart == mapePart)
    }

@Composable
private fun IndividualGradeView(assignment: Assignment, term: String, mapePart: String?) {
    val assessments = visibleAssessments(assignment, term, mapePart)
    if (assessments.isEmpty()) {
        EmptyGradeView("No assessments configured for this term.")
        return
    }
    LazyVerticalGrid(
        columns = GridCells.Fixed(2),
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(12.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        gridItems(assignment.learners, key = { it.id }) { learner ->
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(14.dp),
            ) {
                Column(
                    modifier = Modifier.padding(12.dp),
                    verticalArrangement = Arrangement.spacedBy(7.dp),
                ) {
                    Text(learner.name, fontWeight = FontWeight.ExtraBold, maxLines = 2)
                    HorizontalDivider()
                    assessments.forEach { assessment ->
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                        ) {
                            Text(
                                assessment.title,
                                modifier = Modifier.weight(1f),
                                fontSize = 11.sp,
                                maxLines = 1,
                            )
                            Spacer(Modifier.width(6.dp))
                            Text(
                                assignment.scores["${learner.id}|${assessment.id}"].orEmpty().ifBlank { "—" },
                                fontSize = 12.sp,
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.primary,
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun GridGradeSheet(assignment: Assignment, term: String, mapePart: String?) {
    val assessments = visibleAssessments(assignment, term, mapePart)
    if (assessments.isEmpty()) {
        EmptyGradeView("No assessments configured for this term.")
        return
    }
    val nameWidth = 176.dp
    val scoreWidth = 96.dp
    val sheetWidth = nameWidth + scoreWidth * assessments.size
    val horizontal = rememberScrollState()
    Box(
        modifier = Modifier.fillMaxSize().horizontalScroll(horizontal),
    ) {
        Column(modifier = Modifier.width(sheetWidth).fillMaxSize()) {
            Row {
                GradeSheetCell("Learner", nameWidth, header = true)
                assessments.forEach { assessment ->
                    GradeSheetCell(
                        "${assessment.title}\nHPS ${assessment.maxScore}",
                        scoreWidth,
                        header = true,
                    )
                }
            }
            LazyColumn(modifier = Modifier.fillMaxSize()) {
                items(assignment.learners, key = { it.id }) { learner ->
                    Row {
                        GradeSheetCell(learner.name, nameWidth)
                        assessments.forEach { assessment ->
                            GradeSheetCell(
                                assignment.scores["${learner.id}|${assessment.id}"].orEmpty(),
                                scoreWidth,
                                centered = true,
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun GradeSheetCell(
    text: String,
    width: androidx.compose.ui.unit.Dp,
    header: Boolean = false,
    centered: Boolean = false,
) {
    Box(
        modifier = Modifier
            .width(width)
            .height(if (header) 62.dp else 50.dp)
            .border(0.5.dp, MaterialTheme.colorScheme.outlineVariant)
            .background(if (header) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surface)
            .padding(horizontal = 8.dp, vertical = 6.dp),
        contentAlignment = if (header || centered) Alignment.Center else Alignment.CenterStart,
    ) {
        Text(
            text.ifBlank { "—" },
            fontSize = if (header) 11.sp else 12.sp,
            fontWeight = if (header) FontWeight.ExtraBold else FontWeight.Medium,
            color = if (header) MaterialTheme.colorScheme.onPrimaryContainer else MaterialTheme.colorScheme.onSurface,
            maxLines = 2,
            textAlign = if (header || centered) TextAlign.Center else TextAlign.Start,
        )
    }
}

@Composable
private fun EmptyGradeView(message: String) {
    Box(modifier = Modifier.fillMaxSize().padding(32.dp), contentAlignment = Alignment.Center) {
        Text(message, color = MaterialTheme.colorScheme.outline, fontWeight = FontWeight.Medium)
    }
}

@Composable
private fun GradeSummary(
    assignment: Assignment,
    term: String,
    grades: List<LearnerGradeSummary>,
) {
    val termGrades = grades.filter { it.classId == assignment.id && it.term == term }
    val numericGrades = termGrades.mapNotNull { it.quarterlyGrade?.toDoubleOrNull() }
    val average = numericGrades.average().takeUnless(Double::isNaN)
    val passing = numericGrades.count { it >= 75.0 }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        item {
            Card(
                colors = CardDefaults.cardColors(
                    containerColor = SubjectVisuals.forAssignment(assignment).color.copy(alpha = 0.12f),
                ),
                modifier = Modifier.fillMaxWidth(),
            ) {
                Column(
                    Modifier.padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    Text("Term $term Summary", fontWeight = FontWeight.ExtraBold, fontSize = 18.sp)
                    Text(
                        "Class average: ${average?.let { String.format(Locale.getDefault(), "%.2f", it) } ?: "Not available"}",
                        fontWeight = FontWeight.SemiBold,
                    )
                    Text("$passing of ${numericGrades.size} computed grades are passing")
                }
            }
        }
        if (termGrades.isEmpty()) {
            item {
                Text(
                    "No computed term grades are available in the latest desktop snapshot.",
                    modifier = Modifier.padding(20.dp),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        } else {
            items(termGrades, key = { "${it.learnerId}|${it.term}" }) { grade ->
                val learner = assignment.learners.firstOrNull { it.id == grade.learnerId }
                Card(modifier = Modifier.fillMaxWidth()) {
                    Column(
                        Modifier.padding(14.dp),
                        verticalArrangement = Arrangement.spacedBy(3.dp),
                    ) {
                        Text(learner?.name ?: "Learner", fontWeight = FontWeight.Bold)
                        HorizontalDivider()
                        Text("Initial grade: ${grade.initialGrade ?: "-"}", fontSize = 13.sp)
                        Text("Term grade: ${grade.quarterlyGrade ?: "-"}", fontSize = 13.sp)
                        Text("Remark: ${grade.remark.ifBlank { "-" }}", fontSize = 13.sp)
                    }
                }
            }
        }
    }
}

private fun assessmentComponentLabel(component: String): String {
    val value = component.trim().uppercase()
    fun numbered(prefix: String, label: String): String {
        val suffix = value.removePrefix(prefix).trim()
        return if (suffix.isBlank()) label else "$label $suffix"
    }
    return when {
        value.startsWith("WW") -> numbered("WW", "Written Works")
        value.startsWith("PT") -> numbered("PT", "Performance Task")
        value.startsWith("ST") -> numbered("ST", "Summative Test")
        value.startsWith("SA") -> numbered("SA", "Summative Test")
        value.startsWith("TE") -> numbered("TE", "Term Examination")
        else -> component
    }
}

@Composable
fun AssessmentItem(
    assessment: Assessment,
    gradedCount: Int,
    totalCount: Int,
    percent: Int,
    onClick: () -> Unit,
) {
    val hps = assessment.maxScore.toFloatOrNull()?.toInt() ?: 0
    val label = assessmentComponentLabel(assessment.component)
    val badgeColor = when {
        assessment.component.uppercase().startsWith("WW") -> Color(0xFF1976D2)
        assessment.component.uppercase().startsWith("PT") -> Color(0xFFE65100)
        assessment.component.uppercase().startsWith("TE") -> Color(0xFFC2185B)
        else -> Color(0xFF388E3C)
    }

    Card(
        modifier = Modifier.fillMaxWidth().clickable(onClick = onClick),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(6.dp))
                        .background(badgeColor.copy(alpha = 0.15f))
                        .padding(horizontal = 8.dp, vertical = 4.dp),
                ) {
                    Text(label, fontSize = 11.sp, fontWeight = FontWeight.Bold, color = badgeColor)
                }
                Spacer(modifier = Modifier.height(7.dp))
                Text(assessment.title, fontWeight = FontWeight.Bold, fontSize = 16.sp)
                Text(
                    "HPS: ${if (hps > 0) hps else "--"}",
                    fontSize = 13.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Spacer(modifier = Modifier.height(8.dp))
                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
                    LinearProgressIndicator(
                        progress = { percent / 100f },
                        color = if (percent == 100) Color(0xFF2E7D32) else MaterialTheme.colorScheme.primary,
                        trackColor = MaterialTheme.colorScheme.surfaceVariant,
                        modifier = Modifier.weight(1f).height(6.dp).clip(RoundedCornerShape(3.dp)),
                    )
                    Spacer(modifier = Modifier.width(12.dp))
                    Text(
                        "$gradedCount/$totalCount ($percent%)",
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold,
                        color = if (percent == 100) Color(0xFF2E7D32) else MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            if (percent == 100) {
                Spacer(modifier = Modifier.width(8.dp))
                Icon(
                    Icons.Default.CheckCircle,
                    contentDescription = "Completed",
                    tint = Color(0xFF2E7D32),
                    modifier = Modifier.size(24.dp),
                )
            }
        }
    }
}
