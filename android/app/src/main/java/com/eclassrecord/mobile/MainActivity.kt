package com.eclassrecord.mobile

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.ui.Modifier
import com.eclassrecord.mobile.data.BleServerManager
import com.eclassrecord.mobile.data.DatabaseHelper
import com.eclassrecord.mobile.theme.EClassRecordMobileTheme

class MainActivity : ComponentActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)

    // Initialize databases and Bluetooth manager
    DatabaseHelper.init(applicationContext)
    BleServerManager.init(applicationContext)

    enableEdgeToEdge()
    setContent {
      EClassRecordMobileTheme { Surface(modifier = Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) { MainNavigation() } }
    }
  }
}
