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
const BLE_PAIRING_STORAGE_KEY = 'eclass.bluetooth.pairing.v1';
const BLE_DESKTOP_ID_KEY = 'eclass.bluetooth.desktop-id.v1';


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
let lastSentBluetoothSnapshotKey = '';
let syncLogs = [];
let pendingSnapshotRevision = null;
let snapshotAckTimer = null;
let linkQualityTimer = null;
let reconnectTimer = null;
let reconnectAttempts = 0;
let hasCompletedInitialSnapshot = false;
let bleScanCancelledFromPanel = false;
let automaticBluetoothDiscoveryTag = '';
let automaticBluetoothSelectionPending = false;
let preparedAutomaticBluetoothPairing = null;
let automaticPairingMode = false;
let automaticDiscoveryRetryTimer = null;

function bluetoothDiscoveryTag(sessionId) {
  const compact = String(sessionId || '').replace(/-/g, '').slice(0, 6).toUpperCase();
  return compact ? `EC-${compact}` : '';
}

function scheduleAutomaticBluetoothDiscoveryRetry() {
  clearTimeout(automaticDiscoveryRetryTimer);
  automaticDiscoveryRetryTimer = setTimeout(() => {
    automaticDiscoveryRetryTimer = null;
    startAutomaticBluetoothDiscovery().catch((error) => {
      addSyncLog(`Automatic detection retry waiting: ${error.message}`);
    });
  }, 2500);
}

function setBluetoothScanBusy(busy) {
  const button = document.getElementById('btnScanBle');
  if (!button) return;
  button.disabled = Boolean(busy);
  button.setAttribute('aria-busy', busy ? 'true' : 'false');
}

// Reassembly buffer (Mobile -> Desktop)
let mobileRxBuffer = '';
let mobileExpectedLen = 0;
let mobileIsReceiving = false;

let mobileIsBase64 = false;
function bluetoothDesktopId() {
  let value = localStorage.getItem(BLE_DESKTOP_ID_KEY);
  if (!value) {
    value = crypto.randomUUID();
    localStorage.setItem(BLE_DESKTOP_ID_KEY, value);
  }
  return value;
}

function storedBluetoothPairing() {
  try {
    const value = JSON.parse(localStorage.getItem(BLE_PAIRING_STORAGE_KEY) || 'null');
    return value?.deviceId && value?.reconnectToken ? value : null;
  } catch {
    return null;
  }
}

function saveBluetoothPairing(value) {
  localStorage.setItem(BLE_PAIRING_STORAGE_KEY, JSON.stringify({
    ...value,
    desktopId: bluetoothDesktopId(),
    pairedAt: new Date().toISOString()
  }));
}

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

function bluetoothQualityLabel(roundTripMs) {
  if (roundTripMs <= 100) return 'Excellent';
  if (roundTripMs <= 250) return 'Good';
  if (roundTripMs <= 600) return 'Fair';
  return 'Weak';
}

async function measureBluetoothLink() {
  if (!handshakeChar || !isBleAuthorized) return;
  const started = Date.now();
  await handshakeChar.writeValue(new TextEncoder().encode(JSON.stringify({ kind: 'ping', sentAt: started })));
  const response = JSON.parse(new TextDecoder().decode(await handshakeChar.readValue()));
  if (response.status !== 'pong') throw new Error('No heartbeat response');
  const roundTripMs = Date.now() - started;
  const label = bluetoothQualityLabel(roundTripMs);
  const quality = document.getElementById('syncLinkQuality');
  if (quality) quality.textContent = `${label} - ${roundTripMs} ms`;
  await handshakeChar.writeValue(new TextEncoder().encode(JSON.stringify({ kind: 'quality', label, roundTripMs })));
}

function startBluetoothLinkMonitor() {
  clearInterval(linkQualityTimer);
  const run = () => measureBluetoothLink().catch(() => {
    const quality = document.getElementById('syncLinkQuality');
    if (quality) quality.textContent = 'Weak - heartbeat delayed';
  });
  run();
  linkQualityTimer = setInterval(run, 5000);
}

function scheduleBluetoothReconnect() {
  clearTimeout(reconnectTimer);
  if (!storedBluetoothPairing()) return;
  reconnectAttempts += 1;
  const delay = Math.min(30000, 1000 * (2 ** Math.min(reconnectAttempts, 5)));
  reconnectTimer = setTimeout(() => {
    attemptKnownBluetoothReconnect().catch(() => {});
  }, delay);
}

