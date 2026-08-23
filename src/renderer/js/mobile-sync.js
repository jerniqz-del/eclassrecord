/**
 * E-Class Record — Web Bluetooth Companion Controller
 *
 * Implements standard Web Bluetooth Central client APIs to pair with the
 * Android app, exchange class records, and receive score updates in real-time.
 */

const BLE_SERVICE_UUID = 'e3c1a8e0-0251-412e-a4b5-559d871fbdf2';
const HANDSHAKE_CHAR_UUID = 'e3c1a8e3-0251-412e-a4b5-559d871fbdf2';
const RX_CHAR_UUID = 'e3c1a8e1-0251-412e-a4b5-559d871fbdf2';
const TX_CHAR_UUID = 'e3c1a8e2-0251-412e-a4b5-559d871fbdf2';

let activeGattDevice = null;
let activeGattServer = null;
let activeGattService = null;
let handshakeChar = null;
let rxChar = null;
let txChar = null;

let isSyncConnecting = false;
let isBleAuthorized = false;
let bluetoothPublishTimer = null;
let bleWriteQueue = Promise.resolve();
let syncLogs = [];
let pendingSnapshotRevision = null;
let snapshotAckTimer = null;
let hasCompletedInitialSnapshot = false;

// Reassembly buffer (Mobile -> Desktop)
let mobileRxBuffer = '';
let mobileExpectedLen = 0;
let mobileIsReceiving = false;

function addSyncLog(message) {
  const timestamp = new Date().toLocaleTimeString();
  const entry = `[${timestamp}] ${message}`;
  syncLogs.push(entry);
  if (syncLogs.length > 50) syncLogs.shift();
  
  const logContainer = document.getElementById('syncLogsOutput');
  if (logContainer) {
    logContainer.textContent = syncLogs.join('\n');
    logContainer.scrollTop = logContainer.scrollHeight;
  }
  console.log('[Sync BLE]', message);
}

function updateSyncStatusUI(status, label, details) {
  const indicator = document.getElementById('syncIndicator');
  const labelEl = document.getElementById('syncStatusLabel');
  const subEl = document.getElementById('syncStatusSub');
  
  if (indicator) {
    indicator.className = 'sync-status-indicator';
    if (status === 'inactive') indicator.classList.add('sync-status-indicator--inactive');
    else if (status === 'scanning') indicator.classList.add('sync-status-indicator--scanning');
    else if (status === 'connected') indicator.classList.add('sync-status-indicator--connected');
    else if (status === 'error') indicator.classList.add('sync-status-indicator--error');
  }
  
  if (labelEl) labelEl.textContent = label;
  if (subEl) subEl.textContent = details;
}

/**
 * Initiates BLE scanning using Chromium Web Bluetooth API.
 * In Electron, this will emit 'select-bluetooth-device' in main process.
 */
