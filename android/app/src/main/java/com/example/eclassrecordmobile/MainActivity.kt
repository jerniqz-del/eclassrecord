package com.example.eclassrecordmobile

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.core.content.ContextCompat
import com.example.eclassrecordmobile.data.BleServerManager
import com.example.eclassrecordmobile.data.DatabaseHelper
import com.example.eclassrecordmobile.data.LanSyncManager
import com.example.eclassrecordmobile.data.MobilePinLock
import com.example.eclassrecordmobile.data.MobileUpdateNotifier
import com.example.eclassrecordmobile.theme.EClassRecordMobileTheme
import com.example.eclassrecordmobile.theme.LocalThemeController
import com.example.eclassrecordmobile.theme.ThemeController
import com.example.eclassrecordmobile.ui.main.MobileUiPreferences

class MainActivity : ComponentActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)

    DatabaseHelper.init(applicationContext)
    BleServerManager.init(applicationContext)
    LanSyncManager.init(applicationContext)
    MobileUpdateNotifier.ensureChannel(applicationContext)
    if (Build.VERSION.SDK_INT >= 33 &&
      ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
    ) {
      requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 72)
    }
    if (BleServerManager.isPaired && MobileUiPreferences.autoReconnect(applicationContext)) {
      runCatching { BleServerManager.ensureAdvertising(applicationContext) }
    }
    handleUpdateIntent(intent)

    enableEdgeToEdge()
    setContent {
      var darkTheme by remember { mutableStateOf(MobileUiPreferences.darkTheme(this)) }
      EClassRecordMobileTheme(darkTheme = darkTheme) {
        CompositionLocalProvider(
          LocalThemeController provides ThemeController(
            darkTheme = darkTheme,
            setDarkTheme = { enabled ->
              darkTheme = enabled
              MobileUiPreferences.setDarkTheme(this, enabled)
            },
          ),
        ) {
          Surface(modifier = Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) { MainNavigation() }
        }
      }
    }
  }

  override fun onStart() {
    super.onStart()
    if (BleServerManager.isPaired && MobileUiPreferences.autoReconnect(applicationContext)) {
      runCatching { BleServerManager.ensureAdvertising(applicationContext) }
    }
    if (LanSyncManager.isPaired && LanSyncManager.autoReconnectEnabled) LanSyncManager.start(applicationContext)
    LanSyncManager.refreshUpdatePrompt(applicationContext)
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    handleUpdateIntent(intent)
  }

  private fun handleUpdateIntent(intent: Intent?) {
    if (intent?.getBooleanExtra(MobileUpdateNotifier.EXTRA_OPEN_UPDATE, false) == true) {
      LanSyncManager.openReadyUpdatePrompt()
    }
  }

  override fun onStop() {
    super.onStop()
    MobilePinLock.lockSession()
  }
}
