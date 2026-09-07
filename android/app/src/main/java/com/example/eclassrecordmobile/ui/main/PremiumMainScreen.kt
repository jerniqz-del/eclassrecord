package com.example.eclassrecordmobile.ui.main

import android.content.Context
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowForward
import androidx.compose.material.icons.filled.Assignment
import androidx.compose.material.icons.filled.Bluetooth
import androidx.compose.material.icons.filled.Build
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.DateRange
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.List
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.People
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.PhoneAndroid
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.School
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material.icons.filled.Wifi
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.NavigationRail
import androidx.compose.material3.NavigationRailItem
import androidx.compose.material3.NavigationRailItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
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
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation3.runtime.NavKey
import com.example.eclassrecordmobile.ClassDetail
import com.example.eclassrecordmobile.DesktopFeature
import com.example.eclassrecordmobile.Sync
import com.example.eclassrecordmobile.data.Assignment
import com.example.eclassrecordmobile.data.BleServerManager
import com.example.eclassrecordmobile.data.DatabaseHelper
import com.example.eclassrecordmobile.data.DesktopRemoteController
import com.example.eclassrecordmobile.data.LanSyncManager
import com.example.eclassrecordmobile.data.SyncPayload
import com.example.eclassrecordmobile.theme.LocalDarkTheme
import com.example.eclassrecordmobile.theme.LocalThemeController
import com.example.eclassrecordmobile.ui.DesktopFeatureNames
import com.example.eclassrecordmobile.ui.design.BrandMark
import com.example.eclassrecordmobile.ui.design.DepthIcon
import com.example.eclassrecordmobile.ui.ModernClassesTab
import com.example.eclassrecordmobile.ui.ModernGradingTab
import com.example.eclassrecordmobile.ui.design.EClassTopBar
import com.example.eclassrecordmobile.ui.design.GradientSection
import com.example.eclassrecordmobile.ui.design.LocalFluidLayout
import com.example.eclassrecordmobile.ui.design.NeonCard
import com.example.eclassrecordmobile.ui.design.RemoteToolChip
import com.example.eclassrecordmobile.ui.design.SectionHeader
import com.example.eclassrecordmobile.ui.design.themePanel
import com.example.eclassrecordmobile.theme.NeonBlue
import com.example.eclassrecordmobile.theme.NeonGreen
import com.example.eclassrecordmobile.theme.NeonPurple
import kotlin.math.roundToInt

internal enum class HomeTab(val label: String, val icon: ImageVector) {
    Dashboard("Dashboard", Icons.Default.Home),
    Classes("Classes", Icons.Default.School),
    Grading("Grading", Icons.Default.List),
    Tools("Tools", Icons.Default.Build),
    Settings("Settings", Icons.Default.Settings),
}

private enum class ClassLayout { List, Grid }

private data class CompletionStats(val entered: Int, val expected: Int) {
    val fraction: Float = if (expected == 0) 0f else (entered.toFloat() / expected).coerceIn(0f, 1f)
    val percent: Int = (fraction * 100).roundToInt()
}

private fun gradingCompletion(assignment: Assignment, term: String? = null): CompletionStats {
    val assessments = assignment.assessments.filter { term == null || it.term == term }
    val entered = assessments.sumOf { assessment ->
        assignment.learners.count { learner ->
            assignment.scores["${learner.id}|${assessment.id}"].orEmpty().trim().isNotEmpty()
        }
    }
    return CompletionStats(entered = entered, expected = assessments.size * assignment.learners.size)
}

object MobileUiPreferences {
    private const val STORE = "mobile_ui_preferences"
    private const val AUTO_RECONNECT = "auto_reconnect"
    private const val SMOOTH_MOTION = "smooth_motion"
    private const val DARK_THEME = "dark_theme"

    fun autoReconnect(context: Context): Boolean =
        context.getSharedPreferences(STORE, Context.MODE_PRIVATE).getBoolean(AUTO_RECONNECT, true)

    fun setAutoReconnect(context: Context, enabled: Boolean) {
        context.getSharedPreferences(STORE, Context.MODE_PRIVATE).edit().putBoolean(AUTO_RECONNECT, enabled).apply()
    }

    fun smoothMotion(context: Context): Boolean =
        context.getSharedPreferences(STORE, Context.MODE_PRIVATE).getBoolean(SMOOTH_MOTION, true)

