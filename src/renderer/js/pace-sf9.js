/**
 * Grade 1 SF9 (Learner's Progress Report Card): ages, term narratives, attendance, print.
 * Attendance is read from Attendance Tracker sessions; there is no second store.
 */
(function initPaceSf9(globalScope) {
  'use strict';

  var SF9_ATTENDANCE_MONTHS = Object.freeze([
    { key: 'june', term: '1', month: 6, label: 'June' },
    { key: 'july', term: '1', month: 7, label: 'July' },
    { key: 'august', term: '1', month: 8, label: 'August' },
    { key: 'septemberT1', term: '1', month: 9, label: 'September', split: 'first' },
    { key: 'septemberT2', term: '2', month: 9, label: 'September', split: 'second' },
    { key: 'october', term: '2', month: 10, label: 'October' },
    { key: 'november', term: '2', month: 11, label: 'November' },
    { key: 'december', term: '2', month: 12, label: 'December' },
    { key: 'january', term: '3', month: 1, label: 'January' },
    { key: 'february', term: '3', month: 2, label: 'February' },
    { key: 'march', term: '3', month: 3, label: 'March' },
    { key: 'april', term: '3', month: 4, label: 'April' }
  ]);

  function sf9Esc(value) {
    if (typeof globalScope.esc === 'function') return globalScope.esc(value);
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function parseIsoDate(value) {
    const match = String(value || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) return null;
    return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
  }

  function paceSchoolYearAnchorDates(events) {
    const list = Array.isArray(events)
      ? events
      : (globalScope.OfficialSchoolCalendar && typeof globalScope.OfficialSchoolCalendar.officialEvents === 'function'
        ? globalScope.OfficialSchoolCalendar.officialEvents()
        : []);
    const term1 = list.find(item => item && item.type === 'term' && /term-1/i.test(String(item.id || '')));
    const reports3 = list.find(item => item && item.type === 'report-card' && /reports-3/i.test(String(item.id || '')));
    const term3 = list.find(item => item && item.type === 'term' && /term-3/i.test(String(item.id || '')));
    return {
      beginning: (term1 && term1.startDate) || '2026-06-08',
      end: (reports3 && (reports3.startDate || reports3.endDate)) || (term3 && term3.endDate) || '2027-04-08'
    };
  }

  function paceAgeAtDate(birthdate, asOfDate) {
    const birth = parseIsoDate(birthdate);
    const asOf = parseIsoDate(asOfDate);
    if (!birth || !asOf) return { years: '', months: '' };
    let years = asOf.y - birth.y;
    let months = asOf.m - birth.m;
    if (asOf.d < birth.d) months -= 1;
    if (months < 0) {
      years -= 1;
      months += 12;
    }
    if (years < 0) return { years: '', months: '' };
    return { years, months };
  }

  function paceSf9Ages(learner, events) {
    const anchors = paceSchoolYearAnchorDates(events);
    return {
      beginning: paceAgeAtDate(learner && learner.birthdate, anchors.beginning),
      end: paceAgeAtDate(learner && learner.birthdate, anchors.end),
      anchors
    };
  }

  function paceSf9SeptemberSplitDate(events) {
    const list = Array.isArray(events)
      ? events
      : (globalScope.OfficialSchoolCalendar && typeof globalScope.OfficialSchoolCalendar.officialEvents === 'function'
        ? globalScope.OfficialSchoolCalendar.officialEvents()
        : []);
    const term1 = list.find(item => item && item.type === 'term' && /term-1/i.test(String(item.id || '')));
    return (term1 && term1.endDate) || '2026-09-15';
  }

  function sessionDate(session) {
    if (typeof session === 'string') return session;
    return session && session.date ? String(session.date) : '';
  }

  function sessionTerm(session) {
    if (typeof session === 'string') return '1';
    return String((session && session.term) || '1');
  }

  function normalizedSessions(assignment) {
    const raw = Array.isArray(assignment && assignment.attendanceSessions) ? assignment.attendanceSessions : [];
    const seen = new Set();
    return raw.map(session => ({ date: sessionDate(session), term: sessionTerm(session) })).filter(session => {
      if (!session.date) return false;
      const key = `${session.date}|${session.term}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function sf9SessionStatus(assignment, learnerId, session) {
    if (!learnerId) return 'present';
    if (typeof globalScope.learnerStatusForSession === 'function') {
      return globalScope.learnerStatusForSession(assignment, learnerId, session) || 'present';
    }
    const records = Array.isArray(assignment && assignment.supportRecords) ? assignment.supportRecords : [];
    const hit = records.find(record => (
      record
      && record.category === 'attendance'
      && String(record.learnerId) === String(learnerId)
      && String(record.date) === String(session.date)
      && String(record.term || '1') === String(session.term || '1')
    ));
    if (!hit) return 'present';
    if (hit.type === 'absence') return 'absent';
    if (hit.type === 'tardy') return 'tardy';
    if (hit.type === 'excused' || hit.type === 'excuse') return 'excused';
    return 'present';
  }

  function sessionInBucket(session, bucket, splitDate) {
    const match = String(session.date || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) return false;
    const month = Number(match[2]);
    if (month !== bucket.month) return false;
    if (bucket.month !== 9 || !bucket.split) return true;
    if (bucket.split === 'first') return session.date <= splitDate;
    return session.date > splitDate;
  }

  function paceSf9AttendanceByMonth(assignment, learnerId, events) {
    const splitDate = paceSf9SeptemberSplitDate(events);
    const sessions = normalizedSessions(assignment);
    return SF9_ATTENDANCE_MONTHS.map(bucket => {
      const inMonth = sessions.filter(session => sessionInBucket(session, bucket, splitDate));
      let present = 0;
      let absent = 0;
      if (learnerId) {
        inMonth.forEach(session => {
          const status = sf9SessionStatus(assignment, learnerId, session);
          if (status === 'absent') absent += 1;
          else present += 1;
        });
      }
      return {
        key: bucket.key,
        term: bucket.term,
        month: bucket.month,
        label: bucket.label,
        classDays: inMonth.length,
        present,
        absent
      };
    });
  }

  function paceSf9ClassDaysMap(assignment, events) {
    const months = paceSf9AttendanceByMonth(assignment, null, events);
    const map = {};
    months.forEach(item => { map[item.key] = item.classDays; });
    return map;
  }

  function learnerFormName(learner) {
    if (typeof globalScope.learnerDisplayName === 'function') return globalScope.learnerDisplayName(learner);
    return (learner && (learner.name || [learner.lastName, learner.firstName].filter(Boolean).join(', '))) || '';
  }

  function paceSf9CardMarkup(options) {
    const settings = options && typeof options === 'object' ? options : {};
    const school = settings.school || {};
    const assignment = settings.assignment || {};
    const learner = settings.learner || {};
    const events = settings.events;
    const ages = paceSf9Ages(learner, events);
    const months = paceSf9AttendanceByMonth(assignment, learner.id, events);
    const terms = ['1', '2', '3'].map(term => {
      const summary = typeof globalScope.paceTermSummary === 'function'
        ? globalScope.paceTermSummary(assignment, learner.id, term)
        : { canDo: '', toImprove: '' };
      return { term, canDo: summary.canDo || '', toImprove: summary.toImprove || '' };
    });
    const attendanceRows = months.map(item => `
      <tr>
        <td>${sf9Esc(item.term)}</td>
        <td>${sf9Esc(item.label)}</td>
        <td>${item.classDays || 0}</td>
        <td>${item.present || 0}</td>
        <td>${item.absent || 0}</td>
      </tr>`).join('');
    const classDaysTotal = months.reduce((sum, item) => sum + (item.classDays || 0), 0);
    const presentTotal = months.reduce((sum, item) => sum + (item.present || 0), 0);
    const absentTotal = months.reduce((sum, item) => sum + (item.absent || 0), 0);
    const termBlocks = terms.map(item => `
      <section class="sf9-term">
        <h3>TERM ${sf9Esc(item.term)}</h3>
        <p class="sf9-label">What Your Child Can Do (Mga Nagagawa)</p>
        <p class="sf9-narrative">${sf9Esc(item.canDo || '—')}</p>
        <p class="sf9-label">What Your Child Is Learning To Improve (Dapat Linangin)</p>
        <p class="sf9-narrative">${sf9Esc(item.toImprove || '—')}</p>
      </section>`).join('');
    return `
      <article class="sf9-card">
        <header class="sf9-banner">
          <p>Republic of the Philippines</p>
          <p>Department of Education</p>
          <p>${sf9Esc(school.region || '')} · ${sf9Esc(school.division || '')}</p>
          <h1>${sf9Esc(school.schoolName || 'School')}</h1>
          <h2>LEARNER'S PROGRESS REPORT CARD</h2>
          <p>School Year ${sf9Esc(school.schoolYear || assignment.schoolYear || '')}</p>
        </header>
        <dl class="sf9-meta">
          <div><dt>Name</dt><dd>${sf9Esc(learnerFormName(learner) || '—')}</dd></div>
          <div><dt>LRN</dt><dd>${sf9Esc(learner.lrn || '—')}</dd></div>
          <div><dt>Section</dt><dd>${sf9Esc(assignment.section || '—')}</dd></div>
          <div><dt>Teacher</dt><dd>${sf9Esc(school.teacherName || '—')}</dd></div>
          <div><dt>Birthdate</dt><dd>${sf9Esc(learner.birthdate || '—')}</dd></div>
          <div><dt>Age at beginning of SY</dt><dd>${ages.beginning.years === '' ? '—' : `${sf9Esc(ages.beginning.years)} years ${sf9Esc(ages.beginning.months)} months`}</dd></div>
          <div><dt>Age at end of SY</dt><dd>${ages.end.years === '' ? '—' : `${sf9Esc(ages.end.years)} years ${sf9Esc(ages.end.months)} months`}</dd></div>
        </dl>
        <p class="sf9-intro">This report provides a descriptive account of your child’s learning progress for each term. It highlights what your child can already do, what they are currently developing, and how they can be further supported at home and in school.</p>
        ${termBlocks}
        <section class="sf9-attendance">
          <h3>ATTENDANCE RECORD</h3>
          <table>
            <thead><tr><th>Term</th><th>Month</th><th>No. of Class Days</th><th>No. Days Present</th><th>No. of Times Absent</th></tr></thead>
            <tbody>${attendanceRows}
              <tr><th colspan="2">TOTAL</th><td>${classDaysTotal}</td><td>${presentTotal}</td><td>${absentTotal}</td></tr>
            </tbody>
          </table>
        </section>
        <section class="sf9-legend">
          <h3>Performance levels used in monitoring</h3>
          <ul>
            <li><strong>A Advancing (Namumukod-tangi)</strong> 90–100 — The learner demonstrates knowledge and skills beyond grade-level expectations.</li>
            <li><strong>B Benchmarking (Naipamamalas)</strong> 80–89 — The learner consistently demonstrates the knowledge and skills expected at grade level.</li>
            <li><strong>C Connecting (Natutungo)</strong> 75–79 — The learner is approaching the knowledge and skills expected at grade level.</li>
            <li><strong>D Developing (Nagpapaunlad)</strong> 65–74 — The learner is developing the knowledge and skills expected at grade level and needs support.</li>
            <li><strong>E Emerging (Nagsisimula)</strong> 60–64 — The learner is beginning to demonstrate the knowledge and skills expected at grade level and requires close guidance.</li>
          </ul>
        </section>
        <section class="sf9-transfer">
          <h3>CERTIFICATE OF TRANSFER</h3>
          <p>Admitted to Grade: ________ &nbsp; Section: ________</p>
          <p>Eligibility for Admission to Grade: ________</p>
          <p>Date: ________ &nbsp; Adviser: ________ &nbsp; School Head: ________</p>
          <p class="sf9-cancel">CANCELLATION OF ELIGIBILITY TO TRANSFER</p>
        </section>
      </article>
    `;
  }

  function grade1HomeroomForAdvisory(profileDb, advisoryClass) {
    const year = String((advisoryClass && advisoryClass.schoolYear) || (profileDb && profileDb.schoolYear) || '');
    const section = String((advisoryClass && advisoryClass.section) || '');
    return ((profileDb && profileDb.assignments) || []).find(item => (
      parseInt(item && item.gradeLevel, 10) === 1
      && item.paceHomeroom
      && String(item.section || '') === section
      && String(item.schoolYear || (profileDb && profileDb.schoolYear) || '') === year
    )) || ((profileDb && profileDb.assignments) || []).find(item => parseInt(item && item.gradeLevel, 10) === 1 && item.paceHomeroom) || null;
  }

  function matchSf9Learner(assignment, advisoryLearner) {
    const lrn = String((advisoryLearner && advisoryLearner.lrn) || '').replace(/\D/g, '');
    const learners = (assignment && assignment.learners) || [];
    if (lrn) {
      const byLrn = learners.find(item => String(item.lrn || '').replace(/\D/g, '') === lrn);
      if (byLrn) return byLrn;
    }
    const name = learnerFormName(advisoryLearner).toLowerCase();
    return learners.find(item => learnerFormName(item).toLowerCase() === name) || advisoryLearner;
  }

  function closeGrade1Sf9Preview() {
    if (typeof document === 'undefined') return;
    document.getElementById('grade1Sf9PreviewModal')?.remove();
    document.body.classList.remove('print-sf9-card');
  }

  function grade1Sf9Context() {
    const profileDb = typeof globalScope.getActiveProfileDatabase === 'function'
      ? globalScope.getActiveProfileDatabase()
      : globalScope.db;
    const advisoryClass = globalScope.AdvisoryDashboard && typeof globalScope.AdvisoryDashboard.currentClass === 'function'
      ? globalScope.AdvisoryDashboard.currentClass()
      : null;
    const assignment = (typeof globalScope.currentAssignment === 'function' && globalScope.currentAssignment() && (
      parseInt(globalScope.currentAssignment().gradeLevel, 10) === 1
      || (typeof globalScope.isKinderAssignment === 'function' && globalScope.isKinderAssignment(globalScope.currentAssignment()))
    ))
      ? globalScope.currentAssignment()
      : (grade1HomeroomForAdvisory(profileDb, advisoryClass)
        || ((profileDb && profileDb.assignments) || []).find(item => typeof globalScope.isKinderAssignment === 'function' && globalScope.isKinderAssignment(item)
          && String(item.section || '') === String((advisoryClass && advisoryClass.section) || ''))
        || null);
    const store = profileDb && globalScope.AdvisoryData && typeof globalScope.AdvisoryData.normalizeAdvisoryData === 'function'
      ? globalScope.AdvisoryData.normalizeAdvisoryData(profileDb)
      : null;
    const advisoryLearners = store && advisoryClass
      ? store.learners.filter(item => item.advisoryClassId === advisoryClass.id && item.enrollmentStatus !== 'inactive')
      : [];
    const learners = advisoryLearners.length
      ? advisoryLearners
      : (assignment && assignment.learners) || [];
    return {
      profileDb,
      advisoryClass,
      assignment: assignment || { gradeLevel: '1', section: advisoryClass && advisoryClass.section, learners },
      learners,
      school: profileDb || {}
    };
  }

  function renderGrade1Sf9Sheet() {
    if (typeof document === 'undefined') return;
    const root = document.getElementById('grade1Sf9PreviewSheet');
    const select = document.getElementById('grade1Sf9LearnerSelect');
    const context = grade1Sf9Context();
    if (!root) return;
    const learnerId = select ? select.value : (context.learners[0] && context.learners[0].id);
    const advisoryLearner = context.learners.find(item => String(item.id) === String(learnerId)) || context.learners[0];
    if (!advisoryLearner) {
      root.innerHTML = '<p class="text-muted">Add Grade 1 learners before printing SF9.</p>';
      return;
    }
    const learner = matchSf9Learner(context.assignment, advisoryLearner);
    const kinder = typeof globalScope.isKinderAssignment === 'function' && globalScope.isKinderAssignment(context.assignment);
    root.innerHTML = kinder && typeof kinderSf9CardMarkup === 'function'
      ? kinderSf9CardMarkup({ school: context.school, assignment: context.assignment, learner })
      : paceSf9CardMarkup({
      school: context.school,
      assignment: context.assignment,
      learner
    });
  }

  function openGrade1Sf9Preview() {
    if (typeof document === 'undefined') return;
    const context = grade1Sf9Context();
    if (!context.learners.length) {
      if (typeof globalScope.toast === 'function') globalScope.toast('Add learners before printing the Grade 1 SF9.', 'warning');
      return;
    }
    closeGrade1Sf9Preview();
    const options = context.learners.map((person, index) => `<option value="${sf9Esc(person.id)}"${index === 0 ? ' selected' : ''}>${sf9Esc(learnerFormName(person))}</option>`).join('');
    const overlay = document.createElement('div');
    overlay.id = 'grade1Sf9PreviewModal';
    overlay.className = 'modal-overlay pace-form-preview-modal';
    overlay.innerHTML = `
      <div class="modal pace-form-preview-dialog" role="dialog" aria-labelledby="grade1Sf9PreviewTitle">
        <div class="modal__title" id="grade1Sf9PreviewTitle">Grade 1 SF9 · Learner’s Progress Report Card</div>
        <div class="pace-form-preview-toolbar">
          <label class="field">
            <span class="field-label">Learner</span>
            <select id="grade1Sf9LearnerSelect" class="field-select">${options}</select>
          </label>
          <p class="text-muted">Narrative, legend, attendance, and transfer block from PACE remarks and Attendance Tracker.</p>
        </div>
        <div class="modal__body pace-form-preview-body" id="grade1Sf9PreviewSheet"></div>
        <div class="modal__actions">
          <button type="button" class="btn btn-cancel btn-sm" data-close>Close</button>
          <button type="button" class="btn btn-primary btn-sm" data-print>Print SF9</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector('[data-close]').addEventListener('click', closeGrade1Sf9Preview);
    overlay.querySelector('[data-print]').addEventListener('click', () => {
      document.body.classList.add('print-sf9-card');
      window.print();
      document.body.classList.remove('print-sf9-card');
    });
    overlay.querySelector('#grade1Sf9LearnerSelect').addEventListener('change', renderGrade1Sf9Sheet);
    overlay.addEventListener('click', event => {
      if (event.target === overlay) closeGrade1Sf9Preview();
    });
    renderGrade1Sf9Sheet();
  }

  function kinderSf9CardMarkup(options) {
    const settings = options && typeof options === 'object' ? options : {};
    const school = settings.school || {};
    const assignment = settings.assignment || {};
    const learner = settings.learner || {};
    const events = settings.events;
    const ages = paceSf9Ages(learner, events);
    const months = paceSf9AttendanceByMonth(assignment, learner.id, events);
    const domains = typeof globalScope.kinderDomainNames === 'function' ? globalScope.kinderDomainNames() : [];
    const domainBlocks = domains.map(domain => {
      const items = typeof globalScope.kinderCompetenciesFor === 'function' ? globalScope.kinderCompetenciesFor(domain) : [];
      const rows = items.map(item => {
        const letters = ['1', '2', '3'].map(term => (
          typeof globalScope.paceGetRating === 'function'
            ? globalScope.paceGetRating(assignment, learner.id, item.id, term, '') || ''
            : ''
        ));
        return `<tr><td>${sf9Esc(item.number)}. ${sf9Esc(item.title)}</td><td>${sf9Esc(letters[0] || '—')}</td><td>${sf9Esc(letters[1] || '—')}</td><td>${sf9Esc(letters[2] || '—')}</td></tr>`;
      }).join('');
      return `<section class="sf9-term"><h3>${sf9Esc(domain)}</h3><table><thead><tr><th>Competency</th><th>T1</th><th>T2</th><th>T3</th></tr></thead><tbody>${rows}</tbody></table></section>`;
    }).join('');
    const attendanceRows = months.map(item => `
      <tr><td>${sf9Esc(item.term)}</td><td>${sf9Esc(item.label)}</td><td>${item.classDays || 0}</td><td>${item.present || 0}</td><td>${item.absent || 0}</td></tr>`).join('');
    return `
      <article class="sf9-card">
        <header class="sf9-banner">
          <p>Republic of the Philippines</p>
          <p>Department of Education</p>
          <h1>${sf9Esc(school.schoolName || 'School')}</h1>
          <h2>KINDERGARTEN PROGRESS REPORT CARD</h2>
          <p>School Year ${sf9Esc(school.schoolYear || assignment.schoolYear || '')}</p>
        </header>
        <dl class="sf9-meta">
          <div><dt>Name</dt><dd>${sf9Esc(learnerFormName(learner) || '—')}</dd></div>
          <div><dt>LRN</dt><dd>${sf9Esc(learner.lrn || '—')}</dd></div>
          <div><dt>Section</dt><dd>${sf9Esc(assignment.section || '—')}</dd></div>
          <div><dt>Age at beginning of SY</dt><dd>${ages.beginning.years === '' ? '—' : `${sf9Esc(ages.beginning.years)} years ${sf9Esc(ages.beginning.months)} months`}</dd></div>
        </dl>
        ${domainBlocks}
        <section class="sf9-attendance">
          <h3>ATTENDANCE RECORD</h3>
          <table>
            <thead><tr><th>Term</th><th>Month</th><th>No. of Class Days</th><th>No. Days Present</th><th>No. of Times Absent</th></tr></thead>
            <tbody>${attendanceRows}</tbody>
          </table>
        </section>
        <section class="sf9-legend">
          <h3>Performance levels used in monitoring</h3>
          <ul>
            <li><strong>A Advancing (Namumukod-tangi)</strong></li>
            <li><strong>B Benchmarking (Naipamamalas)</strong></li>
            <li><strong>C Connecting (Natutungo)</strong></li>
            <li><strong>D Developing (Nagpapaunlad)</strong></li>
            <li><strong>E Emerging (Nagsisimula)</strong></li>
          </ul>
        </section>
      </article>
    `;
  }

  const api = {
    SF9_ATTENDANCE_MONTHS,
    paceSchoolYearAnchorDates,
    paceAgeAtDate,
    paceSf9Ages,
    paceSf9SeptemberSplitDate,
    paceSf9AttendanceByMonth,
    paceSf9ClassDaysMap,
    paceSf9CardMarkup,
    kinderSf9CardMarkup,
    openGrade1Sf9Preview,
    closeGrade1Sf9Preview,
    grade1HomeroomForAdvisory
  };

  Object.assign(globalScope, api);
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