async function startScanBleDevices() {
  if (window.AdminTestMode?.blockExternalAction?.('Bluetooth scanning')) return;
  try {
    const pairing = await window.electronAPI.getCompanionWlanStatus();
    if (!pairing.running || pairing.transport !== 'bluetooth') {
      toast('Start Bluetooth Pairing and let Android scan the QR first.', 'warning');
      return;
    }
    isSyncConnecting = true;
    addSyncLog('Starting Bluetooth scan for companion app...');
    updateSyncStatusUI('scanning', 'Bluetooth: Scanning...', 'Searching for E-Class mobile applications...');
    
    // Clear list and display discovery panel
    const list = document.getElementById('discoveredDevicesList');
    if (list) list.innerHTML = '<li class="device-item text-muted">Searching for E-Class companions...</li>';
    showEl('deviceDiscoveryPanel', true);
    showEl('syncPinPanel', false);
    showEl('btnSyncToPhone', false);
    showEl('btnDisconnectBle', false);

    // Call navigator.bluetooth.requestDevice. 
    // This blocks until main process calls the callback via selectBluetoothDevice.
    const device = await navigator.bluetooth.requestDevice({
      filters: [{ services: [BLE_SERVICE_UUID] }],
      optionalServices: [BLE_SERVICE_UUID]
    });
    
    // Discovered and selected!
    showEl('deviceDiscoveryPanel', false);
    addSyncLog(`Found device: ${device.name}. Establishing connection...`);
    
    activeGattDevice = device;
    device.addEventListener('gattserverdisconnected', onBleDisconnected);
    
    // Connect to GATT Server
    activeGattServer = await device.gatt.connect();
    addSyncLog('Connected to GATT Server! Discovering Primary Service...');
    
    // Get Primary Service
    activeGattService = await activeGattServer.getPrimaryService(BLE_SERVICE_UUID);
    addSyncLog('Primary Sync Service discovered.');

    // Get Characteristics
    handshakeChar = await activeGattService.getCharacteristic(HANDSHAKE_CHAR_UUID);
    rxChar = await activeGattService.getCharacteristic(RX_CHAR_UUID);
    txChar = await activeGattService.getCharacteristic(TX_CHAR_UUID);
    
    addSyncLog('GATT characteristics mapped.');
    
    // Android already received the desktop PIN; authorize automatically.
    updateSyncStatusUI('scanning', 'Bluetooth: Verifying Link...', 'Confirming the PIN entered on Android...');
    showEl('btnDisconnectBle', true);
    await submitHandshakePin();
  } catch (error) {
    if (error.name === 'NotFoundError' || error.message.includes('User cancelled')) {
      addSyncLog('Bluetooth scanning cancelled by user.');
      updateSyncStatusUI('inactive', 'Bluetooth: Disconnected', 'Scan cancelled.');
    } else {
      addSyncLog(`Bluetooth error: ${error.message}`);
      updateSyncStatusUI('error', 'Bluetooth: Error', error.message);
      toast('Bluetooth scanning failed: ' + error.message, 'error');
    }
    isSyncConnecting = false;
    showEl('deviceDiscoveryPanel', false);
    showEl('syncPinPanel', false);
  }
}

/**
 * Submits the application-level PIN code handshake to authorize the link.
 */
async function submitHandshakePin() {
  if (window.AdminTestMode?.blockExternalAction?.('Bluetooth authorization')) return;
  if (!handshakeChar) return;
  try {
    const pairing = await window.electronAPI.getCompanionWlanStatus();
    const pin = String(pairing.pin || '');
    if (!pairing.running || pairing.transport !== 'bluetooth' || !/^\d{6}$/.test(pin)) {
      throw new Error('The desktop Bluetooth pairing session has ended.');
    }
    addSyncLog('Confirming the PIN entered on Android...');
    await handshakeChar.writeValue(new TextEncoder().encode(pin));
    isBleAuthorized = true;
    addSyncLog('Authorization passed. The Bluetooth link is secure.');
    const companionName = activeGattDevice?.name || 'Android companion';
    updateSyncStatusUI('scanning', 'Bluetooth: Authorized · Synchronizing', `Linked to ${companionName}`);
    showEl('btnSyncToPhone', true);
    showEl('btnScanBle', false);
    addSyncLog('Subscribing to mobile entry notifications...');
    await txChar.startNotifications();
    txChar.addEventListener('characteristicvaluechanged', handleMobileScoresNotification);
    addSyncLog('Subscribed successfully. Listening for mobile entries.');
    await syncDataToMobile({ silent: true });
    addSyncLog('Initial snapshot sent. Waiting for the Android app to confirm it was imported...');
  } catch (error) {
    addSyncLog(`Authorization failed: ${error.message}`);
    updateSyncStatusUI('error', 'Bluetooth: Connection Refused', 'Check the PIN entered on Android and try pairing again.');
    toast('Bluetooth authorization failed. Re-enter the desktop PIN on Android.', 'error');
    disconnectBleDevice();
  }
}

/**
 * Handles incoming Bluetooth notifications containing scores chunk packages.
 */