    fun setSmoothMotion(context: Context, enabled: Boolean) {
        context.getSharedPreferences(STORE, Context.MODE_PRIVATE).edit().putBoolean(SMOOTH_MOTION, enabled).apply()
    }

    fun darkTheme(context: Context): Boolean =
        context.getSharedPreferences(STORE, Context.MODE_PRIVATE).getBoolean(DARK_THEME, false)

    fun setDarkTheme(context: Context, enabled: Boolean) {
        context.getSharedPreferences(STORE, Context.MODE_PRIVATE).edit().putBoolean(DARK_THEME, enabled).apply()
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PremiumMainScreen(
    onNavigate: (NavKey) -> Unit,
    selectedIndex: Int,
    onSelectedIndexChange: (Int) -> Unit,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val payload = DatabaseHelper.getPayload()
    var smoothMotion by rememberSaveable { mutableStateOf(MobileUiPreferences.smoothMotion(context)) }
    val selected = HomeTab.entries[selectedIndex.coerceIn(HomeTab.entries.indices)]
    val hasUnsynced = DatabaseHelper.hasUnsyncedChanges()

    Scaffold(
        modifier = modifier,
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            EClassTopBar(
                title = selected.label,
                subtitle = payload?.schoolName?.ifBlank { "E-Class Record Mobile" } ?: "E-Class Record Mobile",
                actionIcon = if (LanSyncManager.isConnected) Icons.Default.Wifi else Icons.Default.Refresh,
                actionDescription = "Desktop connection",
                onAction = { onNavigate(Sync) },
            )
        },
    ) { padding ->
        AnimatedContent(
            targetState = selected,
            modifier = Modifier.fillMaxSize().padding(padding),
            transitionSpec = {
                if (smoothMotion) {
                    val forward = targetState.ordinal >= initialState.ordinal
                    (fadeIn() + slideInHorizontally { if (forward) it / 5 else -it / 5 })
                        .togetherWith(fadeOut() + slideOutHorizontally { if (forward) -it / 7 else it / 7 })
                } else {
                    fadeIn().togetherWith(fadeOut())
                }
            },
            label = "home-tab",
        ) { tab ->
            when (tab) {
                HomeTab.Dashboard -> DashboardTab(
                    payload = payload,
                    hasUnsynced = hasUnsynced,
                    onSelectTab = { onSelectedIndexChange(it.ordinal) },
                    onSync = { onNavigate(Sync) },
                    onOpenClass = { onNavigate(ClassDetail(it)) },
                )
                HomeTab.Classes -> ModernClassesTab(payload?.assignments.orEmpty()) { onNavigate(ClassDetail(it)) }
                HomeTab.Grading -> ModernGradingTab(payload?.assignments.orEmpty()) { onNavigate(ClassDetail(it)) }
                HomeTab.Tools -> ToolsTab(payload, onNavigate)
                HomeTab.Settings -> SettingsTab(
                    payload = payload,
                    smoothMotion = smoothMotion,
                    onSmoothMotionChange = {
                        smoothMotion = it
                        MobileUiPreferences.setSmoothMotion(context, it)
                    },
                    onSync = { onNavigate(Sync) },
                )
            }
        }
    }
}

@Composable
fun PersistentAppDock(
    selectedIndex: Int,
    onSelectedIndexChange: (Int) -> Unit,
    modifier: Modifier = Modifier,
) {
    val panel = themePanel()
    Surface(
        modifier = modifier,
        shadowElevation = 18.dp,
        tonalElevation = 4.dp,
        color = panel,
        border = BorderStroke(1.dp, NeonPurple.copy(alpha = .30f)),
    ) {
        NavigationBar(
            containerColor = panel,
            tonalElevation = 0.dp,
        ) {
            HomeTab.entries.forEachIndexed { index, tab ->
                val selected = selectedIndex == index
                val accent = when (index % 3) {
                    0 -> NeonPurple
                    1 -> NeonBlue
                    else -> NeonGreen
                }
                val scale by animateFloatAsState(
                    targetValue = if (selected) 1.08f else 0.96f,
                    label = "dock-icon-scale",
                )
                val rotation by animateFloatAsState(
                    targetValue = if (selected) 8f else 0f,
                    label = "dock-icon-rotation",
                )
                NavigationBarItem(
                    selected = selected,
                    onClick = { onSelectedIndexChange(index) },
                    icon = {
                        DepthIcon(
                            icon = tab.icon,
                            contentDescription = tab.label,
                            selected = selected,
                            size = 38.dp,
                            accent = accent,
                            modifier = Modifier.graphicsLayer {
                                scaleX = scale
                                scaleY = scale
                                rotationY = rotation
                                cameraDistance = 14f * density
                            },
                        )
                    },
                    label = {
                        Text(
                            text = tab.label,
                            modifier = Modifier.fillMaxWidth(),
                            textAlign = TextAlign.Center,
                            fontSize = 10.sp,
                            maxLines = 1,
                        )
                    },
                    alwaysShowLabel = true,
                    colors = NavigationBarItemDefaults.colors(
                        indicatorColor = Color.Transparent,
                        selectedIconColor = accent,
                        selectedTextColor = accent,
                        unselectedIconColor = MaterialTheme.colorScheme.onSurfaceVariant,
                        unselectedTextColor = MaterialTheme.colorScheme.onSurfaceVariant,
                    ),
                )
            }
        }
    }
}

@Composable
fun PersistentAppRail(
    selectedIndex: Int,
    onSelectedIndexChange: (Int) -> Unit,
    modifier: Modifier = Modifier,
) {
    val panel = themePanel()
    NavigationRail(
        modifier = modifier,
        containerColor = panel,
        header = {
            BrandMark(size = 42.dp, modifier = Modifier.padding(vertical = 8.dp))
        },
    ) {
        HomeTab.entries.forEachIndexed { index, tab ->
            val selected = selectedIndex == index
            val accent = when (index % 3) {
                0 -> NeonPurple
                1 -> NeonBlue
                else -> NeonGreen
            }
            NavigationRailItem(
                selected = selected,
                onClick = { onSelectedIndexChange(index) },
                icon = {
                    DepthIcon(
                        icon = tab.icon,
                        contentDescription = tab.label,
                        selected = selected,
                        size = 34.dp,
                        accent = accent,
                    )
                },
                label = { Text(tab.label, fontSize = 11.sp, maxLines = 1) },
                alwaysShowLabel = true,
                colors = NavigationRailItemDefaults.colors(
                    indicatorColor = Color.Transparent,
                    selectedIconColor = accent,
                    selectedTextColor = accent,
                    unselectedIconColor = MaterialTheme.colorScheme.onSurfaceVariant,
                    unselectedTextColor = MaterialTheme.colorScheme.onSurfaceVariant,
                ),
            )
        }
    }
}

@Composable
private fun DashboardTab(
    payload: SyncPayload?,
    hasUnsynced: Boolean,
    onSelectTab: (HomeTab) -> Unit,
    onSync: () -> Unit,
    onOpenClass: (String) -> Unit,
) {
    val assignments = payload?.assignments.orEmpty()
    val learnerCount = assignments.flatMap { it.learners }.distinctBy { it.id }.size
    val completionStats = assignments.map { gradingCompletion(it) }
    val expectedScores = completionStats.sumOf { it.expected }
    val enteredScores = completionStats.sumOf { it.entered }
    val completion = CompletionStats(enteredScores, expectedScores).fraction
    val animatedCompletion by animateFloatAsState(completion, label = "grading-completion")
    var classLayout by rememberSaveable { mutableStateOf(ClassLayout.List) }
    val fluid = LocalFluidLayout.current
    val classColumns = if (classLayout == ClassLayout.Grid) fluid.columns.coerceAtLeast(2) else 1

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(fluid.gutter),
        verticalArrangement = Arrangement.spacedBy(fluid.itemGap),
    ) {
        item {
            GradientSection {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(
                        modifier = Modifier.weight(1f),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        Text(
                            if (payload == null) "Your teaching workspace" else "Good day, ${payload.teacherName.substringBefore(' ')}",
                            color = Color.White,
                            fontWeight = FontWeight.ExtraBold,
                            fontSize = 24.sp,
                        )
                        Text(
                            payload?.let { "${it.schoolYear} - Desktop revision ${it.revision}" }
                                ?: "Connect your desktop to bring classes, grades, and tools to this device.",
                            color = Color.White.copy(alpha = 0.82f),
                            fontSize = 13.sp,
                        )
                        Button(onClick = onSync) {
                            Icon(
                                if (LanSyncManager.isConnected) Icons.Default.Wifi else Icons.Default.Refresh,
                                contentDescription = null,
                            )
                            Spacer(Modifier.width(8.dp))
                            Text(
                                when {
                                    LanSyncManager.isConnected -> "Connected by Wi-Fi"
                                    LanSyncManager.isPaired -> "Reconnect desktop"
                                    else -> "Connect desktop"
                                }
                            )
                        }
                    }
                    BrandMark(size = fluid.mediaHeight * 0.55f)
                }
            }
        }
        item {
            val metrics = listOf(
                Triple("Classes", assignments.size.toString(), Icons.Default.School),
                Triple("Learners", learnerCount.toString(), Icons.Default.People),
                Triple("Assessments", assignments.sumOf { it.assessments.size }.toString(), Icons.Default.Assignment),
                Triple("Term grades", payload?.grades?.size?.toString() ?: "0", Icons.Default.CheckCircle),
            )
            metrics.chunked(fluid.metricColumns).forEach { row ->
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth().padding(bottom = 10.dp)) {
                    row.forEach { (label, value, icon) ->
                        MetricCard(label, value, icon, Modifier.weight(1f))
                    }
                    repeat(fluid.metricColumns - row.size) { Spacer(Modifier.weight(1f)) }
                }
            }
        }
        item {
            NeonCard(modifier = Modifier.fillMaxWidth(), accent = NeonPurple.copy(alpha = 0.35f)) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text("Grading progress", fontWeight = FontWeight.Bold)
                    Text("${(completion * 100).roundToInt()}%", color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.ExtraBold)
                }
                Spacer(Modifier.height(10.dp))
                LinearProgressIndicator(
                    progress = { animatedCompletion },
                    modifier = Modifier.fillMaxWidth().height(9.dp).clip(CircleShape),
                )
                Spacer(Modifier.height(8.dp))
                Text("$enteredScores of $expectedScores score cells completed", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        item { SectionHeader("Quick actions", "Continue where you left off") }
        item {
            LazyRow(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                item { QuickAction("Classes", Icons.Default.School) { onSelectTab(HomeTab.Classes) } }
                item { QuickAction("Grade now", Icons.Default.Assignment) { onSelectTab(HomeTab.Grading) } }
                item { QuickAction("Teacher tools", Icons.Default.Build) { onSelectTab(HomeTab.Tools) } }
                item { QuickAction("Sync", Icons.Default.Refresh, onSync) }
            }
        }
        if (hasUnsynced || payload == null || completion < 1f) {
            item { SectionHeader("Needs attention", "Priority items from your desktop workspace") }
            item {
                AttentionCard(
                    title = when {
                        payload == null -> "Connect to your desktop"
                        hasUnsynced -> "Mobile changes are waiting"
                        else -> "Some grading entries are incomplete"
                    },
                    detail = when {
                        payload == null -> "Pair over Wi-Fi or a phone hotspot to receive the latest class record."
                        hasUnsynced -> "Submit drafts so the desktop can validate and commit them."
                        else -> "${expectedScores - enteredScores} score cells still need an entry."
                    },
                    onClick = if (payload == null || hasUnsynced) onSync else ({ onSelectTab(HomeTab.Grading) }),
                )
            }
        }
        if (assignments.isNotEmpty()) {
            item { SectionHeader("My classes", "Synced teaching loads") }
            item {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    FilterChip(
                        selected = classLayout == ClassLayout.List,
                        onClick = { classLayout = ClassLayout.List },
                        label = { Text("List") },
                    )
                    FilterChip(
                        selected = classLayout == ClassLayout.Grid,
                        onClick = { classLayout = ClassLayout.Grid },
                        label = { Text("Grid") },
                    )
                    Spacer(Modifier.weight(1f))
                    Text(
                        "${assignments.size} classes",
                        modifier = Modifier.align(Alignment.CenterVertically),
                        fontSize = 12.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            if (classLayout == ClassLayout.List && classColumns == 1) {
                items(assignments, key = { it.id }) { assignment ->
                    PremiumClassCard(item = assignment, onClick = { onOpenClass(assignment.id) })
                }
            } else {
                items(assignments.chunked(classColumns.coerceAtLeast(2)), key = { row -> row.joinToString("|") { it.id } }) { row ->
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        row.forEach { assignment ->
                            PremiumClassCard(
                                item = assignment,
                                onClick = { onOpenClass(assignment.id) },
                                modifier = Modifier.weight(1f),
                                compact = true,
                            )
                        }
                        repeat(classColumns.coerceAtLeast(2) - row.size) { Spacer(Modifier.weight(1f)) }
                    }
                }
            }
        }
        payload?.calendar?.sortedBy { it.date }?.take(3)?.takeIf { it.isNotEmpty() }?.let { events ->
            item { SectionHeader("Upcoming", "School calendar") }
            items(events, key = { it.id }) { event ->
                FeatureLine(Icons.Default.DateRange, event.title, event.date, event.details)
            }
        }
    }
}
private val desktopToolEntries = listOf(
    "Name Picker" to "picker",
    "Group Randomizer" to "groups",
    "Grade Simulator" to "simulator",
    "Performance Checklist" to "checklist",
    "Games" to "games",
    "Activity Timer" to "timer",
    "Participation Tracker" to "participation",
    "Noise Meter" to "noise",
    "Class Duels" to "duels",
    "Seating Chart" to "seating",
    "Exit Ticket" to "exit",
    "Anecdotal Notes" to "notes",
    "Boat Race" to "race",
)

