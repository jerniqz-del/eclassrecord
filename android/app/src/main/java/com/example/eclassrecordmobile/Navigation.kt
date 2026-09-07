package com.example.eclassrecordmobile

import android.app.Activity
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.fillMaxHeight
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
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
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
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.navigation3.runtime.entryProvider
import androidx.navigation3.runtime.rememberNavBackStack
import androidx.navigation3.ui.NavDisplay
import com.example.eclassrecordmobile.data.BleServerManager
import com.example.eclassrecordmobile.data.DatabaseHelper
import com.example.eclassrecordmobile.data.DesktopRemoteController
import com.example.eclassrecordmobile.data.LanSyncManager
import com.example.eclassrecordmobile.data.MobilePinLock
import com.example.eclassrecordmobile.ui.ClassDetailScreen
import com.example.eclassrecordmobile.ui.DesktopFeatureScreen
import com.example.eclassrecordmobile.ui.ScoreEntryScreen
import com.example.eclassrecordmobile.ui.SyncScreen
import com.example.eclassrecordmobile.ui.MobilePinUnlockScreen
import com.example.eclassrecordmobile.ui.MobileUpdateInstallDialog
import com.example.eclassrecordmobile.ui.MobileUpdateOfferDialog
import com.example.eclassrecordmobile.ui.main.PersistentAppDock
import com.example.eclassrecordmobile.ui.main.PersistentAppRail
import com.example.eclassrecordmobile.ui.main.PremiumMainScreen
import com.example.eclassrecordmobile.ui.design.LocalFluidLayout

@Composable
fun MainNavigation() {
  val context = LocalContext.current
  val activity = context as? Activity
  val backStack = rememberNavBackStack(Main)
  var selectedDock by rememberSaveable { mutableIntStateOf(0) }
  var showExitDialog by rememberSaveable { mutableStateOf(false) }
  val imeVisible = WindowInsets.ime.getBottom(LocalDensity.current) > 0
  val activeProfileKey = DatabaseHelper.observedProfileKey.ifBlank { LanSyncManager.activeProfileKey }
  var profileLocked by rememberSaveable(activeProfileKey) {
    mutableStateOf(MobilePinLock.requiresUnlock(context, activeProfileKey))
  }
  val lifecycleOwner = LocalLifecycleOwner.current
  DisposableEffect(lifecycleOwner, activeProfileKey) {
    val observer = LifecycleEventObserver { _, event ->
      if (event == Lifecycle.Event.ON_STOP) {
        MobilePinLock.lockSession(activeProfileKey)
        profileLocked = MobilePinLock.requiresUnlock(context, activeProfileKey)
      }
      if (event == Lifecycle.Event.ON_START) {
        profileLocked = MobilePinLock.requiresUnlock(context, activeProfileKey)
      }
    }
    lifecycleOwner.lifecycle.addObserver(observer)
    onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
  }

  if (profileLocked) {
    val profileName = LanSyncManager.pairedProfiles.find { it.profileKey == activeProfileKey }?.profileName.orEmpty()
    MobilePinUnlockScreen(profileName = profileName) { pin ->
      MobilePinLock.verify(context, activeProfileKey, pin).also { if (it) profileLocked = false }
    }
    return
  }

  fun openDock(index: Int) {
    selectedDock = index.coerceIn(0, 4)
    while (backStack.size > 1) backStack.removeLastOrNull()
  }

  BackHandler {
    when {
      backStack.size > 1 -> backStack.removeLastOrNull()
      DatabaseHelper.hasUnsyncedChanges() && !LanSyncManager.isConnected && !BleServerManager.isAuthorized ->
        showExitDialog = true
      else -> {
        if (DatabaseHelper.hasUnsyncedChanges()) DatabaseHelper.requestLivePublish(context)
        activity?.finish()
      }
    }
  }

  val liveDataRevision = LanSyncManager.dataRevision
  val activeRoute = backStack.lastOrNull()
  val remoteAvailable = DesktopRemoteController.isAvailable
  val fluid = LocalFluidLayout.current
  LaunchedEffect(selectedDock, activeRoute, remoteAvailable) {
    if (!remoteAvailable) return@LaunchedEffect
    when (val route = activeRoute) {
      is ClassDetail -> DesktopRemoteController.openPage("record", route.assignmentId)
      is ScoreEntry -> DesktopRemoteController.openPage("record", route.assignmentId)
      is DesktopFeature -> DesktopRemoteController.openPage(
        when (route.name) {
          "grading" -> "record"
          "checklist" -> "performance-checklist"
          else -> route.name
        },
      )
      Sync -> DesktopRemoteController.openPage("sync")
      else -> DesktopRemoteController.openPage(
        listOf("dashboard", "classes", "record", "tools", "settings")[selectedDock.coerceIn(0, 4)],
      )
    }
  }
  Scaffold(
    contentWindowInsets = WindowInsets(0, 0, 0, 0),
    bottomBar = {
      if (!imeVisible && !fluid.useRailNavigation) {
        PersistentAppDock(
          selectedIndex = selectedDock,
          onSelectedIndexChange = ::openDock,
        )
      }
    },
  ) { outerPadding ->
      key(liveDataRevision) {
      Row(Modifier.fillMaxSize().padding(outerPadding)) {
        if (fluid.useRailNavigation) {
          PersistentAppRail(
            selectedIndex = selectedDock,
            onSelectedIndexChange = ::openDock,
            modifier = Modifier.fillMaxHeight().statusBarsPadding(),
          )
        }
      NavDisplay(
      backStack = backStack,
      modifier = Modifier.weight(1f).fillMaxSize(),
      onBack = {
        if (backStack.size > 1) backStack.removeLastOrNull()
        else if (DatabaseHelper.hasUnsyncedChanges() && !LanSyncManager.isConnected && !BleServerManager.isAuthorized) {
          showExitDialog = true
        } else {
          if (DatabaseHelper.hasUnsyncedChanges()) DatabaseHelper.requestLivePublish(context)
          activity?.finish()
        }
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
  }

  if (showExitDialog) {
    val pending = DatabaseHelper.pendingChangeCount()
    AlertDialog(
      onDismissRequest = { showExitDialog = false },
      title = { Text("Waiting to send") },
      text = {
        Text(
          "$pending change${if (pending == 1) "" else "s"} stay encrypted on this phone and publish automatically once the desktop is linked and unlocked. Close anyway, or keep the app open."
        )
      },
      confirmButton = {
        Button(
          onClick = {
            showExitDialog = false
            backStack.add(Sync)
          },
        ) {
          Text("Open connection")
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

  val readyUpdate = LanSyncManager.updateInfo
  if (!showExitDialog && LanSyncManager.updatePromptVisible && readyUpdate != null) {
    MobileUpdateInstallDialog(
      update = readyUpdate,
      phoneVersionName = LanSyncManager.phoneVersionName,
      phoneVersionCode = LanSyncManager.phoneVersionCode,
      onInstall = { LanSyncManager.installReadyUpdate(context) },
      onRemindLater = { option -> LanSyncManager.deferReadyUpdate(context, option.delayMs) },
    )
  } else if (!showExitDialog && LanSyncManager.updateOfferVisible && readyUpdate != null && !LanSyncManager.isUpdateReady) {
    MobileUpdateOfferDialog(
      update = readyUpdate,
      phoneVersionName = LanSyncManager.phoneVersionName,
      phoneVersionCode = LanSyncManager.phoneVersionCode,
      onRequestPackage = { LanSyncManager.requestUpdateFromDesktop(context) },
      onDismiss = { LanSyncManager.dismissUpdateOffer(context) },
    )
  }
}