async function mapBluetoothDevice(device) {
  activeGattDevice = device;
  device.removeEventListener('gattserverdisconnected', onBleDisconnected);
  device.addEventListener('gattserverdisconnected', onBleDisconnected);
  activeGattServer = device.gatt.connected ? device.gatt : await device.gatt.connect();
  activeGattService = await activeGattServer.getPrimaryService(BLE_SERVICE_UUID);
  handshakeChar = await activeGattService.getCharacteristic(HANDSHAKE_CHAR_UUID);
  rxChar = await activeGattService.getCharacteristic(RX_CHAR_UUID);
  txChar = await activeGattService.getCharacteristic(TX_CHAR_UUID);
}

async function attemptKnownBluetoothReconnect() {
  const pairing = storedBluetoothPairing();
  if (!pairing || typeof navigator.bluetooth?.getDevices !== 'function') return false;
  if (activeGattDevice?.gatt?.connected && isBleAuthorized) return true;
  try {
    const devices = await navigator.bluetooth.getDevices();
    const device = devices.find((item) => item.id === pairing.deviceId);
    if (!device) return false;
    isSyncConnecting = true;
    updateSyncStatusUI('scanning', 'Bluetooth: Reconnecting...', `Looking for ${pairing.deviceName || 'paired Android companion'}`);
    await mapBluetoothDevice(device);
    await authorizeKnownBluetoothDevice(pairing);
    isSyncConnecting = false;
    return true;
  } catch (error) {
    isSyncConnecting = false;
    addSyncLog(`Automatic reconnect waiting: ${error.message}`);
    scheduleBluetoothReconnect();
    return false;
  }
}

/**
 * Initiates BLE scanning using Chromium Web Bluetooth API.
 * In Electron, this will emit 'select-bluetooth-device' in main process.
 */
async function startScanBleDevices(options = {}) {
  if (window.AdminTestMode?.blockExternalAction?.('Bluetooth scanning')) return;
  if (isSyncConnecting) return;
  const automatic = Boolean(options.automatic);
  automaticPairingMode = automatic;
  isSyncConnecting = true;
  bleScanCancelledFromPanel = false;
  setBluetoothScanBusy(true);
  try {
    if (!options.skipReset && typeof window.electronAPI.resetBluetoothScan === 'function') {
      await window.electronAPI.resetBluetoothScan();
    }
    const pairing = options.preparedPairing || await window.electronAPI.getCompanionWlanStatus();
    if (!pairing.running || pairing.transport !== 'bluetooth') {
      toast('Start Bluetooth Pairing and let Android scan the QR first.', 'warning');
      return;
    }
    automaticBluetoothDiscoveryTag = automatic ? bluetoothDiscoveryTag(pairing.sessionId) : '';
    automaticBluetoothSelectionPending = automatic && Boolean(automaticBluetoothDiscoveryTag);
    addSyncLog(automatic
      ? `Automatic discovery started for QR session ${automaticBluetoothDiscoveryTag}.`
      : 'Starting Bluetooth scan for companion app...');
    updateSyncStatusUI(
      'scanning',
      automatic ? 'Bluetooth: Waiting for Phone...' : 'Bluetooth: Scanning...',
      automatic ? 'Scan the desktop QR on Android; this desktop will connect automatically.' : 'Searching for E-Class mobile applications...'
    );
    
    // Clear list and display discovery panel
    const list = document.getElementById('discoveredDevicesList');
    if (list) list.innerHTML = `<li class="device-item text-muted">${automatic ? 'Waiting for the phone that scanned this QR...' : 'Searching for E-Class companions...'}</li>`;
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
    automaticBluetoothSelectionPending = false;
    
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
    const knownPairing = storedBluetoothPairing();
    if (knownPairing?.deviceId === device.id) {
      await authorizeKnownBluetoothDevice(knownPairing);
    } else {
      await submitHandshakePin();
    }
  } catch (error) {
    if (error.name === 'NotFoundError' || error.message.includes('User cancelled')) {
      addSyncLog(bleScanCancelledFromPanel
        ? 'Bluetooth search cancelled.'
        : 'Bluetooth scan closed without selecting a phone.');
      updateSyncStatusUI('inactive', 'Bluetooth: Disconnected', 'Scan cancelled.');
    } else {
      addSyncLog(`Bluetooth error: ${error.message}`);
      updateSyncStatusUI('error', 'Bluetooth: Error', error.message);
      toast('Bluetooth scanning failed: ' + error.message, 'error');
    }
    showEl('deviceDiscoveryPanel', false);
    showEl('syncPinPanel', false);
    if (automatic && !bleScanCancelledFromPanel && !isBleAuthorized) {
      addSyncLog('Automatic phone detection will retry. Keep the Android Bluetooth screen open.');
      scheduleAutomaticBluetoothDiscoveryRetry();
    }
  } finally {
    if (!isBleAuthorized) {
      isSyncConnecting = false;
      setBluetoothScanBusy(false);
      automaticBluetoothSelectionPending = false;
      automaticBluetoothDiscoveryTag = '';
    }
  }
}

