package com.example.eclassrecordmobile.data

import android.annotation.SuppressLint
import android.bluetooth.*
import android.bluetooth.le.AdvertiseCallback
import android.bluetooth.le.AdvertiseData
import android.bluetooth.le.AdvertiseSettings
import android.content.Context
import android.os.Handler
import android.os.Looper
import android.os.ParcelUuid
import android.util.Log
import android.util.Base64
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import org.json.JSONObject
import java.io.ByteArrayInputStream
import java.util.zip.GZIPInputStream
import java.nio.charset.StandardCharsets
import java.util.*
import java.time.Instant

@SuppressLint("MissingPermission")
object BleServerManager {
    private const val TAG = "BleServerManager"
    private val outboundJson = Json { encodeDefaults = true }

    val SERVICE_UUID: UUID = UUID.fromString("e3c1a8e0-0251-412e-a4b5-559d871fbdf2")
    val HANDSHAKE_CHAR_UUID: UUID = UUID.fromString("e3c1a8e3-0251-412e-a4b5-559d871fbdf2")
    val RX_CHAR_UUID: UUID = UUID.fromString("e3c1a8e1-0251-412e-a4b5-559d871fbdf2")
    val TX_CHAR_UUID: UUID = UUID.fromString("e3c1a8e2-0251-412e-a4b5-559d871fbdf2")
    val CCCD_UUID: UUID = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb")

    var isAdvertising by mutableStateOf(false)
    var connectionState by mutableStateOf("Disconnected")
    var deviceCode by mutableStateOf("") // e.g. "8F9B"
    var pinCode by mutableStateOf("")
    var isAuthorized by mutableStateOf(false)
    var syncLog by mutableStateOf("No sync logs yet.")
    var pairedDesktopName by mutableStateOf("")
    var isPaired by mutableStateOf(false)
    var linkQuality by mutableStateOf("Offline")
    var roundTripMs by mutableStateOf<Long?>(null)
    var lastHeartbeatAt by mutableStateOf("")
    var connectionProgress by mutableStateOf(0)
    var connectionProgressLabel by mutableStateOf("Ready")


    private var bluetoothManager: BluetoothManager? = null
    private var bluetoothAdapter: BluetoothAdapter? = null
    private var bluetoothGattServer: BluetoothGattServer? = null
    private var advertiser: android.bluetooth.le.BluetoothLeAdvertiser? = null
    private var connectedDevice: BluetoothDevice? = null
    private var contextRef: Context? = null
    private var handshakeResponse = """{"status":"idle"}"""
    private val mainHandler = Handler(Looper.getMainLooper())
    private var advertisingRetryCount = 0
    private var pairingDiscoveryTag = ""
    private var isPreparingAdvertising = false
    private var pendingAdvertiseSettings: AdvertiseSettings? = null
    private var pendingAdvertiseData: AdvertiseData? = null
    private var pendingScanResponse: AdvertiseData? = null

    // Chunking buffers
    private val rxBuffer = StringBuilder()
    private var expectedLength = 0
    private var isReceiving = false
    private var isReceivingBase64 = false
    private var lastPayloadWasChangeResult = false
    private var lastPayloadError = ""

    private data class TxFrame(val label: String, val chunks: List<ByteArray>)

    // BLE notifications must be serialized and advanced by onNotificationSent.
    private val pendingTxFrames: Queue<TxFrame> = LinkedList()
    private var activeTxFrame: TxFrame? = null
    private var activeTxIndex = 0
    private var txNotificationInFlight = false
    private var txRetryCount = 0
    private var negotiatedMtu = 23

    fun init(context: Context) {
        contextRef = context.applicationContext
        bluetoothManager = context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
        bluetoothAdapter = bluetoothManager?.adapter
        deviceCode = BluetoothPairingStore.deviceCode(context)
        BluetoothPairingStore.load(context)?.let {
            isPaired = true
            pairedDesktopName = it.desktopName
        }
        linkQuality = if (isPaired) "Ready to reconnect" else "Not paired"
        connectionProgress = if (isPaired) 10 else 0
        connectionProgressLabel = if (isPaired) "Trusted desktop remembered" else "Ready to pair"
    }

