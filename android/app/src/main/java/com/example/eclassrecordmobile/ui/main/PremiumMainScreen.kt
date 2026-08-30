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
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ElevatedCard
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
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
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
import com.example.eclassrecordmobile.data.SyncPayload
import com.example.eclassrecordmobile.ui.DesktopFeatureNames

private enum class HomeTab(val label: String, val icon: ImageVector) {
    Dashboard("Dashboard", Icons.Default.Home),
    Classes("Classes", Icons.Default.School),
    Grading("Grading", Icons.Default.List),
    Tools("Tools", Icons.Default.Build),
    Settings("Settings", Icons.Default.Settings),
}

object MobileUiPreferences {
    private const val STORE = "mobile_ui_preferences"
    private const val AUTO_RECONNECT = "auto_reconnect"
    private const val SMOOTH_MOTION = "smooth_motion"

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
            TopAppBar(
                title = {
                    Column {
                        Text(selected.label, fontWeight = FontWeight.ExtraBold, fontSize = 21.sp)
                        Text(
                            payload?.schoolName?.ifBlank { "E-Class Record Mobile" } ?: "E-Class Record Mobile",
                            fontSize = 11.sp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                },
                actions = {
                    Surface(
                        shape = CircleShape,
                        color = if (BleServerManager.isAuthorized) Color(0xFFDCFCE7) else MaterialTheme.colorScheme.surfaceVariant,
                    ) {
                        IconButton(onClick = { onNavigate(Sync) }) {
                            Icon(
                                Icons.Default.Refresh,
                                contentDescription = "Desktop sync",
                                tint = if (BleServerManager.isAuthorized) Color(0xFF15803D) else MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                    Spacer(Modifier.width(12.dp))
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.surface),
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
                HomeTab.Classes -> ClassesTab(payload?.assignments.orEmpty()) { onNavigate(ClassDetail(it)) }
                HomeTab.Grading -> GradingTab(payload) { onNavigate(ClassDetail(it)) }
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
    Surface(modifier = modifier, shadowElevation = 18.dp, tonalElevation = 4.dp) {
        NavigationBar(
            containerColor = MaterialTheme.colorScheme.surface,
            tonalElevation = 0.dp,
        ) {
            HomeTab.entries.forEachIndexed { index, tab ->
                val selected = selectedIndex == index
                val scale by animateFloatAsState(
                    targetValue = if (selected) 1.08f else 0.96f,
                    label = "dock-icon-scale",
                )
                NavigationBarItem(
                    selected = selected,
                    onClick = { onSelectedIndexChange(index) },
                    icon = {
                        Icon(
                            imageVector = tab.icon,
                            contentDescription = tab.label,
                            modifier = Modifier.graphicsLayer {
                                scaleX = scale
                                scaleY = scale
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
                        indicatorColor = MaterialTheme.colorScheme.primaryContainer,
                        selectedIconColor = MaterialTheme.colorScheme.primary,
                        selectedTextColor = MaterialTheme.colorScheme.primary,
                    ),
                )
            }
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
    val expectedScores = assignments.sumOf { it.learners.size * it.assessments.size }
    val enteredScores = assignments.sumOf { it.scores.values.count(String::isNotBlank) }
    val completion = if (expectedScores == 0) 0f else enteredScores.toFloat() / expectedScores
    val animatedCompletion by animateFloatAsState(completion, label = "grading-completion")

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(18.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        item {
            Card(
                shape = RoundedCornerShape(26.dp),
                colors = CardDefaults.cardColors(containerColor = Color.Transparent),
            ) {
                Box(
                    Modifier.fillMaxWidth().background(
                        Brush.linearGradient(listOf(Color(0xFF312E81), Color(0xFF2563EB), Color(0xFF06B6D4)))
                    ).padding(22.dp)
                ) {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
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
                            Icon(Icons.Default.Bluetooth, contentDescription = null)
                            Spacer(Modifier.width(8.dp))
                            Text(if (BleServerManager.isAuthorized) "Desktop connected" else "Connect desktop")
                        }
                    }
                }
            }
        }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
                MetricCard("Classes", assignments.size.toString(), Icons.Default.School, Modifier.weight(1f))
                MetricCard("Learners", learnerCount.toString(), Icons.Default.People, Modifier.weight(1f))
            }
        }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
                MetricCard("Assessments", assignments.sumOf { it.assessments.size }.toString(), Icons.Default.Assignment, Modifier.weight(1f))
                MetricCard("Term grades", payload?.grades?.size?.toString() ?: "0", Icons.Default.CheckCircle, Modifier.weight(1f))
            }
        }
        item {
            ElevatedCard(shape = RoundedCornerShape(20.dp), modifier = Modifier.fillMaxWidth()) {
                Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text("Grading progress", fontWeight = FontWeight.Bold)
                        Text("${(completion * 100).toInt()}%", color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.ExtraBold)
                    }
                    LinearProgressIndicator(
                        progress = { animatedCompletion },
                        modifier = Modifier.fillMaxWidth().height(9.dp).clip(CircleShape),
                    )
                    Text("$enteredScores of $expectedScores score cells completed", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
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
                        payload == null -> "Pair over Bluetooth to receive the latest approved class record."
                        hasUnsynced -> "Submit drafts so the desktop can validate and commit them."
                        else -> "${expectedScores - enteredScores} score cells still need an entry."
                    },
                    onClick = if (payload == null || hasUnsynced) onSync else ({ onSelectTab(HomeTab.Grading) }),
                )
            }
        }
        if (assignments.isNotEmpty()) {
            item { SectionHeader("My classes", "Synced teaching loads") }
            items(assignments.take(4), key = { it.id }) { assignment ->
                PremiumClassCard(item = assignment, onClick = { onOpenClass(assignment.id) })
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
@Composable
private fun ClassesTab(assignments: List<Assignment>, onOpen: (String) -> Unit) {
 var query by rememberSaveable { mutableStateOf("") }
 val shown=assignments.filter{query.isBlank()||"${it.subject} ${it.gradeLevel} ${it.section}".contains(query,true)}
 LazyColumn(Modifier.fillMaxSize(),contentPadding=PaddingValues(18.dp),verticalArrangement=Arrangement.spacedBy(14.dp)){
  item{OutlinedTextField(query,{query=it},Modifier.fillMaxWidth(),leadingIcon={Icon(Icons.Default.Search,null)},label={Text("Search classes")},singleLine=true,shape=RoundedCornerShape(18.dp))}
  item{SectionHeader("Teaching loads","${assignments.size} classes from the authoritative desktop record")}
  if(shown.isEmpty())item{EmptyState("No matching classes","Sync the desktop or try another search.")}
  items(shown,key={it.id}){item->PremiumClassCard(item){onOpen(item.id)}}
 }
}

@Composable
private fun GradingTab(payload: SyncPayload?, onOpen: (String) -> Unit) {
 var term by rememberSaveable{mutableStateOf("1")}
 val assignments=payload?.assignments.orEmpty()
 LazyColumn(Modifier.fillMaxSize(),contentPadding=PaddingValues(18.dp),verticalArrangement=Arrangement.spacedBy(14.dp)){
  item{LazyRow(horizontalArrangement=Arrangement.spacedBy(8.dp)){items(listOf("1","2","3")){q->FilterChip(term==q,{term=q},{Text("Term $q")})}}}
  item{SectionHeader("Grading sheets","Mobile entries remain drafts until accepted by desktop")}
  if(assignments.isEmpty())item{EmptyState("No grading sheets","Sync classes from the desktop app.")}
  items(assignments,key={it.id}){assignment->
   val assessments=assignment.assessments.filter{it.term==term}
   val expected=assessments.size*assignment.learners.size
   val entered=assessments.sumOf{assessment->assignment.learners.count{assignment.scores["${it.id}|${assessment.id}"].orEmpty().isNotBlank()}}
   val progress=if(expected==0)0f else entered.toFloat()/expected
   ElevatedCard(Modifier.fillMaxWidth().clickable{onOpen(assignment.id)},shape=RoundedCornerShape(20.dp)){
    Column(Modifier.padding(18.dp),verticalArrangement=Arrangement.spacedBy(10.dp)){
     Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.SpaceBetween){
      Column{Text(assignment.subject,fontWeight=FontWeight.ExtraBold,fontSize=17.sp);Text("Grade ${assignment.gradeLevel} - ${assignment.section}",fontSize=12.sp,color=MaterialTheme.colorScheme.onSurfaceVariant)}
      Text("${(progress*100).toInt()}%",fontWeight=FontWeight.ExtraBold,color=MaterialTheme.colorScheme.primary)
     }
     LinearProgressIndicator({progress},Modifier.fillMaxWidth().height(8.dp).clip(CircleShape))
     Text("${assessments.size} assessments - $entered/$expected scores",fontSize=12.sp,color=MaterialTheme.colorScheme.onSurfaceVariant)
     Text("Open grading sheet  >",color=MaterialTheme.colorScheme.primary,fontWeight=FontWeight.Bold)
    }
   }
  }
 }
}

@Composable
private fun ToolsTab(payload: SyncPayload?, onNavigate: (NavKey) -> Unit) {
 val learners=payload?.assignments.orEmpty().flatMap{it.learners}.distinctBy{it.id}
 var picked by remember{mutableStateOf("No learner selected")}
 var groups by remember{mutableStateOf<List<List<String>>>(emptyList())}
 LazyColumn(Modifier.fillMaxSize(),contentPadding=PaddingValues(18.dp),verticalArrangement=Arrangement.spacedBy(14.dp)){
  item{SectionHeader("Teacher tools","Native tools plus secure desktop controls")}
  item{SettingsCard("Random learner picker",Icons.Default.Person){
   Text(picked,color=MaterialTheme.colorScheme.primary,fontWeight=FontWeight.Bold)
   Button({picked=learners.randomOrNull()?.name?:"Sync a roster first"},enabled=learners.isNotEmpty(),modifier=Modifier.fillMaxWidth()){Text("Pick learner")}
  }}
  item{SettingsCard("Random group maker",Icons.Default.People){
   Button({groups=learners.shuffled().map{it.name}.withIndex().groupBy{it.index%4}.values.map{g->g.map{it.value}}},enabled=learners.isNotEmpty(),modifier=Modifier.fillMaxWidth()){Text("Create four groups")}
   groups.forEachIndexed{i,g->Text("Group ${i+1}: ${g.joinToString()}",fontSize=12.sp)}
  }}
  item{SectionHeader("Classroom workspace","Synchronized desktop-equivalent features")}
  item{LazyRow(horizontalArrangement=Arrangement.spacedBy(8.dp)){
   item{QuickAction("Attendance",Icons.Default.People){onNavigate(DesktopFeature(DesktopFeatureNames.ATTENDANCE))}}
   item{QuickAction("Checklist",Icons.Default.CheckCircle){onNavigate(DesktopFeature(DesktopFeatureNames.CHECKLIST))}}
   item{QuickAction("Calendar",Icons.Default.DateRange){onNavigate(DesktopFeature(DesktopFeatureNames.CALENDAR))}}
   item{QuickAction("All tools",Icons.Default.Build){onNavigate(DesktopFeature(DesktopFeatureNames.TOOLS))}}
  }}
  item{SettingsCard("Control the desktop",Icons.Default.Bluetooth){
   val enabled=BleServerManager.isAuthorized
   listOf(
    "Open learner picker" to {BleServerManager.openDesktopLearnerPicker()},
    "Pick learner now" to {BleServerManager.pickLearnerOnDesktop()},
    "Open group maker" to {BleServerManager.openDesktopGroupMaker()},
    "Randomize groups" to {BleServerManager.randomizeGroupsOnDesktop()},
    "Open checklist" to {BleServerManager.openDesktopChecklist()},
   ).forEach{(label,action)->Button({action()},enabled=enabled,modifier=Modifier.fillMaxWidth()){Text(label)}}
   if(!enabled)Text("Connect Bluetooth to enable desktop controls.",fontSize=11.sp,color=MaterialTheme.colorScheme.onSurfaceVariant)
  }}
 }
}

@Composable
private fun SettingsTab(payload: SyncPayload?,smoothMotion:Boolean,onSmoothMotionChange:(Boolean)->Unit,onSync:()->Unit){
 val context=LocalContext.current
 var reconnect by rememberSaveable{mutableStateOf(MobileUiPreferences.autoReconnect(context))}
 LazyColumn(Modifier.fillMaxSize(),contentPadding=PaddingValues(18.dp),verticalArrangement=Arrangement.spacedBy(14.dp)){
  item{SectionHeader("Android settings","Only options that apply to this phone")}
  item{SettingsCard("Desktop connection",Icons.Default.Bluetooth){
   SettingsToggle("Reconnect automatically","Resume the trusted Bluetooth link when this app opens.",reconnect){reconnect=it;MobileUiPreferences.setAutoReconnect(context,it)}
   HorizontalDivider();SettingsLine("Status",if(BleServerManager.isAuthorized)"Connected - ${BleServerManager.linkQuality}" else BleServerManager.connectionState)
   Button(onSync,modifier=Modifier.fillMaxWidth()){Text("Manage Bluetooth sync")}
  }}
  item{SettingsCard("Experience",Icons.Default.PhoneAndroid){
   SettingsToggle("Smooth motion","Use premium transitions and animated progress.",smoothMotion,onSmoothMotionChange)
   HorizontalDivider();SettingsLine("Theme","Follows Android light or dark mode")
  }}
  item{SettingsCard("Data and security",Icons.Default.Lock){
   SettingsLine("Source of truth","Desktop app");SettingsLine("Local storage","Encrypted")
   SettingsLine("Desktop revision",payload?.revision?.toString()?:"Not synced")
   SettingsLine("Desktop version",payload?.sourceAppVersion?.ifBlank{"Unknown"}?:"Not synced")
  }}
 }
}

@Composable private fun MetricCard(label:String,value:String,icon:ImageVector,modifier:Modifier=Modifier){
 ElevatedCard(modifier,shape=RoundedCornerShape(20.dp)){Column(Modifier.padding(16.dp),verticalArrangement=Arrangement.spacedBy(8.dp)){Icon(icon,null,tint=MaterialTheme.colorScheme.primary);Text(value,fontSize=24.sp,fontWeight=FontWeight.ExtraBold);Text(label,fontSize=11.sp,color=MaterialTheme.colorScheme.onSurfaceVariant)}}
}
@Composable private fun SectionHeader(title:String,subtitle:String){Column{Text(title,fontSize=18.sp,fontWeight=FontWeight.ExtraBold);Text(subtitle,fontSize=12.sp,color=MaterialTheme.colorScheme.onSurfaceVariant)}}
@Composable private fun QuickAction(label:String,icon:ImageVector,onClick:()->Unit){
 ElevatedCard(Modifier.width(132.dp).clickable(onClick=onClick),shape=RoundedCornerShape(18.dp)){Column(Modifier.padding(16.dp),verticalArrangement=Arrangement.spacedBy(10.dp)){Icon(icon,null,tint=MaterialTheme.colorScheme.primary);Text(label,fontWeight=FontWeight.Bold,fontSize=13.sp)}}
}
@Composable private fun AttentionCard(title:String,detail:String,onClick:()->Unit){
 Card(Modifier.fillMaxWidth().clickable(onClick=onClick),shape=RoundedCornerShape(20.dp),colors=CardDefaults.cardColors(containerColor=Color(0xFFFFF7ED))){Row(Modifier.padding(17.dp),verticalAlignment=Alignment.CenterVertically){Icon(Icons.Default.Warning,null,tint=Color(0xFFEA580C));Spacer(Modifier.width(12.dp));Column(Modifier.weight(1f)){Text(title,fontWeight=FontWeight.Bold,color=Color(0xFF9A3412));Text(detail,fontSize=12.sp,color=Color(0xFF9A3412))};Icon(Icons.Default.ArrowForward,null,tint=Color(0xFFEA580C))}}
}
@Composable private fun PremiumClassCard(item:Assignment,onClick:()->Unit){
 val males=item.learners.count{it.sex.equals("M",true)}
 val females=item.learners.count{it.sex.equals("F",true)}
 val visual=SubjectVisuals.forAssignment(item)
 Card(
  modifier=Modifier.fillMaxWidth().clickable(onClick=onClick),
  shape=RoundedCornerShape(22.dp),
  border=BorderStroke(1.dp,visual.color.copy(alpha=0.38f)),
 ){
  Column{
   Box(Modifier.fillMaxWidth().height(4.dp).background(visual.color.copy(alpha=0.85f)))
   Column(Modifier.padding(18.dp),verticalArrangement=Arrangement.spacedBy(10.dp)){
    Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically){
     SubjectIcon(item,size=46.dp)
     Spacer(Modifier.width(12.dp))
     Column(Modifier.weight(1f)){
      Text(item.subject,fontWeight=FontWeight.ExtraBold)
      Text(
       "Grade ${item.gradeLevel} - ${item.section}",
       fontSize=12.sp,
       color=visual.color,
       fontWeight=FontWeight.SemiBold,
      )
     }
     Icon(Icons.Default.ArrowForward,null,tint=visual.color)
    }
    HorizontalDivider(color=visual.color.copy(alpha=0.18f))
    Text(
     "${item.learners.size} learners - M $males / F $females - ${item.assessments.size} assessments",
     fontSize=12.sp,
     color=MaterialTheme.colorScheme.onSurfaceVariant,
    )
   }
  }
 }
}
@Composable private fun FeatureLine(icon:ImageVector,title:String,subtitle:String,detail:String){
 ElevatedCard(shape=RoundedCornerShape(18.dp)){Row(Modifier.fillMaxWidth().padding(16.dp),verticalAlignment=Alignment.CenterVertically){Icon(icon,null,tint=MaterialTheme.colorScheme.primary);Spacer(Modifier.width(12.dp));Column{Text(title,fontWeight=FontWeight.Bold);Text(subtitle,fontSize=12.sp,color=MaterialTheme.colorScheme.primary);if(detail.isNotBlank())Text(detail,fontSize=11.sp)}}}
}
@Composable private fun SettingsCard(title:String,icon:ImageVector,content: @Composable () -> Unit){
 ElevatedCard(shape=RoundedCornerShape(22.dp),modifier=Modifier.fillMaxWidth()){Column(Modifier.padding(18.dp),verticalArrangement=Arrangement.spacedBy(12.dp)){Row{Icon(icon,null,tint=MaterialTheme.colorScheme.primary);Spacer(Modifier.width(10.dp));Text(title,fontWeight=FontWeight.ExtraBold)};content()}}
}
@Composable private fun SettingsToggle(title:String,detail:String,checked:Boolean,onChange:(Boolean)->Unit){
 Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically){Column(Modifier.weight(1f)){Text(title,fontWeight=FontWeight.Bold);Text(detail,fontSize=11.sp,color=MaterialTheme.colorScheme.onSurfaceVariant)};Switch(checked,onChange)}
}
@Composable private fun SettingsLine(label:String,value:String){Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.SpaceBetween){Text(label,fontSize=12.sp,color=MaterialTheme.colorScheme.onSurfaceVariant);Text(value,fontSize=12.sp,fontWeight=FontWeight.SemiBold)}}
@Composable private fun EmptyState(title:String,detail:String){Card(Modifier.fillMaxWidth(),shape=RoundedCornerShape(22.dp),colors=CardDefaults.cardColors(containerColor=MaterialTheme.colorScheme.surfaceVariant)){Column(Modifier.padding(28.dp),horizontalAlignment=Alignment.CenterHorizontally){Icon(Icons.Default.Person,null,modifier=Modifier.size(40.dp));Text(title,fontWeight=FontWeight.ExtraBold);Text(detail,fontSize=12.sp)}}}


