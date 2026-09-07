package com.example.eclassrecordmobile.ui

import android.Manifest
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Bluetooth
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Wifi
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
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
import com.example.eclassrecordmobile.ui.design.EClassTopBar
import com.example.eclassrecordmobile.ui.design.DepthIcon
import com.example.eclassrecordmobile.ui.design.LocalFluidLayout
import com.example.eclassrecordmobile.ui.design.themePanel
import com.example.eclassrecordmobile.theme.NeonBlue
import com.example.eclassrecordmobile.theme.NeonGreen
import com.example.eclassrecordmobile.theme.NeonPurple
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.codescanner.GmsBarcodeScannerOptions
import com.google.mlkit.vision.codescanner.GmsBarcodeScanning
import kotlinx.coroutines.delay
import org.json.JSONObject

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
    var showPushReview by rememberSaveable { mutableStateOf(false) }
    var selectedPushChangeIds by rememberSaveable { mutableStateOf(listOf<String>()) }
    var pushTransport by rememberSaveable { mutableStateOf("lan") }
    var pushPin by rememberSaveable { mutableStateOf("") }
    var pushError by rememberSaveable { mutableStateOf("") }
    var pendingLanQr by rememberSaveable { mutableStateOf("") }
    var pairingPin by rememberSaveable { mutableStateOf("") }
    var pairingInProgress by rememberSaveable { mutableStateOf(false) }
    var showUnlinkConfirmation by rememberSaveable { mutableStateOf(false) }
    var profilePendingDeletion by rememberSaveable { mutableStateOf("") }
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
                if (isLanPairingQr(rawValue)) {
                    if (rawValue.trim().startsWith("{")) {
                        pendingLanQr = rawValue
                        pairingPin = ""
                    } else if (LanSyncManager.pairFromQr(context, rawValue)) {
                        qrAcceptedMessage = "Desktop QR accepted. Connecting through the local network now."
                    } else {
                        pairingError = LanSyncManager.syncLog
                    }
                } else {
                    runCatching {
                        BluetoothPairingQrParser.parse(rawValue)
                    }.onSuccess { pairing ->
                        desktopPin = pairing.pin
                        BleServerManager.prepareFirstPairing(context, pairing)
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
                if (isBluetoothPairingQr(rawValue)) {
                    if (!isBluetoothEnabled(context)) {
                        pairingError = "This is a Bluetooth QR. Turn on Bluetooth, then scan it again."
                    } else {
                        runCatching { BluetoothPairingQrParser.parse(rawValue) }
                            .onSuccess { pairing ->
                                desktopPin = pairing.pin
                                BleServerManager.prepareFirstPairing(context, pairing)
                                BleServerManager.startAdvertising(context)
                                qrAcceptedMessage = "Bluetooth QR accepted. Your phone is now visible to the paired desktop."
                            }
                            .onFailure { pairingError = it.message ?: "The QR code could not be used." }
                    }
                } else if (rawValue.trim().startsWith("{") && isLanPairingQr(rawValue)) {
                    pendingLanQr = rawValue
                    pairingPin = ""
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

    val beginPushReview: (String) -> Unit = { transport ->
        pushTransport = transport
        pushError = ""
        val review = DatabaseHelper.reviewPendingChanges()
        selectedPushChangeIds = review.safe.map { it.changeId }
        showPushReview = true
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
    val pairedProfiles = LanSyncManager.pairedProfiles
    val bluetoothProfiles = BleServerManager.pairedProfiles
    val activeProfileKey = DatabaseHelper.getActiveProfileKey()
    val lanStrengthProgress by animateFloatAsState(LanSyncManager.linkStrength / 100f, label = "lan-link-strength")
    val linkCardDepth by animateFloatAsState(if (lanConnected) 1.01f else 1f, label = "link-card-depth")

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
    if (pendingLanQr.isNotBlank()) {
        AlertDialog(
            onDismissRequest = {
                if (!pairingInProgress) {
                    pendingLanQr = ""
                    pairingPin = ""
                }
            },
            title = { Text("Authorize desktop profile") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text("Enter the six-digit PIN for the profile shown on the desktop. The PIN is verified before this phone saves the connection.")
                    OutlinedTextField(
                        value = pairingPin,
                        onValueChange = {
                            pairingPin = it.filter(Char::isDigit).take(6)
                            pairingError = ""
                        },
                        modifier = Modifier.fillMaxWidth(),
                        label = { Text("Desktop profile PIN") },
                        singleLine = true,
                        enabled = !pairingInProgress,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
                        visualTransformation = PasswordVisualTransformation(),
                    )
                    if (pairingError.isNotBlank()) {
                        Text(pairingError, color = MaterialTheme.colorScheme.error, fontSize = 12.sp)
                    }
                }
            },
            confirmButton = {
                Button(
                    enabled = pairingPin.length == 6 && !pairingInProgress,
                    onClick = {
                        pairingInProgress = true
                        val qr = pendingLanQr
                        LanSyncManager.authorizeAndPair(context, qr, pairingPin) { success, message ->
                            Handler(Looper.getMainLooper()).post {
                                pairingInProgress = false
                                if (success) {
                                    pendingLanQr = ""
                                    pairingPin = ""
                                    pairingError = ""
                                    qrAcceptedMessage = "Profile authorized and saved. Connecting through Wi-Fi or phone hotspot."
                                } else {
                                    pairingError = message
                                }
                            }
                        }
                    },
                ) { Text(if (pairingInProgress) "Authorizing..." else "Authorize") }
            },
            dismissButton = {
                TextButton(
                    enabled = !pairingInProgress,
                    onClick = {
                        pendingLanQr = ""
                        pairingPin = ""
                    },
                ) { Text("Cancel") }
            },
        )
    }
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

    if (showUnlinkConfirmation) {
        AlertDialog(
            onDismissRequest = { showUnlinkConfirmation = false },
            title = { Text("Unlink this desktop profile?") },
            text = { Text("Automatic reconnection will stop for this profile. Encrypted offline records and pending mobile changes will remain on this phone.") },
            confirmButton = {
                Button(onClick = {
                    LanSyncManager.forget(context)
                    showUnlinkConfirmation = false
                }) { Text("Unlink") }
            },
            dismissButton = { TextButton(onClick = { showUnlinkConfirmation = false }) { Text("Cancel") } },
        )
    }

    if (profilePendingDeletion.isNotBlank()) {
        val profileName = pairedProfiles.find { it.profileKey == profilePendingDeletion }?.profileName
            ?: bluetoothProfiles.find { it.profileKey == profilePendingDeletion }?.profileName
            ?: "this profile"
        AlertDialog(
            onDismissRequest = { profilePendingDeletion = "" },
            title = { Text("Delete $profileName?") },
            text = {
                Text("This permanently deletes this profile's pairing credentials, mobile PIN, downloaded class records, and pending mobile changes from this phone. The desktop profile is not deleted.")
            },
            confirmButton = {
                Button(
                    onClick = {
                        val deleted = LanSyncManager.deleteProfile(context, profilePendingDeletion)
                        if (!deleted) pairingError = LanSyncManager.syncLog
                        profilePendingDeletion = ""
                    },
                    colors = ButtonDefaults.buttonColors(
                        containerColor = MaterialTheme.colorScheme.error,
                        contentColor = MaterialTheme.colorScheme.onError,
                    ),
                ) { Text("Delete permanently") }
            },
            dismissButton = {
                TextButton(onClick = { profilePendingDeletion = "" }) { Text("Cancel") }
            },
        )
    }

    if (showPushReview) {
        val review = remember(DatabaseHelper.observedRevision, showPushReview) {
            DatabaseHelper.reviewPendingChanges()
        }
        PushChangeReviewDialog(
            review = review,
            selectedIds = selectedPushChangeIds.toSet(),
            onSelectedIdsChange = { selectedPushChangeIds = it.toList() },
            onConfirm = {
                showPushReview = false
                showPushAuthorization = true
            },
            onDismiss = { showPushReview = false },
        )
    }

    if (showPushAuthorization) {
        val reviewedCount = selectedPushChangeIds.size
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
                            if (pushTransport == "lan") {
                                "Enter your desktop profile PIN. $reviewedCount reviewed change${if (reviewedCount == 1) "" else "s"} will be sent primarily through Wi-Fi or the phone hotspot."
                            } else {
                                "Enter your desktop profile PIN. Bluetooth will be used only as the fallback because this profile has no WLAN pairing."
                            }
                        } else {
                            if (pushTransport == "lan") {
                                "Confirm to push $reviewedCount reviewed change${if (reviewedCount == 1) "" else "s"} through Wi-Fi or the phone hotspot."
                            } else {
                                "Confirm to push $reviewedCount reviewed change${if (reviewedCount == 1) "" else "s"} through the Bluetooth fallback."
                            }
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
                        val accepted = if (pushTransport == "lan") {
                            LanSyncManager.pushChanges(
                                context,
                                if (pushPinRequired) pushPin else "",
                                selectedPushChangeIds,
                            )
                        } else {
                            BleServerManager.syncScoresToDesktop(
                                context,
                                if (pushPinRequired) pushPin else "",
                                selectedPushChangeIds,
                            )
                        }
                        if (accepted) {
                            showPushAuthorization = false
                            pushPin = ""
                            pushError = ""
                        } else {
                            pushError = if (pushTransport == "lan") LanSyncManager.syncLog else BleServerManager.syncLog
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
                    showPushReview = true
                    pushPin = ""
                    pushError = ""
                }) {
                    Text("Back to review")
                }
            },
        )
    }

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            EClassTopBar(
                title = "Desktop Connection",
                subtitle = "Wi-Fi / hotspot first · Bluetooth fallback",
                onBack = onBack,
            )
        },
        modifier = modifier
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .padding(LocalFluidLayout.current.gutter)
                .verticalScroll(rememberScrollState()),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            if (pairedProfiles.isNotEmpty() || bluetoothProfiles.isNotEmpty()) {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(22.dp),
                    colors = CardDefaults.cardColors(containerColor = themePanel()),
                    border = BorderStroke(1.dp, NeonPurple.copy(alpha = 0.34f)),
                ) {
                    Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text("Saved desktop profiles", fontWeight = FontWeight.ExtraBold, fontSize = 17.sp)
                        Text(
                            "Each profile keeps its own encrypted offline data and pending changes. Use the trash button to remove one from this phone.",
                            fontSize = 12.sp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        pairedProfiles.forEach { profile ->
                            Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                                FilterChip(
                                    selected = profile.profileKey == activeProfileKey,
                                    onClick = { LanSyncManager.selectProfile(context, profile.profileKey) },
                                    label = {
                                        Text(
                                            profile.profileName +
                                                profile.schoolYear.takeIf(String::isNotBlank)?.let { " - " + it }.orEmpty()
                                        )
                                    },
                                    modifier = Modifier.weight(1f),
                                )
                                IconButton(onClick = { profilePendingDeletion = profile.profileKey }) {
                                    Icon(Icons.Default.Delete, contentDescription = "Delete ${profile.profileName} profile", tint = MaterialTheme.colorScheme.error)
                                }
                            }
                        }
                        bluetoothProfiles
                            .filterNot { bluetooth -> pairedProfiles.any { it.profileKey == bluetooth.profileKey } }
                            .forEach { profile ->
                                Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                                    FilterChip(
                                        selected = profile.profileKey == activeProfileKey,
                                        onClick = { BleServerManager.selectProfile(context, profile.profileKey) },
                                        label = {
                                            Text(
                                                profile.profileName +
                                                    profile.schoolYear.takeIf(String::isNotBlank)?.let { " - " + it }.orEmpty() +
                                                    " (Bluetooth)"
                                            )
                                        },
                                        modifier = Modifier.weight(1f),
                                    )
                                    IconButton(onClick = { profilePendingDeletion = profile.profileKey }) {
                                        Icon(Icons.Default.Delete, contentDescription = "Delete ${profile.profileName} profile", tint = MaterialTheme.colorScheme.error)
                                    }
                                }
                            }
                    }
                }
                Spacer(modifier = Modifier.height(16.dp))
            }
            Card(
                modifier = Modifier.fillMaxWidth().graphicsLayer {
                    scaleX = linkCardDepth
                    scaleY = linkCardDepth
                    rotationX = if (lanConnected) 0.6f else 0f
                    shadowElevation = if (lanConnected) 24f else 10f
                },
                shape = RoundedCornerShape(22.dp),
                border = BorderStroke(1.dp, if (lanConnected) NeonGreen.copy(alpha = 0.55f) else NeonPurple.copy(alpha = 0.30f)),
                colors = CardDefaults.cardColors(
                    containerColor = themePanel(),
                ),
            ) {
                Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        DepthIcon(
                            icon = Icons.Default.Wifi,
                            contentDescription = "Wi-Fi or phone hotspot",
                            selected = lanConnected,
                            size = 46.dp,
                        )
                        Spacer(Modifier.width(12.dp))
                        Column(modifier = Modifier.weight(1f)) {
                            Text("Wi-Fi / Phone Hotspot", fontWeight = FontWeight.ExtraBold, fontSize = 17.sp)
                            AnimatedContent(
                                targetState = LanSyncManager.connectionState,
                                transitionSpec = { fadeIn() togetherWith fadeOut() },
                                label = "wlan-state",
                            ) { state ->
                                Text(state, color = if (lanConnected) NeonGreen else MaterialTheme.colorScheme.onSurfaceVariant, fontWeight = FontWeight.SemiBold)
                            }
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
                    Surface(
                        modifier = Modifier.fillMaxWidth().graphicsLayer { shadowElevation = 12f },
                        shape = RoundedCornerShape(16.dp),
                        color = themePanel(raised = true),
                        border = BorderStroke(1.dp, if (lanConnected) NeonGreen.copy(alpha = 0.28f) else MaterialTheme.colorScheme.outlineVariant),
                        tonalElevation = 0.dp,
                    ) {
                        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                Text("Desktop link", fontWeight = FontWeight.Bold)
                                Text(
                                    if (lanPaired) "${LanSyncManager.linkQuality} · ${LanSyncManager.linkStrength}%" else "Not linked",
                                    fontWeight = FontWeight.ExtraBold,
                                    color = if (lanConnected) NeonGreen else MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                            LinearProgressIndicator(
                                progress = { lanStrengthProgress },
                                modifier = Modifier.fillMaxWidth().height(8.dp).clip(RoundedCornerShape(8.dp)),
                                color = when {
                                    LanSyncManager.linkStrength >= 75 -> Color(0xFF16A34A)
                                    LanSyncManager.linkStrength >= 45 -> Color(0xFFF59E0B)
                                    else -> Color(0xFFEF4444)
                                },
                            )
                            Text(
                                if (LanSyncManager.autoReconnectEnabled) "Trusted automatic reconnection is on" else "Automatic reconnection is paused",
                                fontSize = 11.sp,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
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
                            Text(if (lanPaired) "Add Profile QR" else "Scan Wi-Fi / Hotspot QR")
                        }
                        if (lanPaired) {
                            TextButton(onClick = { showUnlinkConfirmation = true }) { Text("Unlink") }
                        }
                    }
                    if (lanPaired) {
                        Button(
                            onClick = { beginPushReview("lan") },
                            enabled = hasUnsynced,
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(56.dp),
                            shape = RoundedCornerShape(12.dp),
                            colors = ButtonDefaults.buttonColors(
                                containerColor = NeonGreen,
                                contentColor = Color(0xFF03140A),
                                disabledContainerColor = NeonGreen.copy(alpha = 0.4f),
                            ),
                        ) {
                            Icon(Icons.Default.Refresh, contentDescription = "Push through Wi-Fi or hotspot")
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(
                                if (hasUnsynced) "Push via Wi-Fi / Hotspot" else "All Changes Synced",
                                fontSize = 16.sp,
                                fontWeight = FontWeight.Bold,
                            )
                        }
                    }
                    LanSyncManager.updateInfo?.let { update ->
                        HorizontalDivider()
                        Text("Mobile update ${update.versionName} available", fontWeight = FontWeight.Bold)
                        Text(
                            "This phone: ${LanSyncManager.phoneVersionName.ifBlank { "unknown" }} (build ${LanSyncManager.phoneVersionCode})\nDesktop package: ${update.versionName} (build ${update.versionCode})",
                            fontSize = 12.sp,
                        )
                        if (update.releaseNotes.isNotBlank()) Text(update.releaseNotes, fontSize = 12.sp)
                        if (LanSyncManager.updateProgress in 1..99) {
                            LinearProgressIndicator(
                                progress = { LanSyncManager.updateProgress / 100f },
                                modifier = Modifier.fillMaxWidth(),
                            )
                            Text("Desktop is sending the package ${LanSyncManager.updateProgress}%", fontSize = 12.sp)
                        } else if (LanSyncManager.isUpdateReady) {
                            Button(onClick = { LanSyncManager.installReadyUpdate(context) }) { Text("Update Now") }
                            UpdateReminderButtons { option ->
                                LanSyncManager.deferReadyUpdate(context, option.delayMs)
                            }
                            Text("The verified update is stored safely and can be installed whenever you are ready.", fontSize = 11.sp)
                        } else {
                            Text("The desktop has a newer Android package. Ask it to send the file over Wi-Fi or hotspot after the version check.", fontSize = 12.sp)
                            Button(onClick = { LanSyncManager.requestUpdateFromDesktop(context) }) {
                                Text("Ask desktop to send update")
                            }
                            Button(onClick = { LanSyncManager.checkForUpdate(context) }) { Text("Check desktop version") }
                        }
                    } ?: run {
                        if (lanPaired) {
                            HorizontalDivider()
                            Text("This phone is ${LanSyncManager.phoneVersionName.ifBlank { "the installed app" }}", fontSize = 12.sp)
                            Button(
                                onClick = { LanSyncManager.checkForUpdate(context) },
                                enabled = lanConnected,
                            ) { Text("Check desktop version") }
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
                            "Bluetooth is an optional fallback when Wi-Fi or a phone hotspot is unavailable.",
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
                    shape = RoundedCornerShape(22.dp),
                    colors = CardDefaults.cardColors(containerColor = themePanel()),
                    border = BorderStroke(1.dp, if (isAuthorized) NeonBlue.copy(alpha = 0.45f) else MaterialTheme.colorScheme.outlineVariant),
                ) {
                    Column(
                        modifier = Modifier.padding(16.dp),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            DepthIcon(
                                icon = Icons.Default.Bluetooth,
                                contentDescription = "Bluetooth fallback",
                                selected = isAuthorized,
                                size = 46.dp,
                            )
                            Spacer(Modifier.width(12.dp))
                            Column {
                                Text("Bluetooth fallback", fontWeight = FontWeight.ExtraBold, fontSize = 17.sp)
                                Text("Use when Wi-Fi or hotspot is unavailable", fontSize = 11.sp)
                            }
                        }
                        Spacer(modifier = Modifier.height(14.dp))
                        Text(
                            text = "STATUS: $connectionState",
                            fontSize = 18.sp,
                            fontWeight = FontWeight.ExtraBold,
                            color = if (isAuthorized) NeonGreen else MaterialTheme.colorScheme.onSurfaceVariant
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

                // Bluetooth is only offered for pushes when this profile has no WLAN pairing.
                if (!lanConnected) {
                Button(
                    onClick = { beginPushReview("bluetooth") },
                    enabled = isAuthorized && hasUnsynced,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(56.dp),
                    shape = RoundedCornerShape(12.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = NeonGreen,
                        contentColor = Color(0xFF03140A),
                        disabledContainerColor = NeonGreen.copy(alpha = 0.4f)
                    )
                ) {
                    Icon(Icons.Default.Refresh, contentDescription = "Sync")
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        if (hasUnsynced) "Push via Bluetooth (Fallback)" else "All Changes Synced",
                        fontSize = 16.sp,
                        fontWeight = FontWeight.Bold
                    )
                }
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
                        .height(240.dp),
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

private fun pairingTransport(rawValue: String): String {
    val value = rawValue.trim()
    if (value.startsWith("{")) {
        return runCatching { JSONObject(value).optString("transport") }.getOrDefault("")
    }
    return when {
        value.contains("|wlan|") -> "wlan"
        value.contains("|bluetooth|") -> "bluetooth"
        else -> ""
    }
}

private fun isLanPairingQr(rawValue: String) = pairingTransport(rawValue) == "wlan"

private fun isBluetoothPairingQr(rawValue: String) = pairingTransport(rawValue) == "bluetooth"

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