    fun prepareFirstPairing(pin: String, sessionId: String = "") {
        require(pin.matches(Regex("\\d{6}"))) { "Enter the six-digit PIN shown on the desktop." }
        pinCode = pin
        pairingDiscoveryTag = sessionId.replace("-", "").take(6).uppercase(Locale.ROOT)
        syncLog = "Pairing code saved. Waiting for the desktop to connect."
        connectionProgress = 12
        connectionProgressLabel = "Pairing details ready"
    }

    fun forgetDesktop(context: Context) {
        BluetoothPairingStore.clear(context)
        isPaired = false
        pairedDesktopName = ""
        pinCode = ""
        pairingDiscoveryTag = ""
        linkQuality = "Not paired"
        connectionProgress = 0
        connectionProgressLabel = "Ready to pair"
    }

    fun ensureAdvertising(context: Context) {
        contextRef = context.applicationContext
        if (!isPaired && pinCode.isBlank()) return
        if (isAdvertising) {
            if (!isAuthorized) {
                connectionState = "Advertising..."
                connectionProgress = connectionProgress.coerceAtLeast(35)
                connectionProgressLabel = if (isPaired) "Waiting for trusted desktop" else "Waiting for desktop"
            }
            return
        }
        startAdvertising(context.applicationContext)
    }

    fun startAdvertising(context: Context) {
        contextRef = context.applicationContext
        if (isAdvertising || isPreparingAdvertising) return
        val adapter = bluetoothAdapter ?: return
        if (!adapter.isEnabled) {
            connectionState = "Bluetooth Disabled"
            return
        }

        isAuthorized = false
        connectionState = "Advertising..."
        syncLog = "Broadcasting started. Waiting for desktop app to connect..."
        connectionProgress = 20
        connectionProgressLabel = "Preparing secure Bluetooth service"
        isPreparingAdvertising = true

        // Keep the advertised name short for OEMs with a strict legacy payload limit.
        val advertisedCode = pairingDiscoveryTag.ifBlank { deviceCode }
        runCatching { adapter.name = "EC-$advertisedCode" }

        advertiser = adapter.bluetoothLeAdvertiser
        if (advertiser == null) {
            connectionState = "Bluetooth advertising unavailable"
            connectionProgressLabel = "This phone cannot advertise Bluetooth LE"
            return
        }
        val settings = AdvertiseSettings.Builder()
            .setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_LOW_LATENCY)
            .setConnectable(true)
            .setTimeout(0)
            .setTxPowerLevel(AdvertiseSettings.ADVERTISE_TX_POWER_HIGH)
            .build()

        val data = AdvertiseData.Builder()
            .setIncludeDeviceName(false)
            .addServiceUuid(ParcelUuid(SERVICE_UUID))
            .build()
        val scanResponse = AdvertiseData.Builder()
            .setIncludeDeviceName(true)
            .build()

