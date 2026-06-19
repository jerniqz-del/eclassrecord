package com.example.eclassrecordmobile.data

import android.annotation.SuppressLint
import android.bluetooth.*
import android.bluetooth.le.AdvertiseCallback
import android.bluetooth.le.AdvertiseData
import android.bluetooth.le.AdvertiseSettings
import android.content.Context
import android.os.ParcelUuid
import android.util.Log
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import java.nio.charset.StandardCharsets
import java.util.*
import kotlin.random.Random

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
    var pinCode by mutableStateOf("")    // e.g. "123456"
    var isAuthorized by mutableStateOf(false)
    var syncLog by mutableStateOf("No sync logs yet.")

    private var bluetoothManager: BluetoothManager? = null
    private var bluetoothAdapter: BluetoothAdapter? = null
    private var bluetoothGattServer: BluetoothGattServer? = null
    private var advertiser: android.bluetooth.le.BluetoothLeAdvertiser? = null
    private var connectedDevice: BluetoothDevice? = null
    private var contextRef: Context? = null

    // Chunking buffers
    private val rxBuffer = StringBuilder()
    private var expectedLength = 0
    private var isReceiving = false

    // TX chunks (for sending data back to desktop)
    private var txBufferQueue: Queue<ByteArray> = LinkedList()

    fun init(context: Context) {
        contextRef = context.applicationContext
        bluetoothManager = context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
        bluetoothAdapter = bluetoothManager?.adapter
        
        // Generate a random device code for this installation/session
        if (deviceCode.isEmpty()) {
            val letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
            deviceCode = (1..4).map { letters[Random.nextInt(letters.length)] }.joinToString("")
        }
    }

    fun startAdvertising(context: Context) {
        val adapter = bluetoothAdapter ?: return
        if (!adapter.isEnabled) {
            connectionState = "Bluetooth Disabled"
            return
        }

        // Generate a new 6-digit PIN Code
        pinCode = (1..6).map { Random.nextInt(10) }.joinToString("")
        isAuthorized = false
        connectionState = "Advertising..."
        syncLog = "Broadcasting started. Waiting for desktop app to connect..."

        // Set adapter name to EClass-XXXX
        adapter.name = "EClass-$deviceCode"

        advertiser = adapter.bluetoothLeAdvertiser
        val settings = AdvertiseSettings.Builder()
            .setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_LOW_LATENCY)
            .setConnectable(true)
            .setTimeout(120000) // Timeout after 2 minutes to save battery
            .setTxPowerLevel(AdvertiseSettings.ADVERTISE_TX_POWER_HIGH)
            .build()

        val data = AdvertiseData.Builder()
            .setIncludeDeviceName(true)
            .addServiceUuid(ParcelUuid(SERVICE_UUID))
            .build()

        setupGattServer(context)

        advertiser?.startAdvertising(settings, data, advertiseCallback)
        isAdvertising = true
    }

    fun stopAdvertising() {
        advertiser?.stopAdvertising(advertiseCallback)
        closeGattServer()
        isAdvertising = false
        connectionState = "Disconnected"
        isAuthorized = false
        connectedDevice = null
    }

    private val advertiseCallback = object : AdvertiseCallback() {
        override fun onStartSuccess(settingsInEffect: AdvertiseSettings?) {
            Log.d(TAG, "BLE advertising started successfully")
        }

        override fun onStartFailure(errorCode: Int) {
            Log.e(TAG, "BLE advertising failed: $errorCode")
            connectionState = "Advertising Failed ($errorCode)"
            isAdvertising = false
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
                Log.d(TAG, "Device connected: ${device?.address}")
            } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
                connectedDevice = null
                connectionState = if (isAdvertising) "Advertising..." else "Disconnected"
                isAuthorized = false
                Log.d(TAG, "Device disconnected")
            }
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
                if (dataStr == pinCode) {
                    isAuthorized = true
                    connectionState = "Connected & Authorized"
                    syncLog = "Authorization successful! Ready for sync."
                    if (responseNeeded) {
                        bluetoothGattServer?.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, offset, "OK".toByteArray())
                    }
                } else {
                    isAuthorized = false
                    connectionState = "Auth Failed (Wrong PIN)"
                    syncLog = "Unauthorized connection attempt rejected."
                    if (responseNeeded) {
                        bluetoothGattServer?.sendResponse(device, requestId, BluetoothGatt.GATT_FAILURE, offset, "FAIL".toByteArray())
                    }
                    // Force disconnect
                    device?.let { bluetoothGattServer?.cancelConnection(it) }
                }
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
            }
        }
    }

    private fun handleIncomingRxChunk(chunk: String) {
        if (chunk.startsWith("START:")) {
            val lenStr = chunk.substringAfter("START:")
            expectedLength = lenStr.toIntOrNull() ?: 0
            rxBuffer.clear()
            isReceiving = true
            syncLog = "Syncing class records from desktop..."
            Log.d(TAG, "Start rx data. Expected len: $expectedLength")
        } else if (chunk == "END") {
            isReceiving = false
            syncLog = "Processing database payload..."
            Log.d(TAG, "End rx data. Total received: ${rxBuffer.length}")
            
            // Parse and save
            val ctx = contextRef
            val success = if (ctx != null) parseAndSavePayload(rxBuffer.toString(), ctx) else false
            if (success) {
                syncLog = "Sync complete! Rosters and classes updated."
                connectionState = "Synced"
            } else {
                syncLog = "Error: Sync succeeded but database parse failed."
                connectionState = "Sync Error"
            }
        } else {
            if (isReceiving) {
                rxBuffer.append(chunk)
                Log.d(TAG, "Chunk appended. Current len: ${rxBuffer.length}")
            }
        }
    }

    private fun parseAndSavePayload(jsonStr: String, context: Context): Boolean {
        return try {
            val payload = kotlinx.serialization.json.Json { ignoreUnknownKeys = true }.decodeFromString(SyncPayload.serializer(), jsonStr)
            DatabaseHelper.savePayload(context, payload)
            DatabaseHelper.clearUnsyncedScores(context)
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

        val unsynced = DatabaseHelper.getUnsyncedScores()
        if (unsynced.isEmpty()) {
            syncLog = "No unsynced scores to upload."
            return true
        }

        syncLog = "Uploading scores..."
        val payloadStr = kotlinx.serialization.json.Json.encodeToString(
            kotlinx.serialization.builtins.MapSerializer(
                kotlinx.serialization.builtins.serializer<String>(),
                kotlinx.serialization.builtins.MapSerializer(
                    kotlinx.serialization.builtins.serializer<String>(),
                    kotlinx.serialization.builtins.serializer<String>()
                )
            ),
            unsynced
        )
        
        // Chunk and send notifications
        sendDataToDesktop(payloadStr)
        return true
    }

    private fun sendDataToDesktop(data: String) {
        val txChar = bluetoothGattServer
            ?.getService(SERVICE_UUID)
            ?.getCharacteristic(TX_CHAR_UUID) ?: return

        val bytes = data.toByteArray(StandardCharsets.UTF_8)
        val mtu = 200 // Default safe BLE chunk size (negotiated can be higher)
        
        txBufferQueue.clear()
        
        // Queue START
        txBufferQueue.offer("START:${bytes.size}".toByteArray(StandardCharsets.UTF_8))
        
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
            syncLog = "Scores uploaded successfully! local sync cleared."
            contextRef?.let { DatabaseHelper.clearUnsyncedScores(it) }
        }
    }
}
