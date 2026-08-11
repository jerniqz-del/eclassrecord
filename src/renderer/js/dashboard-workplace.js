(function initDashboardWorkplace(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.DashboardWorkplace = api;
})(typeof window !== 'undefined' ? window : globalThis, function createDashboardWorkplace() {
  'use strict';

  const STORE_VERSION = 1;
  const VALID_TERMS = new Set(['1', '2', '3']);
  const clean = value => String(value == null ? '' : value).trim();
  const dateKey = value => (clean(value).match(/^(\d{4})-(\d{2})-(\d{2})/) || []).slice(1).join('-');

  function todayKey(now) {
    const date = now instanceof Date && !Number.isNaN(now.getTime()) ? now : new Date();
    return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
  }

  function createStore() {
    return {
      version: STORE_VERSION,
      tasks: [],
      preferences: { collapsedPanels: [] },
      lastContext: { assignmentId: '', term: '1', action: 'grading' }
    };
  }

  function normalize(profileDb) {
    if (!profileDb || typeof profileDb !== 'object' || Array.isArray(profileDb)) throw new TypeError('A profile database object is required.');
    const store = profileDb.workplace && typeof profileDb.workplace === 'object' && !Array.isArray(profileDb.workplace) ? profileDb.workplace : {};
    const preferences = store.preferences && typeof store.preferences === 'object' && !Array.isArray(store.preferences) ? store.preferences : {};
    const context = store.lastContext && typeof store.lastContext === 'object' && !Array.isArray(store.lastContext) ? store.lastContext : {};
    store.version = STORE_VERSION;
    store.tasks = (Array.isArray(store.tasks) ? store.tasks : []).filter(item => item && clean(item.title)).map((item, index) => Object.assign({}, item, {
      id: clean(item.id) || 'work-task-' + Date.now() + '-' + index,
      title: clean(item.title).slice(0, 160),
      dueDate: dateKey(item.dueDate),
      completed: Boolean(item.completed),
      createdAt: clean(item.createdAt) || new Date().toISOString()
    }));
    store.preferences = Object.assign({}, preferences, {
      collapsedPanels: Array.from(new Set((Array.isArray(preferences.collapsedPanels) ? preferences.collapsedPanels : []).map(clean).filter(Boolean))),
      includeDuplicateLearners: preferences.includeDuplicateLearners !== false,
      analyticsScope: preferences.analyticsScope === 'all' ? 'all' : 'current',
      attentionScope: preferences.attentionScope === 'all' ? 'all' : 'current',
      dismissedAttention: Array.isArray(preferences.dismissedAttention) ? preferences.dismissedAttention.map(clean).filter(Boolean) : [],
      snoozedAttention: preferences.snoozedAttention && typeof preferences.snoozedAttention === 'object' ? Object.assign({}, preferences.snoozedAttention) : {}
    });
    store.lastContext = Object.assign({}, context, {
      assignmentId: clean(context.assignmentId),
      term: VALID_TERMS.has(clean(context.term)) ? clean(context.term) : '1',
      action: clean(context.action) || 'grading'
    });
    profileDb.workplace = store;
    return store;
  }

  function activeLearners(assignment, term) {
    return (Array.isArray(assignment.learners) ? assignment.learners : []).filter(learner => {
      if (!learner || learner.enrollmentStatus === 'inactive') return false;
      const outTerm = Number(learner.transferredOutTerm);
      return !Number.isFinite(outTerm) || outTerm > Number(term || 1);
    });
  }

  function learnerIdentity(learner, fallbackIndex) {
    const lrn = clean(learner && learner.lrn).replace(/\s+/g, '').toLowerCase();
    if (lrn) return 'lrn:' + lrn;
    const normalizeName = value => clean(value).toLowerCase().replace(/[^a-z0-9]/g, '');
    const name = [normalizeName(learner && learner.lastName), normalizeName(learner && learner.firstName), normalizeName(learner && learner.middleName)].join('|');
    const birthDate = clean(learner && (learner.birthDate || learner.birthdate || learner.dateOfBirth));
    if (name.replace(/\|/g, '')) return 'name:' + name + '|birth:' + birthDate;
    const id = clean(learner && learner.id);
    return id ? 'id:' + id : 'anonymous:' + fallbackIndex;
  }

  function buildLearnerCounts(assignments, term) {
    const entries = [];
    assignments.forEach(assignment => activeLearners(assignment, term).forEach(learner => entries.push(learner)));
    const identities = new Set(entries.map((learner, index) => learnerIdentity(learner, index)));
    return { entries: entries.length, unique: identities.size };
  }

  function assessmentLabel(assessment) {
    return clean(assessment.title) || clean(assessment.name) || clean(assessment.component) || 'Untitled assessment';
  }

  function buildAttention(assignments, today, currentTerm, selectedAssignmentId) {
    const groups = new Map();
    const term = VALID_TERMS.has(clean(currentTerm)) ? clean(currentTerm) : '1';
    const add = item => {
      const key = [item.assignmentId || 'global', item.type].join('|');
      const existing = groups.get(key);
      if (existing) {
        existing.count += Number(item.count || 1);
        existing.assessmentIds = Array.from(new Set(existing.assessmentIds.concat(item.assessmentIds || [])));
        existing.title = existing.titleForCount(existing.count);
        return;
      }
      const created = Object.assign({ count:Number(item.count || 1), assessmentIds:[], priority:99 }, item, {
        id:key,
        assessmentIds:item.assessmentIds || [],
        assessmentId:(item.assessmentIds || [])[0] || '',
        titleForCount:item.titleForCount || (() => item.title)
      });
      created.title = created.titleForCount(created.count);
      groups.set(key, created);
    };
    assignments.forEach(assignment => {
      const assignmentId = clean(assignment.id);
      const learners = activeLearners(assignment, term);
      const className = 'Grade ' + clean(assignment.gradeLevel) + ' - ' + clean(assignment.section) + ' · ' + clean(assignment.subject);
      if (!learners.length) add({ type:'empty-class', assignmentId, term, priority:4, severity:'info', action:'learner', count:1, title:'Empty class roster', titleForCount:() => 'Add learners to ' + className, detail:'This class has no active learners yet.' });
      (Array.isArray(assignment.assessments) ? assignment.assessments : []).filter(item => clean(item.term) === term).forEach(assessment => {
        const assessmentId = clean(assessment.id), label = assessmentLabel(assessment), rawHps = assessment.maxScore;
        const hpsBlank = rawHps === undefined || rawHps === null || clean(rawHps) === '';
        const hps = Number(rawHps);
        let invalid = 0, missing = 0;
        learners.forEach(learner => {
          const value = (assignment.scores || {})[clean(learner.id) + '|' + assessmentId];
          if (value === undefined || value === null || clean(value) === '') { missing++; return; }
          const numeric = Number(value);
          if (!Number.isFinite(numeric) || numeric < 0 || (!hpsBlank && Number.isFinite(hps) && hps > 0 && numeric > hps)) invalid++;
        });
        if (invalid) add({ type:'invalid-scores', assignmentId, assessmentIds:[assessmentId], term, priority:1, severity:'danger', action:'grading', count:invalid, titleForCount:count => count + ' invalid or HPS-exceeding score' + (count===1?'':'s'), detail:className });
        if (hpsBlank || !Number.isFinite(hps) || hps <= 0) add({ type:'missing-hps', assignmentId, assessmentIds:[assessmentId], term, priority:2, severity:'warning', action:'grading', count:1, titleForCount:count => count + ' assessment' + (count===1?'':'s') + ' missing HPS', detail:className });
        const assessmentDate = dateKey(assessment.date);
        if (assessmentDate && assessmentDate <= today && learners.length && missing) add({ type:'incomplete-scores', assignmentId, assessmentIds:[assessmentId], term, priority:3, severity:'warning', action:'grading', count:missing, titleForCount:count => count + ' score' + (count===1?'':'s') + ' still needed', detail:className });
        if (assessmentDate && assessmentDate > today) {
          const days = Math.ceil((new Date(assessmentDate+'T00:00:00') - new Date(today+'T00:00:00')) / 86400000);
          if (days <= 7) add({ type:'upcoming-deadline', assignmentId, assessmentIds:[assessmentId], term, priority:6, severity:'info', action:'grading', count:1, titleForCount:count => count + ' assessment deadline' + (count===1?'':'s') + ' this week', detail:label + ' · ' + className, dismissible:true });
        }
      });
    });
    return Array.from(groups.values()).sort((left,right) =>
      (left.assignmentId === selectedAssignmentId ? 0 : 1) - (right.assignmentId === selectedAssignmentId ? 0 : 1)
      || left.priority - right.priority || left.title.localeCompare(right.title));
  }

  function buildUpcoming(profileDb, assignments, today) {
    const events = [];
    (Array.isArray(profileDb.calendarEvents) ? profileDb.calendarEvents : []).forEach(event => {
      const date = dateKey(event.date);
      if (date && date >= today) events.push({ id: clean(event.id) || 'calendar-' + events.length, source: 'calendar', date, title: clean(event.title) || 'Calendar event', detail: clean(event.type) });
    });
    assignments.forEach(assignment => (Array.isArray(assignment.assessments) ? assignment.assessments : []).forEach(assessment => {
      const date = dateKey(assessment.date);
      if (date && date >= today) events.push({ id: 'assessment-' + clean(assignment.id) + '-' + clean(assessment.id), source: 'assessment', date, title: assessmentLabel(assessment), detail: 'Grade ' + clean(assignment.gradeLevel) + ' - ' + clean(assignment.section) + ' · ' + clean(assignment.subject), assignmentId: clean(assignment.id), assessmentId: clean(assessment.id), term: clean(assessment.term) || '1' });
    }));
    return events.sort((left, right) => left.date.localeCompare(right.date) || left.title.localeCompare(right.title)).slice(0, 6);
  }


  function buildAnalytics(assignments, currentTerm) {
    const term = VALID_TERMS.has(clean(currentTerm)) ? clean(currentTerm) : '1';
    const mix = { written: 0, performance: 0, quarterly: 0, other: 0 };
    const termCounts = { '1': 0, '2': 0, '3': 0 };
    let assessments = 0;
    let expectedScores = 0;
    let enteredScores = 0;
    let hpsReady = 0;
    let totalMissingScores = 0;
    const missingByAssessment = [];

    const byClass = assignments.map(assignment => {
      const learners = activeLearners(assignment, term);
      const allAssessments = Array.isArray(assignment.assessments) ? assignment.assessments : [];
      allAssessments.forEach(item => {
        const itemTerm = clean(item.term);
        if (termCounts[itemTerm] !== undefined) termCounts[itemTerm]++;
        if (!VALID_TERMS.has(itemTerm)) return;
        const termLearners = activeLearners(assignment, itemTerm);
        const missingLearners = termLearners.filter(learner => {
          const value = (assignment.scores || {})[clean(learner.id) + '|' + clean(item.id)];
          return value === undefined || value === null || clean(value) === '';
        }).map(learner => ({
          id: clean(learner.id),
          name: [clean(learner.lastName), clean(learner.firstName), clean(learner.middleName)].filter(Boolean).join(', ').replace(', ,', ',') || clean(learner.name) || clean(learner.lrn) || 'Unnamed learner'
        }));
        totalMissingScores += missingLearners.length;
        missingByAssessment.push({
          assignmentId: clean(assignment.id),
          classLabel: 'Grade ' + clean(assignment.gradeLevel) + ' - ' + clean(assignment.section),
          subject: clean(assignment.subject),
          term: itemTerm,
          assessmentId: clean(item.id),
          assessment: assessmentLabel(item),
          hasHps: !(item.maxScore === undefined || item.maxScore === null || clean(item.maxScore) === ''),
          component: clean(item.component),
          mapePart: clean(item.mapePart),
          missing: missingLearners.length,
          totalLearners: termLearners.length,
          missingLearners
        });
      });
      const currentAssessments = allAssessments.filter(item => clean(item.term) === term);
      let classEntered = 0;
      const classExpected = learners.length * currentAssessments.length;
      currentAssessments.forEach(assessment => {
        assessments++;
        if (!(assessment.maxScore === undefined || assessment.maxScore === null || clean(assessment.maxScore) === '')) hpsReady++;
        const component = clean(assessment.component).toLowerCase();
        if (component === 'ww' || component.includes('written')) mix.written++;
        else if (component === 'pt' || component.includes('performance')) mix.performance++;
        else if (component === 'qa' || component.includes('quarter')) mix.quarterly++;
        else mix.other++;
        learners.forEach(learner => {
          const value = (assignment.scores || {})[clean(learner.id) + '|' + clean(assessment.id)];
          if (!(value === undefined || value === null || clean(value) === '')) classEntered++;
        });
      });
      expectedScores += classExpected;
      enteredScores += classEntered;
      return {
        id: clean(assignment.id),
        label: 'G' + clean(assignment.gradeLevel) + ' ' + clean(assignment.section),
        subject: clean(assignment.subject),
        entered: classEntered,
        expected: classExpected,
        percent: classExpected ? Math.round((classEntered / classExpected) * 100) : 0
      };
    });

    const missingHps = Math.max(0, assessments - hpsReady);
    const emptyCategories = [['written','Written Work'],['performance','Performance Task'],['quarterly','Quarterly/Other']].filter(([key]) => key === 'quarterly' ? mix.quarterly + mix.other === 0 : mix[key] === 0).map(([,label]) => label);
    return {
      assessments,
      expectedScores,
      enteredScores,
      completionPercent: expectedScores ? Math.round((enteredScores / expectedScores) * 100) : 0,
      hpsReady,
      hpsPercent: assessments ? Math.round((hpsReady / assessments) * 100) : 0,
      byClass,
      mix,
      termCounts,
      totalMissingScores,
      missingByAssessment,
      missingHps,
      emptyCategories
    };
  }

  function snapshot(profileDb, options) {
    const store = normalize(profileDb);
    const settings = options && typeof options === 'object' ? options : {};
    const today = todayKey(settings.now);
    const activeYear = clean(settings.schoolYear) || clean(profileDb.schoolYear);
    const assignments = (Array.isArray(profileDb.assignments) ? profileDb.assignments : []).filter(item => !activeYear || clean(item.schoolYear) === activeYear);
    const currentAssignment = assignments.find(item => clean(item.id) === clean(store.lastContext.assignmentId)) || assignments.find(item => clean(item.id) === clean(profileDb.currentAssignmentId)) || assignments[0] || null;
    const currentTerm = VALID_TERMS.has(clean(store.lastContext.term)) ? clean(store.lastContext.term) : (VALID_TERMS.has(clean(profileDb.currentTerm)) ? clean(profileDb.currentTerm) : '1');
    const analyticsAssignments = store.preferences.analyticsScope === 'all' || !currentAssignment ? assignments : [currentAssignment];
    const attention = buildAttention(assignments, today, currentTerm, clean(currentAssignment?.id));
    const analytics = buildAnalytics(analyticsAssignments, currentTerm);
    const advisory = settings.advisorySummary || {};
    if (Number(advisory.conflicts) > 0) attention.push({ id:'global|advisory-conflicts', priority:5, action:'advisory', type: 'advisory-conflicts', title: Number(advisory.conflicts) + ' Advisory grade conflict' + (Number(advisory.conflicts) === 1 ? '' : 's'), detail: 'Review conflicting imported grades.', severity: 'danger' });
    else if (Number(advisory.missingGrades) > 0) attention.push({ id:'global|advisory-missing', priority:5, action:'advisory', type: 'advisory-missing', title: Number(advisory.missingGrades) + ' Advisory grade' + (Number(advisory.missingGrades) === 1 ? '' : 's') + ' missing', detail: 'Open Advisory to continue grade consolidation.', severity: 'warning' });
    attention.sort((left,right) => (left.assignmentId === clean(currentAssignment?.id) ? 0 : 1) - (right.assignmentId === clean(currentAssignment?.id) ? 0 : 1) || Number(left.priority||99)-Number(right.priority||99));
    const learnerCounts = buildLearnerCounts(assignments, currentTerm);
    return {
      today, schoolYear: activeYear, assignments, currentAssignment, currentTerm, attention, analytics,
      upcoming: buildUpcoming(profileDb, assignments, today),
      tasks: store.tasks.slice().sort((left, right) => left.completed !== right.completed ? (left.completed ? 1 : -1) : (left.dueDate || '9999-99-99').localeCompare(right.dueDate || '9999-99-99')),
      preferences: store.preferences,
      stats: {
        classes: assignments.length,
        learners: learnerCounts.entries,
        learnerDisplay: store.preferences.includeDuplicateLearners ? learnerCounts.entries : learnerCounts.unique,
        learnerEntries: learnerCounts.entries,
        uniqueLearners: learnerCounts.unique,
        attention: attention.length
      }
    };
  }

  function addTask(profileDb, title, dueDate) {
    const store = normalize(profileDb);
    const taskTitle = clean(title).slice(0, 160);
    if (!taskTitle) throw new Error('Task title is required.');
    const task = { id: 'work-task-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8), title: taskTitle, dueDate: dateKey(dueDate), completed: false, createdAt: new Date().toISOString() };
    store.tasks.push(task);
    return task;
  }

  function toggleTask(profileDb, taskId) {
    const task = normalize(profileDb).tasks.find(item => item.id === taskId);
    if (!task) return false;
    task.completed = !task.completed;
    return true;
  }

  function removeTask(profileDb, taskId) {
    const store = normalize(profileDb);
    const before = store.tasks.length;
    store.tasks = store.tasks.filter(item => item.id !== taskId);
    return store.tasks.length !== before;
  }

  function rememberContext(profileDb, nextContext) {
    const store = normalize(profileDb);
    const context = nextContext && typeof nextContext === 'object' ? nextContext : {};
    if (clean(context.assignmentId)) store.lastContext.assignmentId = clean(context.assignmentId);
    if (VALID_TERMS.has(clean(context.term))) store.lastContext.term = clean(context.term);
    if (clean(context.action)) store.lastContext.action = clean(context.action);
    return store.lastContext;
  }

  function togglePanel(profileDb, panel) {
    const store = normalize(profileDb);
    const key = clean(panel);
    const current = new Set(store.preferences.collapsedPanels);
    if (current.has(key)) current.delete(key); else if (key) current.add(key);
    store.preferences.collapsedPanels = Array.from(current);
    return store.preferences.collapsedPanels;
  }

  return { STORE_VERSION, createStore, normalize, snapshot, addTask, toggleTask, removeTask, rememberContext, togglePanel, todayKey, buildAttention, buildAnalytics };
});
