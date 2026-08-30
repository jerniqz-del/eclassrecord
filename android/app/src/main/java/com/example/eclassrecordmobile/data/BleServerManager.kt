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

    // Chunking buffers
    private val rxBuffer = StringBuilder()
    private var expectedLength = 0
    private var isReceiving = false
    private var isReceivingBase64 = false

    // TX chunks (for sending data back to desktop)
    private var txBufferQueue: Queue<ByteArray> = LinkedList()

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

    fun prepareFirstPairing(pin: String) {
        require(pin.matches(Regex("\\d{6}"))) { "Enter the six-digit PIN shown on the desktop." }
        pinCode = pin
        syncLog = "Pairing code saved. Waiting for the desktop to connect."
        connectionProgress = 12
        connectionProgressLabel = "Pairing details ready"
    }

    fun forgetDesktop(context: Context) {
        BluetoothPairingStore.clear(context)
        isPaired = false
        pairedDesktopName = ""
        pinCode = ""
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
        if (isAdvertising) return
        val adapter = bluetoothAdapter ?: return
        if (!adapter.isEnabled) {
            connectionState = "Bluetooth Disabled"
            return
        }

        isAuthorized = false
        connectionState = "Advertising..."
        syncLog = "Broadcasting started. Waiting for desktop app to connect..."
        connectionProgress = 20
        connectionProgressLabel = "Starting Bluetooth broadcast"

        // Keep the advertised name short for OEMs with a strict legacy payload limit.
        runCatching { adapter.name = "EC-$deviceCode" }

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

        setupGattServer(context)

        advertiser?.startAdvertising(settings, data, scanResponse, advertiseCallback)
        isAdvertising = true
    }

    fun stopAdvertising() {
        advertiser?.stopAdvertising(advertiseCallback)
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

    private fun setupGattServer(context: Context) {
        val manager = bluetoothManager ?: return
        bluetoothGattServer = manager.openGattServer(context, gattServerCallback)

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

        bluetoothGattServer?.addService(service)
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
        bluetoothGattServer?.clearServices()
        bluetoothGattServer?.close()
        bluetoothGattServer = null
    }

    private val gattServerCallback = object : BluetoothGattServerCallback() {
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
                val authorized = handleHandshake(dataStr)
                isAuthorized = authorized || isAuthorized
                connectionState = if (isAuthorized) "Connected & Authorized" else "Authorization Failed"
                linkQuality = if (isAuthorized) "Measuring..." else "Offline"
                connectionProgress = if (isAuthorized) 70 else 0
                connectionProgressLabel = if (isAuthorized) "Secure link verified" else "Authorization failed"
                syncLog = if (isAuthorized) {
                    "Secure Bluetooth link ready. Desktop is the source of truth."
                } else {
                    "Unauthorized desktop connection rejected."
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
                if (isAuthorized) { connectionProgress = 76; connectionProgressLabel = "Secure data channel ready" }
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
            connectionProgress = 80
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
            if (success) {
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
                    connectionProgress = (80 + (rxBuffer.length.toFloat() / expectedLength * 18).toInt()).coerceIn(80, 97)
                    connectionProgressLabel = "Receiving desktop records"
                }
                Log.d(TAG, "Chunk appended. Current len: ${rxBuffer.length}")
            }
        }
    }

    private fun parseAndSavePayload(jsonStr: String, context: Context): Boolean {
        return try {
            val codec = Json { ignoreUnknownKeys = true }
            val root = JSONObject(jsonStr)
            when (root.optString("kind")) {
                "snapshot" -> {
                    val envelope = codec.decodeFromString(BluetoothEnvelope.serializer(), jsonStr)
                    val snapshot = requireNotNull(envelope.snapshot).copy(revision = envelope.revision)
                    DatabaseHelper.saveAuthoritativePayload(context, snapshot)
                    sendDataToDesktop(Json.encodeToString(
                        SnapshotAcknowledgement(revision = envelope.revision, success = true)
                    ))
                }
                "snapshot-gzip" -> {
                    val revision = root.optLong("revision")
                    val compressed = Base64.decode(root.getString("data"), Base64.DEFAULT)
                    val decoded = GZIPInputStream(ByteArrayInputStream(compressed)).bufferedReader().use { it.readText() }

                    val snapshot = codec.decodeFromString(SyncPayload.serializer(), decoded).copy(revision = revision)
                    DatabaseHelper.saveAuthoritativePayload(context, snapshot)
                    sendDataToDesktop(Json.encodeToString(
                        SnapshotAcknowledgement(revision = revision, success = true)
                    ))
                }
                "change-result" -> {
                    val envelope = codec.decodeFromString(BluetoothEnvelope.serializer(), jsonStr)
                    if (!envelope.success) throw IllegalStateException(envelope.error.ifBlank { "Desktop rejected mobile changes." })
                    DatabaseHelper.clearUnsyncedScores(context)
                    syncLog = "Desktop accepted ${envelope.accepted} mobile changes. Waiting for canonical refresh."
                }
                else -> {
                    val payload = codec.decodeFromString(SyncPayload.serializer(), jsonStr)
                    DatabaseHelper.saveAuthoritativePayload(context, payload)
                }
            }
            true
        } catch (e: Exception) {
            Log.e(TAG, "Failed to parse payload", e)
            false
        }
    }

    // Trigger score sync back to desktop
    fun syncScoresToDesktop(context: Context): Boolean {
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

        syncLog = "Submitting ${changes.size} changes for desktop validation..."
        val payloadStr = Json.encodeToString(
            MobileChangesEnvelope(
                baseRevision = DatabaseHelper.getRevision(),
                changes = changes,
            )
        )
        sendDataToDesktop(payloadStr)
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
        sendDataToDesktop(Json.encodeToString(ToolCommand(command = command)))
        syncLog = "Approved teacher tool command sent to the desktop."
        return true
    }

    private fun sendDataToDesktop(data: String) {
        val txChar = bluetoothGattServer
            ?.getService(SERVICE_UUID)
            ?.getCharacteristic(TX_CHAR_UUID) ?: return

        val rawBytes = data.toByteArray(StandardCharsets.UTF_8)
        val bytes = Base64.encode(rawBytes, Base64.NO_WRAP)
        val mtu = 200 // Default safe BLE chunk size (negotiated can be higher)
        
        txBufferQueue.clear()
        
        // Queue START
        txBufferQueue.offer("B64START:${bytes.size}".toByteArray(StandardCharsets.UTF_8))
        
        // Queue Chunks
        var offset = 0
        while (offset < bytes.size) {
            val chunkSize = Math.min(mtu, bytes.size - offset)
            val chunk = bytes.copyOfRange(offset, offset + chunkSize)
            txBufferQueue.offer(chunk)
            offset += chunkSize
        }
        
        // Queue END
        txBufferQueue.offer("END".toByteArray(StandardCharsets.UTF_8))
        
        // Start sending notifications
        sendNextTxNotification(txChar)
    }

    private fun sendNextTxNotification(characteristic: BluetoothGattCharacteristic) {
        val device = connectedDevice ?: return
        val server = bluetoothGattServer ?: return

        val nextChunk = txBufferQueue.poll()
        if (nextChunk != null) {
            characteristic.setValue(nextChunk)
            server.notifyCharacteristicChanged(device, characteristic, false)
            
            // To prevent congestion, wait 30ms between notifications
            android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
                sendNextTxNotification(characteristic)
            }, 30)
        } else {
            syncLog = "Transfer complete. Waiting for desktop acknowledgment."
        }
    }
}