function handleMobileScoresNotification(event) {
  const value = event.target.value;
  const chunk = new TextDecoder().decode(value);
  
  if (chunk.startsWith('START:')) {
    const lenStr = chunk.split(':')[1];
    mobileExpectedLen = parseInt(lenStr, 10);
    mobileRxBuffer = '';
    mobileIsReceiving = true;
    addSyncLog(`Incoming scores upload: expected size ${mobileExpectedLen} bytes...`);
  } else if (chunk === 'END') {
    mobileIsReceiving = false;
    addSyncLog(`Upload transfer complete. Processing data (${mobileRxBuffer.length} bytes)...`);
    
    try {
      const payload = JSON.parse(mobileRxBuffer);
      handleMobilePayload(payload).catch((error) => {
        addSyncLog(`Mobile payload failed: ${error.message}`);
        toast(error.message || 'The mobile payload was rejected.', 'error');
      });
    } catch (parseErr) {
      addSyncLog(`Error: Failed to parse uploaded scores: ${parseErr.message}`);
      toast('Failed to parse uploaded score payload.', 'error');
    }
  } else {
    if (mobileIsReceiving) {
      mobileRxBuffer += chunk;
    }
  }
}

async function handleMobilePayload(payload) {
  if (payload?.kind === 'snapshot-ack') {
    const revision = Number(payload.revision || 0);
    if (payload.success) {
      const isInitialSync = !hasCompletedInitialSnapshot;
      clearTimeout(snapshotAckTimer);
      snapshotAckTimer = null;
      pendingSnapshotRevision = null;
      hasCompletedInitialSnapshot = true;
      const companionName = activeGattDevice?.name || 'Android companion';
      updateSyncStatusUI('connected', 'Bluetooth: Connected & Synchronized', `Linked to ${companionName} · desktop revision ${revision}`);
      addSyncLog(`Android imported desktop revision ${revision} successfully.`);
      if (isInitialSync) toast('Phone connected and synchronized.', 'success');
    } else {
      clearTimeout(snapshotAckTimer);
      snapshotAckTimer = null;
      const reason = payload.error || 'The Android app could not import the desktop records.';
      updateSyncStatusUI('error', 'Bluetooth: Sync Incomplete', reason);
      addSyncLog(`Android rejected desktop revision ${revision}: ${reason}`);
      toast(reason, 'error');
    }
    return;
  }
  if (payload?.kind === 'changes') {
    try {
      const result = await window.MobileSyncBridge.applyBluetoothEnvelope(payload);
      await sendPayloadToMobile({ kind: 'change-result', success: true, accepted: result.accepted || 0 }, 'change result');
    } catch (error) {
      await sendPayloadToMobile({ kind: 'change-result', success: false, accepted: 0, error: error.message || 'Mobile entries were rejected.' }, 'change rejection');
      throw error;
    }
    return;
  }
  if (payload?.kind === 'tool-command') {
    window.MobileSyncBridge.handleToolCommand(payload);
    return;
  }
  mergeUploadedScores(payload);
}

/**
 * Safely merges legacy score-only uploads back into the desktop DB assignments.
 */
function mergeUploadedScores(payload) {
  if (window.AdminTestMode?.blockExternalAction?.('Mobile score imports')) return;
  // Payload format: { "assignmentId": { "learnerId|assessmentId": "scoreValue" } }
  let updateCount = 0;
  
  for (const assignmentId in payload) {
    const targetAssignment = db.assignments.find(a => a.id === assignmentId);
    if (!targetAssignment) {
      addSyncLog(`Warning: Assignment ${assignmentId} not found in this desktop profiles directory.`);
      continue;
    }
    
    const scoreMap = payload[assignmentId];
    for (const scoreKey in scoreMap) {
      const newValue = scoreMap[scoreKey];
      const oldValue = targetAssignment.scores[scoreKey] === undefined ? '' : String(targetAssignment.scores[scoreKey]);
      
      if (oldValue !== newValue) {
        const ids = globalThis.ScoreHistory?.splitScoreKey(scoreKey);
        if (ids) {
          ScoreHistory.record(targetAssignment, {
            ...ids,
            previousValue: oldValue,
            newValue,
            source: 'mobile-sync'
          });
        }
        targetAssignment.scores[scoreKey] = newValue;
        updateCount++;
      }
    }
  }
  
  if (updateCount > 0) {
    addSyncLog(`Merged ${updateCount} student score entries successfully!`);
    saveDatabase();
    render();
    toast(`Successfully synced ${updateCount} score updates from mobile!`, 'success');
  } else {
    addSyncLog('Sync completed. No new grade modifications found.');
    toast('No new score changes to merge.', 'info');
  }
}

