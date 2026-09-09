package com.example.eclassrecordmobile.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.eclassrecordmobile.data.Assignment
import com.example.eclassrecordmobile.data.DatabaseHelper
import com.example.eclassrecordmobile.data.Learner
import com.example.eclassrecordmobile.data.PaceCompetency
import com.example.eclassrecordmobile.ui.design.EClassTopBar
import com.example.eclassrecordmobile.ui.design.NeonCard

private val PACE_LETTERS = listOf("A", "B", "C", "D", "E")

private data class PaceLetterStyle(val fill: Color, val stroke: Color, val ink: Color)

private val PACE_LETTER_STYLES = mapOf(
    "A" to PaceLetterStyle(Color(0xFFC6F6D5), Color(0xFF38A169), Color(0xFF276749)),
    "B" to PaceLetterStyle(Color(0xFFBEE3F8), Color(0xFF3182CE), Color(0xFF2B6CB0)),
    "C" to PaceLetterStyle(Color(0xFFFEFCBF), Color(0xFFD69E2E), Color(0xFF975A16)),
    "D" to PaceLetterStyle(Color(0xFFFEEBC8), Color(0xFFDD6B20), Color(0xFF9C4221)),
    "E" to PaceLetterStyle(Color(0xFFFED7D7), Color(0xFFE53E3E), Color(0xFF9B2C2C)),
)

private fun paceKey(learnerId: String, competencyId: String, term: String, skill: String): String {
    return "$learnerId|$competencyId|$term|$skill"
}

private fun incrementLetter(letter: String): String {
    return when (letter) {
        "E" -> "D"
        "D" -> "C"
        "C" -> "B"
        "B" -> "A"
        "A" -> "A"
        else -> ""
    }
}

private fun eligibleLearners(assignment: Assignment, term: String): List<Learner> {
    val termNumber = term.toIntOrNull() ?: 1
    return assignment.learners.filter { learner ->
        val out = learner.transferredOutTerm.toIntOrNull()
        out == null || out > termNumber
    }
}

private fun appliesToTerm(item: PaceCompetency, term: String): Boolean {
    val termNumber = term.toIntOrNull() ?: 1
    return item.terms.isEmpty() || termNumber in item.terms
}

private fun competenciesForTerm(assignment: Assignment, term: String, subject: String): List<PaceCompetency> {
    val termNumber = term.toIntOrNull() ?: 1
    return assignment.paceCompetencies.filter { item ->
        (item.terms.isEmpty() || termNumber in item.terms) &&
            (subject.isBlank() || item.subject.isBlank() || item.subject == subject)
    }
}

private fun skillsFor(item: PaceCompetency): List<String> {
    if (item.details.size > 1) return item.details.indices.map { index -> ('a'.code + index).toChar().toString() }
    return listOf("")
}

private fun skillLabel(item: PaceCompetency, code: String, index: Int): String {
    return if (item.details.size > 1) item.details.getOrNull(index).orEmpty()
    else if (code.isBlank()) ""
    else code
}

private fun cellNumber(item: PaceCompetency, skillIndex: Int, skillCount: Int): String {
    return if (item.details.size > 1) "${item.number}.${('a'.code + skillIndex).toChar()}"
    else item.number.toString()
}

private fun subjectColor(subject: String): Color {
    val value = subject.lowercase()
    return when {
        value.contains("reading") -> Color(0xFF1E3A8A)
        value == "language" || value.startsWith("language ") -> Color(0xFF38BDF8)
        value.contains("math") -> Color(0xFF16A34A)
        value.contains("gmrc") || value.contains("good manners") -> Color(0xFF92400E)
        value.contains("makabansa") -> Color(0xFFDC2626)
        else -> Color(0xFF0F766E)
    }
}

private fun subjectTabLabel(subject: String): String {
    val value = subject.lowercase()
    return if (value.contains("gmrc") || value.contains("good manners")) "GMRC" else subject
}

private val PACE_LETTER_LABELS = mapOf(
    "A" to "Advancing (Namumukod-tangi)",
    "B" to "Benchmarking (Naipamamalas)",
    "C" to "Connecting (Natutungo)",
    "D" to "Developing (Nagpapaunlad)",
    "E" to "Emerging (Nagsisimula)",
)

