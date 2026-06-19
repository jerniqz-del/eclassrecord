package com.example.eclassrecordmobile.ui.main

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation3.runtime.NavKey
import com.example.eclassrecordmobile.ClassDetail
import com.example.eclassrecordmobile.Sync
import com.example.eclassrecordmobile.data.Assignment
import com.example.eclassrecordmobile.data.DatabaseHelper

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MainScreen(
    onNavigate: (NavKey) -> Unit,
    modifier: Modifier = Modifier
) {
    val payload = DatabaseHelper.getPayload()
    val assignments = payload?.assignments ?: emptyList()
    val hasUnsynced = DatabaseHelper.hasUnsyncedChanges()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("E-Class Record", fontWeight = FontWeight.Bold) },
                actions = {
                    IconButton(onClick = { onNavigate(Sync) }) {
                        BadgedBox(
                            badge = {
                                if (hasUnsynced) {
                                    Badge(containerColor = MaterialTheme.colorScheme.error)
                                }
                            }
                        ) {
                            Icon(Icons.Default.Refresh, contentDescription = "Sync Options")
                        }
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.primary,
                    titleContentColor = MaterialTheme.colorScheme.onPrimary,
                    actionIconContentColor = MaterialTheme.colorScheme.onPrimary
                )
            )
        },
        modifier = modifier
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .background(MaterialTheme.colorScheme.background)
        ) {
            // Profile Card (Header)
            if (payload != null && payload.teacherName.isNotEmpty()) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(
                            Brush.verticalGradient(
                                listOf(MaterialTheme.colorScheme.primary, MaterialTheme.colorScheme.primaryContainer)
                            )
                        )
                        .padding(bottom = 16.dp, start = 16.dp, end = 16.dp)
                ) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(12.dp))
                            .background(MaterialTheme.colorScheme.surface.copy(alpha = 0.9f))
                            .padding(16.dp)
                    ) {
                        Text(
                            text = payload.teacherName,
                            fontWeight = FontWeight.Bold,
                            fontSize = 18.sp,
                            color = MaterialTheme.colorScheme.primary
                        )
                        Spacer(modifier = Modifier.height(2.dp))
                        Text(
                            text = payload.schoolName,
                            fontSize = 13.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        Spacer(modifier = Modifier.height(4.dp))
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Box(
                                modifier = Modifier
                                    .clip(RoundedCornerShape(4.dp))
                                    .background(MaterialTheme.colorScheme.secondary.copy(alpha = 0.2f))
                                    .padding(vertical = 2.dp, horizontal = 6.dp)
                            ) {
                                Text(
                                    text = payload.schoolYear,
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = MaterialTheme.colorScheme.secondary
                                )
                            }
                            if (hasUnsynced) {
                                Spacer(modifier = Modifier.width(8.dp))
                                Box(
                                    modifier = Modifier
                                        .clip(RoundedCornerShape(4.dp))
                                        .background(MaterialTheme.colorScheme.error.copy(alpha = 0.2f))
                                        .padding(vertical = 2.dp, horizontal = 6.dp)
                                ) {
                                    Text(
                                        text = "Unsynced Changes",
                                        fontSize = 11.sp,
                                        fontWeight = FontWeight.Bold,
                                        color = MaterialTheme.colorScheme.error
                                    )
                                }
                            }
                        }
                    }
                }
            }

            // Roster List
            if (assignments.isEmpty()) {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(32.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Icon(
                            Icons.Default.Info,
                            contentDescription = "Empty",
                            modifier = Modifier.size(64.dp),
                            color = MaterialTheme.colorScheme.outline
                        )
                        Spacer(modifier = Modifier.height(16.dp))
                        Text(
                            text = "No Class Roster Synced",
                            fontWeight = FontWeight.Bold,
                            fontSize = 18.sp,
                            textAlign = TextAlign.Center
                        )
                        Spacer(modifier = Modifier.height(8.dp))
                        Text(
                            text = "Please open the Sync screen and connect to your desktop app to download your classes.",
                            fontSize = 14.sp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            textAlign = TextAlign.Center
                        )
                        Spacer(modifier = Modifier.height(24.dp))
                        Button(onClick = { onNavigate(Sync) }) {
                            Text("Go to Sync Screen")
                        }
                    }
                }
            } else {
                LazyColumn(
                    contentPadding = PaddingValues(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                    modifier = Modifier.fillMaxSize()
                ) {
                    item {
                        Text(
                            text = "Your Teaching Loads",
                            fontWeight = FontWeight.Bold,
                            fontSize = 16.sp,
                            color = MaterialTheme.colorScheme.onBackground,
                            modifier = Modifier.padding(bottom = 4.dp)
                        )
                    }

                    items(assignments) { item ->
                        AssignmentCard(
                            assignment = item,
                            onClick = { onNavigate(ClassDetail(item.id)) }
                        )
                    }
                }
            }
        }
    }
}