async function startAutomaticBluetoothDiscovery() {
  if (isSyncConnecting) return false;
  clearTimeout(automaticDiscoveryRetryTimer);
  if (typeof window.electronAPI.resetBluetoothScan === 'function') {
    await window.electronAPI.resetBluetoothScan();
  }
  const pairing = await window.electronAPI.getCompanionWlanStatus();
  if (!pairing.running || pairing.transport !== 'bluetooth') return false;
  preparedAutomaticBluetoothPairing = pairing;
  const result = await window.electronAPI.startAutomaticBluetoothScan(bluetoothDiscoveryTag(pairing.sessionId));
  if (!result?.started) preparedAutomaticBluetoothPairing = null;
  return Boolean(result?.started);
}

function startAutomaticBluetoothDiscoveryFromDesktopGesture() {
  const pairing = preparedAutomaticBluetoothPairing;
  preparedAutomaticBluetoothPairing = null;
  if (!pairing) return false;
  startScanBleDevices({ automatic: true, preparedPairing: pairing, skipReset: true }).catch((error) => {
    addSyncLog(`Automatic phone detection failed: ${error.message}`);
  });
  return true;
}

async function finishBluetoothAuthorization(message) {
  clearTimeout(automaticDiscoveryRetryTimer);
  automaticPairingMode = false;
  isBleAuthorized = true;
  reconnectAttempts = 0;
  addSyncLog(message);
  const companionName = activeGattDevice?.name || 'Android companion';
  updateSyncStatusUI('scanning', 'Bluetooth: Authorized - Synchronizing', `Linked to ${companionName}`);
  showEl('btnSyncToPhone', true);
  showEl('btnScanBle', false);
  showEl('btnDisconnectBle', true);
  await txChar.startNotifications();
  txChar.removeEventListener('characteristicvaluechanged', handleMobileScoresNotification);
  txChar.addEventListener('characteristicvaluechanged', handleMobileScoresNotification);
  startBluetoothLinkMonitor();
  await syncDataToMobile({ silent: true });
  addSyncLog('Authoritative desktop snapshot sent; waiting for Android confirmation.');
}

async function authorizeKnownBluetoothDevice(pairing) {
  const request = {
    kind: 'reconnect',
    desktopId: bluetoothDesktopId(),
    reconnectToken: pairing.reconnectToken
  };
  addSyncLog(`Reconnecting securely to ${pairing.deviceName || 'known Android companion'}...`);
  await handshakeChar.writeValue(new TextEncoder().encode(JSON.stringify(request)));
  const responseValue = await handshakeChar.readValue();
  const response = JSON.parse(new TextDecoder().decode(responseValue));
  if (response.status !== 'reconnected') {
    localStorage.removeItem(BLE_PAIRING_STORAGE_KEY);
    throw new Error('The saved Bluetooth pairing is no longer valid. Pair once more.');
  }
  await finishBluetoothAuthorization('Known Android companion reconnected automatically.');
}

