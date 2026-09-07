(function companionSyncModule(globalScope) {
  'use strict';

  const VALID_ATTENDANCE = new Set(['present', 'absent', 'tardy', 'excused']);
  const COMPANION_DISPLAY_CLASSES = ['companion-js-hidden', 'companion-js-grid', 'companion-js-flex', 'companion-js-inline-flex'];
  const WLAN_QR_TTL_MS = 5 * 60 * 1000;
  const INSTALL_QR_TTL_MS = 15 * 60 * 1000;
  let wlanStatus = { running: false };
  let apkInstallStatus = { running: false };
  let publishTimer = null;
  let companionQrTimer = null;
  let companionQrDeadline = 0;
  let companionQrKind = '';

  function setCompanionDisplay(element, visible, shownClass) {
    if (!element) return;
    Array.from(element.classList).forEach((name) => {
      if (name.startsWith('eclass-generated-style-') || COMPANION_DISPLAY_CLASSES.includes(name)) {
        element.classList.remove(name);
      }
    });
    element.classList.add(visible ? shownClass : 'companion-js-hidden');
    element.hidden = !visible;
  }

  function activeProfile() {
    return typeof getActiveProfileDatabase === 'function' ? getActiveProfileDatabase() : null;
  }

  function activeProfileDescriptor() {
    const database = activeProfile();
    const root = typeof getRootDatabase === 'function' ? getRootDatabase() : globalScope.getRootDatabase?.();
    const profileId = String(root?.activeProfileId || '');
    if (!database || !profileId) throw new Error('Open an E-Class Record profile first.');
    const record = (root?.profiles || []).find((item) => item.id === profileId);
    return {
      profileId,
      profileName: String(record?.name || database.teacherName || 'Teacher profile'),
      schoolYear: String(database.schoolYear || ''),
      desktopName: 'E-Class Record Desktop'
    };
  }

  function escapeCompanionHtml(value) {
    return String(value || '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[char]));
  }

  function formatQrCountdown(ms) {
    const total = Math.max(0, Math.ceil(ms / 1000));
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  }

  function stopCompanionQrTimer() {
    if (!companionQrTimer) return;
    clearInterval(companionQrTimer);
    companionQrTimer = null;
  }

  function closeCompanionQrModal() {
    stopCompanionQrTimer();
    companionQrKind = '';
    const modal = document.getElementById('companionQrModal');
    if (modal) modal.style.display = 'none';
  }

  function tickCompanionQrTimer() {
    const remaining = companionQrDeadline - Date.now();
    const timer = document.getElementById('companionQrModalTimer');
    if (timer) {
      timer.textContent = remaining <= 0
        ? 'This QR expired. Close this window and generate a new one.'
        : `This QR expires in ${formatQrCountdown(remaining)}. Click outside or Close to hide it. Pairing stays active.`;
    }
    if (remaining <= 0) closeCompanionQrModal();
  }

  function companionQrInstructions(kind) {
    if (kind === 'install') {
      const url = escapeCompanionHtml(document.getElementById('companionApkInstallUrl')?.textContent || apkInstallStatus.url || '');
      const meta = escapeCompanionHtml(document.getElementById('companionApkInstallMeta')?.textContent || '');
      return `<strong>Scan this QR with the phone camera</strong>
        <ol>
          <li>Use the same trusted Wi-Fi, or enable the phone hotspot and connect this computer to it.</li>
          <li>Open the camera or a QR scanner, not the companion app scanner.</li>
          <li>On the landing page tap Download APK, then allow install from this source if Android asks.</li>
        </ol>
        <p class="companion-apk-install-url">${url}</p>
        <small>${meta}</small>`;
    }
    if (kind === 'bluetooth') {
      const pin = escapeCompanionHtml(document.getElementById('companionBluetoothPairingPin')?.textContent || wlanStatus.pin || '');
      return `<strong>Scan this Bluetooth QR from the Android app</strong>
        <ol>
          <li>On Android choose Connect to Desktop App → Bluetooth and scan this QR.</li>
          <li>The phone advertises this QR session automatically.</li>
          <li>The desktop detects the matching phone, authorizes it, and synchronizes without another click.</li>
        </ol>
        <div class="companion-pin-display"><span>Manual pairing PIN</span><strong>${pin}</strong></div>
        <small>Keep this desktop pairing session open while using the companion app.</small>`;
    }
    const usesProfilePin = Boolean(globalScope.activeProfileRequiresPin?.());
    const pin = escapeCompanionHtml(document.getElementById('companionPairingPin')?.textContent || wlanStatus.pin || '');
    const pinHtml = usesProfilePin ? '' : `<div class="companion-pin-display"><span>Temporary pairing PIN (profile has no login PIN)</span><strong>${pin}</strong></div>`;
    return `<strong>Scan this QR code from the Android app</strong>
      <ol>
        <li>Use the same trusted Wi-Fi, or enable the phone hotspot and connect this computer to it.</li>
        <li>If Android times out, open Windows Firewall and allow E-Class Record on Private networks. Then refresh the QR.</li>
        <li>On Android scan this QR and enter your usual profile login PIN. The PIN is neither displayed nor included in the QR.</li>
      </ol>
      ${pinHtml}
      <small>Do not photograph or share this QR code. It contains the encrypted session key.</small>`;
  }

  function openCompanionQrModal({ kind, title, image, expiresAt, fallbackMs }) {
    companionQrKind = kind;
    const modal = document.getElementById('companionQrModal');
    const titleEl = document.getElementById('companionQrModalTitle');
    const imageEl = document.getElementById('companionQrModalImage');
    const instructions = document.getElementById('companionQrModalInstructions');
    if (titleEl) titleEl.textContent = title;
    if (imageEl) imageEl.src = image || '';
    if (instructions) instructions.innerHTML = companionQrInstructions(kind);
    const parsed = Date.parse(expiresAt || '');
    companionQrDeadline = Number.isFinite(parsed) ? parsed : Date.now() + (fallbackMs || WLAN_QR_TTL_MS);
    if (modal) modal.style.display = 'flex';
    stopCompanionQrTimer();
    tickCompanionQrTimer();
    companionQrTimer = setInterval(tickCompanionQrTimer, 1000);
  }

  function renderWlanPairingPin(status = wlanStatus) {
    const display = document.getElementById('companionPairingPinDisplay');
    const pin = document.getElementById('companionPairingPin');
    const usesProfilePin = Boolean(globalScope.activeProfileRequiresPin?.());
    setCompanionDisplay(display, !usesProfilePin, 'companion-js-flex');
    if (pin) pin.textContent = usesProfilePin ? '' : String(status.pin || '------');
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
      protocolVersion: 2,
      profileId: activeProfileDescriptor().profileId,
      profileName: activeProfileDescriptor().profileName,
      exportedAt: new Date().toISOString(),
      sourceAppVersion: String(document.title.match(/v([\d.]+)/)?.[1] || 'desktop'),
      pushPinRequired: Boolean(globalScope.activeProfileRequiresPin?.()),
      teacherName: String(database.teacherName || 'Teacher'),
      schoolName: String(database.schoolName || 'E-Class Record School'),
      schoolId: String(database.schoolId || ''),
      region: String(database.region || ''),
      division: String(database.division || ''),
      district: String(database.district || ''),
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
          .map((session) => ({
            classId: session.classId,
            date: session.date,
            term: session.term,
            statuses: session.statuses.map((status) => ({ ...status }))
          }))
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
    const linkQuality = document.getElementById('companionWlanLinkQuality');
    const linkMeter = document.getElementById('companionWlanLinkMeter');
    const linkLatency = document.getElementById('companionWlanLinkLatency');
    if (status) status.textContent = wlanReady ? 'WLAN sync is ready' : 'WLAN sync is off';
    if (details) details.textContent = wlanReady
      ? `${(wlanStatus.networkInterfaces || []).map((item) => `${item.type} ${item.address}`).join(' · ') || wlanStatus.host}:${wlanStatus.port} · Revision ${wlanStatus.revision || 0}${wlanStatus.lastClientAt ? ' · Phone connected' : ''}`
      : 'Linked phones reconnect automatically after you unlock a profile. A new QR is only needed for a first-time pair.';
    setCompanionDisplay(panel, false, 'companion-js-grid');
    const strength = Math.max(0, Math.min(100, Number(wlanStatus.linkStrength || 0)));
    if (linkQuality) linkQuality.textContent = wlanStatus.lastClientAt
      ? `${wlanStatus.linkQuality || 'Connected'} · ${strength}%`
      : 'Waiting for phone';
    if (linkMeter) {
      linkMeter.style.width = `${strength}%`;
      linkMeter.dataset.quality = strength >= 75 ? 'strong' : strength >= 40 ? 'fair' : 'weak';
    }
    if (linkLatency) linkLatency.textContent = wlanStatus.lastClientAt
      ? `Last activity ${new Date(wlanStatus.lastClientAt).toLocaleTimeString()}${wlanStatus.linkRttMs ? ` · ${wlanStatus.linkRttMs} ms local round-trip` : ''}`
      : 'The linked phone will reconnect automatically when this desktop is available.';
    const start = document.getElementById('btnStartCompanionWlan');
    const refresh = document.getElementById('btnRefreshCompanionWlan');
    const stop = document.getElementById('btnStopCompanionWlan');
    setCompanionDisplay(start, !wlanReady, 'companion-js-inline-flex');
    setCompanionDisplay(refresh, wlanReady, 'companion-js-inline-flex');
    setCompanionDisplay(stop, wlanReady, 'companion-js-inline-flex');
    const bluetoothPanel = document.getElementById('companionBluetoothPairingPanel');
    const bluetoothStart = document.getElementById('btnStartCompanionBluetooth');
    const bluetoothStop = document.getElementById('btnStopCompanionBluetooth');
    const bluetoothScan = document.getElementById('btnScanBle');
    setCompanionDisplay(bluetoothPanel, false, 'companion-js-grid');
    setCompanionDisplay(bluetoothStart, true, 'companion-js-inline-flex');
    setCompanionDisplay(bluetoothStop, bluetoothReady, 'companion-js-inline-flex');
    setCompanionDisplay(bluetoothScan, bluetoothReady, 'companion-js-inline-flex');
  }

  async function startCompanionWlan() {
    if (globalScope.AdminTestMode?.blockExternalAction?.('Companion WLAN server')) return;
    try {
      wlanStatus = await globalScope.electronAPI.startCompanionWlan(activeProfileDescriptor());
      renderWlanPairingPin();
      renderWlanStatus();
      const image = await globalScope.electronAPI.generateCompanionQr(wlanStatus.pairingPayloadV2 || wlanStatus.pairingPayload);
      const qr = document.getElementById('companionPairingQr');
      if (qr) qr.src = image;
      openCompanionQrModal({
        kind: 'wlan',
        title: 'WLAN pairing QR',
        image,
        expiresAt: wlanStatus.pairingExpiresAt,
        fallbackMs: WLAN_QR_TTL_MS
      });
      await publish();
      globalScope.toast?.('Companion WLAN pairing is ready.', 'success');
    } catch (error) {
      renderWlanStatus();
      globalScope.toast?.(error.message || 'Could not start companion WLAN sync.', 'error');
    }
  }

  async function stopCompanionWlan() {
    wlanStatus = await globalScope.electronAPI.stopCompanionWlan();
    if (companionQrKind === 'wlan' || companionQrKind === 'bluetooth') closeCompanionQrModal();
    renderWlanStatus();
  }

  function formatApkSize(bytes) {
    const size = Number(bytes) || 0;
    if (size < 1024) return `${size} bytes`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }

  function renderMobileUpdateStatus(result) {
    const status = document.getElementById('companionMobileUpdateStatus');
    const github = document.getElementById('companionMobileUpdateGithubStatus');
    const banner = document.getElementById('companionMobileUpdateBanner');
    const bannerText = document.getElementById('companionMobileUpdateBannerText');
    const available = Boolean(result?.available);
    if (status) {
      status.textContent = available
        ? `Cached Android update ${result.update.versionName} (${formatApkSize(result.update.size)}). Linked phones receive it automatically over Wi-Fi.`
        : 'No cached Android update.';
    }
    if (github) github.textContent = result?.github?.message || 'GitHub mobile updates have not been checked yet.';
    if (bannerText && available) {
      bannerText.textContent = `Android ${result.update.versionName} is ready. Linked phones receive the package over Wi-Fi or hotspot.`;
    }
    setCompanionDisplay(banner, available, 'companion-js-flex');
  }

  function renderApkInstallPanel(status = apkInstallStatus) {
    apkInstallStatus = status || { running: false };
    const running = Boolean(apkInstallStatus.running);
    setCompanionDisplay(document.getElementById('btnStartCompanionApkInstall'), !running, 'companion-js-inline-flex');
    setCompanionDisplay(document.getElementById('btnRefreshCompanionApkInstall'), running, 'companion-js-inline-flex');
    setCompanionDisplay(document.getElementById('btnStopCompanionApkInstall'), running, 'companion-js-inline-flex');
    setCompanionDisplay(document.getElementById('companionApkInstallPanel'), false, 'companion-js-grid');
    const url = document.getElementById('companionApkInstallUrl');
    const meta = document.getElementById('companionApkInstallMeta');
    if (url) url.textContent = running ? String(apkInstallStatus.url || '') : '';
    if (meta) {
      meta.textContent = running
        ? `${apkInstallStatus.versionName || 'Android package'} · ${formatApkSize(apkInstallStatus.size)} · expires ${apkInstallStatus.expiresAt ? new Date(apkInstallStatus.expiresAt).toLocaleTimeString() : 'soon'}`
        : 'This link expires after 15 minutes.';
    }
  }

  async function refreshCompanionMobileUpdateFromGithub() {
    try {
      const result = await globalScope.electronAPI.refreshCompanionMobileUpdateFromGithub();
      renderMobileUpdateStatus(result);
      globalScope.toast?.(result?.available ? 'A verified Android update is cached for WLAN delivery.' : (result?.github?.message || 'No Android update is cached yet.'), result?.available ? 'success' : 'warning');
    } catch (error) {
      globalScope.toast?.(error.message || 'Could not check GitHub for a mobile update.', 'error');
    }
  }

  async function importCompanionMobileUpdate() {
    try {
      const result = await globalScope.electronAPI.importCompanionMobileUpdate();
      if (result?.canceled) return;
      const status = await globalScope.electronAPI.getCompanionMobileUpdateStatus();
      renderMobileUpdateStatus(status);
      globalScope.toast?.(status?.available ? 'The imported Android update is ready for the install QR.' : 'Import did not leave a cached Android update.', status?.available ? 'success' : 'warning');
    } catch (error) {
      globalScope.toast?.(error.message || 'Could not import a mobile update.', 'error');
    }
  }

  async function configureCompanionFirewall() {
    try {
      await globalScope.electronAPI.configureCompanionFirewall();
      globalScope.toast?.('Allow E-Class Record on Private networks. Install QR uses TCP 38474.', 'success');
    } catch (error) {
      globalScope.toast?.(error.message || 'Could not open Windows Firewall.', 'error');
    }
  }

  async function startCompanionApkInstall() {
    if (globalScope.AdminTestMode?.blockExternalAction?.('Companion APK install QR')) return;
    try {
      apkInstallStatus = await globalScope.electronAPI.startCompanionApkInstall();
      const qr = document.getElementById('companionApkInstallQr');
      if (qr) qr.src = apkInstallStatus.qrDataUrl || '';
      renderApkInstallPanel(apkInstallStatus);
      openCompanionQrModal({
        kind: 'install',
        title: 'Android install QR',
        image: apkInstallStatus.qrDataUrl || '',
        expiresAt: apkInstallStatus.expiresAt,
        fallbackMs: INSTALL_QR_TTL_MS
      });
      globalScope.toast?.('Scan the install QR with the phone camera to download the APK.', 'success');
    } catch (error) {
      renderApkInstallPanel({ running: false });
      globalScope.toast?.(error.message || 'Could not start the APK install QR.', 'error');
    }
  }

  async function stopCompanionApkInstall() {
    apkInstallStatus = await globalScope.electronAPI.stopCompanionApkInstall();
    if (companionQrKind === 'install') closeCompanionQrModal();
    renderApkInstallPanel(apkInstallStatus);
  }

  async function restoreMobileUpdateUi() {
    try {
      renderMobileUpdateStatus(await globalScope.electronAPI.getCompanionMobileUpdateStatus());
    } catch (_error) {
      renderMobileUpdateStatus({ available: false });
    }
    try {
      renderApkInstallPanel(await globalScope.electronAPI.getCompanionApkInstallStatus());
    } catch (_error) {
      renderApkInstallPanel({ running: false });
    }
  }

  async function startCompanionBluetoothPairing() {
    if (globalScope.AdminTestMode?.blockExternalAction?.('Companion Bluetooth pairing')) return;
    try {
      if (!wlanStatus.running || wlanStatus.transport !== 'bluetooth') wlanStatus = await globalScope.electronAPI.startCompanionBluetooth(activeProfileDescriptor());
      const bluetoothPayload = String(wlanStatus.pairingPayloadV2 || wlanStatus.pairingPayload || '');
      if (!bluetoothPayload.includes('bluetooth')) throw new Error('The Bluetooth pairing session could not be created.');
      const image = await globalScope.electronAPI.generateCompanionQr(bluetoothPayload);
      const panel = document.getElementById('companionBluetoothPairingPanel');
      const qr = document.getElementById('companionBluetoothPairingQr');
      const pin = document.getElementById('companionBluetoothPairingPin');
      const scan = document.getElementById('btnScanBle');
      if (qr) qr.src = image;
      if (pin) pin.textContent = wlanStatus.pin;
      setCompanionDisplay(panel, false, 'companion-js-grid');
      setCompanionDisplay(scan, true, 'companion-js-inline-flex');
      renderWlanStatus();
      openCompanionQrModal({
        kind: 'bluetooth',
        title: 'Bluetooth pairing QR',
        image,
        expiresAt: wlanStatus.pairingExpiresAt,
        fallbackMs: WLAN_QR_TTL_MS
      });
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
      newValue: value === '' ? '' : String(value),
      source: 'android-companion'
    });
    if (value === '') delete assignment.scores[key];
    else assignment.scores[key] = value;
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

  function profileFields(change) {
    if (change.field) {
      return { [String(change.field)]: String(change.value || '') };
    }
    try {
      const parsed = JSON.parse(String(change.value || '{}'));
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    } catch (_error) {}
    return {};
  }

  function profileChange(change, database) {
    const allowed = new Set(['teacherName', 'schoolName', 'schoolId', 'region', 'division', 'district']);
    const fields = profileFields(change);
    let changed = false;
    allowed.forEach((key) => {
      if (!Object.prototype.hasOwnProperty.call(fields, key)) return;
      const next = String(fields[key] || '').trim().slice(0, 160);
      if (String(database[key] || '') === next) return;
      database[key] = next;
      changed = true;
    });
    if (changed && database.teacherName) {
      const root = typeof getRootDatabase === 'function' ? getRootDatabase() : globalScope.getRootDatabase?.();
      const profile = (root?.profiles || []).find((item) => item.id === activeProfileDescriptor().profileId);
      if (profile && profile.name !== database.teacherName) profile.name = database.teacherName;
    }
    return changed;
  }

  function calendarChange(change, database) {
    if (!Array.isArray(database.calendarEvents)) database.calendarEvents = [];
    const action = String(change.action || 'upsert');
    const eventId = String(change.eventId || change.assessmentId || '').trim();
    if (!eventId) throw new Error('A mobile calendar change is missing its event id.');
    const existing = database.calendarEvents.find((item) => String(item.id) === eventId);
    const official = Boolean(existing?.immutable || existing?.sourceId || eventId.startsWith('official-'));
    if (official) throw new Error('Official calendar events cannot be changed from the phone.');
    if (action === 'delete') {
      const before = database.calendarEvents.length;
      database.calendarEvents = database.calendarEvents.filter((item) => String(item.id) !== eventId);
      return database.calendarEvents.length !== before;
    }
    const date = String(change.date || '');
    const endDate = String(change.endDate || date);
    const title = String(change.title || change.value || '').trim().slice(0, 160);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate) || !title) {
      throw new Error('A mobile calendar entry is invalid.');
    }
    if (endDate < date) throw new Error('A mobile calendar entry ends before it starts.');
    const next = {
      id: eventId,
      title,
      type: String(change.status || 'local').trim().slice(0, 40) || 'local',
      date,
      startDate: date,
      endDate,
      details: String(change.details || change.note || '').trim().slice(0, 500),
      schoolYear: String(database.schoolYear || ''),
      source: 'android-companion',
      immutable: false
    };
    if (change.classId) next.classId = String(change.classId);
    if (!existing) {
      database.calendarEvents.push(next);
      return true;
    }
    Object.assign(existing, next);
    return true;
  }

  async function applyChanges(request) {
    const database = activeProfile();
    if (!database) throw new Error('No active desktop profile is open.');
    const activeId = activeProfileDescriptor().profileId;
    if (request.profileId && String(request.profileId) !== activeId) {
      throw new Error('Open the matching desktop profile before pushing its mobile changes.');
    }
    const latestStatus = await globalScope.electronAPI.getCompanionWlanStatus();
    const desktopRevision = Number(latestStatus.revision || 0);
    const baseRevision = Number(request.baseRevision || 0);
    if (baseRevision > desktopRevision) {
      throw new Error('The phone is ahead of this desktop snapshot. Refresh the phone and try again.');
    }
    await globalScope.electronAPI.createDatabaseRestorePoint?.('android-companion-import');
    let accepted = 0;
    const acceptedChangeIds = [];
    const appliedIds = new Set(database.mobileSync?.appliedChangeIds || []);
    for (const change of request.changes || []) {
      const changeId = String(change.changeId || '');
      if (changeId && appliedIds.has(changeId)) {
        acceptedChangeIds.push(changeId);
        continue;
      }
      if (change.type === 'profile') {
        if (profileChange(change, database)) accepted += 1;
      } else if (change.type === 'calendar') {
        if (calendarChange(change, database)) accepted += 1;
      } else {
        const assignment = (database.assignments || []).find((item) => item.id === change.classId);
        if (!assignment) throw new Error('A mobile change references an unknown class.');
        if (change.type === 'score' && scoreChange(change, assignment)) accepted += 1;
        else if (change.type === 'attendance' && attendanceChange(change, assignment)) accepted += 1;
        else if (!['score', 'attendance'].includes(change.type)) throw new Error('Unsupported mobile change type.');
      }
      if (changeId) {
        appliedIds.add(changeId);
        acceptedChangeIds.push(changeId);
      }
    }
    if (accepted || acceptedChangeIds.length) {
      database.mobileSync = {
        ...(database.mobileSync || {}),
        appliedChangeIds: [...appliedIds].slice(-5000),
        lastBatchId: String(request.batchId || ''),
        lastAppliedAt: new Date().toISOString()
      };
      await globalScope.saveDatabase();
      globalScope.render?.();
      globalScope.renderRecordTable?.();
      globalScope.scheduleRecordTableRefresh?.();
      globalScope.renderFinalOnly?.();
      globalScope.refreshCalendarView?.();
      if (!request.liveSync) {
        globalScope.toast?.(`${accepted} mobile entries were applied to the desktop record.`, 'success');
      }
    }
    return { success: true, accepted: acceptedChangeIds.length || accepted, acceptedChangeIds };
  }

  async function authorizePairing(request) {
    const descriptor = activeProfileDescriptor();
    if (String(request.profileId || '') !== descriptor.profileId) {
      throw new Error('Open the profile shown in the Android pairing request.');
    }
    return {
      success: true,
      authorized: true,
      profileId: descriptor.profileId,
      profileName: descriptor.profileName,
      schoolYear: descriptor.schoolYear
    };
  }

  async function handleApplyRequest(request) {
    try {
      const result = await applyChanges(request);
      globalScope.electronAPI.sendCompanionChangesResult(request.requestId, result);
    } catch (error) {
      globalScope.electronAPI.sendCompanionChangesResult(request.requestId, { success: false, error: error.message || 'Mobile changes were rejected.' });
    }
  }

  async function handlePairingRequest(request) {
    try {
      const result = await authorizePairing(request);
      globalScope.electronAPI.sendCompanionChangesResult(request.requestId, result);
    } catch (error) {
      globalScope.electronAPI.sendCompanionChangesResult(request.requestId, {
        success: false,
        error: error.message || 'Android pairing was rejected.'
      });
    }
  }

  function handleToolCommand(request) {
    const command = String(request.command || '');
    const args = request.args && typeof request.args === 'object' ? request.args : {};
    let descriptor;
    try { descriptor = activeProfileDescriptor(); } catch (_error) { return; }
    if (request.profileId && String(request.profileId) !== descriptor.profileId) {
      globalScope.toast?.('The phone requested a page for another profile.', 'warning');
      return;
    }
    const allowedViews = new Set(['dashboard', 'classes', 'record', 'attendance', 'performance-checklist', 'calendar', 'advisory', 'tools', 'settings', 'sync']);
    const allowedTools = new Set(['picker', 'groups', 'simulator', 'checklist', 'games', 'timer', 'participation', 'noise', 'duels', 'seating', 'exit', 'notes', 'race']);
    const openTool = (toolId) => {
      if (!allowedTools.has(toolId)) return false;
      if (toolId === 'checklist') globalScope.TeacherTools?.openPerformanceChecklistPage?.();
      else { globalScope.setView?.('tools'); globalScope.TeacherTools?.openTool?.(toolId); }
      return true;
    };
    const runToolAction = (action) => {
      const actions = {
        'pick-learner': () => { openTool('picker'); globalScope.TeacherTools?.pickName?.(); },
        'reset-picker': () => { openTool('picker'); globalScope.TeacherTools?.resetPicker?.(); },
        'randomize-groups': () => { openTool('groups'); globalScope.TeacherTools?.randomizeGroups?.(); },
        'reveal-groups': () => { openTool('groups'); globalScope.TeacherTools?.revealGroupsNow?.(); },
        'timer-start': () => { openTool('timer'); globalScope.ClassroomTools?.timerAction?.('start'); },
        'timer-pause': () => { openTool('timer'); globalScope.ClassroomTools?.timerAction?.('pause'); },
        'timer-skip': () => { openTool('timer'); globalScope.ClassroomTools?.timerAction?.('skip'); },
        'timer-reset': () => { openTool('timer'); globalScope.ClassroomTools?.timerAction?.('reset'); },
        'randomize-seating': () => { openTool('seating'); globalScope.ClassroomTools?.randomSeating?.(); },
        'noise-start': () => { openTool('noise'); globalScope.ClassroomTools?.startNoiseMeter?.(); },
        'noise-stop': () => { openTool('noise'); globalScope.ClassroomTools?.stopNoiseMeter?.(); },
        'noise-calibrate': () => { openTool('noise'); globalScope.ClassroomTools?.calibrateNoiseMeter?.(); }
      };
      if (!Object.hasOwn(actions, action)) return false;
      actions[action]();
      return true;
    };
    let accepted = true;
    if (command === 'open-page') {
      const view = String(args.page || '');
      if (!allowedViews.has(view)) accepted = false;
      else {
        const assignmentId = String(args.assignmentId || '');
        if (assignmentId && globalScope.getActiveProfileDatabase?.()?.assignments?.some(item => String(item.id) === assignmentId)) {
          globalScope.selectAssignment?.(assignmentId);
        }
        globalScope.setView?.(view);
      }
    } else if (command === 'open-tool') accepted = openTool(String(args.toolId || ''));
    else if (command === 'tool-action') accepted = runToolAction(String(args.action || ''));
    else if (command === 'open-picker') accepted = openTool('picker');
    else if (command === 'pick-learner') accepted = runToolAction('pick-learner');
    else if (command === 'reset-picker') accepted = runToolAction('reset-picker');
    else if (command === 'open-groups') accepted = openTool('groups');
    else if (command === 'randomize-groups') accepted = runToolAction('randomize-groups');
    else if (command === 'open-checklist') accepted = openTool('checklist');
    else accepted = false;
    if (!accepted) globalScope.toast?.('The phone requested an unsupported desktop control.', 'warning');
  }

  let restorePromise = null;

  function isProfileSessionActive() {
    return typeof sessionActive !== 'undefined' && sessionActive === true;
  }

  function isProfileLockError(error) {
    return /unlock a desktop profile/i.test(String(error?.message || error || ''));
  }

  function canRestoreTrustedLink() {
    if (!isProfileSessionActive()) return false;
    const overlay = document.getElementById('profileOverlay');
    if (!overlay) return true;
    const display = String(overlay.style.display || '').trim().toLowerCase();
    return display !== 'flex';
  }

  function watchProfileWorkspace() {
    const overlay = document.getElementById('profileOverlay');
    if (!overlay) return;
    new MutationObserver(() => {
      if (!canRestoreTrustedLink()) return;
      restoreTrustedLink().catch((error) => {
        if (isProfileLockError(error)) return;
        console.error('Companion status restore failed:', error);
      });
    }).observe(overlay, { attributes: true, attributeFilter: ['style', 'class', 'hidden'] });
  }

  async function restoreTrustedLink() {
    if (!canRestoreTrustedLink()) return wlanStatus;
    if (restorePromise) return restorePromise;
    restorePromise = restoreStatus().finally(() => {
      restorePromise = null;
    });
    return restorePromise;
  }

  async function restoreStatus() {
    if (!canRestoreTrustedLink()) {
      renderWlanStatus();
      return wlanStatus;
    }
    let descriptor;
    try {
      descriptor = activeProfileDescriptor();
    } catch (_error) {
      renderWlanStatus();
      return wlanStatus;
    }
    wlanStatus = await globalScope.electronAPI.getCompanionWlanStatus();
    if (wlanStatus.running && wlanStatus.transport === 'bluetooth') {
      try {
        wlanStatus = await globalScope.electronAPI.startCompanionBluetooth(descriptor);
      } catch (error) {
        renderWlanStatus();
        if (isProfileLockError(error)) return wlanStatus;
        throw error;
      }
    } else {
      try {
        wlanStatus = await globalScope.electronAPI.startCompanionWlan(descriptor);
      } catch (error) {
        renderWlanStatus();
        if (isProfileLockError(error)) return wlanStatus;
        throw error;
      }
    }
    if (wlanStatus.running) {
      const image = await globalScope.electronAPI.generateCompanionQr(wlanStatus.pairingPayloadV2 || wlanStatus.pairingPayload);
      const bluetooth = wlanStatus.transport === 'bluetooth';
      const qr = document.getElementById(bluetooth ? 'companionBluetoothPairingQr' : 'companionPairingQr');
      if (qr) qr.src = image;
      if (bluetooth) {
        const pin = document.getElementById('companionBluetoothPairingPin');
        if (pin) pin.textContent = wlanStatus.pin;
      } else {
        renderWlanPairingPin();
      }
      if (bluetooth) setCompanionDisplay(document.getElementById('btnScanBle'), true, 'companion-js-inline-flex');
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
    return wlanStatus;
  }

  async function applyBluetoothEnvelope(payload, transportAuthorized = false) {
    if (!transportAuthorized) throw new Error('The Bluetooth link is not authorized.');
    return applyChanges(payload);
  }

  globalScope.MobileSyncBridge = {
    buildCompanionSnapshot,
    publish,
    schedulePublish,
    flushPublish,
    restoreTrustedLink,
    authorizePairing,
    applyChanges,
    applyBluetoothEnvelope,
    handleToolCommand
  };
  globalScope.startCompanionWlan = startCompanionWlan;
  globalScope.startCompanionBluetoothPairing = startCompanionBluetoothPairing;
  globalScope.stopCompanionWlan = stopCompanionWlan;
  globalScope.startCompanionApkInstall = startCompanionApkInstall;
  globalScope.stopCompanionApkInstall = stopCompanionApkInstall;
  globalScope.closeCompanionQrModal = closeCompanionQrModal;
  globalScope.refreshCompanionMobileUpdateFromGithub = refreshCompanionMobileUpdateFromGithub;
  globalScope.importCompanionMobileUpdate = importCompanionMobileUpdate;
  globalScope.configureCompanionFirewall = configureCompanionFirewall;

  globalScope.addEventListener('DOMContentLoaded', () => {
    globalScope.electronAPI?.onCompanionApplyChanges?.(handleApplyRequest);
    globalScope.electronAPI?.onCompanionAuthorizePairing?.(handlePairingRequest);
    globalScope.electronAPI?.onCompanionToolCommand?.(handleToolCommand);
    globalScope.electronAPI?.onCompanionClientActivity?.((activity) => {
      wlanStatus = { ...wlanStatus, ...activity, lastClientAt: activity.at };
      renderWlanStatus();
    });
    globalScope.electronAPI?.onCompanionMobileUpdate?.((status) => {
      renderMobileUpdateStatus(status);
    });
    watchProfileWorkspace();
    restoreMobileUpdateUi().catch((error) => console.error('Companion update status restore failed:', error));
  });
})(window);
