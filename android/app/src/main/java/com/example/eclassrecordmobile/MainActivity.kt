package com.example.eclassrecordmobile

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.ui.Modifier
import com.example.eclassrecordmobile.data.BleServerManager
import com.example.eclassrecordmobile.data.DatabaseHelper
import com.example.eclassrecordmobile.data.LanSyncManager
import com.example.eclassrecordmobile.theme.EClassRecordMobileTheme
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
      EClassRecordMobileTheme { Surface(modifier = Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) { MainNavigation() } }
    }
  }

  override fun onStart() {
    super.onStart()
    if (BleServerManager.isPaired && MobileUiPreferences.autoReconnect(applicationContext)) {
      runCatching { BleServerManager.ensureAdvertising(applicationContext) }
    }
    if (LanSyncManager.isPaired) LanSyncManager.start(applicationContext)
  }
}