// Submits the first-pairing PIN and persists the returned reconnect credential.
async function submitHandshakePin() {
  if (window.AdminTestMode?.blockExternalAction?.('Bluetooth authorization')) return;
  if (!handshakeChar) return;
  try {
    const pairing = await window.electronAPI.getCompanionWlanStatus();
    const pin = String(pairing.pin || '');
    if (!pairing.running || pairing.transport !== 'bluetooth' || !/^\d{6}$/.test(pin)) {
      throw new Error('The desktop Bluetooth pairing session has ended.');
    }
    const request = {
      kind: 'pair',
      pin,
      desktopId: bluetoothDesktopId(),
      desktopName: 'E-Class Record Desktop'
    };
    addSyncLog('Confirming the desktop PIN entered on Android...');
    await handshakeChar.writeValue(new TextEncoder().encode(JSON.stringify(request)));
    const responseValue = await handshakeChar.readValue();
    const response = JSON.parse(new TextDecoder().decode(responseValue));
    if (response.status !== 'paired' || !response.reconnectToken) {
      throw new Error('Android did not return a reconnect credential.');
    }
    saveBluetoothPairing({
      deviceId: activeGattDevice.id,
      deviceName: activeGattDevice.name || 'Android companion',
      reconnectToken: response.reconnectToken
    });
    await finishBluetoothAuthorization('First pairing complete. Future reconnection is automatic.');
    return;
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
    if (automaticPairingMode && !bleScanCancelledFromPanel) {
      scheduleAutomaticBluetoothDiscoveryRetry();
    }
  }
}

/**
 * Handles incoming Bluetooth notifications containing scores chunk packages.
 */