@Composable
fun PaceRatingScreen(
    assignmentId: String,
    term: String,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val liveRevision = DatabaseHelper.observedRevision
    val payload = remember(liveRevision) { DatabaseHelper.getPayload() }
    val assignment = payload?.assignments?.find { it.id == assignmentId }
    if (assignment == null) {
        Text("Class not found", modifier = Modifier.padding(24.dp), fontWeight = FontWeight.Bold)
        return
    }
    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            EClassTopBar(
                title = "PACE ratings",
                subtitle = "${assignment.subject} · Term $term",
                onBack = onBack,
            )
        },
        modifier = modifier,
    ) { padding ->
        PaceRatingPane(
            assignment = assignment,
            term = term,
            modifier = Modifier.fillMaxSize().padding(padding),
        )
    }
}

@Composable
fun PaceRatingPane(
    assignment: Assignment,
    term: String,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val liveRevision = DatabaseHelper.observedRevision
    val payload = remember(liveRevision) { DatabaseHelper.getPayload() }
    val live = payload?.assignments?.find { it.id == assignment.id } ?: assignment
    val subjects = live.paceCompetencies.map { it.subject }.filter { it.isNotBlank() }.distinct()
    var selectedSubject by rememberSaveable { mutableStateOf("") }
    val activeSubject = if (selectedSubject.isNotBlank() && (subjects.isEmpty() || selectedSubject in subjects)) {
        selectedSubject
    } else {
        subjects.firstOrNull().orEmpty()
    }
    val items = competenciesForTerm(live, term, activeSubject)
    if (items.isEmpty()) {
        Text("No PACE competencies for this subject.", modifier = modifier.padding(24.dp))
        return
    }
    var mode by rememberSaveable { mutableStateOf("class") }
    var itemIndex by rememberSaveable { mutableIntStateOf(0) }
    var skillIndex by rememberSaveable { mutableIntStateOf(0) }
    var learnerIndex by rememberSaveable { mutableIntStateOf(0) }
    val selected = remember { mutableStateMapOf<String, Boolean>() }
    var confirmLetter by remember { mutableStateOf<String?>(null) }
    var lastBulk by remember { mutableStateOf<Map<String, String>>(emptyMap()) }
    val safeItemIndex = itemIndex.coerceIn(0, items.lastIndex)
    val item = items[safeItemIndex]
    val skills = skillsFor(item)
    val safeSkillIndex = skillIndex.coerceIn(0, skills.lastIndex)
    val skill = skills[safeSkillIndex]
    val learners = eligibleLearners(live, term)
    val counts = PACE_LETTERS.associateWith { letter ->
        learners.count { live.paceRatings[paceKey(it.id, item.id, term, skill)] == letter }
    } + mapOf("unrated" to learners.count { live.paceRatings[paceKey(it.id, item.id, term, skill)].isNullOrBlank() })

    fun writeRating(learnerId: String, letter: String) {
        if (!appliesToTerm(item, term)) return
        DatabaseHelper.updatePaceRating(context, live.id, learnerId, item.id, term, skill, letter)
    }

    fun applyClassSet(letter: String) {
        val snapshot = learners.associate { it.id to (live.paceRatings[paceKey(it.id, item.id, term, skill)] ?: "") }
        lastBulk = snapshot
        learners.forEach { learner ->
            val current = live.paceRatings[paceKey(learner.id, item.id, term, skill)].orEmpty()
            if (current.isBlank()) writeRating(learner.id, letter)
        }
    }

    fun increment(ids: List<String>) {
        val snapshot = learners.associate { it.id to (live.paceRatings[paceKey(it.id, item.id, term, skill)] ?: "") }
        lastBulk = snapshot
        ids.forEach { learnerId ->
            val current = live.paceRatings[paceKey(learnerId, item.id, term, skill)].orEmpty()
            val next = incrementLetter(current)
            if (next.isNotBlank() && next != current) writeRating(learnerId, next)
        }
    }

    Column(modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        val activeColor = subjectColor(activeSubject)
        Row(
            modifier = Modifier
                .background(Color(0xFFF1F5F9), RoundedCornerShape(999.dp))
                .border(1.dp, Color(0xFFCBD5E1), RoundedCornerShape(999.dp))
                .padding(3.dp),
        ) {
            listOf("class" to "Class", "individual" to "Individual").forEach { (value, label) ->
                val on = mode == value
                Text(
                    label,
                    modifier = Modifier
                        .background(if (on) activeColor else Color.Transparent, RoundedCornerShape(999.dp))
                        .clickable { mode = value }
                        .padding(horizontal = 14.dp, vertical = 6.dp),
                    color = if (on) Color.White else Color(0xFF64748B),
                    fontWeight = FontWeight.Bold,
                    fontSize = 13.sp,
                )
            }
        }
        if (subjects.size > 1) {
            Row(
                modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
            ) {
                subjects.forEach { name ->
                    val color = subjectColor(name)
                    val on = name == activeSubject
                    Column(
                        modifier = Modifier.clickable {
                            selectedSubject = name
                            itemIndex = 0
                            skillIndex = 0
                        },
                        horizontalAlignment = Alignment.CenterHorizontally,
                    ) {
                        Text(
                            subjectTabLabel(name),
                            modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                            color = color,
                            fontWeight = FontWeight.Bold,
                            fontSize = 12.sp,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                        Box(
                            Modifier
                                .height(3.dp)
                                .width(if (on) 48.dp else 0.dp)
                                .background(color, RoundedCornerShape(999.dp)),
                        )
                    }
                }
            }
        }
        Text("Criterion ${cellNumber(item, safeSkillIndex, skills.size)} · ${skillLabel(item, skill, safeSkillIndex)}", color = MaterialTheme.colorScheme.onSurfaceVariant)
        NeonCard {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(assignment.subject, color = MaterialTheme.colorScheme.primary, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                if (item.group.isNotBlank()) Text(item.group, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp)
                Text("${cellNumber(item, safeSkillIndex, skills.size)}. ${item.title}", fontWeight = FontWeight.ExtraBold, fontSize = 18.sp)
                val caption = skillLabel(item, skill, safeSkillIndex)
                if (caption.isNotBlank() && caption != "Overall") Text(caption, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 13.sp)
                if (item.standard.isNotBlank()) Text(item.standard, fontSize = 13.sp)
                if (skills.size > 1) {
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        skills.forEachIndexed { index, code ->
                            FilterChip(
                                selected = index == safeSkillIndex,
                                onClick = { skillIndex = index },
                                label = { Text("${cellNumber(item, index, skills.size)} ${skillLabel(item, code, index)}", fontSize = 12.sp) },
                            )
                        }
                    }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(onClick = {
                        if (safeSkillIndex > 0) skillIndex = safeSkillIndex - 1
                        else if (safeItemIndex > 0) {
                            itemIndex = safeItemIndex - 1
                            skillIndex = 0
                        }
                    }) { Text("Previous") }
                    Button(onClick = {
                        if (safeSkillIndex < skills.lastIndex) skillIndex = safeSkillIndex + 1
                        else if (safeItemIndex < items.lastIndex) {
                            itemIndex = safeItemIndex + 1
                            skillIndex = 0
                        }
                    }) { Text("Next criterion") }
                }
            }
        }
        Text(
            PACE_LETTERS.joinToString(" · ") { "${it} ${counts[it] ?: 0}" } + " · — ${counts["unrated"] ?: 0} unrated",
            fontWeight = FontWeight.SemiBold,
        )
        if (mode == "individual") {
            if (learners.isEmpty()) {
                Text("Add learners before rating.")
            } else {
                val safeLearner = learnerIndex.coerceIn(0, learners.lastIndex)
                val learner = learners[safeLearner]
                val current = live.paceRatings[paceKey(learner.id, item.id, term, skill)].orEmpty()
                NeonCard {
                    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        Text("Learner ${safeLearner + 1} of ${learners.size}", color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text(learner.name, fontWeight = FontWeight.ExtraBold, fontSize = 20.sp)
                        Text("LRN: ${learner.lrn.ifBlank { "—" }}")
                        LetterRow(current) { letter ->
                            writeRating(learner.id, letter)
                        }
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            OutlinedButton(onClick = { if (safeLearner > 0) learnerIndex = safeLearner - 1 }) { Text("Previous learner") }
                            Button(onClick = { if (safeLearner < learners.lastIndex) learnerIndex = safeLearner + 1 }) { Text("Next learner") }
                        }
                    }
                }
            }
        } else {
            confirmLetter?.let { letter ->
                val unrated = counts["unrated"] ?: 0
                AlertDialog(
                    onDismissRequest = { confirmLetter = null },
                    title = { Text("Set class rating") },
                    text = { Text("Set $unrated unrated learners to $letter for this competency?") },
                    confirmButton = {
                        TextButton(onClick = {
                            applyClassSet(letter)
                            confirmLetter = null
                        }) { Text("Confirm") }
                    },
                    dismissButton = { TextButton(onClick = { confirmLetter = null }) { Text("Cancel") } },
                )
            }
            Column(Modifier.weight(1f, fill = true), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Set unrated learners to", fontWeight = FontWeight.SemiBold)
                LetterRow("", palette = true) { confirmLetter = it }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(onClick = { increment(learners.map { it.id }) }) { Text("Increment class") }
                    Button(onClick = {
                        val ids = selected.filterValues { it }.keys.toList()
                        if (ids.isNotEmpty()) increment(ids)
                    }) { Text("Increment selected") }
                    OutlinedButton(onClick = {
                        val ids = selected.filterValues { it }.keys.toList().ifEmpty { learners.map { it.id } }
                        ids.forEach { writeRating(it, "") }
                    }) { Text("Clear") }
                    OutlinedButton(onClick = {
                        lastBulk.forEach { (learnerId, previous) -> writeRating(learnerId, previous) }
                        lastBulk = emptyMap()
                    }) { Text("Undo") }
                }
                Text("Select who advances. Increment never goes past A.", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                LazyColumn(Modifier.weight(1f)) {
                    items(learners, key = { it.id }) { learner ->
                        val letter = live.paceRatings[paceKey(learner.id, item.id, term, skill)].orEmpty()
                        Row(
                            Modifier.fillMaxWidth().padding(vertical = 6.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            Checkbox(
                                checked = selected[learner.id] == true,
                                onCheckedChange = { selected[learner.id] = it },
                            )
                            Text(
                                learner.name.uppercase(),
                                modifier = Modifier.weight(1f),
                                fontWeight = FontWeight.SemiBold,
                                maxLines = 2,
                                overflow = TextOverflow.Ellipsis,
                            )
                            LetterRow(letter) { writeRating(learner.id, it) }
                        }
                    }
                }
            }
        }
        Spacer(Modifier.height(8.dp))
    }
}

