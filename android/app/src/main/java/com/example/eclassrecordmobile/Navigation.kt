package com.example.eclassrecordmobile

import android.app.Activity
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.ime
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.School
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Icon
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.Alignment
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.navigation3.runtime.entryProvider
import androidx.navigation3.runtime.rememberNavBackStack
import androidx.navigation3.ui.NavDisplay
import com.example.eclassrecordmobile.data.BleServerManager
import com.example.eclassrecordmobile.data.DatabaseHelper
import com.example.eclassrecordmobile.data.LanSyncManager
import com.example.eclassrecordmobile.ui.ClassDetailScreen
import com.example.eclassrecordmobile.ui.DesktopFeatureScreen
import com.example.eclassrecordmobile.ui.ScoreEntryScreen
import com.example.eclassrecordmobile.ui.SyncScreen
import com.example.eclassrecordmobile.ui.main.PersistentAppDock
import com.example.eclassrecordmobile.ui.main.PremiumMainScreen

@Composable
fun MainNavigation() {
  val context = LocalContext.current
  val activity = context as? Activity
  val backStack = rememberNavBackStack(Main)
  var selectedDock by rememberSaveable { mutableIntStateOf(0) }
  var showExitDialog by rememberSaveable { mutableStateOf(false) }
  val imeVisible = WindowInsets.ime.getBottom(LocalDensity.current) > 0

  fun openDock(index: Int) {
    selectedDock = index.coerceIn(0, 4)
    while (backStack.size > 1) backStack.removeLastOrNull()
  }

  BackHandler {
    when {
      backStack.size > 1 -> backStack.removeLastOrNull()
      DatabaseHelper.hasUnsyncedChanges() -> showExitDialog = true
      else -> activity?.finish()
    }
  }

  val liveDataRevision = LanSyncManager.dataRevision
  Scaffold(
    topBar = { PersistentMobileHeader() },
    bottomBar = {
      if (!imeVisible) {
        PersistentAppDock(
          selectedIndex = selectedDock,
          onSelectedIndexChange = ::openDock,
        )
      }
    },
  ) { outerPadding ->
      key(liveDataRevision) {
      NavDisplay(
      backStack = backStack,
      modifier = Modifier.fillMaxSize().padding(outerPadding),
      onBack = {
        if (backStack.size > 1) backStack.removeLastOrNull()
        else if (DatabaseHelper.hasUnsyncedChanges()) showExitDialog = true
        else activity?.finish()
      },
      entryProvider =
        entryProvider {
          entry<Main> {
            PremiumMainScreen(
              onNavigate = { navKey -> backStack.add(navKey) },
              selectedIndex = selectedDock,
              onSelectedIndexChange = { selectedDock = it },
            )
          }
          entry<ClassDetail> { key ->
            ClassDetailScreen(
              assignmentId = key.assignmentId,
              onBack = { backStack.removeLastOrNull() },
              onNavigate = { navKey -> backStack.add(navKey) }
            )
          }
          entry<ScoreEntry> { key ->
            ScoreEntryScreen(
              assignmentId = key.assignmentId,
              assessmentId = key.assessmentId,
              onBack = { backStack.removeLastOrNull() }
            )
          }
          entry<DesktopFeature> { key ->
            DesktopFeatureScreen(
              feature = key.name,
              onBack = { backStack.removeLastOrNull() },
            )
          }
          entry<Sync> {
            SyncScreen(
              onBack = { backStack.removeLastOrNull() },
              onSynced = { openDock(0) },
            )
          }
        }
    )
  }
  }

  if (showExitDialog) {
    val pending = DatabaseHelper.pendingChangeCount()
    AlertDialog(
      onDismissRequest = { showExitDialog = false },
      title = { Text("Unsynced mobile changes") },
      text = {
        Text(
          "$pending change${if (pending == 1) "" else "s"} are safely encrypted on this phone. " +
            "Push them to the desktop now, keep editing, or close without pushing."
        )
      },
      confirmButton = {
        Button(
          onClick = {
            showExitDialog = false
            backStack.add(Sync)
          },
        ) {
          Text(if (BleServerManager.isAuthorized) "Authorize push" else "Connect & push")
        }
      },
      dismissButton = {
        TextButton(onClick = { activity?.finish() }) {
          Text("Continue close", color = MaterialTheme.colorScheme.error)
        }
        TextButton(onClick = { showExitDialog = false }) {
          Text("Keep editing")
        }
      },
    )
  }
}

@Composable
private fun PersistentMobileHeader() {
  Surface(
    color = Color(0xFF172554),
    shadowElevation = 6.dp,
  ) {
    Row(
      modifier = Modifier.fillMaxWidth().statusBarsPadding().height(44.dp).padding(horizontal = 16.dp),
      verticalAlignment = Alignment.CenterVertically,
    ) {
      Icon(Icons.Default.School, contentDescription = null, tint = Color.White)
      Spacer(Modifier.width(9.dp))
      Text(
        "E-Class Record Mobile",
        color = Color.White,
        fontWeight = FontWeight.ExtraBold,
      )
    }
  }
}
