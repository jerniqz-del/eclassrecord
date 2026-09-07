package com.example.eclassrecordmobile.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.DialogProperties
import com.example.eclassrecordmobile.data.Assignment
import com.example.eclassrecordmobile.theme.NeonBlue
import com.example.eclassrecordmobile.theme.NeonGreen
import com.example.eclassrecordmobile.ui.design.LocalFluidLayout

data class TransmutationRow(
    val low: Double,
    val high: Double,
    val transmuted: String,
    val descriptor: String = "",
)

data class TransmutationTableModel(
    val title: String,
    val sourceLabel: String,
    val rows: List<TransmutationRow>,
    val roundedInitial: Double,
    val transmutedGrade: String,
    val matchIndex: Int,
    val zeroBased: Boolean,
)

object TransmutationTables {
    private val adjusted2026 = listOf(
        Triple(99.50, 100.00, "100"), Triple(98.32, 99.49, "99"), Triple(97.14, 98.31, "98"),
        Triple(95.96, 97.13, "97"), Triple(94.78, 95.95, "96"), Triple(93.60, 94.77, "95"),
        Triple(92.42, 93.59, "94"), Triple(91.24, 92.41, "93"), Triple(90.06, 91.23, "92"),
        Triple(88.88, 90.05, "91"), Triple(87.70, 88.87, "90"), Triple(86.52, 87.69, "89"),
        Triple(85.34, 86.51, "88"), Triple(84.16, 85.33, "87"), Triple(82.98, 84.15, "86"),
        Triple(81.80, 82.97, "85"), Triple(80.62, 81.79, "84"), Triple(79.44, 80.61, "83"),
        Triple(78.26, 79.43, "82"), Triple(77.08, 78.25, "81"), Triple(75.90, 77.07, "80"),
        Triple(74.72, 75.89, "79"), Triple(73.54, 74.71, "78"), Triple(72.36, 73.53, "77"),
        Triple(71.18, 72.35, "76"), Triple(70.00, 71.17, "75"), Triple(65.34, 69.99, "74"),
        Triple(60.67, 65.33, "73"), Triple(56.01, 60.66, "72"), Triple(51.34, 56.00, "71"),
        Triple(46.67, 51.33, "70"), Triple(42.01, 46.66, "69"), Triple(37.34, 42.00, "68"),
        Triple(32.68, 37.33, "67"), Triple(28.01, 32.67, "66"), Triple(23.35, 28.00, "65"),
        Triple(18.68, 23.34, "64"), Triple(14.01, 18.67, "63"), Triple(9.35, 14.00, "62"),
        Triple(4.68, 9.34, "61"), Triple(0.00, 4.67, "60"),
    )

    private val keyStage2Mins = listOf(
        99.50, 98.32, 97.14, 95.96, 94.78, 93.60, 92.42, 91.24, 90.06, 88.88,
        87.70, 86.52, 85.34, 84.16, 82.98, 81.80, 80.62, 79.44, 78.26, 77.08,
        75.90, 74.72, 73.54, 72.36, 71.18, 70.00, 65.34, 60.67, 56.01, 51.34,
        46.67, 42.01, 37.34, 32.68, 28.01, 23.35, 18.68, 14.01, 9.35, 4.68, 0.00,
    )

    fun roundInitial(ig: Double): Double = kotlin.math.round((ig + 1e-12) * 100.0) / 100.0

    fun isZeroBased(schoolYear: String): Boolean {
        val start = schoolYear.substringBefore("-").toIntOrNull() ?: return false
        return start >= 2027
    }

    fun modelFor(assignment: Assignment, schoolYear: String, initialGrade: Double, displayedTg: String?): TransmutationTableModel {
        val sy = assignment.schoolYear.ifBlank { schoolYear }
        val policy = assignment.policy
        val grade = assignment.gradeLevel.toIntOrNull() ?: 0
        val zeroBased = isZeroBased(sy) || policy == "DO15_ZERO"
        val rounded = roundInitial(initialGrade)
        val ks2 = grade in 4..6 || policy == "KEY_STAGE_2_TRIMESTER"

        if (policy == "DO15_DESCRIPTIVE") {
            val rows = listOf(
                TransmutationRow(90.0, 100.0, "A", "Advancing (Namumukod-tangi)"),
                TransmutationRow(80.0, 89.99, "B", "Benchmarking (Napamamalas)"),
                TransmutationRow(75.0, 79.99, "C", "Connecting (Natutungo)"),
                TransmutationRow(65.0, 74.99, "D", "Developing (Napauunlad)"),
                TransmutationRow(0.0, 64.99, "E", "Emerging (Nagsisimula)"),
            )
            return TransmutationTableModel(
                title = "Descriptive Transmutation Table",
                sourceLabel = "DO 15, s. 2026 descriptive equivalents",
                rows = rows,
                roundedInitial = rounded,
                transmutedGrade = displayedTg?.ifBlank { transmuteDescriptive(rounded) } ?: transmuteDescriptive(rounded),
                matchIndex = matchIndex(rows, rounded),
                zeroBased = false,
            )
        }

        if (zeroBased) {
            val tg = displayedTg?.ifBlank { kotlin.math.round(initialGrade).toInt().toString() }
                ?: kotlin.math.round(initialGrade).toInt().toString()
            return TransmutationTableModel(
                title = "Zero-based grading",
                sourceLabel = "SY 2027-2028 onward: the transmuted grade is the rounded initial grade",
                rows = emptyList(),
                roundedInitial = rounded,
                transmutedGrade = tg,
                matchIndex = -1,
                zeroBased = true,
            )
        }

        val rows = if (ks2) {
            keyStage2Mins.mapIndexed { index, low ->
                val high = if (index == 0) 100.0 else roundInitial(keyStage2Mins[index - 1] - 0.01)
                TransmutationRow(low, high, (100 - index).coerceAtLeast(60).toString())
            }
        } else {
            adjusted2026.map { (low, high, tg) -> TransmutationRow(low, high, tg) }
        }
        val computed = rows.firstOrNull { rounded >= it.low }?.transmuted ?: "60"
        return TransmutationTableModel(
            title = if (ks2) "Key Stage 2 Transmutation Table" else "Transmutation Table",
            sourceLabel = if (ks2) "DepEd Key Stage 2 trimester transmutation" else "DO 15, s. 2026 adjusted transmutation (SY 2026-2027)",
            rows = rows,
            roundedInitial = rounded,
            transmutedGrade = displayedTg?.ifBlank { computed } ?: computed,
            matchIndex = matchIndex(rows, rounded),
            zeroBased = false,
        )
    }

