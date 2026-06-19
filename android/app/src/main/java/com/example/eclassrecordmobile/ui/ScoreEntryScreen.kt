package com.example.eclassrecordmobile.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.ArrowForward
import androidx.compose.material.icons.filled.List
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.eclassrecordmobile.data.DatabaseHelper

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ScoreEntryScreen(
    assignmentId: String,
    assessmentId: String,
    onBack: () -> Unit,
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    val payload = DatabaseHelper.getPayload()
    val assignment = payload?.assignments?.find { it.id == assignmentId }
    val assessment = assignment?.assessments?.find { it.id == assessmentId }

    if (assignment == null || assessment == null) {
        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Text("Assessment not found", fontWeight = FontWeight.Bold)
        }
        return
    }

    val learners = assignment.learners
    if (learners.isEmpty()) {
        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Text("No students in this class roster.", fontWeight = FontWeight.Bold)
        }
        return
    }

    var currentIndex by remember { mutableStateOf(0) }
    val activeLearner = learners[currentIndex]

    // Read score from database
    val scoreKey = "${activeLearner.id}|$assessmentId"
    val savedScore = assignment.scores[scoreKey] ?: ""

    // Text field state
    var textState by remember(currentIndex) {
        mutableStateOf(TextFieldValue(text = savedScore, selection = TextRange(savedScore.length)))
    }

    val maxScore = assessment.maxScore.toFloatOrNull() ?: 0f

    // Keyboard and Focus management
    val focusRequester = remember { FocusRequester() }
    val focusManager = LocalFocusManager.current

    // Bottom sheet for quick jump roster list
    val sheetState = rememberModalBottomSheetState()
    var showRosterSheet by remember { mutableStateOf(false) }

    // Validation
    var validationError by remember(textState.text) {
        mutableStateOf<String?>(null)
    }
    LaunchedEffect(textState.text) {
        val txt = textState.text.trim()
        if (txt.isNotEmpty()) {
            val num = txt.toFloatOrNull()
            if (num == null) {
                validationError = "Invalid number format"
            } else if (maxScore > 0f && num > maxScore) {
                validationError = "Warning: Score exceeds HPS (${maxScore.toInt()})"
            } else {
                validationError = null
            }
        } else {
            validationError = null
        }
    }

    // Auto-focus input on student switch
    LaunchedEffect(currentIndex) {
        try {
            focusRequester.requestFocus()
        } catch (_: Exception) {}
    }

    fun saveScore(value: String) {
        val cleaned = value.trim()
        DatabaseHelper.updateScore(context, assignmentId, activeLearner.id, assessmentId, cleaned)
    }

    fun navigateNext() {
        saveScore(textState.text)
        if (currentIndex < learners.size - 1) {
            currentIndex++
        } else {
            focusManager.clearFocus()
        }
    }

    fun navigatePrev() {
        saveScore(textState.text)
        if (currentIndex > 0) {
            currentIndex--
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text(assessment.title, fontWeight = FontWeight.Bold, fontSize = 16.sp)
                        Text("Grade ${assignment.gradeLevel} - ${assignment.section} · HPS: ${assessment.maxScore}", fontSize = 12.sp)
                    }
                },
                navigationIcon = {
                    IconButton(onClick = {
                        saveScore(textState.text)
                        onBack()
                    }) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    IconButton(onClick = { showRosterSheet = true }) {
                        Icon(Icons.Default.List, contentDescription = "Roster Jump List")
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
                .padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.SpaceBetween
        ) {
            // Student Card Header (Top)
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
            ) {
                Column(
                    modifier = Modifier.padding(20.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Text(
                        text = "STUDENT ${currentIndex + 1} OF ${learners.size}",
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.primary,
                        letterSpacing = 1.5.sp
                    )
                    Spacer(modifier = Modifier.height(10.dp))
                    Text(
                        text = activeLearner.name,
                        fontSize = 20.sp,
                        fontWeight = FontWeight.ExtraBold,
                        textAlign = TextAlign.Center,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Spacer(modifier = Modifier.height(6.dp))
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(16.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = "Sex: ${if (activeLearner.sex.uppercase() == "M") "Male" else "Female"}",
                            fontSize = 13.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.8f)
                        )
                        Divider(
                            color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.2f),
                            modifier = Modifier
                                .height(12.dp)
                                .width(1.dp)
                        )
                        Text(
                            text = "LRN: ${activeLearner.lrn.ifEmpty { "—" }}",
                            fontSize = 13.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.8f)
                        )
                    }
                }
            }

            // Score Input Area (Center)
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.Center
            ) {
                Row(
                    verticalAlignment = Alignment.Bottom,
                    horizontalArrangement = Arrangement.Center,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    // Actual input field
                    OutlinedTextField(
                        value = textState,
                        onValueChange = { textState = it },
                        modifier = Modifier
                            .width(110.dp)
                            .focusRequester(focusRequester),
                        textStyle = LocalTextStyle.current.copy(
                            fontSize = 32.sp,
                            fontWeight = FontWeight.Black,
                            textAlign = TextAlign.Center
                        ),
                        keyboardOptions = KeyboardOptions(
                            keyboardType = KeyboardType.Number,
                            imeAction = ImeAction.Next
                        ),
                        keyboardActions = KeyboardActions(
                            onNext = { navigateNext() }
                        ),
                        singleLine = true
                    )
                    
                    Spacer(modifier = Modifier.width(12.dp))
                    
                    Text(
                        text = "/ ${assessment.maxScore}",
                        fontSize = 24.sp,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f),
                        modifier = Modifier.padding(bottom = 12.dp)
                    )
                }
                
                Spacer(modifier = Modifier.height(12.dp))
                
                // Real-time validation warning badge
                if (validationError != null) {
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(6.dp))
                            .background(
                                if (validationError!!.contains("exceeds"))
                                    Color(0xFFFFF3E0) // Orange/Warning
                                else
                                    Color(0xFFFFEBEE) // Red/Error
                            )
                            .padding(horizontal = 8.dp, vertical = 4.dp)
                    ) {
                        Text(
                            text = validationError!!,
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Bold,
                            color = if (validationError!!.contains("exceeds"))
                                Color(0xFFE65100)
                            else
                                Color(0xFFC62828)
                        )
                    }
                }
            }

            // Navigation Controls (Bottom)
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                // Prev Button
                FilledTonalButton(
                    onClick = { navigatePrev() },
                    enabled = currentIndex > 0,
                    modifier = Modifier
                        .weight(1f)
                        .height(52.dp),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Icon(Icons.Default.ArrowBack, contentDescription = "Prev")
                    Spacer(modifier = Modifier.width(4.dp))
                    Text("Prev", fontWeight = FontWeight.Bold)
                }

                Spacer(modifier = Modifier.width(16.dp))

                // Next Button
                Button(
                    onClick = { navigateNext() },
                    modifier = Modifier
                        .weight(1f)
                        .height(52.dp),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Text(
                        text = if (currentIndex < learners.size - 1) "Next" else "Finish",
                        fontWeight = FontWeight.Bold
                    )
                    Spacer(modifier = Modifier.width(4.dp))
                    Icon(Icons.Default.ArrowForward, contentDescription = "Next")
                }
            }
        }

        // Roster Jump Sheet
        if (showRosterSheet) {
            ModalBottomSheet(
                onDismissRequest = { showRosterSheet = false },
                sheetState = sheetState
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(16.dp)
                ) {
                    Text(
                        "Jump to Student",
                        fontWeight = FontWeight.Bold,
                        fontSize = 18.sp,
                        modifier = Modifier.padding(bottom = 12.dp)
                    )
                    
                    Divider(color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.1f))
                    
                    LazyColumn(
                        modifier = Modifier.fillMaxSize(),
                        contentPadding = PaddingValues(vertical = 8.dp)
                    ) {
                        itemsIndexed(learners) { index, learner ->
                            val sKey = "${learner.id}|$assessmentId"
                            val currentScore = assignment.scores[sKey] ?: ""

                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clip(RoundedCornerShape(8.dp))
                                    .background(
                                        if (index == currentIndex)
                                            MaterialTheme.colorScheme.primaryContainer
                                        else
                                            Color.Transparent
                                    )
                                    .clickable {
                                        saveScore(textState.text)
                                        currentIndex = index
                                        showRosterSheet = false
                                    }
                                    .padding(vertical = 12.dp, horizontal = 16.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text(
                                    text = "${index + 1}. ${learner.name}",
                                    fontWeight = if (index == currentIndex) FontWeight.Bold else FontWeight.Normal,
                                    color = if (index == currentIndex)
                                        MaterialTheme.colorScheme.onPrimaryContainer
                                    else
                                        MaterialTheme.colorScheme.onSurface
                                )
                                Text(
                                    text = currentScore.ifEmpty { "—" },
                                    fontWeight = FontWeight.Bold,
                                    color = if (currentScore.isNotEmpty())
                                        MaterialTheme.colorScheme.primary
                                    else
                                        MaterialTheme.colorScheme.outline
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}