private val desktopActionEntries = listOf(
    "Pick learner now" to "pick-learner",
    "Reset learner picker" to "reset-picker",
    "Randomize groups" to "randomize-groups",
    "Reveal groups" to "reveal-groups",
    "Start / resume timer" to "timer-start",
    "Pause timer" to "timer-pause",
    "Skip timer segment" to "timer-skip",
    "Reset timer" to "timer-reset",
    "Randomize seating" to "randomize-seating",
    "Start noise meter" to "noise-start",
    "Stop noise meter" to "noise-stop",
    "Calibrate noise meter" to "noise-calibrate",
)

@Composable
private fun ToolsTab(payload: SyncPayload?, onNavigate: (NavKey) -> Unit) {
    val learners = payload?.assignments.orEmpty().flatMap { it.learners }.distinctBy { it.id }
    var picked by remember { mutableStateOf("No learner selected") }
    var groups by remember { mutableStateOf<List<List<String>>>(emptyList()) }
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(LocalFluidLayout.current.gutter), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        item { SectionHeader("Teacher tools", "Native tools plus secure desktop controls") }
        item {
            SettingsCard("Random learner picker", Icons.Default.Person) {
                Text(picked, color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Bold)
                Button(
                    onClick = { picked = learners.randomOrNull()?.name ?: "Sync a roster first" },
                    enabled = learners.isNotEmpty(),
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(14.dp),
                ) { Text("Pick learner") }
            }
        }
        item {
            SettingsCard("Random group maker", Icons.Default.People) {
                Button(
                    onClick = {
                        groups = learners.shuffled().map { it.name }.withIndex().groupBy { it.index % 4 }.values.map { g -> g.map { it.value } }
                    },
                    enabled = learners.isNotEmpty(),
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(14.dp),
                ) { Text("Create four groups") }
                groups.forEachIndexed { i, g -> Text("Group ${i + 1}: ${g.joinToString()}", fontSize = 12.sp) }
            }
        }
        item { SectionHeader("Classroom workspace", "Synchronized desktop-equivalent features") }
        item {
            LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                item { QuickAction("Attendance", Icons.Default.People) { onNavigate(DesktopFeature(DesktopFeatureNames.ATTENDANCE)) } }
                item { QuickAction("Checklist", Icons.Default.CheckCircle) { onNavigate(DesktopFeature(DesktopFeatureNames.CHECKLIST)) } }
                item { QuickAction("Calendar", Icons.Default.DateRange) { onNavigate(DesktopFeature(DesktopFeatureNames.CALENDAR)) } }
                item { QuickAction("All tools", Icons.Default.Build) { onNavigate(DesktopFeature(DesktopFeatureNames.TOOLS)) } }
            }
        }
        item {
            SettingsCard("Control the desktop", Icons.Default.Wifi) {
                val enabled = DesktopRemoteController.isAvailable
                Text(DesktopRemoteController.transportLabel, fontSize = 12.sp, color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Bold)
                Text(
                    "Opening a page on this phone also opens its desktop equivalent. Commands use Wi-Fi or your phone hotspot first, with Bluetooth only as fallback.",
                    fontSize = 11.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                HorizontalDivider()
                Text("Open every desktop tool", fontWeight = FontWeight.Bold)
                desktopToolEntries.chunked(2).forEach { row ->
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        row.forEach { (label, tool) ->
                            RemoteToolChip(label, enabled, { DesktopRemoteController.openTool(tool) }, Modifier.weight(1f))
                        }
                        if (row.size == 1) Spacer(Modifier.weight(1f))
                    }
                }
                HorizontalDivider()
                Text("Live desktop actions", fontWeight = FontWeight.Bold)
                desktopActionEntries.chunked(2).forEach { row ->
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        row.forEach { (label, action) ->
                            RemoteToolChip(label, enabled, { DesktopRemoteController.toolAction(action) }, Modifier.weight(1f))
                        }
                        if (row.size == 1) Spacer(Modifier.weight(1f))
                    }
                }
                if (!enabled) {
                    Text("Pair through Wi-Fi or a phone hotspot to enable desktop controls.", fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
    }
}

@Composable
private fun SettingsTab(
    payload: SyncPayload?,
    smoothMotion: Boolean,
    onSmoothMotionChange: (Boolean) -> Unit,
    onSync: () -> Unit,
) {
    val context = LocalContext.current
    var reconnect by rememberSaveable { mutableStateOf(MobileUiPreferences.autoReconnect(context)) }
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(LocalFluidLayout.current.gutter), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        item { SectionHeader("Android settings", "Only options that apply to this phone") }
        item {
            SettingsCard("Desktop connection", Icons.Default.Bluetooth) {
                SettingsToggle(
                    "Reconnect automatically",
                    "Reconnect to the trusted desktop through Wi-Fi, hotspot, or Bluetooth when this app opens.",
                    reconnect,
                ) {
                    reconnect = it
                    MobileUiPreferences.setAutoReconnect(context, it)
                    LanSyncManager.setAutoReconnect(context, it)
                    if (it && BleServerManager.isPaired) BleServerManager.ensureAdvertising(context)
                    else if (!it) BleServerManager.stopAdvertising()
                }
                HorizontalDivider()
                SettingsLine(
                    "Status",
                    if (LanSyncManager.isConnected) "Linked - ${LanSyncManager.linkQuality}"
                    else if (BleServerManager.isAuthorized) "Connected - ${BleServerManager.linkQuality}"
                    else LanSyncManager.connectionState,
                )
                Button(onClick = onSync, modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(14.dp)) {
                    Text("Manage desktop link")
                }
            }
        }
        item {
            SettingsCard("Experience", Icons.Default.PhoneAndroid) {
                val theme = LocalThemeController.current
                val dark = LocalDarkTheme.current
                SettingsToggle(
                    "Dark mode",
                    "Light mode is the default. Turn this on for the high-contrast neon classroom look.",
                    dark,
                ) { theme.setDarkTheme(it) }
                HorizontalDivider()
                SettingsToggle("Smooth motion", "Use premium transitions and animated progress.", smoothMotion, onSmoothMotionChange)
                HorizontalDivider()
                SettingsLine("Theme", if (dark) "Dark neon" else "Light classroom")
            }
        }
        item {
            SettingsCard("Data and security", Icons.Default.Lock) {
                SettingsLine("Source of truth", "Desktop app")
                SettingsLine("Local storage", "Encrypted")
                SettingsLine("Desktop revision", payload?.revision?.toString() ?: "Not synced")
                SettingsLine("Desktop version", payload?.sourceAppVersion?.ifBlank { "Unknown" } ?: "Not synced")
            }
        }
    }
}

