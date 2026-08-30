package com.example.eclassrecordmobile

import android.app.Activity
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.navigation3.runtime.entryProvider
import androidx.navigation3.runtime.rememberNavBackStack
import androidx.navigation3.ui.NavDisplay
import com.example.eclassrecordmobile.data.BleServerManager
import com.example.eclassrecordmobile.data.DatabaseHelper
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

  Scaffold(
    bottomBar = {
      PersistentAppDock(
        selectedIndex = selectedDock,
        onSelectedIndexChange = ::openDock,
      )
    },
  ) { outerPadding ->
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
            SyncScreen(onBack = { backStack.removeLastOrNull() })
          }
        }
    )
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
            if (BleServerManager.isAuthorized) {
              BleServerManager.syncScoresToDesktop(context)
            }
            backStack.add(Sync)
          },
        ) {
          Text(if (BleServerManager.isAuthorized) "Push first" else "Connect & push")
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
