package com.example.eclassrecordmobile.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation3.runtime.NavKey
import com.example.eclassrecordmobile.ScoreEntry
import com.example.eclassrecordmobile.data.Assessment
import com.example.eclassrecordmobile.data.DatabaseHelper

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ClassDetailScreen(
    assignmentId: String,
    onBack: () -> Unit,
    onNavigate: (NavKey) -> Unit,
    modifier: Modifier = Modifier
) {
    val payload = DatabaseHelper.getPayload()
    val assignment = payload?.assignments?.find { it.id == assignmentId }

    if (assignment == null) {
        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Text("Class not found", fontWeight = FontWeight.Bold)
        }
        return
    }

    var selectedTerm by remember { mutableStateOf("1") }
    
    val isMapeh = assignment.subject.uppercase().contains("MAPEH")
    var selectedMapePart by remember { mutableStateOf("music_arts") }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text("Grade ${assignment.gradeLevel} - ${assignment.section}", fontWeight = FontWeight.Bold, fontSize = 16.sp)
                        Text(assignment.subject, fontSize = 13.sp)
                    }
                },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.primaryContainer,
                    titleContentColor = MaterialTheme.colorScheme.onPrimaryContainer
                )
            )
        },
        modifier = modifier
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
        ) {
            // Term Selection Tabs
            TabRow(selectedTabIndex = selectedTerm.toInt() - 1) {
                Tab(
                    selected = selectedTerm == "1",
                    onClick = { selectedTerm = "1" },
                    text = { Text("Term 1", fontWeight = FontWeight.Bold) }
                )
                Tab(
                    selected = selectedTerm == "2",
                    onClick = { selectedTerm = "2" },
                    text = { Text("Term 2", fontWeight = FontWeight.Bold) }
                )
                Tab(
                    selected = selectedTerm == "3",
                    onClick = { selectedTerm = "3" },
                    text = { Text("Term 3", fontWeight = FontWeight.Bold) }
                )
            }

            // MAPEH Strand Sub-tabs
            if (isMapeh) {
                TabRow(
                    selectedTabIndex = if (selectedMapePart == "music_arts") 0 else 1,
                    containerColor = MaterialTheme.colorScheme.surfaceVariant,
                    contentColor = MaterialTheme.colorScheme.onSurfaceVariant
                ) {
                    Tab(
                        selected = selectedMapePart == "music_arts",
                        onClick = { selectedMapePart = "music_arts" },
                        text = { Text("Music & Arts", fontSize = 12.sp, fontWeight = FontWeight.SemiBold) }
                    )
                    Tab(
                        selected = selectedMapePart == "pe_health",
                        onClick = { selectedMapePart = "pe_health" },
                        text = { Text("PE & Health", fontSize = 12.sp, fontWeight = FontWeight.SemiBold) }
                    )
                }
            }

            // Filter assessments matching the selected term and MAPEH strand
            val filteredAssessments = assignment.assessments.filter { ast ->
                ast.term == selectedTerm && (!isMapeh || ast.mapePart == selectedMapePart)
            }

            if (filteredAssessments.isEmpty()) {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(32.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        "No assessments configured for this term.",
                        color = MaterialTheme.colorScheme.outline,
                        fontSize = 15.sp,
                        fontWeight = FontWeight.Medium
                    )
                }
            } else {
                LazyColumn(
                    contentPadding = PaddingValues(16.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                    modifier = Modifier.fillMaxSize()
                ) {
                    items(filteredAssessments) { assessment ->
                        // Calculate stats
                        val totalLearners = assignment.learners.size
                        var gradedCount = 0
                        assignment.learners.forEach { learner ->
                            val score = assignment.scores["${learner.id}|${assessment.id}"]
                            if (!score.isNullOrEmpty()) {
                                gradedCount++
                            }
                        }
                        val percent = if (totalLearners > 0) (gradedCount * 100 / totalLearners) else 0

                        AssessmentItem(
                            assessment = assessment,
                            gradedCount = gradedCount,
                            totalCount = totalLearners,
                            percent = percent,
                            onClick = {
                                onNavigate(ScoreEntry(assignment.id, assessment.id))
                            }
                        )
                    }
                }
            }
        }
    }
}

@Composable
fun AssessmentItem(
    assessment: Assessment,
    gradedCount: Int,
    totalCount: Int,
    percent: Int,
    onClick: () -> Unit
) {
    val hps = assessment.maxScore.toFloatOrNull()?.toInt() ?: 0
    val label = when (assessment.component.uppercase()) {
        "WW" -> "Written Work"
        "PT" -> "Performance Task"
        "SA1", "ST1", "SA2", "ST2", "SA", "ST" -> "Summative Assessment"
        "TE" -> "Quarterly Exam"
        else -> assessment.component
    }

    val badgeColor = when (assessment.component.uppercase()) {
        "WW" -> Color(0xFF1976D2) // Blue
        "PT" -> Color(0xFFE65100) // Orange
        "TE" -> Color(0xFFC2185B) // Pink
        else -> Color(0xFF388E3C) // Green
    }

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(4.dp))
                            .background(badgeColor.copy(alpha = 0.15f))
                            .padding(horizontal = 6.dp, vertical = 2.dp)
                    ) {
                        Text(
                            text = assessment.component,
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold,
                            color = badgeColor
                        )
                    }
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = assessment.title,
                        fontWeight = FontWeight.Bold,
                        fontSize = 16.sp
                    )
                }
                
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = "$label · HPS: ${if (hps > 0) hps else "--"}",
                    fontSize = 13.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                
                Spacer(modifier = Modifier.height(8.dp))
                
                // Progress Bar
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    LinearProgressIndicator(
                        progress = percent / 100f,
                        color = if (percent == 100) Color(0xFF2E7D32) else MaterialTheme.colorScheme.primary,
                        trackColor = MaterialTheme.colorScheme.surfaceVariant,
                        modifier = Modifier
                            .weight(1f)
                            .height(6.dp)
                            .clip(RoundedCornerShape(3.dp))
                    )
                    Spacer(modifier = Modifier.width(12.dp))
                    Text(
                        text = "$gradedCount/$totalCount ($percent%)",
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold,
                        color = if (percent == 100) Color(0xFF2E7D32) else MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
            
            Spacer(modifier = Modifier.width(8.dp))
            
            if (percent == 100) {
                Icon(
                    Icons.Default.CheckCircle,
                    contentDescription = "Completed",
                    tint = Color(0xFF2E7D32),
                    modifier = Modifier.size(24.dp)
                )
            }
        }
    }
}
