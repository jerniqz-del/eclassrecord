package com.example.eclassrecordmobile

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
import com.example.eclassrecordmobile.data.BleServerManager
import com.example.eclassrecordmobile.data.DatabaseHelper
import com.example.eclassrecordmobile.data.LanSyncManager
import com.example.eclassrecordmobile.data.MobilePinLock
import com.example.eclassrecordmobile.theme.EClassRecordMobileTheme
import com.example.eclassrecordmobile.theme.LocalThemeController
import com.example.eclassrecordmobile.theme.ThemeController
import com.example.eclassrecordmobile.ui.main.MobileUiPreferences

class MainActivity : ComponentActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)

    // Initialize databases and Bluetooth manager
    DatabaseHelper.init(applicationContext)
    BleServerManager.init(applicationContext)
    LanSyncManager.init(applicationContext)
    if (BleServerManager.isPaired && MobileUiPreferences.autoReconnect(applicationContext)) {
      runCatching { BleServerManager.ensureAdvertising(applicationContext) }
    }

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
  }

  override fun onStop() {
    super.onStop()
    MobilePinLock.lockSession()
  }
}