@Composable
private fun LetterRow(selected: String, palette: Boolean = false, onPick: (String) -> Unit) {
    val idleFill = Color(0xFFE2E8F0)
    val idleStroke = Color(0xFFCBD5E1)
    val idleInk = Color(0xFF64748B)
    Row(
        horizontalArrangement = Arrangement.spacedBy(4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        PACE_LETTERS.forEach { letter ->
            val style = PACE_LETTER_STYLES[letter] ?: return@forEach
            val active = selected == letter
            val live = palette || active
            val shape = RoundedCornerShape(6.dp)
            val tooltip = PACE_LETTER_LABELS[letter]?.let { "$letter — $it" } ?: letter
            Box(
                modifier = Modifier
                    .size(32.dp)
                    .semantics { contentDescription = tooltip }
                    .shadow(if (live) 2.dp else 0.dp, shape)
                    .background(if (live) style.fill else idleFill, shape)
                    .border(
                        if (active) 2.dp else 1.dp,
                        when {
                            active -> Color(0xFF1A202C)
                            live -> style.stroke
                            else -> idleStroke
                        },
                        shape,
                    )
                    .clickable { onPick(letter) },
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    letter,
                    fontWeight = FontWeight.ExtraBold,
                    color = if (live) style.ink else idleInk,
                    fontSize = 13.sp,
                )
            }
        }
    }
}
