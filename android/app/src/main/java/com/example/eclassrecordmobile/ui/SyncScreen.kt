package com.example.eclassrecordmobile.ui

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import com.example.eclassrecordmobile.data.BleServerManager
import com.example.eclassrecordmobile.data.DatabaseHelper
import com.example.eclassrecordmobile.data.BluetoothPairingQrParser
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.codescanner.GmsBarcodeScannerOptions
import com.google.mlkit.vision.codescanner.GmsBarcodeScanning

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SyncScreen(
    onBack: () -> Unit,
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    var hasPermissions by remember {
        mutableStateOf(checkBlePermissions(context))
    }
    var desktopPin by rememberSaveable { mutableStateOf("") }
    var pairingError by rememberSaveable { mutableStateOf("") }
    var isQrScanning by rememberSaveable { mutableStateOf(false) }
    val qrScanner = remember(context) {
        val options = GmsBarcodeScannerOptions.Builder()
            .setBarcodeFormats(Barcode.FORMAT_QR_CODE)
            .enableAutoZoom()
            .build()
        GmsBarcodeScanning.getClient(context, options)
    }


    val permissionsLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestMultiplePermissions()
    ) { perms ->
        hasPermissions = perms.values.all { it }
    }

    val isAdvertising = BleServerManager.isAdvertising
    val connectionState = BleServerManager.connectionState
    val pinCode = BleServerManager.pinCode
    val deviceCode = BleServerManager.deviceCode
    val isAuthorized = BleServerManager.isAuthorized
    val syncLog = BleServerManager.syncLog
    val hasUnsynced = DatabaseHelper.hasUnsyncedChanges()

    val isPaired = BleServerManager.isPaired
    val pairedDesktopName = BleServerManager.pairedDesktopName
    val linkQuality = BleServerManager.linkQuality
    val roundTripMs = BleServerManager.roundTripMs
    val connectionProgress = BleServerManager.connectionProgress
    val connectionProgressLabel = BleServerManager.connectionProgressLabel
    val animatedProgress by animateFloatAsState(connectionProgress / 100f, label = "connection-progress")

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Desktop Bluetooth Link", fontWeight = FontWeight.Bold) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back")
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
                .padding(16.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            if (!hasPermissions) {
                // Permissions Missing State
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer)
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Text(
                            "Bluetooth Permissions Required",
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.onErrorContainer
                        )
                        Spacer(modifier = Modifier.height(8.dp))
                        Text(
                            "The app needs Bluetooth permissions to connect and sync grades with the desktop application.",
                            color = MaterialTheme.colorScheme.onErrorContainer
                        )
                        Spacer(modifier = Modifier.height(16.dp))
                        Button(
                            onClick = {
                                val required = getRequiredBlePermissions()
                                permissionsLauncher.launch(required)
                            },
                            colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error)
                        ) {
                            Text("Grant Permissions")
                        }
                    }
                }
            } else {
                // Connection Status Panel
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(16.dp),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
                ) {
                    Column(
                        modifier = Modifier.padding(16.dp),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Text(
                            text = "STATUS: $connectionState",
                            fontSize = 18.sp,
                            fontWeight = FontWeight.ExtraBold,
                            color = if (isAuthorized) Color(0xFF2E7D32) else MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        Text(
                            text = "Connection strength: $linkQuality" +
                                (roundTripMs?.let { " - ${it} ms" } ?: ""),
                            fontSize = 13.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = MaterialTheme.colorScheme.primary,
                        )
                        if (connectionProgress > 0) {
                            Spacer(modifier = Modifier.height(12.dp))
                            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                Text(connectionProgressLabel, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                                Text("$connectionProgress%", fontSize = 13.sp, fontWeight = FontWeight.ExtraBold, color = MaterialTheme.colorScheme.primary)
                            }
                            Spacer(modifier = Modifier.height(6.dp))
                            LinearProgressIndicator(
                                progress = { animatedProgress },
                                modifier = Modifier.fillMaxWidth().height(10.dp).clip(RoundedCornerShape(8.dp)),
                            )
                        }
                        if (isPaired) Text("Paired with $pairedDesktopName", fontSize = 12.sp)
                        
                        Spacer(modifier = Modifier.height(8.dp))
                        
                        if (isAdvertising) {
                            Text(
                                text = "Device Name: EClass-$deviceCode",
                                fontWeight = FontWeight.SemiBold,
                                fontSize = 16.sp
                            )
                            Spacer(modifier = Modifier.height(16.dp))
                            
                            if (!isPaired) {
                            Box(
                                modifier = Modifier
                                    .clip(RoundedCornerShape(12.dp))
                                    .background(
                                        Brush.horizontalGradient(
                                            listOf(MaterialTheme.colorScheme.primary, MaterialTheme.colorScheme.secondary)
                                        )
                                    )
                                    .padding(vertical = 12.dp, horizontal = 24.dp)
                            ) {
                                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                    Text("DESKTOP PIN", color = Color.White, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                                    Text(
                                        text = pinCode.ifBlank { "------" },
                                        color = Color.White,
                                        fontSize = 32.sp,
                                        fontWeight = FontWeight.Black,
                                        letterSpacing = 4.sp
                                    )
                                }
                            }
                            Spacer(modifier = Modifier.height(8.dp))
                            Text(
                                "This must match the six-digit PIN shown by the desktop app.",
                                fontSize = 12.sp,
                                color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f)
                            )
                            }
                        } else {
                            Text("Broadcasting is currently offline.", color = MaterialTheme.colorScheme.outline)
                        }
                    }
                }

                Spacer(modifier = Modifier.height(24.dp))

                if (!isPaired && !isAdvertising) {
                    Button(
                        onClick = {
                            pairingError = ""
                            isQrScanning = true
                            qrScanner.startScan()
                                .addOnSuccessListener { barcode ->
                                    isQrScanning = false
                                    runCatching {
                                        BluetoothPairingQrParser.parse(barcode.rawValue.orEmpty())
                                    }.onSuccess { pairing ->
                                        desktopPin = pairing.pin
                                        BleServerManager.prepareFirstPairing(pairing.pin)
                                        BleServerManager.startAdvertising(context)
                                    }.onFailure { error ->
                                        pairingError = error.message ?: "The QR code could not be used."
                                    }
                                }
                                .addOnCanceledListener { isQrScanning = false }
                                .addOnFailureListener { error ->
                                    isQrScanning = false
                                    pairingError = error.message ?: "QR scanner unavailable. Enter the PIN manually."
                                }
                        },
                        enabled = !isQrScanning,
                        modifier = Modifier.fillMaxWidth().height(56.dp),
                    ) {
                        Text(if (isQrScanning) "Opening Scanner..." else "Scan Desktop QR")
                    }
                    Text(
                        "Recommended for first pairing. You can enter the PIN manually below.",
                        fontSize = 12.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Spacer(modifier = Modifier.height(12.dp))

                    OutlinedTextField(
                        value = desktopPin,
                        onValueChange = {
                            desktopPin = it.filter(Char::isDigit).take(6)
                            pairingError = ""
                        },
                        modifier = Modifier.fillMaxWidth(),
                        label = { Text("PIN shown on desktop") },
                        supportingText = {
                            Text(pairingError.ifBlank { "Manual fallback. Future connections reconnect automatically." })
                        },
                        isError = pairingError.isNotBlank(),
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
                    )
                    Spacer(modifier = Modifier.height(12.dp))
                }

                // Toggle advertising button
                Button(
                    onClick = {
                        if (isAdvertising) {
                            BleServerManager.stopAdvertising()
                        } else {
                            if (!isPaired && desktopPin.length != 6) {
                                pairingError = "Enter the complete six-digit desktop PIN."
                            } else {
                                if (!isPaired) BleServerManager.prepareFirstPairing(desktopPin)
                                BleServerManager.startAdvertising(context)
                            }
                        }
                    },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(56.dp),
                    shape = RoundedCornerShape(12.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = if (isAdvertising) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary
                    )
                ) {
                    Text(
                        if (isAdvertising) "Stop Advertising" else "Start Sync Connection",
                        fontSize = 16.sp,
                        fontWeight = FontWeight.Bold
                    )
                }

                Spacer(modifier = Modifier.height(16.dp))

                if (isPaired && !isAuthorized) {
                    TextButton(
                        onClick = {
                            BleServerManager.stopAdvertising()
                            BleServerManager.forgetDesktop(context)
                            desktopPin = ""
                        },
                    ) {
                        Text("Forget paired desktop", color = MaterialTheme.colorScheme.error)
                    }
                    Spacer(modifier = Modifier.height(8.dp))
                }

                // Upload scores button (Visible if authorized and has unsynced changes)
                Button(
                    onClick = {

                        BleServerManager.syncScoresToDesktop(context)
                    },
                    enabled = isAuthorized && hasUnsynced,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(56.dp),
                    shape = RoundedCornerShape(12.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = Color(0xFF2E7D32),
                        disabledContainerColor = Color(0xFF2E7D32).copy(alpha = 0.4f)
                    )
                ) {
                    Icon(Icons.Default.Refresh, contentDescription = "Sync")
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        if (hasUnsynced) "Upload Scores back to Laptop" else "All Scores Synced",
                        fontSize = 16.sp,
                        fontWeight = FontWeight.Bold
                    )
                }

                Spacer(modifier = Modifier.height(24.dp))

                // Logs and output info
                Text(
                    "Sync Activity Logs",
                    fontWeight = FontWeight.Bold,
                    fontSize = 14.sp,
                    modifier = Modifier.align(Alignment.Start)
                )
                Spacer(modifier = Modifier.height(8.dp))
                
                Card(
                    modifier = Modifier
                        .fillMaxWidth()
                        .weight(1f),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
                ) {
                    LazyColumn(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(12.dp)
                    ) {
                        item {
                            Text(
                                text = syncLog,
                                fontFamily = FontFamily.Monospace,
                                fontSize = 13.sp,
                                color = MaterialTheme.colorScheme.onSurface
                            )
                        }
                    }
                }
            }
        }
    }
}

private fun getRequiredBlePermissions(): Array<String> {
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        arrayOf(
            Manifest.permission.BLUETOOTH_ADVERTISE,
            Manifest.permission.BLUETOOTH_CONNECT
        )
    } else {
        arrayOf(
            Manifest.permission.BLUETOOTH,
            Manifest.permission.BLUETOOTH_ADMIN,
            Manifest.permission.ACCESS_FINE_LOCATION
        )
    }
}

private fun checkBlePermissions(context: Context): Boolean {
    val req = getRequiredBlePermissions()
    return req.all {
        ContextCompat.checkSelfPermission(context, it) == PackageManager.PERMISSION_GRANTED
    }
}
