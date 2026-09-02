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

  function companionCalendar(database, schoolYear) {
    const api = globalScope.OfficialSchoolCalendar;
    const stored = Array.isArray(database.calendarEvents) ? database.calendarEvents : [];
    const events = api?.SOURCE_PACK?.schoolYear === schoolYear
      ? api.mergeOfficialEvents(stored)
      : stored.slice();
    const preferences = globalScope.TeacherToolsCore?.normalize?.(database)?.calendarPreferences;
    const filters = preferences?.filters || { official: true, local: true };
    const seen = new Set();

    return events
      .filter((event) => {
        if (!event || event.virtual || event.localOnly || event.syncByDefault === false) return false;
        if (event.schoolYear && String(event.schoolYear) !== schoolYear) return false;
        const official = Boolean(event.immutable || event.sourceId || String(event.id || '').startsWith('official-'));
        if (official && filters.official === false) return false;
        if (!official && filters.local === false) return false;
        return true;
      })
      .map((event, index) => {
        const date = String(event.startDate || event.date || '');
        const endDate = String(event.endDate || date);
        return {
          id: String(event.id || `calendar-${index}-${date}`),
          title: String(event.title || 'School event'),
          date,
          endDate,
          type: String(event.type || event.category || 'local'),
          details: String(event.details || event.description || ''),
          classId: event.classId ? String(event.classId) : null
        };
      })
      .filter((event) => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(event.date)) return false;
        const key = `${event.id}|${event.date}|${event.endDate}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((left, right) => left.date.localeCompare(right.date) || left.title.localeCompare(right.title));
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
      formatVersion: 4,
      exportedAt: new Date().toISOString(),
      sourceAppVersion: String(document.title.match(/v([\d.]+)/)?.[1] || 'desktop'),
      pushPinRequired: Boolean(globalScope.activeProfileRequiresPin?.()),
      teacherName: String(database.teacherName || 'Teacher'),
      schoolName: String(database.schoolName || 'E-Class Record School'),
      schoolYear,
      assignments: assignments.map((assignment) => ({
        id: assignment.id,
        gradeLevel: String(assignment.gradeLevel || ''),
        section: String(assignment.section || ''),
        subject: String(assignment.subject || ''),
        subjectGroup: String(assignment.subjectGroup || ''),
        policy: String(assignment.policy || ''),
        schoolYear: String(assignment.schoolYear || schoolYear),
        learners: (assignment.learners || []).map((learner) => ({
          id: learner.id,
          name: learnerName(learner),
          sex: String(learner.sex || ''),
          lrn: String(learner.lrn || ''),
          avatarPresetId: String(learner.avatarPresetId || ''),
          avatarAssignment: String(learner.avatarAssignment || 'automatic')
        })),
        assessments: (assignment.assessments || []).map((assessment) => ({
          id: assessment.id,
          term: String(assessment.term || '1'),
          component: String(assessment.component || ''),
          title: String(assessment.title || assessment.component || 'Assessment'),
          maxScore: String(assessment.maxScore || ''),
          date: String(assessment.date || ''),
          mapePart: assessment.mapePart ? String(assessment.mapePart) : null
        })),
        scores: Object.fromEntries(Object.entries(assignment.scores || {}).map(([key, value]) => [key, String(value)])),
        attendance: attendance.filter((session) => session.classId === assignment.id)
      })),
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
      calendar: companionCalendar(database, schoolYear),
      summaries: assignments.map((assignment) => ({
        classId: assignment.id,
        term: String(database.currentTerm || '1'),
        learnerCount: (assignment.learners || []).length,
        gradedAssessmentCount: (assignment.assessments || []).filter((assessment) => Object.keys(assignment.scores || {}).some((key) => key.endsWith(`|${assessment.id}`))).length,
        pendingAssessmentCount: (assignment.assessments || []).filter((assessment) => !Object.keys(assignment.scores || {}).some((key) => key.endsWith(`|${assessment.id}`))).length,
        classAverage: null
      })),
      dashboard: { currentTerm: String(database.currentTerm || '1'), attention: [] },
      grades: assignments.flatMap((assignment) => (assignment.learners || []).flatMap((learner) =>
        ['1', '2', '3'].flatMap((term) => {
          if (typeof globalScope.computeTerm !== 'function' && typeof computeTerm !== 'function') return [];
          const result = (globalScope.computeTerm || computeTerm)(assignment, learner.id, term);
          if (!result?.hasData) return [];
          return [{
            learnerId: learner.id,
            classId: assignment.id,
            term,
            initialGrade: Number(result.initialGrade || 0),
            quarterlyGrade: result.termGrade == null ? null : String(result.termGrade),
            remark: typeof descriptor === 'function' ? String(descriptor(result.termGrade) || '') : ''
          }];
        }))),
      checklist: (database.teacherTools?.performanceChecklists || []).flatMap((checklist) => {
        const classId = String(checklist.assignmentId || checklist.classId || '');
        const assignment = assignments.find((item) => item.id === classId);
        return (checklist.criteria || []).map((criterion) => ({
          id: `${checklist.id}-${criterion.id}`,
          classId,
          title: String(criterion.label || criterion.title || 'Checklist item'),
          category: String(checklist.title || checklist.activityTitle || 'Performance Checklist'),
          completedLearners: 0,
          totalLearners: (assignment?.learners || []).length,
          completed: false
        }));
      }),
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
    publishTimer = setTimeout(() => {
      publishTimer = null;
      publish().catch((error) => console.error('Companion publish failed:', error));
    }, 500);
  }

  async function flushPublish() {
    clearTimeout(publishTimer);
    publishTimer = null;
    return publish();
  }

  function renderWlanStatus() {
    const wlanReady = wlanStatus.running && wlanStatus.transport === 'wlan';
    const bluetoothReady = wlanStatus.running && wlanStatus.transport === 'bluetooth';
    const status = document.getElementById('companionWlanStatus');
    const details = document.getElementById('companionWlanDetails');
    const panel = document.getElementById('companionPairingPanel');
    if (status) status.textContent = wlanReady ? 'WLAN sync is ready' : 'WLAN sync is off';
    if (details) details.textContent = wlanReady
      ? `${(wlanStatus.networkInterfaces || []).map((item) => `${item.type} ${item.address}`).join(' · ') || wlanStatus.host}:${wlanStatus.port} · Revision ${wlanStatus.revision || 0}${wlanStatus.lastClientAt ? ' · Phone connected' : ''}`
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
      if (pin) pin.textContent = 'Profile PIN';
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
      globalScope.toast?.('Bluetooth QR is ready. Scan it with Android; pairing will continue automatically.', 'success');
      setTimeout(() => globalScope.startAutomaticBluetoothDiscovery?.().catch((error) => {
        console.error('Automatic Bluetooth discovery failed:', error);
      }), 150);
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
    if (globalScope.activeProfileRequiresPin?.()) {
      if (typeof globalScope.verifyActiveProfilePinForMobile !== 'function') {
        throw new Error('Desktop PIN verification is unavailable. Mobile changes were not applied.');
      }
      const verified = await globalScope.verifyActiveProfilePinForMobile(String(request.authorizationPin || ''));
      if (!verified) throw new Error('Incorrect profile PIN. Mobile changes were not applied.');
    }
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
    if (!wlanStatus.running) {
      try {
        wlanStatus = await globalScope.electronAPI.startCompanionWlan();
      } catch (_error) {
        wlanStatus = await globalScope.electronAPI.startCompanionBluetooth();
      }
    }
    if (wlanStatus.running) {
      const image = await globalScope.electronAPI.generateCompanionQr(wlanStatus.pairingPayload);
      const bluetooth = wlanStatus.transport === 'bluetooth';
      const qr = document.getElementById(bluetooth ? 'companionBluetoothPairingQr' : 'companionPairingQr');
      const pin = document.getElementById(bluetooth ? 'companionBluetoothPairingPin' : 'companionPairingPin');
      if (qr) qr.src = image;
      if (pin) pin.textContent = bluetooth ? wlanStatus.pin : 'Profile PIN';
      if (bluetooth) document.getElementById('btnScanBle')?.style.setProperty('display', '');
      await publish();
      if (bluetooth) {
        setTimeout(async () => {
          const reconnected = await globalScope.attemptKnownBluetoothReconnect?.();
          if (!reconnected) {
            globalScope.startAutomaticBluetoothDiscovery?.().catch((error) => {
              console.error('Automatic Bluetooth discovery failed:', error);
            });
          }
        }, 600);
      }
    }
    renderWlanStatus();
  }

  async function applyBluetoothEnvelope(payload, transportAuthorized = false) {
    if (!transportAuthorized) throw new Error('The Bluetooth link is not authorized.');
    return applyChanges(payload);
  }

  globalScope.MobileSyncBridge = { buildCompanionSnapshot, publish, schedulePublish, flushPublish, applyChanges, applyBluetoothEnvelope, handleToolCommand };
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
