(function companionSyncModule(globalScope) {
  'use strict';

  const VALID_ATTENDANCE = new Set(['present', 'absent', 'tardy', 'excused']);
  let wlanStatus = { running: false };
  let publishTimer = null;

  function activeProfile() {
    return typeof getActiveProfileDatabase === 'function' ? getActiveProfileDatabase() : null;
  }

  function learnerName(learner) {
    if (typeof globalScope.learnerDisplayName === 'function') return globalScope.learnerDisplayName(learner);
    return String(learner?.name || learner?.displayName || '').trim();
  }

  function attendanceStatuses(assignment, session) {
    const records = Array.isArray(assignment.supportRecords) ? assignment.supportRecords : [];
    return (assignment.learners || []).map((learner) => {
      const match = records.find((record) => record
        && record.category === 'attendance'
        && record.learnerId === learner.id
        && record.date === session.date
        && String(record.term || '1') === String(session.term || '1')
        && ['absence', 'tardy', 'excused'].includes(record.type));
      const status = match?.type === 'absence' ? 'absent' : (match?.type || 'present');
      return { learnerId: learner.id, status, note: String(match?.excuseReason || match?.note || '') };
    });
  }

  function buildCompanionSnapshot() {
    const database = activeProfile();
    if (!database) throw new Error('Open an E-Class Record profile first.');
    const schoolYear = database.schoolYear || '2026-2027';
    const assignments = (database.assignments || []).filter((item) => item.schoolYear === schoolYear);
    const learners = assignments.flatMap((assignment) => (assignment.learners || []).map((learner) => ({
      id: learner.id,
      classId: assignment.id,
      displayName: learnerName(learner),
      avatarPresetId: String(learner.avatarPresetId || ''),
      avatarAssignment: String(learner.avatarAssignment || 'automatic')
    })));
    const assessments = assignments.flatMap((assignment) => (assignment.assessments || []).map((assessment) => ({
      id: assessment.id,
      classId: assignment.id,
      term: String(assessment.term || '1'),
      title: String(assessment.title || assessment.component || 'Assessment'),
      component: String(assessment.component || ''),
      maxScore: Number(assessment.maxScore || 0),
      date: String(assessment.date || '')
    })));
    const scores = assignments.flatMap((assignment) => Object.entries(assignment.scores || {}).flatMap(([key, value]) => {
      const separator = key.indexOf('|');
      if (separator < 1) return [];
      const learnerId = key.slice(0, separator);
      const assessmentId = key.slice(separator + 1);
      if (!(assignment.learners || []).some((item) => item.id === learnerId)) return [];
      if (!(assignment.assessments || []).some((item) => item.id === assessmentId)) return [];
      return [{ classId: assignment.id, learnerId, assessmentId, value: value === '' ? null : Number(value) }];
    }));
    const attendance = assignments.flatMap((assignment) => (assignment.attendanceSessions || []).map((rawSession) => {
      const session = typeof rawSession === 'string' ? { date: rawSession, term: '1' } : rawSession;
      return {
        classId: assignment.id,
        date: String(session.date || ''),
        term: String(session.term || '1'),
        statuses: attendanceStatuses(assignment, session)
      };
    }).filter((session) => /^\d{4}-\d{2}-\d{2}$/.test(session.date)));

    return {
      format: 'eclass-companion-snapshot',
      formatVersion: 3,
      exportedAt: new Date().toISOString(),
      sourceAppVersion: String(document.title.match(/v([\d.]+)/)?.[1] || 'desktop'),
      school: {
        name: String(database.schoolName || 'E-Class Record School'),
        schoolYear,
        teacherName: String(database.teacherName || 'Teacher')
      },
      classes: assignments.map((assignment) => ({
        id: assignment.id,
        gradeLevel: `Grade ${assignment.gradeLevel || ''}`.trim(),
        section: String(assignment.section || ''),
        subject: String(assignment.subject || ''),
        learnerCount: (assignment.learners || []).length
      })),
      learners,
      calendar: [],
      summaries: assignments.map((assignment) => ({
        classId: assignment.id,
        term: String(database.currentTerm || '1'),
        learnerCount: (assignment.learners || []).length,
        gradedAssessmentCount: (assignment.assessments || []).filter((assessment) => Object.keys(assignment.scores || {}).some((key) => key.endsWith(`|${assessment.id}`))).length,
        pendingAssessmentCount: (assignment.assessments || []).filter((assessment) => !Object.keys(assignment.scores || {}).some((key) => key.endsWith(`|${assessment.id}`))).length,
        classAverage: null
      })),
      dashboard: { currentTerm: String(database.currentTerm || '1'), attention: [] },
      grades: [],
      checklist: [],
      assessments,
      scores,
      attendance
    };
  }

  async function publish() {
    if (!globalScope.electronAPI?.publishCompanionSnapshot) return { skipped: true };
    const status = await globalScope.electronAPI.getCompanionWlanStatus();
    wlanStatus = status;
    if (!status.running) return { skipped: true };
    const result = await globalScope.electronAPI.publishCompanionSnapshot(buildCompanionSnapshot());
    wlanStatus = { ...wlanStatus, revision: result.revision, hasSnapshot: true };
    renderWlanStatus();
    return result;
  }

  function schedulePublish() {
    clearTimeout(publishTimer);
    publishTimer = setTimeout(() => publish().catch((error) => console.error('Companion publish failed:', error)), 500);
  }

  function renderWlanStatus() {
    const wlanReady = wlanStatus.running && wlanStatus.transport === 'wlan';
    const bluetoothReady = wlanStatus.running && wlanStatus.transport === 'bluetooth';
    const status = document.getElementById('companionWlanStatus');
    const details = document.getElementById('companionWlanDetails');
    const panel = document.getElementById('companionPairingPanel');
    if (status) status.textContent = wlanReady ? 'WLAN sync is ready' : 'WLAN sync is off';
    if (details) details.textContent = wlanReady
      ? `${wlanStatus.host}:${wlanStatus.port} · Revision ${wlanStatus.revision || 0}${wlanStatus.lastClientAt ? ' · Phone connected' : ''}`
      : 'Create a QR for phones connected to the same trusted Wi-Fi network.';
    if (panel) panel.style.display = wlanReady ? '' : 'none';
    const start = document.getElementById('btnStartCompanionWlan');
    const stop = document.getElementById('btnStopCompanionWlan');
    if (start) start.style.display = wlanReady ? 'none' : '';
    if (stop) stop.style.display = wlanReady ? '' : 'none';
    const bluetoothPanel = document.getElementById('companionBluetoothPairingPanel');
    const bluetoothStart = document.getElementById('btnStartCompanionBluetooth');
    const bluetoothStop = document.getElementById('btnStopCompanionBluetooth');
    const bluetoothScan = document.getElementById('btnScanBle');
    if (bluetoothPanel) bluetoothPanel.style.display = bluetoothReady ? '' : 'none';
    if (bluetoothStart) bluetoothStart.style.display = bluetoothReady ? 'none' : '';
    if (bluetoothStop) bluetoothStop.style.display = bluetoothReady ? '' : 'none';
    if (bluetoothScan && !bluetoothReady) bluetoothScan.style.display = 'none';
  }

  async function startCompanionWlan() {
    if (globalScope.AdminTestMode?.blockExternalAction?.('Companion WLAN server')) return;
    try {
      wlanStatus = await globalScope.electronAPI.startCompanionWlan();
      const image = await globalScope.electronAPI.generateCompanionQr(wlanStatus.pairingPayload);
      const qr = document.getElementById('companionPairingQr');
      const pin = document.getElementById('companionPairingPin');
      if (qr) qr.src = image;
      if (pin) pin.textContent = wlanStatus.pin;
      renderWlanStatus();
      await publish();
      globalScope.toast?.('Companion WLAN pairing is ready.', 'success');
    } catch (error) {
      globalScope.toast?.(error.message || 'Could not start companion WLAN sync.', 'error');
    }
  }

  async function stopCompanionWlan() {
    wlanStatus = await globalScope.electronAPI.stopCompanionWlan();
    renderWlanStatus();
  }

  async function startCompanionBluetoothPairing() {
    if (globalScope.AdminTestMode?.blockExternalAction?.('Companion Bluetooth pairing')) return;
    try {
      if (!wlanStatus.running || wlanStatus.transport !== 'bluetooth') wlanStatus = await globalScope.electronAPI.startCompanionBluetooth();
      const bluetoothPayload = String(wlanStatus.pairingPayload || '');
      if (!bluetoothPayload.includes('|bluetooth|')) throw new Error('The Bluetooth pairing session could not be created.');
      const image = await globalScope.electronAPI.generateCompanionQr(bluetoothPayload);
      const panel = document.getElementById('companionBluetoothPairingPanel');
      const qr = document.getElementById('companionBluetoothPairingQr');
      const pin = document.getElementById('companionBluetoothPairingPin');
      const scan = document.getElementById('btnScanBle');
      if (qr) qr.src = image;
      if (pin) pin.textContent = wlanStatus.pin;
      if (panel) panel.style.display = '';
      if (scan) scan.style.display = '';
      renderWlanStatus();
      await publish();
      globalScope.toast?.('Bluetooth QR is ready. Scan it with Android, then scan for the phone.', 'success');
    } catch (error) {
      globalScope.toast?.(error.message || 'Could not create Bluetooth pairing QR.', 'error');
    }
  }

  function scoreChange(change, assignment) {
    const learner = (assignment.learners || []).find((item) => item.id === change.learnerId);
    const assessment = (assignment.assessments || []).find((item) => item.id === change.assessmentId);
    if (!learner || !assessment) throw new Error('A mobile score references an unknown learner or assessment.');
    const value = change.value === null || change.value === '' ? '' : Number(change.value);
    if (value !== '' && (!Number.isFinite(value) || value < 0 || value > Number(assessment.maxScore || 0))) {
      throw new Error(`A mobile score is outside the allowed range for ${assessment.title}.`);
    }
    const key = `${learner.id}|${assessment.id}`;
    const previousValue = assignment.scores?.[key] ?? '';
    if (String(previousValue) === String(value)) return false;
    if (!assignment.scores) assignment.scores = {};
    globalScope.ScoreHistory?.record?.(assignment, {
      learnerId: learner.id,
      assessmentId: assessment.id,
      previousValue,
      newValue: value,
      source: 'android-companion'
    });
    assignment.scores[key] = value;
    return true;
  }

  function attendanceChange(change, assignment) {
    const learner = (assignment.learners || []).find((item) => item.id === change.learnerId);
    const date = String(change.date || '');
    const term = String(change.term || '1');
    const status = String(change.status || '');
    if (!learner || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !VALID_ATTENDANCE.has(status)) {
      throw new Error('A mobile attendance entry is invalid.');
    }
    if (!Array.isArray(assignment.attendanceSessions)) assignment.attendanceSessions = [];
    if (!assignment.attendanceSessions.some((item) => {
      const session = typeof item === 'string' ? { date: item, term: '1' } : item;
      return session.date === date && String(session.term || '1') === term;
    })) assignment.attendanceSessions.push({ date, term });
    if (!Array.isArray(assignment.supportRecords)) assignment.supportRecords = [];
    const before = assignment.supportRecords.length;
    assignment.supportRecords = assignment.supportRecords.filter((record) => !(record
      && record.category === 'attendance'
      && record.learnerId === learner.id
      && record.date === date
      && String(record.term || '1') === term
      && ['absence', 'tardy', 'excused'].includes(record.type)));
    if (status !== 'present') {
      const type = status === 'absent' ? 'absence' : status;
      const note = String(change.note || '').trim().slice(0, 300);
      assignment.supportRecords.push({
        id: `mobile-attendance-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        category: 'attendance', type, learnerId: learner.id, date, term,
        note: status === 'excused' && note ? `Excused: ${note}` : note,
        ...(status === 'excused' ? { excuseReason: note } : {}),
        createdAt: new Date().toISOString(), source: 'android-companion'
      });
    }
    return before !== assignment.supportRecords.length || status !== 'present';
  }

  async function applyChanges(request) {
    const database = activeProfile();
    if (!database) throw new Error('No active desktop profile is open.');
    const latestStatus = await globalScope.electronAPI.getCompanionWlanStatus();
    if (Number(request.baseRevision || 0) !== Number(latestStatus.revision || 0)) {
      throw new Error('Desktop data changed after these mobile edits were started. Refresh the phone and review the drafts before sending again.');
    }
    await globalScope.electronAPI.createDatabaseRestorePoint?.('android-companion-import');
    let accepted = 0;
    for (const change of request.changes || []) {
      const assignment = (database.assignments || []).find((item) => item.id === change.classId);
      if (!assignment) throw new Error('A mobile change references an unknown class.');
      if (change.type === 'score' && scoreChange(change, assignment)) accepted += 1;
      else if (change.type === 'attendance' && attendanceChange(change, assignment)) accepted += 1;
      else if (!['score', 'attendance'].includes(change.type)) throw new Error('Unsupported mobile change type.');
    }
    if (accepted) {
      await globalScope.saveDatabase();
      globalScope.render?.();
      globalScope.toast?.(`${accepted} mobile entries were applied to the desktop record.`, 'success');
    }
    return { success: true, accepted };
  }

  async function handleApplyRequest(request) {
    try {
      const result = await applyChanges(request);
      globalScope.electronAPI.sendCompanionChangesResult(request.requestId, result);
    } catch (error) {
      globalScope.electronAPI.sendCompanionChangesResult(request.requestId, { success: false, error: error.message || 'Mobile changes were rejected.' });
    }
  }

  function handleToolCommand(request) {
    const command = String(request.command || '');
    if (command === 'open-picker') { globalScope.setView?.('tools'); globalScope.TeacherTools?.openTool?.('picker'); }
    else if (command === 'pick-learner') { globalScope.setView?.('tools'); globalScope.TeacherTools?.activate?.('picker'); globalScope.TeacherTools?.pickName?.(); }
    else if (command === 'reset-picker') globalScope.TeacherTools?.resetPicker?.();
    else if (command === 'open-groups') { globalScope.setView?.('tools'); globalScope.TeacherTools?.openTool?.('groups'); }
    else if (command === 'randomize-groups') { globalScope.setView?.('tools'); globalScope.TeacherTools?.activate?.('groups'); globalScope.TeacherTools?.randomizeGroups?.(); }
    else if (command === 'open-checklist') globalScope.TeacherTools?.openPerformanceChecklistPage?.();
    else globalScope.toast?.('The phone requested an unsupported tool command.', 'warning');
  }

  async function restoreStatus() {
    wlanStatus = await globalScope.electronAPI.getCompanionWlanStatus();
    if (wlanStatus.running) {
      const image = await globalScope.electronAPI.generateCompanionQr(wlanStatus.pairingPayload);
      const bluetooth = wlanStatus.transport === 'bluetooth';
      const qr = document.getElementById(bluetooth ? 'companionBluetoothPairingQr' : 'companionPairingQr');
      const pin = document.getElementById(bluetooth ? 'companionBluetoothPairingPin' : 'companionPairingPin');
      if (qr) qr.src = image;
      if (pin) pin.textContent = wlanStatus.pin;
      if (bluetooth) document.getElementById('btnScanBle')?.style.setProperty('display', '');
      await publish();
    }
    renderWlanStatus();
  }

  let bluetoothPinFailures = 0;
  let bluetoothPinLockedUntil = 0;

  async function applyBluetoothEnvelope(payload) {
    const now = Date.now();
    if (now < bluetoothPinLockedUntil) throw new Error('Too many incorrect PIN attempts. Wait 30 seconds and try again.');
    const latestStatus = await globalScope.electronAPI.getCompanionWlanStatus();
    if (!latestStatus.running || String(payload.pin || '') !== String(latestStatus.pin || '')) {
      bluetoothPinFailures += 1;
      if (bluetoothPinFailures >= 5) {
        bluetoothPinFailures = 0;
        bluetoothPinLockedUntil = now + 30000;
      }
      throw new Error('The desktop PIN is incorrect or the pairing session has ended.');
    }
    bluetoothPinFailures = 0;
    return applyChanges(payload);
  }

  globalScope.MobileSyncBridge = { buildCompanionSnapshot, publish, schedulePublish, applyChanges, applyBluetoothEnvelope, handleToolCommand };
  globalScope.startCompanionWlan = startCompanionWlan;
  globalScope.startCompanionBluetoothPairing = startCompanionBluetoothPairing;
  globalScope.stopCompanionWlan = stopCompanionWlan;

  globalScope.addEventListener('DOMContentLoaded', () => {
    globalScope.electronAPI?.onCompanionApplyChanges?.(handleApplyRequest);
    globalScope.electronAPI?.onCompanionToolCommand?.(handleToolCommand);
    globalScope.electronAPI?.onCompanionClientActivity?.((activity) => {
      wlanStatus = { ...wlanStatus, lastClientAt: activity.at };
      renderWlanStatus();
    });
    restoreStatus().catch((error) => console.error('Companion status restore failed:', error));
  });
})(window);
