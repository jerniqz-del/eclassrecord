/*
 * Attendance Extension
 * Adds Excused attendance, no-class calendar days, corrected analytics,
 * and SF2 summary prefill without rewriting the compressed tracker module.
 */

(function initAttendanceExtension() {
  const EXCUSED_STATUS = 'excused';
  const EXCUSED_TYPE = 'excused';
  const EXCUSED_LABEL = 'Excused';
  const NO_CLASS_STATUS = 'no-class';
  const NO_CLASS_TYPE = 'no_class';
  const NO_CLASS_LABEL = 'No Class';
  let rollCallTouchedLearnersThisOpen = new Set();

  function escapeHtml(value) {
    if (typeof esc === 'function') return esc(value);
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[char]));
  }

  function timestamp() {
    return typeof timestampNow === 'function' ? timestampNow() : new Date().toISOString();
  }

  function activeAssignment() {
    return typeof currentAssignment === 'function' ? currentAssignment() : null;
  }

  function currentRollCallDate() {
    if (typeof attendanceRollCallState !== 'undefined' && attendanceRollCallState?.date) return attendanceRollCallState.date;
    if (typeof supportToday === 'function') return supportToday();
    return new Date().toISOString().slice(0, 10);
  }

  function currentRollCallTermValue() {
    if (typeof getCurrentRollCallTerm === 'function') return String(getCurrentRollCallTerm() || '1');
    if (typeof attendanceRollCallState !== 'undefined' && attendanceRollCallState?.term) return String(attendanceRollCallState.term);
    if (typeof db !== 'undefined' && db?.currentTerm) return String(db.currentTerm);
    return '1';
  }

  function normalizeExcusedReason(value) {
    return String(value || '').trim().slice(0, 300);
  }

  function getExcusedReasonStore() {
    if (typeof attendanceRollCallState === 'undefined' || !attendanceRollCallState) return {};
    if (!attendanceRollCallState.excusedReasons || typeof attendanceRollCallState.excusedReasons !== 'object') {
      attendanceRollCallState.excusedReasons = {};
    }
    return attendanceRollCallState.excusedReasons;
  }

  function ensureNoClassDays(assignment) {
    if (!assignment) return [];
    if (!Array.isArray(assignment.attendanceNoClassDays)) assignment.attendanceNoClassDays = [];
    return assignment.attendanceNoClassDays;
  }

  function noClassDayFor(assignment, date, term) {
    if (!assignment || !date) return null;
    const targetTerm = String(term || currentRollCallTermValue() || '1');
    return ensureNoClassDays(assignment).find((day) => (
      day
      && day.date === date
      && String(day.term || '1') === targetTerm
    )) || null;
  }

  function removeAttendanceEntriesForDate(assignment, date, term) {
    if (!assignment || !date) return;
    const targetTerm = String(term || '1');
    if (Array.isArray(assignment.attendanceSessions)) {
      assignment.attendanceSessions = assignment.attendanceSessions.filter((session) => {
        if (!session) return false;
        const sessionDate = typeof session === 'string' ? session : session.date;
        const sessionTerm = typeof session === 'string' ? targetTerm : String(session.term || '1');
        return !(sessionDate === date && sessionTerm === targetTerm);
      });
    }
    if (Array.isArray(assignment.supportRecords)) {
      assignment.supportRecords = assignment.supportRecords.filter((record) => !(
        record
        && record.category === 'attendance'
        && record.date === date
        && String(record.term || '1') === targetTerm
      ));
    }
  }

  function hasAttendanceSessionForDate(assignment, date, term) {
    if (!assignment || !date || !Array.isArray(assignment.attendanceSessions)) return false;
    const targetTerm = String(term || '1');
    return assignment.attendanceSessions.some((session) => {
      if (!session) return false;
      const sessionDate = typeof session === 'string' ? session : session.date;
      const sessionTerm = typeof session === 'string' ? targetTerm : String(session.term || '1');
      return sessionDate === date && sessionTerm === targetTerm;
    });
  }

  function removeAttendanceEntriesForLearnerDate(assignment, learnerId, date, term, keepType = '') {
    if (!assignment || !learnerId || !date || !Array.isArray(assignment.supportRecords)) return false;
    const targetTerm = String(term || '1');
    const before = assignment.supportRecords.length;
    assignment.supportRecords = assignment.supportRecords.filter((record) => {
      const isTarget = record
        && record.category === 'attendance'
        && record.learnerId === learnerId
        && record.date === date
        && String(record.term || '1') === targetTerm;
      if (!isTarget) return true;
      return keepType && record.type === keepType;
    });
    return assignment.supportRecords.length !== before;
  }

  function removeNoClassDayForDate(assignment, date, term) {
    if (!assignment || !date || !Array.isArray(assignment.attendanceNoClassDays)) return false;
    const targetTerm = String(term || '1');
    const before = assignment.attendanceNoClassDays.length;
    assignment.attendanceNoClassDays = assignment.attendanceNoClassDays.filter((day) => !(
      day
      && day.date === date
      && String(day.term || '1') === targetTerm
    ));
    return assignment.attendanceNoClassDays.length !== before;
  }

  function dedupeAttendanceEntriesForDate(assignment, date, term) {
    if (!assignment || !date || !Array.isArray(assignment.supportRecords)) return false;
    const targetTerm = String(term || '1');
    const seen = new Set();
    const before = assignment.supportRecords.length;
    assignment.supportRecords = assignment.supportRecords.filter((record) => {
      const isTarget = record
        && record.category === 'attendance'
        && record.date === date
        && String(record.term || '1') === targetTerm;
      if (!isTarget) return true;
      const key = `${record.learnerId || ''}|${record.type || ''}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return assignment.supportRecords.length !== before;
  }

  function closeRollCallModal() {
    if (typeof closeModal === 'function') {
      closeModal('attendanceRollCallModal');
    }
    if (typeof closeAttendanceRollCallModal === 'function') {
      closeAttendanceRollCallModal();
    }
    const modal = document.getElementById('attendanceRollCallModal');
    if (modal?.parentNode) modal.parentNode.removeChild(modal);
  }

  function setNoClassDay(checked) {
    const assignment = activeAssignment();
    if (!assignment) return;
    const date = currentRollCallDate();
    const term = currentRollCallTermValue();
    const reasonInput = document.getElementById('attendanceNoClassReason');
    const reason = normalizeExcusedReason(reasonInput?.value || '');
    const days = ensureNoClassDays(assignment);
    const existing = noClassDayFor(assignment, date, term);

    if (checked) {
      removeAttendanceEntriesForDate(assignment, date, term);
      if (existing) {
        existing.reason = reason;
        existing.updatedAt = timestamp();
      } else {
        days.push({
          id: `no-class-${date}-${term}-${Date.now()}`,
          date,
          term,
          reason,
          createdAt: timestamp(),
          updatedAt: timestamp()
        });
      }
      if (typeof toast === 'function') toast('Marked as no class day. Attendance entries for this date were cleared.', 'success');
    } else {
      assignment.attendanceNoClassDays = days.filter((day) => !(day.date === date && String(day.term || '1') === term));
      if (typeof toast === 'function') toast('No class marker removed for this date.', 'info');
    }

    if (typeof saveDatabase === 'function') saveDatabase();
    if (typeof renderAttendanceTracker === 'function') renderAttendanceTracker();
    setTimeout(() => {
      if (typeof refreshAttendanceRollCallModal === 'function') refreshAttendanceRollCallModal();
      decorateRollCallModal();
    }, 0);
  }

  function updateNoClassReason(value) {
    const assignment = activeAssignment();
    const day = noClassDayFor(assignment, currentRollCallDate(), currentRollCallTermValue());
    if (!day) return;
    day.reason = normalizeExcusedReason(value);
    day.updatedAt = timestamp();
    if (typeof saveDatabase === 'function') saveDatabase();
  }

  function collectExcusedReasonInputs() {
    document.querySelectorAll('.attendance-excused-reason-input').forEach((input) => {
      const learnerId = input.dataset.learnerId;
      if (!learnerId) return;
      const reasons = getExcusedReasonStore();
      const reason = normalizeExcusedReason(input.value);
      if (reason) reasons[learnerId] = reason;
      else delete reasons[learnerId];
    });
  }

  function excusedButton(learnerId, activeStatus) {
    return `
      <button
        type="button"
        class="attendance-status-btn attendance-status-btn--excused ${activeStatus === EXCUSED_STATUS ? 'attendance-status-btn--active' : ''}"
        title="${EXCUSED_LABEL}"
        onclick="setAttendanceRollCallStatus('${escapeHtml(learnerId)}', '${EXCUSED_STATUS}')">
        ${EXCUSED_LABEL}
      </button>
    `;
  }

  function excusedReasonControl(learnerId, status) {
    const reason = getExcusedReasonStore()[learnerId] || '';
    const hiddenClass = status === EXCUSED_STATUS ? '' : ' is-hidden';
    return `
      <label class="attendance-excused-reason${hiddenClass}">
        <span>Reason</span>
        <input
          class="field-input attendance-excused-reason-input"
          data-learner-id="${escapeHtml(learnerId)}"
          value="${escapeHtml(reason)}"
          placeholder="Optional reason">
      </label>
    `;
  }

  function attendanceRecords(assignment) {
    if (!assignment) return [];
    const records = typeof supportValidRecords === 'function'
      ? supportValidRecords(assignment)
      : (Array.isArray(assignment.supportRecords) ? assignment.supportRecords : []);
    return records.filter((record) => record && record.category === 'attendance');
  }

  function rangeIncludesDate(date, range) {
    if (!range || typeof range !== 'object') return true;
    if (!date) return false;
    const start = range.startDate || range.start || range.from || '';
    const end = range.endDate || range.end || range.to || '';
    if (start && date < start) return false;
    if (end && date > end) return false;
    if (range.month && !date.startsWith(String(range.month))) return false;
    return true;
  }

  function recordInRange(record, range) {
    if (typeof attendanceRecordInRange === 'function') {
      try {
        if (attendanceRecordInRange(record, range)) return true;
      } catch (error) {
        console.warn('Attendance record range check failed', error);
      }
    }
    return rangeIncludesDate(record?.date || '', range);
  }

  function normalizedAttendanceSessions(assignment, range) {
    if (!assignment) return [];
    if (typeof ensureAttendanceSessions === 'function') {
      try {
        ensureAttendanceSessions(assignment);
      } catch (error) {
        console.warn('Attendance session normalization failed', error);
      }
    }
    const sessions = Array.isArray(assignment.attendanceSessions) ? assignment.attendanceSessions : [];
    const seen = new Set();
    return sessions
      .map((session) => {
        if (typeof session === 'string') return { date: session, term: '1' };
        return { date: session?.date || '', term: String(session?.term || '1') };
      })
      .filter((session) => {
        if (!session.date || !rangeIncludesDate(session.date, range)) return false;
        if (noClassDayFor(assignment, session.date, session.term)) return false;
        const key = `${session.date}|${session.term}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => `${a.date}|${a.term}`.localeCompare(`${b.date}|${b.term}`));
  }

  function attendanceRecordFor(assignment, learnerId, date, term, type) {
    if (!assignment || !learnerId || !date) return null;
    return attendanceRecords(assignment).find((record) => (
      record
      && record.type === type
      && record.learnerId === learnerId
      && record.date === date
      && String(record.term || '1') === String(term || '1')
    )) || null;
  }

  function savedExcusedRecordForCurrentRollCall(learnerId) {
    return attendanceRecordFor(
      activeAssignment(),
      learnerId,
      currentRollCallDate(),
      currentRollCallTermValue(),
      EXCUSED_TYPE
    );
  }

  function hydrateSavedExcusedReasons() {
    const assignment = activeAssignment();
    if (!assignment || !Array.isArray(assignment.learners)) return;
    const reasons = getExcusedReasonStore();
    assignment.learners.forEach((learner) => {
      const record = savedExcusedRecordForCurrentRollCall(learner.id);
      if (!record) return;
      const reason = normalizeExcusedReason(record.excuseReason || String(record.note || '').replace(/^Excused:\s*/i, ''));
      if (reason) reasons[learner.id] = reason;
    });
  }

  function learnerStatusForSession(assignment, learnerId, session) {
    if (attendanceRecordFor(assignment, learnerId, session.date, session.term, 'absence')) return 'absent';
    if (attendanceRecordFor(assignment, learnerId, session.date, session.term, 'tardy')) return 'tardy';
    if (attendanceRecordFor(assignment, learnerId, session.date, session.term, EXCUSED_TYPE)) return EXCUSED_STATUS;
    return 'present';
  }

  function computeLearnerAttendance(assignment, learnerId, range) {
    const sessions = normalizedAttendanceSessions(assignment, range);
    const totals = {
      checked: 0,
      present: 0,
      tardy: 0,
      absent: 0,
      excused: 0,
      absenceRate: 0,
      sessionKeys: new Set()
    };

    sessions.forEach((session) => {
      const status = learnerStatusForSession(assignment, learnerId, session);
      totals.checked += 1;
      totals.sessionKeys.add(`${session.date}|${session.term}`);
      if (status === 'absent') totals.absent += 1;
      else if (status === 'tardy') totals.tardy += 1;
      else if (status === EXCUSED_STATUS) totals.excused += 1;
      else totals.present += 1;
    });

    totals.absenceRate = totals.checked ? Math.round((totals.absent / totals.checked) * 100) : 0;
    return totals;
  }

  function computeClassAttendance(assignment, range) {
    const learners = Array.isArray(assignment?.learners) ? assignment.learners : [];
    const summaries = learners.map((learner) => ({
      learner,
      ...computeLearnerAttendance(assignment, learner.id, range)
    }));
    const totals = summaries.reduce((sum, summary) => {
      sum.checked += summary.checked || 0;
      sum.present += summary.present || 0;
      sum.tardy += summary.tardy || 0;
      sum.absent += summary.absent || 0;
      sum.excused += summary.excused || 0;
      return sum;
    }, { checked: 0, present: 0, tardy: 0, absent: 0, excused: 0, absenceRate: 0 });
    totals.absenceRate = totals.checked ? Math.round((totals.absent / totals.checked) * 100) : 0;
    return { summaries, totals };
  }

  function countRollCallStatuses() {
    const assignment = activeAssignment();
    const learners = Array.isArray(assignment?.learners) ? assignment.learners : [];
    if (noClassDayFor(assignment, currentRollCallDate(), currentRollCallTermValue())) {
      return { present: 0, tardy: 0, absent: 0, excused: 0 };
    }
    return learners.reduce((totals, learner) => {
      const status = typeof attendanceRollCallStatus === 'function' ? attendanceRollCallStatus(learner.id) : 'present';
      if (status === 'tardy') totals.tardy += 1;
      else if (status === 'absent') totals.absent += 1;
      else if (status === EXCUSED_STATUS) totals.excused += 1;
      else totals.present += 1;
      return totals;
    }, { present: 0, tardy: 0, absent: 0, excused: 0 });
  }

  function refreshExcusedSummary() {
    const summary = document.querySelector('#attendanceRollCallModal .attendance-roll-call__summary');
    if (!summary) return;
    const totals = countRollCallStatuses();
    summary.innerHTML = `
      <span class="attendance-pill attendance-pill--present">Present: ${totals.present}</span>
      <span class="attendance-pill attendance-pill--tardy">Tardy: ${totals.tardy}</span>
      <span class="attendance-pill attendance-pill--absent">Absent: ${totals.absent}</span>
      <span class="attendance-pill attendance-pill--excused">Excused: ${totals.excused}</span>
    `;
  }

  function renderNoClassPanel() {
    const assignment = activeAssignment();
    const day = noClassDayFor(assignment, currentRollCallDate(), currentRollCallTermValue());
    return `
      <div class="attendance-no-class-panel" id="attendanceNoClassPanel">
        <label class="attendance-no-class-toggle">
          <input
            type="checkbox"
            id="attendanceNoClassToggle"
            ${day ? 'checked' : ''}
            onchange="toggleAttendanceNoClassDate(this.checked)">
          <span>No classes / holiday for this date</span>
        </label>
        <input
          id="attendanceNoClassReason"
          class="field-input attendance-no-class-reason"
          value="${escapeHtml(day?.reason || '')}"
          placeholder="Reason (optional)"
          ${day ? '' : 'disabled'}
          onchange="updateAttendanceNoClassReason(this.value)">
        <span class="attendance-no-class-note">Shows as NC in the attendance table and is excluded from attendance totals.</span>
      </div>
    `;
  }

  function hideRollCallTermControl(modal) {
    modal.querySelectorAll('select').forEach((select) => {
      const onchange = String(select.getAttribute('onchange') || '');
      if (onchange.includes('setAttendanceRollCallTerm')) {
        const wrapper = select.closest('label, .field, .form-field, div');
        if (wrapper) wrapper.classList.add('attendance-roll-call__term-hidden');
      }
    });
  }

  function decorateRollCallModal() {
    const modal = document.getElementById('attendanceRollCallModal');
    if (!modal) return;
    hideRollCallTermControl(modal);
    const toolbar = modal.querySelector('.attendance-roll-call__toolbar');
    if (toolbar && !modal.querySelector('#attendanceNoClassPanel')) {
      toolbar.insertAdjacentHTML('afterend', renderNoClassPanel());
    }

    const assignment = activeAssignment();
    const isNoClass = !!noClassDayFor(assignment, currentRollCallDate(), currentRollCallTermValue());
    modal.classList.toggle('attendance-roll-call-modal--no-class', isNoClass);
    const reason = modal.querySelector('#attendanceNoClassReason');
    if (reason) reason.disabled = !isNoClass;
    modal.querySelectorAll('.attendance-excused-reason-input').forEach((input) => {
      const learnerId = input.dataset.learnerId;
      const savedReason = learnerId ? getExcusedReasonStore()[learnerId] : '';
      if (savedReason && !input.value) input.value = savedReason;
    });
    modal.querySelectorAll('.attendance-status-btn, .attendance-excused-reason-input').forEach((control) => {
      control.disabled = isNoClass;
    });
    refreshExcusedSummary();
  }

  function captureRollCallScrollState() {
    const modal = document.getElementById('attendanceRollCallModal');
    const tableWrap = modal?.querySelector('.attendance-roll-call__table-wrap');
    const body = modal?.querySelector('.modal__body');
    return {
      tableWrap,
      body,
      tableTop: tableWrap?.scrollTop || 0,
      tableLeft: tableWrap?.scrollLeft || 0,
      bodyTop: body?.scrollTop || 0
    };
  }

  function restoreRollCallScrollState(state) {
    if (!state) return;
    const modal = document.getElementById('attendanceRollCallModal');
    const tableWrap = state.tableWrap?.isConnected
      ? state.tableWrap
      : modal?.querySelector('.attendance-roll-call__table-wrap');
    const body = state.body?.isConnected
      ? state.body
      : modal?.querySelector('.modal__body');
    if (tableWrap) {
      tableWrap.scrollTop = state.tableTop;
      tableWrap.scrollLeft = state.tableLeft;
    }
    if (body) body.scrollTop = state.bodyTop;
  }

  function markAllRollCallLearnersTouched(status = '') {
    const assignment = activeAssignment();
    if (!assignment || !Array.isArray(assignment.learners)) return;
    assignment.learners.forEach((learner) => {
      if (learner?.id) rollCallTouchedLearnersThisOpen.add(learner.id);
    });
    if (status === 'present' && typeof attendanceRollCallState !== 'undefined' && attendanceRollCallState) {
      attendanceRollCallState.excusedReasons = {};
    }
  }

  function applyExcusedReasonsToSavedRecords() {
    const assignment = activeAssignment();
    if (!assignment || !Array.isArray(assignment.supportRecords)) return;
    const date = currentRollCallDate();
    const term = currentRollCallTermValue();
    const reasons = getExcusedReasonStore();

    assignment.supportRecords.forEach((record) => {
      if (!record || record.category !== 'attendance' || record.type !== EXCUSED_TYPE) return;
      if (record.date !== date || String(record.term || '1') !== term) return;
      record.excuseReason = normalizeExcusedReason(reasons[record.learnerId] || record.excuseReason || '');
      record.note = record.excuseReason ? `Excused: ${record.excuseReason}` : 'Marked excused during roll call.';
      record.status = 'resolved';
      record.updatedAt = timestamp();
    });

    if (typeof saveDatabase === 'function') saveDatabase();
  }

  function reconcileSavedRollCallRecords() {
    const assignment = activeAssignment();
    if (!assignment || !Array.isArray(assignment.learners)) return false;
    const date = currentRollCallDate();
    const term = currentRollCallTermValue();
    let changed = removeNoClassDayForDate(assignment, date, term);

    assignment.learners.forEach((learner) => {
      const status = typeof attendanceRollCallStatus === 'function'
        ? attendanceRollCallStatus(learner.id)
        : 'present';
      if (status === 'present') {
        changed = removeAttendanceEntriesForLearnerDate(assignment, learner.id, date, term) || changed;
        delete getExcusedReasonStore()[learner.id];
      } else if (status === EXCUSED_STATUS) {
        changed = removeAttendanceEntriesForLearnerDate(assignment, learner.id, date, term, EXCUSED_TYPE) || changed;
      } else if (status === 'tardy') {
        changed = removeAttendanceEntriesForLearnerDate(assignment, learner.id, date, term, 'tardy') || changed;
        delete getExcusedReasonStore()[learner.id];
      } else if (status === 'absent') {
        changed = removeAttendanceEntriesForLearnerDate(assignment, learner.id, date, term, 'absence') || changed;
        delete getExcusedReasonStore()[learner.id];
      }
    });

    changed = dedupeAttendanceEntriesForDate(assignment, date, term) || changed;
    if (changed && typeof saveDatabase === 'function') saveDatabase();
    return changed;
  }

  function cleanupClearedDateIfSessionRemoved(date, term) {
    const assignment = activeAssignment();
    if (!assignment) return;
    removeAttendanceEntriesForDate(assignment, date, term);
    removeNoClassDayForDate(assignment, date, term);
    if (typeof saveDatabase === 'function') saveDatabase();
    if (typeof renderAttendanceTracker === 'function') renderAttendanceTracker();
    decorateRollCallModal();
  }

  function resetRollCallNoClassControls() {
    const modal = document.getElementById('attendanceRollCallModal');
    const toggle = modal?.querySelector('#attendanceNoClassToggle');
    const reason = modal?.querySelector('#attendanceNoClassReason');
    if (toggle) toggle.checked = false;
    if (reason) {
      reason.value = '';
      reason.disabled = true;
    }
  }

  function clearRollCallDateFromModal(date, term) {
    const assignment = activeAssignment();
    if (!assignment || !date) return false;
    removeAttendanceEntriesForDate(assignment, date, term);
    removeNoClassDayForDate(assignment, date, term);
    if (typeof attendanceRollCallState !== 'undefined' && attendanceRollCallState) {
      attendanceRollCallState.marks = {};
      attendanceRollCallState.excusedReasons = {};
      attendanceRollCallState.loadedKey = '';
    }
    rollCallTouchedLearnersThisOpen = new Set();
    resetRollCallNoClassControls();
    if (typeof saveDatabase === 'function') saveDatabase();
    if (typeof renderAttendanceTracker === 'function') renderAttendanceTracker();
    closeRollCallModal();
    if (typeof toast === 'function') toast('Attendance entries cleared for this date.', 'success');
    return true;
  }

  function renderExcusedMetric(value) {
    if (typeof attendanceMetricCard === 'function') {
      return attendanceMetricCard(EXCUSED_LABEL, value, EXCUSED_TYPE);
    }
    return `
      <div class="attendance-metric-card attendance-metric-card--excused">
        <span>${EXCUSED_LABEL}</span>
        <strong>${Number(value) || 0}</strong>
      </div>
    `;
  }

  function insertExcusedMetric(html, value) {
    const metric = renderExcusedMetric(value);
    const source = String(html || '');
    if (/attendance-metric-card--excused/.test(source)) return source;
    const lastMetricIndex = source.lastIndexOf('<div class="attendance-metric-card');
    if (lastMetricIndex === -1) return `${source}${metric}`;
    return `${source.slice(0, lastMetricIndex)}${metric}${source.slice(lastMetricIndex)}`;
  }

  function appendClassToAttrs(attrs, className) {
    const source = String(attrs || '');
    if (/\bclass=/.test(source)) {
      return source.replace(/class=(["'])(.*?)\1/, (match, quote, value) => (
        value.split(/\s+/).includes(className)
          ? match
          : `class=${quote}${value} ${className}${quote}`
      ));
    }
    return `${source} class="${className}"`;
  }

  function colorizeMonthlyMarks(html) {
    return String(html || '')
      .replace(/(<span[^>]*attendance-mark--no-class[^>]*>)\s*N\s*(<\/span>)/g, '$1NC$2')
      .replace(/<td([^>]*)>(\s*E\s*)<\/td>/g, (match, attrs, content) => (
        `<td${appendClassToAttrs(attrs, 'attendance-month-cell--excused')}>${content}</td>`
      ))
      .replace(/<td([^>]*)>(\s*NC\s*)<\/td>/g, (match, attrs, content) => (
        `<td${appendClassToAttrs(attrs, 'attendance-month-cell--no-class')}>${content}</td>`
      ));
  }

  function addAttendanceMonthlyLegends(html) {
    let source = colorizeMonthlyMarks(html);
    const legendStart = source.indexOf('attendance-monthly__legend');
    if (legendStart === -1) return source;
    const closeIndex = source.indexOf('</div>', legendStart);
    if (closeIndex === -1) return source;
    let extra = '';
    if (!/Excused/.test(source)) {
      extra += '<span class="attendance-legend--excused"><strong>E</strong> Excused</span>';
    }
    if (!/No Class/.test(source)) {
      extra += '<span class="attendance-legend--no-class"><strong>NC</strong> No Class</span>';
    }
    return extra ? `${source.slice(0, closeIndex)}${extra}${source.slice(closeIndex)}` : source;
  }

  function monthlyStatusContext(args) {
    const values = Array.from(args || []);
    const assignment = values.find((value) => value && typeof value === 'object' && Array.isArray(value.learners))
      || activeAssignment();
    const date = values.find((value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) || '';
    const learner = values.find((value) => value && typeof value === 'object' && typeof value.id === 'string');
    let learnerId = learner?.id || '';
    if (!learnerId && assignment?.learners) {
      const ids = new Set(assignment.learners.map((item) => item.id));
      learnerId = values.find((value) => typeof value === 'string' && ids.has(value)) || '';
    }
    const term = values.find((value) => (
      typeof value === 'string'
      && value !== date
      && /^[1-3]$/.test(value)
    )) || (typeof attendanceMonthlyState !== 'undefined' && attendanceMonthlyState?.term) || currentRollCallTermValue();
    return { assignment, learnerId, date, term };
  }

  function summarizeSf2Inputs(assignment) {
    const learners = Array.isArray(assignment?.learners) ? assignment.learners : [];
    const sexOf = (learner) => String(learner?.sex || learner?.gender || '').trim().toUpperCase();
    const countBySex = (predicate, sexPrefix) => learners.filter((learner) => (
      sexOf(learner).startsWith(sexPrefix)
      && predicate(learner)
    )).length;
    const hasObjectEntries = (value) => value && typeof value === 'object' && Object.keys(value).length > 0;
    const isTransferredIn = (learner) => hasObjectEntries(learner?.transferredInGrades) || !!learner?.transferredInDate;
    const isTransferredOut = (learner) => !!learner?.transferredOutTerm || !!learner?.transferredOutDate;
    const isLateEnrollment = (learner) => !!learner?.lateEnrollmentDate || learner?.enrollmentType === 'late';
    const isDropOut = (learner) => !!learner?.dropOutDate || learner?.status === 'dropout';

    return {
      enrollmentMale: countBySex(() => true, 'M'),
      enrollmentFemale: countBySex(() => true, 'F'),
      lateEnrollmentMale: countBySex(isLateEnrollment, 'M'),
      lateEnrollmentFemale: countBySex(isLateEnrollment, 'F'),
      dropOutMale: countBySex(isDropOut, 'M'),
      dropOutFemale: countBySex(isDropOut, 'F'),
      transferredOutMale: countBySex(isTransferredOut, 'M'),
      transferredOutFemale: countBySex(isTransferredOut, 'F'),
      transferredInMale: countBySex(isTransferredIn, 'M'),
      transferredInFemale: countBySex(isTransferredIn, 'F')
    };
  }

  function fillSf2SummaryInputs() {
    const modal = document.getElementById('attendanceSf2OptionsModal');
    if (!modal) return;
    const summary = summarizeSf2Inputs(activeAssignment());
    const inputIds = {
      enrollmentMale: 'attendanceSf2EnrollmentMale',
      enrollmentFemale: 'attendanceSf2EnrollmentFemale',
      lateEnrollmentMale: 'attendanceSf2LateEnrollmentMale',
      lateEnrollmentFemale: 'attendanceSf2LateEnrollmentFemale',
      dropOutMale: 'attendanceSf2DropOutMale',
      dropOutFemale: 'attendanceSf2DropOutFemale',
      transferredOutMale: 'attendanceSf2TransferredOutMale',
      transferredOutFemale: 'attendanceSf2TransferredOutFemale',
      transferredInMale: 'attendanceSf2TransferredInMale',
      transferredInFemale: 'attendanceSf2TransferredInFemale'
    };
    Object.entries(inputIds).forEach(([key, id]) => {
      const input = modal.querySelector(`#${id}`);
      if (input) input.value = String(summary[key] ?? 0);
    });
  }

  function sf2PayloadDates(payload) {
    if (Array.isArray(payload?.dates)) {
      return payload.dates
        .map((date) => {
          if (typeof date === 'string') return { value: date };
          return { ...date, value: date?.value || date?.date || '' };
        })
        .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date.value));
    }

    const month = payload?.month
      || (typeof attendanceSf2ExportState !== 'undefined' && attendanceSf2ExportState?.month)
      || (typeof attendanceMonthlyState !== 'undefined' && attendanceMonthlyState?.month)
      || '';
    if (month && typeof attendanceMonthDates === 'function') {
      return attendanceMonthDates(month)
        .map((date) => ({ ...date, value: date?.value || date?.date || '' }))
        .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date.value));
    }
    return [];
  }

  function sf2PayloadTerm(payload) {
    return String(
      payload?.term
      || (typeof attendanceSf2ExportState !== 'undefined' && attendanceSf2ExportState?.term)
      || (typeof attendanceMonthlyState !== 'undefined' && attendanceMonthlyState?.term)
      || currentRollCallTermValue()
      || '1'
    );
  }

  function sf2RowSex(row) {
    return String(row?.sex || row?.gender || '').trim().toUpperCase();
  }

  function sf2PresentTotalsBySex(payload) {
    const assignment = activeAssignment();
    const dates = sf2PayloadDates(payload);
    const term = sf2PayloadTerm(payload);
    const rows = Array.isArray(payload?.learners)
      ? payload.learners
      : (Array.isArray(payload?.rows) ? payload.rows : []);
    const totals = { male: {}, female: {}, all: {} };

    dates.forEach((date) => {
      if (!hasAttendanceSessionForDate(assignment, date.value, term)) return;
      if (noClassDayFor(assignment, date.value, term)) return;

      const maleRows = rows.filter((row) => sf2RowSex(row).startsWith('M'));
      const femaleRows = rows.filter((row) => sf2RowSex(row).startsWith('F'));
      const countPresent = (sectionRows) => sectionRows.reduce((count, row) => {
        const status = row?.id
          ? learnerStatusForSession(assignment, row.id, { date: date.value, term })
          : String(row?.marks?.[date.value] || '').trim().toLowerCase();
        if (status === 'absent' || status === EXCUSED_STATUS || status === EXCUSED_TYPE || status === NO_CLASS_STATUS || status === NO_CLASS_TYPE) {
          return count;
        }
        return count + 1;
      }, 0);

      totals.male[date.value] = countPresent(maleRows);
      totals.female[date.value] = countPresent(femaleRows);
      totals.all[date.value] = totals.male[date.value] + totals.female[date.value];
    });

    return { dates, totals };
  }

  function sf2TotalRowKind(row) {
    const text = String(row?.textContent || '').replace(/\s+/g, ' ').trim().toUpperCase();
    if (text.includes('FEMALE') && text.includes('TOTAL PER DAY')) return 'female';
    if (text.includes('MALE') && text.includes('TOTAL PER DAY')) return 'male';
    if (text.includes('COMBINED') && text.includes('TOTAL PER DAY')) return 'all';
    return '';
  }

  function fillSf2PresentTotalRow(row, dates, dailyTotals) {
    const cells = Array.from(row?.children || []).filter((cell) => /^(TD|TH)$/i.test(cell.tagName));
    if (!cells.length || !dates.length) return;
    const trailingCells = 3;
    const startIndex = Math.max(1, cells.length - trailingCells - dates.length);
    dates.forEach((date, index) => {
      const cell = cells[startIndex + index];
      if (!cell) return;
      const hasTotal = Object.prototype.hasOwnProperty.call(dailyTotals, date.value);
      cell.textContent = hasTotal ? String(dailyTotals[date.value]) : '';
    });
  }

  function patchSf2PreviewPresentTotals(html, payload) {
    if (!html || typeof document === 'undefined') return html;
    const { dates, totals } = sf2PresentTotalsBySex(payload);
    if (!dates.length) return html;

    const template = document.createElement('template');
    template.innerHTML = html;
    Array.from(template.content.querySelectorAll('tr')).forEach((row) => {
      const kind = sf2TotalRowKind(row);
      if (!kind || !totals[kind]) return;
      fillSf2PresentTotalRow(row, dates, totals[kind]);
    });
    return template.innerHTML;
  }

  function patchStatusHelpers() {
    const originalTypeFromStatus = window.attendanceTypeFromStatus;
    window.attendanceTypeFromStatus = function patchedAttendanceTypeFromStatus(status) {
      if (status === EXCUSED_STATUS) return EXCUSED_TYPE;
      if (status === NO_CLASS_STATUS) return NO_CLASS_TYPE;
      return typeof originalTypeFromStatus === 'function' ? originalTypeFromStatus(status) : '';
    };

    const originalStatusFromType = window.attendanceStatusFromType;
    window.attendanceStatusFromType = function patchedAttendanceStatusFromType(type) {
      if (type === EXCUSED_TYPE) return EXCUSED_STATUS;
      if (type === NO_CLASS_TYPE) return NO_CLASS_STATUS;
      return typeof originalStatusFromType === 'function' ? originalStatusFromType(type) : 'present';
    };

    const originalStatusLabel = window.attendanceStatusLabel;
    window.attendanceStatusLabel = function patchedAttendanceStatusLabel(status) {
      if (status === EXCUSED_STATUS) return EXCUSED_LABEL;
      if (status === NO_CLASS_STATUS) return NO_CLASS_LABEL;
      return typeof originalStatusLabel === 'function' ? originalStatusLabel(status) : 'Present';
    };
  }

  function patchRollCallRendering() {
    const originalRollCallStatus = window.attendanceRollCallStatus;
    window.attendanceRollCallStatus = function patchedAttendanceRollCallStatus(learnerId) {
      const status = typeof originalRollCallStatus === 'function'
        ? originalRollCallStatus(learnerId)
        : 'present';
      if (
        !rollCallTouchedLearnersThisOpen.has(learnerId)
        && status === 'present'
        && savedExcusedRecordForCurrentRollCall(learnerId)
      ) {
        return EXCUSED_STATUS;
      }
      return status;
    };

    const originalControls = window.renderAttendanceStatusControls;
    window.renderAttendanceStatusControls = function patchedRenderAttendanceStatusControls(learnerId, activeStatus) {
      const base = typeof originalControls === 'function' ? originalControls(learnerId, activeStatus) : '';
      return base.replace('</div>', `${excusedButton(learnerId, activeStatus)}</div>${excusedReasonControl(learnerId, activeStatus)}`);
    };

    const originalSetStatus = window.setAttendanceRollCallStatus;
    window.setAttendanceRollCallStatus = function patchedSetAttendanceRollCallStatus(learnerId, status) {
      if (noClassDayFor(activeAssignment(), currentRollCallDate(), currentRollCallTermValue())) return;
      const scrollState = captureRollCallScrollState();
      rollCallTouchedLearnersThisOpen.add(learnerId);
      collectExcusedReasonInputs();
      if (typeof originalSetStatus === 'function') originalSetStatus(learnerId, status);
      if (status !== EXCUSED_STATUS) delete getExcusedReasonStore()[learnerId];
      restoreRollCallScrollState(scrollState);
      setTimeout(() => {
        refreshExcusedSummary();
        decorateRollCallModal();
        restoreRollCallScrollState(scrollState);
        requestAnimationFrame(() => restoreRollCallScrollState(scrollState));
      }, 0);
    };

    const originalRefresh = window.refreshAttendanceRollCallModal;
    window.refreshAttendanceRollCallModal = function patchedRefreshAttendanceRollCallModal() {
      hydrateSavedExcusedReasons();
      const result = typeof originalRefresh === 'function' ? originalRefresh() : undefined;
      hydrateSavedExcusedReasons();
      decorateRollCallModal();
      return result;
    };

    const originalShow = window.showAttendanceRollCallModal;
    window.showAttendanceRollCallModal = function patchedShowAttendanceRollCallModal(...args) {
      rollCallTouchedLearnersThisOpen = new Set();
      const result = typeof originalShow === 'function' ? originalShow.apply(this, args) : undefined;
      hydrateSavedExcusedReasons();
      decorateRollCallModal();
      return result;
    };

    const originalSave = window.saveAttendanceRollCall;
    window.saveAttendanceRollCall = function patchedSaveAttendanceRollCall(...args) {
      const assignment = activeAssignment();
      if (noClassDayFor(assignment, currentRollCallDate(), currentRollCallTermValue())) {
        removeAttendanceEntriesForDate(assignment, currentRollCallDate(), currentRollCallTermValue());
        if (typeof saveDatabase === 'function') saveDatabase();
        if (typeof renderAttendanceTracker === 'function') renderAttendanceTracker();
        closeRollCallModal();
        if (typeof toast === 'function') toast('No class day saved. No learner attendance was recorded for this date.', 'success');
        return undefined;
      }
      collectExcusedReasonInputs();
      const result = typeof originalSave === 'function' ? originalSave.apply(this, args) : undefined;
      applyExcusedReasonsToSavedRecords();
      reconcileSavedRollCallRecords();
      if (typeof renderAttendanceTracker === 'function') renderAttendanceTracker();
      return result;
    };

    window.toggleAttendanceNoClassDate = setNoClassDay;
    window.updateAttendanceNoClassReason = updateNoClassReason;

    document.addEventListener('click', (event) => {
      const button = event.target?.closest?.('button');
      if (!button || !document.getElementById('attendanceRollCallModal')) return;
      if (!/mark\s+all(?:\s+as)?\s+present/i.test(button.textContent || '')) return;
      if (noClassDayFor(activeAssignment(), currentRollCallDate(), currentRollCallTermValue())) return;
      const scrollState = captureRollCallScrollState();
      markAllRollCallLearnersTouched('present');
      setTimeout(() => {
        refreshExcusedSummary();
        decorateRollCallModal();
        restoreRollCallScrollState(scrollState);
        requestAnimationFrame(() => restoreRollCallScrollState(scrollState));
      }, 0);
    }, true);

    document.addEventListener('click', (event) => {
      const button = event.target?.closest?.('button');
      if (!button || !document.getElementById('attendanceRollCallModal')) return;
      if (!/Clear\s+This\s+Date/i.test(button.textContent || '')) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const date = currentRollCallDate();
      const term = currentRollCallTermValue();
      const clearDate = () => clearRollCallDateFromModal(date, term);
      if (typeof confirmModal === 'function') {
        confirmModal(
          'Clear Attendance Date',
          'Clear all attendance entries, excused reasons, and the no-class marker for this date?',
          clearDate
        );
      } else {
        clearDate();
      }
    }, true);
  }

  function patchAnalytics() {
    window.attendanceLearnerAnalytics = function patchedAttendanceLearnerAnalytics(assignment, learnerId, range) {
      return computeLearnerAttendance(assignment, learnerId, range);
    };

    window.attendanceClassAnalytics = function patchedAttendanceClassAnalytics(assignment, range) {
      return computeClassAttendance(assignment, range);
    };

    const originalAnalyticsCard = window.renderAttendanceAnalyticsCard;
    window.renderAttendanceAnalyticsCard = function patchedRenderAttendanceAnalyticsCard(assignment, ...args) {
      const html = typeof originalAnalyticsCard === 'function'
        ? originalAnalyticsCard(assignment, ...args)
        : '';
      const range = typeof attendanceAnalyticsRange === 'function' ? attendanceAnalyticsRange(assignment) : null;
      const learnerId = (typeof attendanceAnalyticsState !== 'undefined' && attendanceAnalyticsState)
        ? attendanceAnalyticsState.learnerId
        : '';
      const stats = learnerId
        ? computeLearnerAttendance(assignment, learnerId, range)
        : computeClassAttendance(assignment, range).totals;
      return insertExcusedMetric(html, stats.excused || 0);
    };
  }

  function patchMonthlyAttendance() {
    const originalMonthlyStatus = window.attendanceMonthlyStatus;
    window.attendanceMonthlyStatus = function patchedAttendanceMonthlyStatus(...args) {
      const context = monthlyStatusContext(args);
      if (noClassDayFor(context.assignment, context.date, context.term)) {
        return NO_CLASS_STATUS;
      }
      if (attendanceRecordFor(context.assignment, context.learnerId, context.date, context.term, EXCUSED_TYPE)) {
        return EXCUSED_STATUS;
      }
      return typeof originalMonthlyStatus === 'function' ? originalMonthlyStatus.apply(this, args) : '';
    };

    const originalMonthlyGrid = window.renderAttendanceMonthlyGrid;
    window.renderAttendanceMonthlyGrid = function patchedRenderAttendanceMonthlyGrid(...args) {
      const html = typeof originalMonthlyGrid === 'function' ? originalMonthlyGrid.apply(this, args) : '';
      return addAttendanceMonthlyLegends(html);
    };
  }

  function patchDisplayHelpers() {
    const originalSf2Display = window.attendanceSf2Display;
    window.attendanceSf2Display = function patchedAttendanceSf2Display(value, ...rest) {
      if (value === EXCUSED_STATUS || value === EXCUSED_TYPE) return 'E';
      if (value === NO_CLASS_STATUS || value === NO_CLASS_TYPE) return 'NC';
      return typeof originalSf2Display === 'function' ? originalSf2Display(value, ...rest) : '';
    };

    const originalSf2Cell = window.attendanceSf2PreviewCell;
    window.attendanceSf2PreviewCell = function patchedAttendanceSf2PreviewCell(value, ...rest) {
      if (value === EXCUSED_STATUS || value === EXCUSED_TYPE) {
        return '<td class="attendance-sf2-cell attendance-sf2-cell--excused">E</td>';
      }
      if (value === NO_CLASS_STATUS || value === NO_CLASS_TYPE) {
        return '<td class="attendance-sf2-cell attendance-sf2-cell--no-class">NC</td>';
      }
      return typeof originalSf2Cell === 'function' ? originalSf2Cell(value, ...rest) : '';
    };

    const originalSf2Preview = window.renderAttendanceSf2Preview;
    window.renderAttendanceSf2Preview = function patchedRenderAttendanceSf2Preview(payload, ...rest) {
      const html = typeof originalSf2Preview === 'function'
        ? originalSf2Preview.call(this, payload, ...rest)
        : '';
      return patchSf2PreviewPresentTotals(html, payload);
    };

    const originalSf2Options = window.showAttendanceSf2OptionsModal;
    window.showAttendanceSf2OptionsModal = function patchedShowAttendanceSf2OptionsModal(...args) {
      const result = typeof originalSf2Options === 'function' ? originalSf2Options.apply(this, args) : undefined;
      fillSf2SummaryInputs();
      setTimeout(fillSf2SummaryInputs, 0);
      return result;
    };
  }

  function init() {
    patchStatusHelpers();
    patchRollCallRendering();
    patchAnalytics();
    patchMonthlyAttendance();
    patchDisplayHelpers();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