function bytesToBase64(bytes) {
  let binary = '';
  const blockSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += blockSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + blockSize, bytes.length)));
  }
  return btoa(binary);
}

async function buildBluetoothSnapshotPayload(snapshot, revision) {
  const raw = JSON.stringify(snapshot);
  if (typeof CompressionStream !== 'function') {
    addSyncLog('Bluetooth compression is unavailable; sending the standard snapshot.');
    return { kind: 'snapshot', revision, snapshot };
  }
  try {
    const stream = new Blob([raw], { type: 'application/json' })
      .stream()
      .pipeThrough(new CompressionStream('gzip'));
    const compressed = new Uint8Array(await new Response(stream).arrayBuffer());
    const encoded = bytesToBase64(compressed);
    const standardSize = new TextEncoder().encode(JSON.stringify({ kind: 'snapshot', revision, snapshot })).length;
    const compressedSize = new TextEncoder().encode(encoded).length;
    if (compressedSize >= standardSize) return { kind: 'snapshot', revision, snapshot };
    const saved = Math.max(0, Math.round((1 - compressedSize / standardSize) * 100));
    addSyncLog(`Compressed desktop snapshot from ${standardSize} to ${compressedSize} bytes (${saved}% smaller).`);
    return { kind: 'snapshot-gzip', revision, encoding: 'gzip-base64', data: encoded };
  } catch (error) {
    addSyncLog(`Snapshot compression was skipped: ${error.message}`);
    return { kind: 'snapshot', revision, snapshot };
  }
}

/**
 * Sends a framed JSON payload to the Android GATT server.
 */
async function sendPayloadToMobile(payload, label = 'payload') {
  if (!rxChar || !isBleAuthorized) throw new Error('No authorized Bluetooth companion is connected.');
  const task = bleWriteQueue.catch(() => {}).then(async () => {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(JSON.stringify(payload));
    addSyncLog(`Sending Bluetooth ${label}: ${bytes.length} bytes.`);
    const write = (value) => typeof rxChar.writeValueWithResponse === 'function'
      ? rxChar.writeValueWithResponse(value)
      : rxChar.writeValue(value);
    await write(encoder.encode(`START:${bytes.length}`));
    let lastProgressBucket = -1;
    for (let offset = 0; offset < bytes.length; offset += 160) {
      const end = Math.min(offset + 160, bytes.length);
      await write(bytes.slice(offset, end));
      if (label === 'desktop snapshot') {
        const bucket = Math.floor((end / bytes.length) * 10);
        if (bucket > lastProgressBucket) {
          lastProgressBucket = bucket;
          addSyncLog(`Bluetooth snapshot transfer ${Math.min(bucket * 10, 100)}%...`);
        }
      }
    }
    await write(encoder.encode('END'));
    addSyncLog(`Bluetooth ${label} sent successfully.`);
  });
  bleWriteQueue = task;
  return task;
}

/**
 * Publishes the authoritative desktop snapshot, then transfers it automatically.
 */
async function syncDataToMobile(options = {}) {
  if (window.AdminTestMode?.blockExternalAction?.('Mobile synchronization')) return;
  if (!rxChar || !isBleAuthorized) {
    if (!options.silent) toast('No authorized Bluetooth companion is connected.', 'warning');
    return;
  }
  try {
    const status = await window.electronAPI.getCompanionWlanStatus();
    const snapshot = window.MobileSyncBridge?.buildCompanionSnapshot?.();
    if (!snapshot) throw new Error('The desktop snapshot is not ready.');
    const revision = Number(status.revision || 0);
    pendingSnapshotRevision = revision;
    const companionName = activeGattDevice?.name || 'Android companion';
    updateSyncStatusUI('scanning', 'Bluetooth: Authorized · Synchronizing', `Sending desktop revision ${revision} to ${companionName}...`);
    const payload = await buildBluetoothSnapshotPayload(snapshot, revision);
    await sendPayloadToMobile(payload, 'desktop snapshot');
    clearTimeout(snapshotAckTimer);
    snapshotAckTimer = setTimeout(() => {
      if (pendingSnapshotRevision !== revision) return;
      updateSyncStatusUI('error', 'Bluetooth: Sync Incomplete', 'The phone did not confirm the desktop records. Press Refresh Phone to retry.');
      addSyncLog(`Android did not confirm desktop revision ${revision}; the Bluetooth link remains authorized.`);
    }, 30000);
    if (!options.silent) toast('Desktop records sent. Waiting for confirmation from the phone.', 'info');
  } catch (error) {
    addSyncLog(`Sync failed: ${error.message}`);
    if (!options.silent) toast('Failed to transfer class records: ' + error.message, 'error');
    throw error;
  }
}