function handleMobileScoresNotification(event) {
  const value = event.target.value;
  const chunk = new TextDecoder().decode(value);
  
  if (chunk.startsWith('START:') || chunk.startsWith('B64START:')) {
    mobileIsBase64 = chunk.startsWith('B64START:');
    const lenStr = chunk.slice(chunk.indexOf(':') + 1);
    mobileExpectedLen = parseInt(lenStr, 10);
    mobileRxBuffer = '';
    mobileIsReceiving = true;
    addSyncLog(`Incoming scores upload: expected size ${mobileExpectedLen} bytes...`);
  } else if (chunk === 'END') {
    mobileIsReceiving = false;
    addSyncLog(`Upload transfer complete. Processing data (${mobileRxBuffer.length} bytes)...`);
    
    try {
      const jsonText = mobileIsBase64
        ? new TextDecoder().decode(Uint8Array.from(atob(mobileRxBuffer), (char) => char.charCodeAt(0)))
        : mobileRxBuffer;
      const payload = JSON.parse(jsonText);
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
  const payloadKind = payload?.kind
    || (Array.isArray(payload?.changes) ? 'changes' : '')
    || (payload?.command ? 'tool-command' : '')
    || (Object.hasOwn(payload || {}, 'revision') && Object.hasOwn(payload || {}, 'success') ? 'snapshot-ack' : '');
  if (payloadKind === 'snapshot-ack') {
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
  if (payloadKind === 'changes') {
    try {
      const result = await window.MobileSyncBridge.applyBluetoothEnvelope(payload, isBleAuthorized);
      await sendPayloadToMobile({ kind: 'change-result', success: true, accepted: result.accepted || 0 }, 'change result');
      addSyncLog(`${result.accepted || 0} authorized mobile change${result.accepted === 1 ? '' : 's'} saved automatically.`);
    } catch (error) {
      await sendPayloadToMobile({ kind: 'change-result', success: false, accepted: 0, error: error.message || 'Mobile entries were rejected.' }, 'change rejection');
      throw error;
    }
    return;
  }
  if (payloadKind === 'tool-command') {
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
    const rawBytes = encoder.encode(JSON.stringify(payload));
    const bytes = encoder.encode(bytesToBase64(rawBytes));
    addSyncLog(`Sending Bluetooth ${label}: ${rawBytes.length} data bytes (${bytes.length} bytes on wire).`);
    const canWriteWithoutResponse = typeof rxChar.writeValueWithoutResponse === 'function';
    const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
    const write = async (value) => {
      let lastError;
      for (let attempt = 0; attempt < 5; attempt += 1) {
        try {
          if (canWriteWithoutResponse) await rxChar.writeValueWithoutResponse(value);
          else if (typeof rxChar.writeValueWithResponse === 'function') await rxChar.writeValueWithResponse(value);
          else await rxChar.writeValue(value);
          return;
        } catch (error) {
          lastError = error;
          await wait(15 * (attempt + 1));
        }
      }
      throw lastError || new Error('Bluetooth write failed.');
    };
    await write(encoder.encode(`B64START:${bytes.length}`));
    let lastProgressBucket = -1;
    let chunkIndex = 0;
    for (let offset = 0; offset < bytes.length; offset += 160) {
      const end = Math.min(offset + 160, bytes.length);
      await write(bytes.slice(offset, end));
      chunkIndex += 1;
      if (canWriteWithoutResponse && chunkIndex % 8 === 0) await wait(8);
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
  let claimedSnapshotKey = '';
  try {
    const status = await window.electronAPI.getCompanionWlanStatus();
    const snapshot = window.MobileSyncBridge?.buildCompanionSnapshot?.();
    if (!snapshot) throw new Error('The desktop snapshot is not ready.');
    const snapshotKey = JSON.stringify({ ...snapshot, exportedAt: '' });
    if (options.silent && snapshotKey === lastSentBluetoothSnapshotKey) return;
    lastSentBluetoothSnapshotKey = snapshotKey;
    claimedSnapshotKey = snapshotKey;
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
    if (!options.silent) toast('Desktop records sent to the connected phone.', 'success');
  } catch (error) {
    if (claimedSnapshotKey && lastSentBluetoothSnapshotKey === claimedSnapshotKey) {
      lastSentBluetoothSnapshotKey = '';
    }
    addSyncLog(`Sync failed: ${error.message}`);
    if (!options.silent) toast('Failed to transfer class records: ' + error.message, 'error');
    throw error;
  }
}

function scheduleBluetoothSnapshot() {
  if (!rxChar || !isBleAuthorized) return;
  clearTimeout(bluetoothPublishTimer);
  bluetoothPublishTimer = setTimeout(async () => {
    try {
      await window.MobileSyncBridge?.flushPublish?.();
      await syncDataToMobile({ silent: true });
    } catch (_) {
      // The next desktop save or manual refresh retries without interrupting editing.
    }
  }, 250);
}
window.attemptKnownBluetoothReconnect = attemptKnownBluetoothReconnect;

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
  lastSentBluetoothSnapshotKey = '';
  pendingSnapshotRevision = null;
  clearTimeout(snapshotAckTimer);
  snapshotAckTimer = null;
  hasCompletedInitialSnapshot = false;
  clearTimeout(bluetoothPublishTimer);
  clearInterval(linkQualityTimer);
  const quality = document.getElementById('syncLinkQuality');
  if (quality) quality.textContent = storedBluetoothPairing() ? 'Reconnecting...' : 'Not paired';
  scheduleBluetoothReconnect();
  
  showEl('syncPinPanel', false);
  showEl('btnSyncToPhone', false);
  showEl('btnDisconnectBle', false);
  showEl('btnScanBle', true);
}

// ── Electron main process device listing callbacks ──

function cancelBleDiscovery() {
  if (!isSyncConnecting) return;
  bleScanCancelledFromPanel = true;
  automaticBluetoothSelectionPending = false;
  automaticPairingMode = false;
  clearTimeout(automaticDiscoveryRetryTimer);
  window.electronAPI.cancelBluetoothDevice();
  updateSyncStatusUI('scanning', 'Bluetooth: Cancelling...', 'Closing the current phone search...');
}

function selectDiscoveredDevice(deviceId) {
  automaticBluetoothSelectionPending = false;
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
      
      // The private service UUID already filters compatible companions. Keep
      // nameless devices because Windows may not refresh an Android BLE name.
      const companions = deviceList.filter(d => d?.deviceId);
      if (companions.length === 0) {
        list.innerHTML = '<li class="device-item text-muted">No compatible E-Class companion service found nearby.</li>';
        return;
      }

      if (automaticBluetoothSelectionPending && automaticBluetoothDiscoveryTag) {
        const exactMatch = companions.find((device) =>
          String(device.deviceName || '').trim().toUpperCase() === automaticBluetoothDiscoveryTag
        );
        const match = exactMatch || (companions.length === 1 ? companions[0] : null);
        if (match) {
          automaticBluetoothSelectionPending = false;
          addSyncLog(`${exactMatch ? 'QR-matched' : 'Compatible'} phone detected: ${match.deviceName}. Connecting automatically...`);
          selectDiscoveredDevice(match.deviceId);
          return;
        }
      }
      
      companions.forEach(device => {
        const li = document.createElement('li');
        li.className = 'device-item';
        li.innerHTML = `
          <span>📱 ${esc(device.deviceName || 'E-Class Android companion')}</span>
          <span class="device-item__rssi">ID: ${esc(device.deviceId)}</span>
        `;
        li.onclick = () => selectDiscoveredDevice(device.deviceId);
        list.appendChild(li);
      });
    });
  }
});

window.startAutomaticBluetoothDiscovery = startAutomaticBluetoothDiscovery;
window.startAutomaticBluetoothDiscoveryFromDesktopGesture = startAutomaticBluetoothDiscoveryFromDesktopGesture;
