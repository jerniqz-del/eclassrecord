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
let syncLogs = [];

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
  try {
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
      filters: [{ namePrefix: 'EClass-' }],
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
    
    // Connection established but needs authorization code
    updateSyncStatusUI('scanning', 'Bluetooth: Verifying Link...', 'Waiting for validation PIN input...');
    showEl('syncPinPanel', true);
    showEl('btnDisconnectBle', true);
    
    const pinInput = document.getElementById('syncPinInput');
    if (pinInput) {
      pinInput.value = '';
      pinInput.focus();
    }
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
  const pinInput = document.getElementById('syncPinInput');
  if (!pinInput || !handshakeChar) return;
  
  const pin = pinInput.value.trim();
  if (pin.length !== 6 || isNaN(parseInt(pin))) {
    toast('Please enter a valid 6-digit number PIN.', 'warning');
    return;
  }
  
  addSyncLog(`Submitting confirmation PIN code: ${pin}...`);
  
  try {
    const encoder = new TextEncoder();
    await handshakeChar.writeValue(encoder.encode(pin));
    
    // PIN validated successfully!
    addSyncLog('Authorization check passed! Link established securely.');
    updateSyncStatusUI('connected', 'Bluetooth: Connected & Authorized', `Linked to ${activeGattDevice.name}`);
    
    showEl('syncPinPanel', false);
    showEl('btnSyncToPhone', true);
    showEl('btnScanBle', false);
    
    // Subscribe to TX notifications (scores notifications)
    addSyncLog('Subscribing to score notifications from phone...');
    await txChar.startNotifications();
    txChar.addEventListener('characteristicvaluechanged', handleMobileScoresNotification);
    addSyncLog('Subscribed successfully! Listening for score inputs.');
    
    toast('Phone connected and synced successfully!', 'success');
  } catch (err) {
    addSyncLog(`Authorization failed: ${err.message}. Refused connection.`);
    updateSyncStatusUI('error', 'Bluetooth: Connection Refused', 'Verification PIN is incorrect.');
    toast('Handshake verification failed. Check phone screen PIN.', 'error');
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
      const scoresPayload = JSON.parse(mobileRxBuffer);
      mergeUploadedScores(scoresPayload);
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

/**
 * Safely merges synced scores back into the desktop DB assignments.
 */
function mergeUploadedScores(payload) {
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

/**
 * Packs active class loads and sends them in chunks to the mobile app.
 */
async function syncDataToMobile() {
  if (!rxChar) {
    toast('No active companion connection found.', 'warning');
    return;
  }
  
  addSyncLog('Packing class records for synchronization...');
  
  // Extract and send ONLY assignments belonging to active year
  const activeYear = db.schoolYear || '2026-2027';
  const filteredAssignments = db.assignments.filter(a => a.schoolYear === activeYear);
  
  const payload = {
    teacherName: db.teacherName || '',
    schoolName: db.schoolName || '',
    schoolYear: activeYear,
    assignments: filteredAssignments.map(a => ({
      id: a.id,
      gradeLevel: a.gradeLevel,
      section: a.section,
      subject: a.subject,
      subjectGroup: a.subjectGroup || '',
      policy: a.policy || '',
      schoolYear: a.schoolYear || '',
      learners: a.learners.map(l => ({
        id: l.id,
        name: l.name,
        sex: l.sex,
        lrn: l.lrn || ''
      })),
      assessments: a.assessments.map(ast => ({
        id: ast.id,
        term: ast.term,
        component: ast.component,
        title: ast.title,
        maxScore: ast.maxScore,
        date: ast.date || '',
        mapePart: ast.mapePart
      })),
      scores: a.scores || {}
    }))
  };
  
  const dataStr = JSON.stringify(payload);
  addSyncLog(`Payload prepared. Size: ${dataStr.length} characters.`);
  
  try {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(dataStr);
    const mtu = 400; // Safe chunk size for write
    
    addSyncLog('Writing transfer payload initialization header...');
    await rxChar.writeValue(encoder.encode(`START:${bytes.length}`));
    
    // Write chunks
    let offset = 0;
    let chunkIndex = 0;
    const totalChunks = Math.ceil(bytes.length / mtu);
    
    while (offset < bytes.length) {
      const size = Math.min(mtu, bytes.length - offset);
      const chunk = bytes.slice(offset, offset + size);
      
      await rxChar.writeValue(chunk);
      offset += size;
      chunkIndex++;
      
      const pct = Math.round((offset / bytes.length) * 100);
      addSyncLog(`Sending chunks: ${chunkIndex}/${totalChunks} (${pct}%)`);
    }
    
    addSyncLog('Writing transfer payload completion header...');
    await rxChar.writeValue(encoder.encode('END'));
    
    addSyncLog('Rosters and existing grades synced to phone successfully!');
    toast('Rosters synced to phone successfully!', 'success');
  } catch (err) {
    addSyncLog(`Sync failed: ${err.message}`);
    toast('Failed to transfer class files to mobile: ' + err.message, 'error');
  }
}

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
      const companions = deviceList.filter(d => d.deviceName && d.deviceName.startsWith('EClass-'));
      if (companions.length === 0) {
        list.innerHTML = '<li class="device-item text-muted">No compatible E-Class devices broadcasting nearby.</li>';
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