function scheduleBluetoothSnapshot() {
  if (!rxChar || !isBleAuthorized) return;
  clearTimeout(bluetoothPublishTimer);
  bluetoothPublishTimer = setTimeout(() => syncDataToMobile({ silent: true }).catch(() => {}), 900);
}

window.scheduleBluetoothSnapshot = scheduleBluetoothSnapshot;

/**
 * Disconnects the active BLE connection.
 */
function disconnectBleDevice() {
  if (activeGattDevice && activeGattDevice.gatt.connected) {
    addSyncLog('Closing active link...');
    activeGattDevice.gatt.disconnect();
  } else {
    onBleDisconnected();
  }
}

function onBleDisconnected() {
  addSyncLog('Bluetooth disconnected.');
  updateSyncStatusUI('inactive', 'Bluetooth: Disconnected', 'Link severed.');
  
  activeGattDevice = null;
  activeGattServer = null;
  activeGattService = null;
  handshakeChar = null;
  rxChar = null;
  txChar = null;
  isSyncConnecting = false;
  isBleAuthorized = false;
  pendingSnapshotRevision = null;
  clearTimeout(snapshotAckTimer);
  snapshotAckTimer = null;
  hasCompletedInitialSnapshot = false;
  clearTimeout(bluetoothPublishTimer);
  
  showEl('syncPinPanel', false);
  showEl('btnSyncToPhone', false);
  showEl('btnDisconnectBle', false);
  showEl('btnScanBle', true);
}

// ── Electron main process device listing callbacks ──

function cancelBleDiscovery() {
  window.electronAPI.cancelBluetoothDevice();
  showEl('deviceDiscoveryPanel', false);
  updateSyncStatusUI('inactive', 'Bluetooth: Disconnected', 'Search cancelled.');
}

function selectDiscoveredDevice(deviceId) {
  window.electronAPI.selectBluetoothDevice(deviceId);
  showEl('deviceDiscoveryPanel', false);
  addSyncLog(`Device selected: ${deviceId}. Pairing...`);
}

// Handle incoming bluetooth device selection lists from main process
window.addEventListener('DOMContentLoaded', () => {
  if (window.electronAPI && typeof window.electronAPI.onBluetoothDeviceList === 'function') {
    window.electronAPI.onBluetoothDeviceList((deviceList) => {
      const list = document.getElementById('discoveredDevicesList');
      if (!list) return;
      
      list.innerHTML = '';
      if (!deviceList || deviceList.length === 0) {
        list.innerHTML = '<li class="device-item text-muted">Searching for E-Class companions...</li>';
        return;
      }
      
      // Filter out empty names or non-matching names
      const companions = deviceList.filter(d => d.deviceName);
      if (companions.length === 0) {
        list.innerHTML = '<li class="device-item text-muted">No compatible E-Class companion service found nearby.</li>';
        return;
      }
      
      companions.forEach(device => {
        const li = document.createElement('li');
        li.className = 'device-item';
        li.innerHTML = `
          <span>📱 ${esc(device.deviceName)}</span>
          <span class="device-item__rssi">ID: ${esc(device.deviceId)}</span>
        `;
        li.onclick = () => selectDiscoveredDevice(device.deviceId);
        list.appendChild(li);
      });
    });
  }
});