        pendingAdvertiseSettings = settings
        pendingAdvertiseData = data
        pendingScanResponse = scanResponse
        if (!setupGattServer(context)) {
            failAdvertisingPreparation("Bluetooth sync service could not be registered")
        }
    }

    private fun startPreparedAdvertising() {
        val settings = pendingAdvertiseSettings ?: return
        val data = pendingAdvertiseData ?: return
        val scanResponse = pendingScanResponse ?: return
        pendingAdvertiseSettings = null
        pendingAdvertiseData = null
        pendingScanResponse = null
        isPreparingAdvertising = false
        advertiser?.startAdvertising(settings, data, scanResponse, advertiseCallback)
        isAdvertising = true
    }

    private fun failAdvertisingPreparation(message: String) {
        isPreparingAdvertising = false
        isAdvertising = false
        pendingAdvertiseSettings = null
        pendingAdvertiseData = null
        pendingScanResponse = null
        closeGattServer()
        connectionState = "Bluetooth advertising unavailable"
        connectionProgress = 0
        connectionProgressLabel = message
    }

    fun stopAdvertising() {
        advertiser?.stopAdvertising(advertiseCallback)
        isPreparingAdvertising = false
        pendingAdvertiseSettings = null
        pendingAdvertiseData = null
        pendingScanResponse = null
        closeGattServer()
        isAdvertising = false
        connectionState = "Disconnected"
        isAuthorized = false
        connectedDevice = null
        connectionProgress = 0
        connectionProgressLabel = "Connection stopped"
    }

    private val advertiseCallback = object : AdvertiseCallback() {
        override fun onStartSuccess(settingsInEffect: AdvertiseSettings?) {
            advertisingRetryCount = 0
            Log.d(TAG, "BLE advertising started successfully")
            connectionState = "Advertising..."
            connectionProgress = 35
            connectionProgressLabel = if (isPaired) "Waiting for trusted desktop" else "Waiting for desktop"
        }

        override fun onStartFailure(errorCode: Int) {
            Log.e(TAG, "BLE advertising failed: $errorCode")
            connectionState = "Advertising Failed ($errorCode)"
            isAdvertising = false
            closeGattServer()
            connectionProgress = 0
            connectionProgressLabel = "Bluetooth broadcast paused - retrying"
            val context = contextRef
            if (context != null && advertisingRetryCount < 3 && (isPaired || pinCode.isNotBlank())) {
                advertisingRetryCount += 1
                mainHandler.postDelayed(
                    { ensureAdvertising(context) },
                    1_000L * advertisingRetryCount,
                )
            }
        }
    }

    private fun setupGattServer(context: Context): Boolean {
        val manager = bluetoothManager ?: return false
        bluetoothGattServer = manager.openGattServer(context, gattServerCallback)
        if (bluetoothGattServer == null) return false

        val service = BluetoothGattService(SERVICE_UUID, BluetoothGattService.SERVICE_TYPE_PRIMARY)

        // Handshake Char
        val handshakeChar = BluetoothGattCharacteristic(
            HANDSHAKE_CHAR_UUID,
            BluetoothGattCharacteristic.PROPERTY_WRITE or BluetoothGattCharacteristic.PROPERTY_READ,
            BluetoothGattCharacteristic.PERMISSION_WRITE or BluetoothGattCharacteristic.PERMISSION_READ
        )

        // RX Char (Desktop to Mobile)
        val rxChar = BluetoothGattCharacteristic(
            RX_CHAR_UUID,
            BluetoothGattCharacteristic.PROPERTY_WRITE or BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE,
            BluetoothGattCharacteristic.PERMISSION_WRITE
        )

        // TX Char (Mobile to Desktop)
        val txChar = BluetoothGattCharacteristic(
            TX_CHAR_UUID,
            BluetoothGattCharacteristic.PROPERTY_READ or BluetoothGattCharacteristic.PROPERTY_NOTIFY,
            BluetoothGattCharacteristic.PERMISSION_READ
        )
        // Add CCCD descriptor to TX
        val descriptor = BluetoothGattDescriptor(
            CCCD_UUID,
            BluetoothGattDescriptor.PERMISSION_READ or BluetoothGattDescriptor.PERMISSION_WRITE
        )
        txChar.addDescriptor(descriptor)

        service.addCharacteristic(handshakeChar)
        service.addCharacteristic(rxChar)
        service.addCharacteristic(txChar)

        return bluetoothGattServer?.addService(service) == true
    }

    private fun handleHandshake(data: String): Boolean {
        val context = contextRef ?: return false
        val message = runCatching { JSONObject(data) }.getOrNull()
        val kind = message?.optString("kind").orEmpty()
        if (kind == "pair") {
            val suppliedPin = message?.optString("pin").orEmpty()
            val desktopId = message?.optString("desktopId").orEmpty()
            val desktopName = message?.optString("desktopName", "E-Class Record Desktop").orEmpty()
            if (pinCode.isBlank() || suppliedPin != pinCode || desktopId.isBlank()) return false
            val token = BluetoothPairingStore.newReconnectToken()
            BluetoothPairingStore.save(
                context,
                BluetoothPairing(desktopId, desktopName, token, Instant.now().toString()),
            )
            isPaired = true
            pairedDesktopName = desktopName
            handshakeResponse = JSONObject()
                .put("status", "paired")
                .put("desktopId", desktopId)
                .put("reconnectToken", token)
                .put("deviceCode", deviceCode)
                .toString()
            return true
        }
        if (kind == "reconnect") {
            val pairing = BluetoothPairingStore.load(context) ?: return false
            val valid = message?.optString("desktopId") == pairing.desktopId &&
                message.optString("reconnectToken") == pairing.reconnectToken
            if (!valid) return false
            pairedDesktopName = pairing.desktopName
            handshakeResponse = JSONObject().put("status", "reconnected").put("deviceCode", deviceCode).toString()
            return true
        }
        if (kind == "ping" && isAuthorized) {
            lastHeartbeatAt = Instant.now().toString()
            handshakeResponse = JSONObject().put("status", "pong").put("sentAt", message?.optLong("sentAt")).toString()
            return true
        }
        if (kind == "quality" && isAuthorized) {
            roundTripMs = message?.optLong("roundTripMs")
            linkQuality = message?.optString("label", "Connected").orEmpty()
            lastHeartbeatAt = Instant.now().toString()
            handshakeResponse = JSONObject().put("status", "quality-received").toString()
            return true
        }
        return data == pinCode && pinCode.isNotBlank()
    }


    private fun closeGattServer() {
        resetTxState()
        bluetoothGattServer?.clearServices()
        bluetoothGattServer?.close()
        bluetoothGattServer = null
    }

    private val gattServerCallback = object : BluetoothGattServerCallback() {
        override fun onServiceAdded(status: Int, service: BluetoothGattService?) {
            if (service?.uuid != SERVICE_UUID) return
            if (status == BluetoothGatt.GATT_SUCCESS) {
                connectionProgressLabel = "Bluetooth service ready - broadcasting"
                startPreparedAdvertising()
            } else {
                Log.e(TAG, "GATT service registration failed: $status")
                failAdvertisingPreparation("Bluetooth sync service registration failed ($status)")
            }
        }

        override fun onConnectionStateChange(device: BluetoothDevice?, status: Int, newState: Int) {
            if (newState == BluetoothProfile.STATE_CONNECTED) {
                connectedDevice = device
                connectionState = "Connected (Verifying...)"
                isAuthorized = false
                linkQuality = "Measuring..."
                connectionProgress = 55
                connectionProgressLabel = "Desktop found - verifying"
                Log.d(TAG, "Device connected: ${device?.address}")
            } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
                resetTxState()
                connectedDevice = null
                connectionState = if (isAdvertising) "Advertising..." else "Disconnected"
                isAuthorized = false
                Log.d(TAG, "Device disconnected")
                roundTripMs = null
                linkQuality = if (isPaired) "Ready to reconnect" else "Offline"
                connectionProgress = if (isAdvertising) 35 else 0
                connectionProgressLabel = if (isAdvertising) "Waiting to reconnect" else "Disconnected"
            }
        }

        override fun onMtuChanged(device: BluetoothDevice?, mtu: Int) {
            negotiatedMtu = mtu.coerceAtLeast(23)
            Log.d(TAG, "Negotiated BLE MTU: $negotiatedMtu")
        }

        override fun onNotificationSent(device: BluetoothDevice?, status: Int) {
            mainHandler.post {
                if (!txNotificationInFlight) return@post
                txNotificationInFlight = false
                if (status == BluetoothGatt.GATT_SUCCESS) {
                    activeTxIndex += 1
                    txRetryCount = 0
                } else {
                    txRetryCount += 1
                    if (txRetryCount > 3) {
                        syncLog = "Grade transfer failed while waiting for Bluetooth delivery. Please try again."
                        activeTxFrame = null
                        activeTxIndex = 0
                        txRetryCount = 0
                    }
                }
                sendNextTxNotification()
            }
        }

        override fun onCharacteristicReadRequest(
            device: BluetoothDevice?,
            requestId: Int,
            offset: Int,
            characteristic: BluetoothGattCharacteristic?,
        ) {
            val response = if (characteristic?.uuid == HANDSHAKE_CHAR_UUID) {
                handshakeResponse.toByteArray(StandardCharsets.UTF_8)
            } else {
                ByteArray(0)
            }
            bluetoothGattServer?.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, offset, response)
        }

        override fun onCharacteristicWriteRequest(
            device: BluetoothDevice?,
            requestId: Int,
            characteristic: BluetoothGattCharacteristic?,
            preparedWrite: Boolean,
            responseNeeded: Boolean,
            offset: Int,
            value: ByteArray?
        ) {
            val dataStr = value?.toString(StandardCharsets.UTF_8) ?: ""
            Log.d(TAG, "Write request on ${characteristic?.uuid}: $dataStr")

            if (characteristic?.uuid == HANDSHAKE_CHAR_UUID) {
                val wasAuthorized = isAuthorized
                val authorized = handleHandshake(dataStr)
                isAuthorized = authorized || wasAuthorized
                if (!wasAuthorized) {
                    connectionState = if (authorized) "Connected & Authorized" else "Authorization Failed"
                    linkQuality = if (authorized) "Measuring..." else "Offline"
                    connectionProgress = if (authorized) 70 else 0
                    connectionProgressLabel = if (authorized) "Secure link verified" else "Authorization failed"
                    syncLog = if (authorized) {
                        "Secure Bluetooth link ready. Desktop is the source of truth."
                    } else {
                        "Unauthorized desktop connection rejected."
                    }
                }
                if (responseNeeded) bluetoothGattServer?.sendResponse(
                    device, requestId, if (authorized) BluetoothGatt.GATT_SUCCESS else BluetoothGatt.GATT_FAILURE,
                    offset, null,
                )
                if (!authorized && !isAuthorized) device?.let { bluetoothGattServer?.cancelConnection(it) }
                return
            }

            if (!isAuthorized) {
                if (responseNeeded) {
                    bluetoothGattServer?.sendResponse(device, requestId, BluetoothGatt.GATT_FAILURE, offset, null)
                }
                return
            }

            if (characteristic?.uuid == RX_CHAR_UUID) {
                handleIncomingRxChunk(dataStr)
                if (responseNeeded) {
                    bluetoothGattServer?.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, offset, null)
                }
            }
        }

        override fun onDescriptorWriteRequest(
            device: BluetoothDevice?,
            requestId: Int,
            descriptor: BluetoothGattDescriptor?,
            preparedWrite: Boolean,
            responseNeeded: Boolean,
            offset: Int,
            value: ByteArray?
        ) {
            if (descriptor?.uuid == CCCD_UUID) {
                if (responseNeeded) {
                    bluetoothGattServer?.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, offset, null)
                }
                Log.d(TAG, "CCCD descriptor written (Notifications enabled/disabled)")
                if (isAuthorized && connectionProgress < 76) {
                    connectionProgress = 76
                    connectionProgressLabel = "Secure data channel ready"
                }
            }
        }
    }

    private fun handleIncomingRxChunk(chunk: String) {
        if (chunk.startsWith("START:") || chunk.startsWith("B64START:")) {
            isReceivingBase64 = chunk.startsWith("B64START:")
            val lenStr = chunk.substringAfter(':')
            expectedLength = lenStr.toIntOrNull() ?: 0
            rxBuffer.clear()
            isReceiving = true
            syncLog = "Syncing class records from desktop..."
            connectionProgress = 1
            connectionProgressLabel = "Receiving desktop records"
            Log.d(TAG, "Start rx data. Expected len: $expectedLength")
        } else if (chunk == "END") {
            isReceiving = false
            syncLog = "Processing database payload..."
            connectionProgress = 98
            connectionProgressLabel = "Applying authoritative record"
            Log.d(TAG, "End rx data. Total received: ${rxBuffer.length}")
            
            // Parse and save
            val ctx = contextRef
            val payload = if (isReceivingBase64) {
                String(Base64.decode(rxBuffer.toString(), Base64.DEFAULT), StandardCharsets.UTF_8)
            } else rxBuffer.toString()
            val success = if (ctx != null) parseAndSavePayload(payload, ctx) else false
            if (lastPayloadWasChangeResult) {
                connectionState = "Connected & Authorized"
                connectionProgress = if (success) 92 else 76
                connectionProgressLabel = if (success) "Grades accepted; refreshing records" else "Grade push rejected"
                if (!success && lastPayloadError.isNotBlank()) syncLog = lastPayloadError
            } else if (success) {
                syncLog = "Sync complete! Rosters and classes updated."
                connectionState = "Synced"
                connectionProgress = 100
                connectionProgressLabel = "Connected and synchronized"
            } else {
                syncLog = "Error: Sync succeeded but database parse failed."
                connectionState = "Sync Error"
                connectionProgress = 0
                connectionProgressLabel = "Sync failed"
            }
        } else {
            if (isReceiving) {
                rxBuffer.append(chunk)
                if (expectedLength > 0) {
                    val receivedRatio = (rxBuffer.length.toFloat() / expectedLength).coerceIn(0f, 1f)
                    connectionProgress = (1 + (receivedRatio * 94).toInt()).coerceIn(1, 95)
                    connectionProgressLabel = "Receiving desktop records"
                }
                Log.d(TAG, "Chunk appended. Current len: ${rxBuffer.length}")
            }
        }
    }

    private fun parseAndSavePayload(jsonStr: String, context: Context): Boolean {
        lastPayloadWasChangeResult = false
        lastPayloadError = ""
        return try {
            val codec = Json { ignoreUnknownKeys = true }
            val root = JSONObject(jsonStr)
            when (root.optString("kind")) {
                "snapshot" -> {
                    val envelope = codec.decodeFromString(BluetoothEnvelope.serializer(), jsonStr)
                    val snapshot = requireNotNull(envelope.snapshot).copy(revision = envelope.revision)
                    DatabaseHelper.saveAuthoritativePayload(context, snapshot)
                    sendDataToDesktop(outboundJson.encodeToString(
                        SnapshotAcknowledgement(revision = envelope.revision, success = true)
                    ), "snapshot acknowledgement")
                }
                "snapshot-gzip" -> {
                    val revision = root.optLong("revision")
                    val compressed = Base64.decode(root.getString("data"), Base64.DEFAULT)
                    val decoded = GZIPInputStream(ByteArrayInputStream(compressed)).bufferedReader().use { it.readText() }

                    val snapshot = codec.decodeFromString(SyncPayload.serializer(), decoded).copy(revision = revision)
                    DatabaseHelper.saveAuthoritativePayload(context, snapshot)
                    sendDataToDesktop(outboundJson.encodeToString(
                        SnapshotAcknowledgement(revision = revision, success = true)
                    ), "snapshot acknowledgement")
                }
                "change-result" -> {
                    lastPayloadWasChangeResult = true
                    val envelope = codec.decodeFromString(BluetoothEnvelope.serializer(), jsonStr)
                    if (!envelope.success) {
                        lastPayloadError = envelope.error.ifBlank { "Desktop rejected mobile changes." }
                        syncLog = lastPayloadError
                        return false
                    }
                    DatabaseHelper.clearUnsyncedScores(context)
                    syncLog = "${envelope.accepted} mobile change${if (envelope.accepted == 1) "" else "s"} saved on the desktop."
                }
                else -> {
                    val payload = codec.decodeFromString(SyncPayload.serializer(), jsonStr)
                    DatabaseHelper.saveAuthoritativePayload(context, payload)
                }
            }
            true
        } catch (e: Exception) {
            Log.e(TAG, "Failed to parse payload", e)
            lastPayloadError = e.message ?: "The desktop response could not be processed."
            false
        }
    }

    // Trigger score sync back to desktop
    fun syncScoresToDesktop(context: Context, authorizationPin: String = ""): Boolean {
        val device = connectedDevice
        val server = bluetoothGattServer
        if (device == null || server == null || !isAuthorized) {
            syncLog = "Failed: Not connected or authorized to a computer."
            return false
        }

        val changes = DatabaseHelper.pendingChanges()
        if (changes.isEmpty()) {
            syncLog = "No unsynced scores to upload."
            return true
        }

        val pinRequired = DatabaseHelper.getPayload()?.pushPinRequired ?: true
        if (pinRequired && !authorizationPin.matches(Regex("\\d{6}"))) {
            syncLog = "Enter the six-digit desktop profile PIN to authorize this push."
            return false
        }

        syncLog = "Sending ${changes.size} authorized change${if (changes.size == 1) "" else "s"} to the desktop..."
        val payloadStr = outboundJson.encodeToString(
            MobileChangesEnvelope(
                baseRevision = DatabaseHelper.getRevision(),
                changes = changes,
                authorizationPin = authorizationPin,
            )
        )
        sendDataToDesktop(payloadStr, "mobile changes")
        return true
    }

    fun openDesktopLearnerPicker(): Boolean = sendApprovedToolCommand("open-picker")
    fun pickLearnerOnDesktop(): Boolean = sendApprovedToolCommand("pick-learner")
    fun openDesktopGroupMaker(): Boolean = sendApprovedToolCommand("open-groups")
    fun randomizeGroupsOnDesktop(): Boolean = sendApprovedToolCommand("randomize-groups")
    fun openDesktopChecklist(): Boolean = sendApprovedToolCommand("open-checklist")

    private fun sendApprovedToolCommand(command: String): Boolean {
        val approved = setOf("open-picker", "pick-learner", "open-groups", "randomize-groups", "open-checklist")
        check(command in approved) { "Unsupported desktop tool command." }
        if (connectedDevice == null || bluetoothGattServer == null || !isAuthorized) {
            syncLog = "Connect to the paired desktop before using remote teacher tools."
            return false
        }
        sendDataToDesktop(outboundJson.encodeToString(ToolCommand(command = command)), "tool command")
        syncLog = "Approved teacher tool command sent to the desktop."
        return true
    }

    private fun sendDataToDesktop(data: String, label: String) {
        bluetoothGattServer
            ?.getService(SERVICE_UUID)
            ?.getCharacteristic(TX_CHAR_UUID) ?: return

        val rawBytes = data.toByteArray(StandardCharsets.UTF_8)
        val bytes = Base64.encode(rawBytes, Base64.NO_WRAP)
        val payloadSize = (negotiatedMtu - 3).coerceIn(20, 180)
        val chunks = mutableListOf<ByteArray>()
        chunks += "B64START:${bytes.size}".toByteArray(StandardCharsets.UTF_8)
        var offset = 0
        while (offset < bytes.size) {
            val chunkSize = minOf(payloadSize, bytes.size - offset)
            chunks += bytes.copyOfRange(offset, offset + chunkSize)
            offset += chunkSize
        }
        chunks += "END".toByteArray(StandardCharsets.UTF_8)

        mainHandler.post {
            pendingTxFrames.offer(TxFrame(label, chunks))
            sendNextTxNotification()
        }
    }

    private fun sendNextTxNotification() {
        if (txNotificationInFlight) return
        val device = connectedDevice ?: return
        val server = bluetoothGattServer ?: return
        val characteristic = server.getService(SERVICE_UUID)?.getCharacteristic(TX_CHAR_UUID) ?: return

        if (activeTxFrame == null) {
            activeTxFrame = pendingTxFrames.poll() ?: return
            activeTxIndex = 0
            txRetryCount = 0
        }
        val frame = activeTxFrame ?: return
        if (activeTxIndex >= frame.chunks.size) {
            if (frame.label == "mobile changes") {
                syncLog = "Grades sent securely. The desktop is applying them now."
            }
            activeTxFrame = null
            activeTxIndex = 0
            sendNextTxNotification()
            return
        }

        characteristic.setValue(frame.chunks[activeTxIndex])
        txNotificationInFlight = server.notifyCharacteristicChanged(device, characteristic, false)
        if (!txNotificationInFlight) {
            txRetryCount += 1
            if (txRetryCount > 3) {
                syncLog = "Bluetooth is busy. Grade transfer was not sent; please try again."
                activeTxFrame = null
                activeTxIndex = 0
                txRetryCount = 0
            }
            mainHandler.postDelayed({ sendNextTxNotification() }, 80)
        }
    }

    private fun resetTxState() {
        pendingTxFrames.clear()
        activeTxFrame = null
        activeTxIndex = 0
        txNotificationInFlight = false
        txRetryCount = 0
        negotiatedMtu = 23
    }
}