    private fun transmuteDescriptive(ig: Double): String = when {
        ig >= 90 -> "A"
        ig >= 80 -> "B"
        ig >= 75 -> "C"
        ig >= 65 -> "D"
        else -> "E"
    }

    private fun matchIndex(rows: List<TransmutationRow>, roundedIg: Double): Int {
        val index = rows.indexOfFirst { roundedIg >= it.low }
        return if (index >= 0) index else rows.lastIndex
    }
}

@Composable
fun TransmutationTableDialog(
    assignment: Assignment,
    schoolYear: String,
    learnerName: String,
    initialGrade: Double?,
    transmutedGrade: String?,
    onDismiss: () -> Unit,
) {
    val ig = initialGrade ?: return
    val model = TransmutationTables.modelFor(assignment, schoolYear, ig, transmutedGrade)
    val fluid = LocalFluidLayout.current
    val listState = rememberLazyListState()
    LaunchedEffect(model.matchIndex) {
        if (model.matchIndex >= 0) listState.scrollToItem(model.matchIndex.coerceAtMost(model.rows.lastIndex.coerceAtLeast(0)))
    }
    AlertDialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(
            dismissOnBackPress = true,
            dismissOnClickOutside = true,
        ),
        title = {
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(model.title, fontWeight = FontWeight.ExtraBold, fontSize = fluid.type(18))
                if (learnerName.isNotBlank()) {
                    Text(learnerName, fontSize = 13.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                Text(model.sourceLabel, fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Row(
                    Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    GradeChip("Initial Grade", formatInitialGrade(model.roundedInitial), NeonGreen)
                    Text("→", fontWeight = FontWeight.ExtraBold)
                    GradeChip("Transmuted Grade", formatTransmutedGrade(model.transmutedGrade), NeonBlue)
                }
                if (model.zeroBased) {
                    Text(
                        "There is no range table for zero-based grading. The transmuted grade is the initial grade rounded to a whole number.",
                        fontSize = 13.sp,
                    )
                } else {
                    LazyColumn(
                        state = listState,
                        modifier = Modifier.heightIn(max = 360.dp),
                        verticalArrangement = Arrangement.spacedBy(0.dp),
                    ) {
                        itemsIndexed(model.rows, key = { index, row -> "${row.low}-${row.transmuted}-$index" }) { index, row ->
                            val match = index == model.matchIndex
                            Row(
                                Modifier
                                    .fillMaxWidth()
                                    .clip(RoundedCornerShape(8.dp))
                                    .background(if (match) Color(0xFFFDE68A).copy(alpha = 0.72f) else Color.Transparent)
                                    .padding(horizontal = 8.dp, vertical = 7.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                            ) {
                                Text(
                                    "${formatInitialGrade(row.low)} – ${formatInitialGrade(row.high)}",
                                    fontWeight = if (match) FontWeight.ExtraBold else FontWeight.Medium,
                                    color = if (match) Color(0xFF0F766E) else MaterialTheme.colorScheme.onSurface,
                                    fontSize = 13.sp,
                                )
                                Text(
                                    formatTransmutedGrade(row.transmuted),
                                    fontWeight = if (match) FontWeight.ExtraBold else FontWeight.SemiBold,
                                    color = if (match) Color(0xFF1D4ED8) else MaterialTheme.colorScheme.onSurface,
                                    fontSize = 13.sp,
                                )
                            }
                            if (index < model.rows.lastIndex) HorizontalDivider()
                        }
                    }
                }
            }
        },
        confirmButton = {
            TextButton(onClick = onDismiss) { Text("Done") }
        },
    )
}

@Composable
private fun GradeChip(label: String, value: String, accent: Color) {
    Column(
        Modifier
            .clip(RoundedCornerShape(12.dp))
            .background(accent.copy(alpha = 0.12f))
            .padding(horizontal = 12.dp, vertical = 8.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(label, fontSize = 10.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, fontWeight = FontWeight.Bold)
        Spacer(Modifier.height(2.dp))
        Text(value, fontSize = 20.sp, fontWeight = FontWeight.ExtraBold, color = accent)
    }
}

private fun formatInitialGrade(value: Double): String {
    val rounded = TransmutationTables.roundInitial(value)
    return String.format(java.util.Locale.US, "%.2f", rounded)
}

private fun formatTransmutedGrade(value: String): String {
    val numeric = value.toDoubleOrNull()
    return if (numeric != null) kotlin.math.round(numeric).toInt().toString() else value
}