@Composable
fun AssignmentCard(
    assignment: Assignment,
    onClick: () -> Unit
) {
    val males = assignment.learners.count { it.sex.uppercase() == "M" }
    val females = assignment.learners.count { it.sex.uppercase() == "F" }
    val total = assignment.learners.size

    // Pick dynamic color scheme based on subject name
    val containerColor = when {
        assignment.subject.uppercase().contains("MATH") -> Color(0xFFE8F5E9)
        assignment.subject.uppercase().contains("SCIENCE") -> Color(0xFFE3F2FD)
        assignment.subject.uppercase().contains("MAPEH") -> Color(0xFFF3E5F5)
        assignment.subject.uppercase().contains("ENGLISH") -> Color(0xFFFFF3E0)
        else -> Color(0xFFECEFF1)
    }

    val contentColor = when {
        assignment.subject.uppercase().contains("MATH") -> Color(0xFF1B5E20)
        assignment.subject.uppercase().contains("SCIENCE") -> Color(0xFF0D47A1)
        assignment.subject.uppercase().contains("MAPEH") -> Color(0xFF4A148C)
        assignment.subject.uppercase().contains("ENGLISH") -> Color(0xFFE65100)
        else -> Color(0xFF37474F)
    }

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(containerColor = containerColor)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "Grade ${assignment.gradeLevel} - ${assignment.section}",
                    fontWeight = FontWeight.Bold,
                    fontSize = 18.sp,
                    color = contentColor
                )
                
                Box(
                    modifier = Modifier
                        .clip(CircleShape)
                        .background(contentColor.copy(alpha = 0.1f))
                        .padding(horizontal = 10.dp, vertical = 4.dp)
                ) {
                    Text(
                        text = assignment.subject,
                        fontWeight = FontWeight.Bold,
                        fontSize = 11.sp,
                        color = contentColor
                    )
                }
            }

            Spacer(modifier = Modifier.height(12.dp))

            Divider(color = contentColor.copy(alpha = 0.15f), thickness = 1.dp)

            Spacer(modifier = Modifier.height(12.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Column {
                    Text(
                        text = "Learners",
                        fontSize = 11.sp,
                        color = contentColor.copy(alpha = 0.7f),
                        fontWeight = FontWeight.Medium
                    )
                    Text(
                        text = "$total students",
                        fontSize = 14.sp,
                        fontWeight = FontWeight.Bold,
                        color = contentColor
                    )
                }

                Column(horizontalAlignment = Alignment.End) {
                    Text(
                        text = "Roster Details",
                        fontSize = 11.sp,
                        color = contentColor.copy(alpha = 0.7f),
                        fontWeight = FontWeight.Medium
                    )
                    Text(
                        text = "M: $males · F: $females",
                        fontSize = 14.sp,
                        fontWeight = FontWeight.Bold,
                        color = contentColor
                    )
                }
            }
        }
    }
}