@Composable
private fun MetricCard(label: String, value: String, icon: ImageVector, modifier: Modifier = Modifier) {
    NeonCard(modifier = modifier, accent = NeonBlue.copy(alpha = 0.28f), contentPadding = PaddingValues(16.dp)) {
        DepthIcon(icon, label, size = 38.dp)
        Text(value, fontSize = 24.sp, fontWeight = FontWeight.ExtraBold)
        Text(label, fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun QuickAction(label: String, icon: ImageVector, onClick: () -> Unit) {
    NeonCard(modifier = Modifier.width(140.dp), onClick = onClick, accent = NeonPurple.copy(alpha = 0.28f), contentPadding = PaddingValues(16.dp)) {
        DepthIcon(icon, label, size = 44.dp)
        Text(label, fontWeight = FontWeight.Bold, fontSize = 13.sp)
    }
}

@Composable
private fun AttentionCard(title: String, detail: String, onClick: () -> Unit) {
    Card(
        Modifier.fillMaxWidth().clickable(onClick = onClick),
        shape = RoundedCornerShape(20.dp),
        border = BorderStroke(1.dp, Color(0xFFF59E0B).copy(alpha = .55f)),
        colors = CardDefaults.cardColors(containerColor = themePanel(raised = true)),
    ) {
        Row(Modifier.padding(17.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Default.Warning, null, tint = Color(0xFFF59E0B))
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(title, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurface)
                Text(detail, fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Icon(Icons.Default.ArrowForward, null, tint = Color(0xFFF59E0B))
        }
    }
}

@Composable
private fun PremiumClassCard(item: Assignment, modifier: Modifier = Modifier, compact: Boolean = false, onClick: () -> Unit) {
 val males=item.learners.count{it.sex.equals("M",true)}
 val females=item.learners.count{it.sex.equals("F",true)}
 val visual=SubjectVisuals.forAssignment(item)
 Card(
  modifier=modifier.fillMaxWidth().clickable(onClick=onClick),
  shape=RoundedCornerShape(22.dp),
  border=BorderStroke(1.dp,visual.color.copy(alpha=0.38f)),
  colors=CardDefaults.cardColors(containerColor=themePanel()),
 ){
  Column{
   Box(Modifier.fillMaxWidth().height(4.dp).background(visual.color.copy(alpha=0.85f)))
   Column(Modifier.padding(if(compact) 13.dp else 18.dp),verticalArrangement=Arrangement.spacedBy(if(compact) 7.dp else 10.dp)){
    Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically){
     SubjectIconTile(item,size=if(compact) 44.dp else 56.dp)
     Spacer(Modifier.width(if(compact) 8.dp else 12.dp))
     Column(Modifier.weight(1f)){
      Text(item.subject,fontWeight=FontWeight.ExtraBold)
      Text(
       "Grade ${item.gradeLevel} - ${item.section}",
       fontSize=12.sp,
       color=visual.color,
       fontWeight=FontWeight.SemiBold,
      )
     }
     if(!compact)Icon(Icons.Default.ArrowForward,null,tint=visual.color)
    }
    HorizontalDivider(color=visual.color.copy(alpha=0.18f))
    Text(
     if(compact) "${item.learners.size} learners\n${item.assessments.size} assessments" else "${item.learners.size} learners - M $males / F $females - ${item.assessments.size} assessments",
     fontSize=if(compact) 11.sp else 12.sp,
     color=MaterialTheme.colorScheme.onSurfaceVariant,
    )
   }
  }
 }
}
@Composable
private fun FeatureLine(icon: ImageVector, title: String, subtitle: String, detail: String) {
    NeonCard(modifier = Modifier.fillMaxWidth(), contentPadding = PaddingValues(16.dp), accent = NeonBlue.copy(alpha = 0.28f)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            DepthIcon(icon, title, size = 40.dp)
            Spacer(Modifier.width(12.dp))
            Column {
                Text(title, fontWeight = FontWeight.Bold)
                Text(subtitle, fontSize = 12.sp, color = MaterialTheme.colorScheme.primary)
                if (detail.isNotBlank()) Text(detail, fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

@Composable
private fun SettingsCard(title: String, icon: ImageVector, content: @Composable () -> Unit) {
    NeonCard(modifier = Modifier.fillMaxWidth(), accent = NeonPurple.copy(alpha = 0.28f)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            DepthIcon(icon, title, size = 40.dp)
            Spacer(Modifier.width(12.dp))
            Text(title, fontWeight = FontWeight.ExtraBold)
        }
        Spacer(Modifier.height(12.dp))
        Column(verticalArrangement = Arrangement.spacedBy(12.dp), content = { content() })
    }
}

@Composable
private fun SettingsToggle(title: String, detail: String, checked: Boolean, onChange: (Boolean) -> Unit) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(title, fontWeight = FontWeight.Bold)
            Text(detail, fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Switch(checked, onChange)
    }
}

@Composable
private fun SettingsLine(label: String, value: String) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(label, fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(value, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
    }
}


