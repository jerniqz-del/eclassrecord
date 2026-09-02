package com.example.eclassrecordmobile.ui

import android.Manifest
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothManager
import android.content.Context
import android.content.Intent
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
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import com.example.eclassrecordmobile.data.BleServerManager
import com.example.eclassrecordmobile.data.DatabaseHelper
import com.example.eclassrecordmobile.data.BluetoothPairingQrParser
import com.example.eclassrecordmobile.data.LanSyncManager
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.codescanner.GmsBarcodeScannerOptions
import com.google.mlkit.vision.codescanner.GmsBarcodeScanning
import kotlinx.coroutines.delay

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SyncScreen(
    onBack: () -> Unit,
    onSynced: () -> Unit,
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    var hasPermissions by remember {
        mutableStateOf(checkBlePermissions(context))
    }
    var desktopPin by rememberSaveable { mutableStateOf("") }
    var pairingError by rememberSaveable { mutableStateOf("") }
    var qrAcceptedMessage by rememberSaveable { mutableStateOf("") }
    var isQrScanning by rememberSaveable { mutableStateOf(false) }
    var showBluetoothEnablePrompt by rememberSaveable { mutableStateOf(false) }
    var showPushAuthorization by rememberSaveable { mutableStateOf(false) }
    var pushPin by rememberSaveable { mutableStateOf("") }
    var pushError by rememberSaveable { mutableStateOf("") }
    val qrScanner = remember(context) {
        val options = GmsBarcodeScannerOptions.Builder()
            .setBarcodeFormats(Barcode.FORMAT_QR_CODE)
            .enableAutoZoom()
            .build()
        GmsBarcodeScanning.getClient(context, options)
    }

    val startDesktopQrScan: () -> Unit = {
        pairingError = ""
        isQrScanning = true
        qrScanner.startScan()
            .addOnSuccessListener { barcode ->
                isQrScanning = false
                val rawValue = barcode.rawValue.orEmpty()
                if (rawValue.contains("|wlan|")) {
                    if (LanSyncManager.pairFromQr(context, rawValue)) {
                        qrAcceptedMessage = "Desktop QR accepted. Connecting through the local network now."
                    } else {
                        pairingError = LanSyncManager.syncLog
                    }
                } else {
                    runCatching {
                        BluetoothPairingQrParser.parse(rawValue)
                    }.onSuccess { pairing ->
                        desktopPin = pairing.pin
                        BleServerManager.prepareFirstPairing(pairing.pin, pairing.sessionId)
                        BleServerManager.startAdvertising(context)
                        qrAcceptedMessage = "Desktop QR accepted. Your phone is now visible to the paired desktop."
                    }.onFailure { error ->
                        pairingError = error.message ?: "The QR code could not be used."
                    }
                }
            }
            .addOnCanceledListener { isQrScanning = false }
            .addOnFailureListener { error ->
                isQrScanning = false
                pairingError = error.message ?: "QR scanner unavailable. Enter the PIN manually."
            }
    }

    val startLanQrScan: () -> Unit = {
        pairingError = ""
        isQrScanning = true
        qrScanner.startScan()
            .addOnSuccessListener { barcode ->
                isQrScanning = false
                val rawValue = barcode.rawValue.orEmpty()
                if (rawValue.contains("|bluetooth|")) {
                    if (!isBluetoothEnabled(context)) {
                        pairingError = "This is a Bluetooth QR. Turn on Bluetooth, then scan it again."
                    } else {
                        runCatching { BluetoothPairingQrParser.parse(rawValue) }
                            .onSuccess { pairing ->
                                desktopPin = pairing.pin
                                BleServerManager.prepareFirstPairing(pairing.pin, pairing.sessionId)
                                BleServerManager.startAdvertising(context)
                                qrAcceptedMessage = "Bluetooth QR accepted. Your phone is now visible to the paired desktop."
                            }
                            .onFailure { pairingError = it.message ?: "The QR code could not be used." }
                    }
                } else if (LanSyncManager.pairFromQr(context, rawValue)) {
                    qrAcceptedMessage = "Desktop QR accepted. Connecting through the local network now."
                } else {
                    pairingError = LanSyncManager.syncLog
                }
            }
            .addOnCanceledListener { isQrScanning = false }
            .addOnFailureListener { error ->
                isQrScanning = false
                pairingError = error.message ?: "WLAN QR scanner unavailable."
            }
    }

    val bluetoothEnableLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.StartActivityForResult()
    ) {
        if (isBluetoothEnabled(context)) {
            startDesktopQrScan()
        } else {
            pairingError = "Bluetooth must be turned on before scanning the desktop QR."
        }
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
    val pushPinRequired = DatabaseHelper.getPayload()?.pushPinRequired ?: true
    val lanConnected = LanSyncManager.isConnected
    val lanPaired = LanSyncManager.isPaired

    if (qrAcceptedMessage.isNotBlank()) {
        AlertDialog(
            onDismissRequest = { qrAcceptedMessage = "" },
            title = { Text("QR code accepted") },
            text = { Text(qrAcceptedMessage) },
            confirmButton = {
                Button(onClick = { qrAcceptedMessage = "" }) { Text("Continue") }
            },
        )
    }
    val effectiveAuthorized = lanConnected || isAuthorized
    val effectiveSyncLog = if (lanPaired) LanSyncManager.syncLog else syncLog

    val isPaired = BleServerManager.isPaired
    val pairedDesktopName = BleServerManager.pairedDesktopName
    val linkQuality = BleServerManager.linkQuality
    val roundTripMs = BleServerManager.roundTripMs
    val connectionProgress = BleServerManager.connectionProgress
    val connectionProgressLabel = BleServerManager.connectionProgressLabel
    val animatedProgress by animateFloatAsState(connectionProgress / 100f, label = "connection-progress")
    val fullySynced = lanConnected || (connectionState.equals("Synced", ignoreCase = true) && connectionProgress >= 100)
    var wasFullySynced by remember { mutableStateOf(fullySynced) }
    var showSyncCompleteDialog by rememberSaveable { mutableStateOf(false) }

    LaunchedEffect(fullySynced) {
        if (fullySynced && !wasFullySynced) {
            wasFullySynced = true
            showSyncCompleteDialog = true
            delay(5_000)
            showSyncCompleteDialog = false
            onSynced()
        } else if (!fullySynced) {
            wasFullySynced = false
        }
    }

    if (showSyncCompleteDialog) {
        AlertDialog(
            onDismissRequest = {},
            title = { Text("Sync complete") },
            text = {
                Text("Desktop and mobile app now synced, proceeding to Dashboard")
            },
            confirmButton = {
                Text("Opening Dashboard in 5 seconds…", fontWeight = FontWeight.SemiBold)
            },
        )
    }

    if (showBluetoothEnablePrompt) {
        AlertDialog(
            onDismissRequest = { showBluetoothEnablePrompt = false },
            title = { Text("Turn on Bluetooth?") },
            text = {
                Text("Bluetooth is off. Turn it on before opening the scanner for the Desktop Bluetooth QR code.")
            },
            confirmButton = {
                Button(
                    onClick = {
                        showBluetoothEnablePrompt = false
                        bluetoothEnableLauncher.launch(Intent(BluetoothAdapter.ACTION_REQUEST_ENABLE))
                    }
                ) {
                    Text("Turn On and Scan")
                }
            },
            dismissButton = {
                TextButton(onClick = { showBluetoothEnablePrompt = false }) {
                    Text("Not Now")
                }
            }
        )
    }

    if (showPushAuthorization) {
        AlertDialog(
            onDismissRequest = {
                showPushAuthorization = false
                pushPin = ""
                pushError = ""
            },
            title = { Text("Authorize grade push") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text(
                        if (pushPinRequired) {
                            "Enter your desktop profile PIN. The paired desktop will validate and save the pending grades automatically—no action is needed on the desktop."
                        } else {
                            "The paired desktop profile has no PIN enabled. Confirm to save the pending grades automatically."
                        }
                    )
                    if (pushPinRequired) {
                        OutlinedTextField(
                            value = pushPin,
                            onValueChange = {
                                pushPin = it.filter(Char::isDigit).take(6)
                                pushError = ""
                            },
                            modifier = Modifier.fillMaxWidth(),
                            label = { Text("6-digit desktop profile PIN") },
                            singleLine = true,
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
                            visualTransformation = PasswordVisualTransformation(),
                            isError = pushError.isNotBlank(),
                            supportingText = if (pushError.isNotBlank()) ({ Text(pushError) }) else null,
                        )
                    }
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        val accepted = if (lanConnected) {
                            LanSyncManager.pushChanges(context, if (pushPinRequired) pushPin else "")
                        } else {
                            BleServerManager.syncScoresToDesktop(context, if (pushPinRequired) pushPin else "")
                        }
                        if (accepted) {
                            showPushAuthorization = false
                            pushPin = ""
                            pushError = ""
                        } else {
                            pushError = if (lanConnected) LanSyncManager.syncLog else BleServerManager.syncLog
                        }
                    },
                    enabled = !pushPinRequired || pushPin.length == 6,
                ) {
                    Text("Push to Desktop")
                }
            },
            dismissButton = {
                TextButton(onClick = {
                    showPushAuthorization = false
                    pushPin = ""
                    pushError = ""
                }) {
                    Text("Cancel")
                }
            },
        )
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Desktop Connection", fontWeight = FontWeight.Bold) },
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
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(
                    containerColor = if (lanConnected) Color(0xFFE8F5E9) else MaterialTheme.colorScheme.surfaceVariant,
                ),
            ) {
                Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text("Wi-Fi / Local Network", fontWeight = FontWeight.ExtraBold, fontSize = 17.sp)
                            Text(
                                LanSyncManager.connectionState,
                                color = if (lanConnected) Color(0xFF2E7D32) else MaterialTheme.colorScheme.onSurfaceVariant,
                                fontWeight = FontWeight.SemiBold,
                            )
                        }
                        AssistChip(
                            onClick = {},
                            label = { Text(if (lanConnected) "LIVE" else if (lanPaired) "RECONNECTING" else "NOT PAIRED") },
                        )
                    }
                    Text(
                        if (lanConnected) "Desktop changes arrive automatically. Mobile changes use your profile PIN and save immediately."
                        else "Pair once while both devices use the same Wi-Fi or phone hotspot.",
                        fontSize = 12.sp,
                    )
                    if (LanSyncManager.activeDesktopAddress.isNotBlank()) {
                        Text(
                            "Desktop: ${LanSyncManager.activeDesktopAddress}",
                            fontSize = 12.sp,
                            fontWeight = FontWeight.SemiBold,
                        )
                    }
                    if (LanSyncManager.desktopInterfaces.isNotBlank()) {
                        Text(
                            LanSyncManager.desktopInterfaces,
                            fontSize = 11.sp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    LanSyncManager.roundTripMs?.let { latency ->
                        Text(
                            "Local round-trip: $latency ms",
                            fontSize = 11.sp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    if (LanSyncManager.diagnosticMessage.isNotBlank()) {
                        Text(
                            LanSyncManager.diagnosticMessage,
                            fontSize = 11.sp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button(onClick = startLanQrScan, enabled = !isQrScanning, modifier = Modifier.weight(1f)) {
                            Text(if (lanPaired) "Scan New WLAN QR" else "Scan WLAN QR")
                        }
                        if (lanPaired) {
                            TextButton(onClick = { LanSyncManager.forget(context) }) { Text("Forget") }
                        }
                    }
                    LanSyncManager.updateInfo?.let { update ->
                        HorizontalDivider()
                        Text("Mobile update ${update.versionName} available", fontWeight = FontWeight.Bold)
                        if (update.releaseNotes.isNotBlank()) Text(update.releaseNotes, fontSize = 12.sp)
                        if (LanSyncManager.updateProgress in 1..99) {
                            LinearProgressIndicator(
                                progress = { LanSyncManager.updateProgress / 100f },
                                modifier = Modifier.fillMaxWidth(),
                            )
                            Text("Downloading ${LanSyncManager.updateProgress}%", fontSize = 12.sp)
                        } else {
                            Button(onClick = { LanSyncManager.downloadAndInstallUpdate(context) }) {
                                Text("Download & Install Update")
                            }
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.height(16.dp))

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
                            if (isBluetoothEnabled(context)) {
                                startDesktopQrScan()
                            } else {
                                showBluetoothEnablePrompt = true
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
                        pushError = ""
                        showPushAuthorization = true
                    },
                    enabled = effectiveAuthorized && hasUnsynced,
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
                        if (hasUnsynced) "Authorize & Push Grades" else "All Scores Synced",
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
                                text = effectiveSyncLog,
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

private fun isBluetoothEnabled(context: Context): Boolean {
    return runCatching {
        val manager = context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
        manager?.adapter?.isEnabled == true
    }.getOrDefault(false)
}
