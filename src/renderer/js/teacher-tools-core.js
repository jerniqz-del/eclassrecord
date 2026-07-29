/**
 * Pure data and algorithm layer for Teacher Tools.
 * This module is UI-independent so randomization and grade transactions can be
 * tested without loading Electron or the renderer.
 */
(function initTeacherToolsCore(globalScope) {
  'use strict';

  const TOOLS_SCHEMA_VERSION = 3;
  const SIMULATION_HISTORY_LIMIT = 10;
  const CHECKLIST_HISTORY_LIMIT = 20;
  const CHECKLIST_ENTRY_HISTORY_LIMIT = 50;
  const CHECKLIST_COMPONENTS = ['TRACKING', 'WW', 'PT'];
  const CHECKLIST_SCORING_MODES = ['CHECK', 'NUMERIC'];

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function createId(prefix) {
    const cryptoApi = globalScope.crypto;
    if (cryptoApi && typeof cryptoApi.randomUUID === 'function') {
      return `${prefix}-${cryptoApi.randomUUID()}`;
    }
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function scoreState(scores, key) {
    const present = Object.prototype.hasOwnProperty.call(scores || {}, key)
      && scores[key] !== '';
    return {
      present,
      value: present ? Number(scores[key]) : null
    };
  }

  function equalScoreState(left, right) {
    return Boolean(left?.present) === Boolean(right?.present)
      && (!left?.present || Number(left.value) === Number(right.value));
  }

  function writeScoreState(scores, key, state) {
    if (!state?.present) delete scores[key];
    else scores[key] = Number(state.value);
  }

  function normalizeScoreState(state) {
    if (!state || typeof state !== 'object') return null;
    if (!state.present) return { present: false, value: null };
    const value = Number(state.value);
    return Number.isFinite(value) ? { present: true, value } : null;
  }

  function normalizeSimulationChange(change) {
    if (!change || typeof change !== 'object') return null;
    const key = String(change.key || '');
    if (!key.includes('|')) return null;
    const before = normalizeScoreState(change.before);
    const after = normalizeScoreState(change.after);
    if (!before || !after || equalScoreState(before, after)) return null;
    return { key, before, after };
  }

  function normalizeHistoryEntry(entry, assignmentIds) {
    if (!entry || typeof entry !== 'object') return null;
    const assignmentId = String(entry.assignmentId || '');
    if (!assignmentId || (assignmentIds && !assignmentIds.has(assignmentId))) return null;
    const changes = Array.isArray(entry.changes)
      ? entry.changes.map(normalizeSimulationChange).filter(Boolean)
      : [];
    if (changes.length === 0) return null;
    const status = ['applied', 'reverted', 'partially-reverted'].includes(entry.status)
      ? entry.status
      : 'applied';
    return {
      ...entry,
      id: String(entry.id || createId('grade-simulation')),
      assignmentId,
      assignmentLabel: String(entry.assignmentLabel || ''),
      term: ['1', '2', '3'].includes(String(entry.term)) ? String(entry.term) : '1',
      appliedAt: String(entry.appliedAt || new Date().toISOString()),
      changes,
      status,
      revertedAt: status === 'applied' ? '' : String(entry.revertedAt || '')
    };
  }

  function finiteNonNegative(value, fallback = 0) {
    const numberValue = Number(value);
    return Number.isFinite(numberValue) && numberValue >= 0 ? numberValue : fallback;
  }

  function optionalPositive(value) {
    if (value === '' || value === null || value === undefined) return null;
    const numberValue = Number(value);
    return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : null;
  }

  function normalizedChecklistComponent(value) {
    const component = String(value || '').toUpperCase();
    return CHECKLIST_COMPONENTS.includes(component) ? component : 'TRACKING';
  }

  function normalizeChecklistCriterion(criterion, index = 0) {
    if (!criterion || typeof criterion !== 'object') return null;
    const label = String(criterion.label || '').trim();
    if (!label) return null;
    const scoringMode = CHECKLIST_SCORING_MODES.includes(String(criterion.scoringMode || '').toUpperCase())
      ? String(criterion.scoringMode).toUpperCase()
      : 'CHECK';
    let pointsPerCheck = optionalPositive(criterion.pointsPerCheck) || 1;
    const maxPointsPerSession = optionalPositive(criterion.maxPointsPerSession)
      || (scoringMode === 'CHECK' ? pointsPerCheck : 1);
    pointsPerCheck = Math.min(pointsPerCheck, maxPointsPerSession);
    const maxPointsPerTerm = optionalPositive(criterion.maxPointsPerTerm);
    return {
      ...criterion,
      id: String(criterion.id || createId('checklist-criterion')),
      label,
      destinationComponent: normalizedChecklistComponent(criterion.destinationComponent),
      scoringMode,
      pointsPerCheck,
      maxPointsPerSession,
      maxPointsPerTerm,
      allowNotes: Boolean(criterion.allowNotes),
      active: criterion.active !== false,
      order: Number.isFinite(Number(criterion.order)) ? Number(criterion.order) : index
    };
  }

  function normalizeChecklistEntry(entry) {
    if (entry === '' || entry === null || entry === undefined) return null;
    if (typeof entry === 'number') {
      return Number.isFinite(entry) && entry >= 0
        ? { points: entry, note: '', updatedAt: '', updatedByDeviceId: '' }
        : null;
    }
    if (typeof entry !== 'object') return null;
    const points = Number(entry.points);
    if (!Number.isFinite(points) || points < 0) return null;
    return {
      ...entry,
      points,
      note: String(entry.note || ''),
      updatedAt: String(entry.updatedAt || ''),
      updatedByDeviceId: String(entry.updatedByDeviceId || '')
    };
  }

  function normalizeChecklistSession(session, criterionIds) {
    if (!session || typeof session !== 'object') return null;
    const entries = {};
    const sourceEntries = session.entries && typeof session.entries === 'object' && !Array.isArray(session.entries)
      ? session.entries
      : {};
    Object.entries(sourceEntries).forEach(([learnerId, learnerEntries]) => {
      if (!learnerId || !learnerEntries || typeof learnerEntries !== 'object' || Array.isArray(learnerEntries)) return;
      const normalizedLearnerEntries = {};
      Object.entries(learnerEntries).forEach(([criterionId, entry]) => {
        if (!criterionIds.has(criterionId)) return;
        const normalized = normalizeChecklistEntry(entry);
        if (normalized) normalizedLearnerEntries[criterionId] = normalized;
      });
      if (Object.keys(normalizedLearnerEntries).length) entries[learnerId] = normalizedLearnerEntries;
    });
    return {
      ...session,
      id: String(session.id || createId('checklist-session')),
      date: String(session.date || new Date().toISOString().slice(0, 10)),
      title: String(session.title || 'Checklist Session').trim() || 'Checklist Session',
      entries,
      createdAt: String(session.createdAt || new Date().toISOString()),
      updatedAt: String(session.updatedAt || session.createdAt || new Date().toISOString())
    };
  }

  function normalizeContributionMap(value) {
    const output = {};
    if (!value || typeof value !== 'object' || Array.isArray(value)) return output;
    Object.entries(value).forEach(([learnerId, contribution]) => {
      const numeric = Number(contribution);
      if (learnerId && Number.isFinite(numeric) && numeric >= 0) output[learnerId] = numeric;
    });
    return output;
  }

  function normalizeScoreStateMap(value) {
    const output = {};
    if (!value || typeof value !== 'object' || Array.isArray(value)) return output;
    Object.entries(value).forEach(([learnerId, state]) => {
      const normalized = normalizeScoreState(state);
      if (learnerId && normalized) output[learnerId] = normalized;
    });
    return output;
  }

  function normalizePublicationTarget(target) {
    const existing = target && typeof target === 'object' && !Array.isArray(target) ? target : {};
    return {
      ...existing,
      assessmentId: String(existing.assessmentId || ''),
      lastPublishedAt: String(existing.lastPublishedAt || ''),
      publishedContributions: normalizeContributionMap(existing.publishedContributions),
      publishedScoreStates: normalizeScoreStateMap(existing.publishedScoreStates)
    };
  }

  function normalizePerformanceChecklist(checklist) {
    if (!checklist || typeof checklist !== 'object') return null;
    const assignmentId = String(checklist.assignmentId || '');
    if (!assignmentId) return null;
    const criteria = Array.isArray(checklist.criteria)
      ? checklist.criteria.map(normalizeChecklistCriterion).filter(Boolean)
      : [];
    const criterionIds = new Set(criteria.map(item => item.id));
    const sessions = Array.isArray(checklist.sessions)
      ? checklist.sessions.map(item => normalizeChecklistSession(item, criterionIds)).filter(Boolean)
      : [];
    const targets = checklist.publicationTargets && typeof checklist.publicationTargets === 'object'
      ? checklist.publicationTargets
      : {};
    return {
      ...checklist,
      id: String(checklist.id || createId('performance-checklist')),
      assignmentId,
      schoolYear: String(checklist.schoolYear || ''),
      term: ['1', '2', '3'].includes(String(checklist.term)) ? String(checklist.term) : '1',
      mapePart: String(checklist.mapePart || ''),
      title: String(checklist.title || 'Performance Checklist').trim() || 'Performance Checklist',
      status: ['active', 'archived'].includes(String(checklist.status)) ? String(checklist.status) : 'active',
      criteria,
      sessions,
      publicationTargets: {
        WW: normalizePublicationTarget(targets.WW),
        PT: normalizePublicationTarget(targets.PT)
      },
      createdAt: String(checklist.createdAt || new Date().toISOString()),
      updatedAt: String(checklist.updatedAt || checklist.createdAt || new Date().toISOString())
    };
  }

  function normalizeChecklistHistoryEntry(entry, checklistIds, assignmentIds) {
    if (!entry || typeof entry !== 'object') return null;
    const checklistId = String(entry.checklistId || '');
    const assignmentId = String(entry.assignmentId || '');
    if (!checklistId || !assignmentId) return null;
    if (checklistIds && !checklistIds.has(checklistId)) return null;
    if (assignmentIds && !assignmentIds.has(assignmentId)) return null;
    const changes = Array.isArray(entry.changes)
      ? entry.changes.map(normalizeSimulationChange).filter(Boolean)
      : [];
    if (!changes.length) return null;
    const component = ['WW', 'PT'].includes(String(entry.component)) ? String(entry.component) : 'WW';
    const status = ['applied', 'reverted'].includes(String(entry.status)) ? String(entry.status) : 'applied';
    return {
      ...entry,
      id: String(entry.id || createId('checklist-publication')),
      checklistId,
      assignmentId,
      assessmentId: String(entry.assessmentId || ''),
      component,
      term: ['1', '2', '3'].includes(String(entry.term)) ? String(entry.term) : '1',
      appliedAt: String(entry.appliedAt || new Date().toISOString()),
      changes,
      publicationBefore: normalizePublicationTarget(entry.publicationBefore),
      publicationAfter: normalizePublicationTarget(entry.publicationAfter),
      status,
      revertedAt: status === 'reverted' ? String(entry.revertedAt || '') : ''
    };
  }

  function normalizeChecklistEntryHistoryChange(change) {
    if (!change || typeof change !== 'object') return null;
    const sessionId = String(change.sessionId || '');
    const learnerId = String(change.learnerId || '');
    const criterionId = String(change.criterionId || '');
    if (!sessionId || !learnerId || !criterionId) return null;
    const before = change.before === null || change.before === undefined
      ? null
      : normalizeChecklistEntry(change.before);
    const after = change.after === null || change.after === undefined
      ? null
      : normalizeChecklistEntry(change.after);
    if (JSON.stringify(before) === JSON.stringify(after)) return null;
    return { sessionId, learnerId, criterionId, before, after };
  }

  function normalizeChecklistEntryHistoryEntry(entry, checklistIds, assignmentIds) {
    if (!entry || typeof entry !== 'object') return null;
    const checklistId = String(entry.checklistId || '');
    const assignmentId = String(entry.assignmentId || '');
    if (!checklistId || !assignmentId) return null;
    if (checklistIds && !checklistIds.has(checklistId)) return null;
    if (assignmentIds && !assignmentIds.has(assignmentId)) return null;
    const changes = Array.isArray(entry.changes)
      ? entry.changes.map(normalizeChecklistEntryHistoryChange).filter(Boolean)
      : [];
    if (!changes.length) return null;
    return {
      ...entry,
      id: String(entry.id || createId('checklist-entry-change')),
      checklistId,
      assignmentId,
      operation: ['entry', 'bulk', 'session-reset', 'term-reset', 'criterion-clear'].includes(String(entry.operation))
        ? String(entry.operation)
        : 'entry',
      label: String(entry.label || ''),
      createdAt: String(entry.createdAt || new Date().toISOString()),
      changes,
      status: entry.status === 'reverted' ? 'reverted' : 'applied',
      revertedAt: entry.status === 'reverted' ? String(entry.revertedAt || '') : ''
    };
  }

  function normalizeChecklistTemplate(template) {
    if (!template || typeof template !== 'object') return null;
    const name = String(template.name || '').trim();
    if (!name) return null;
    const criteria = Array.isArray(template.criteria)
      ? template.criteria.map(normalizeChecklistCriterion).filter(Boolean)
      : [];
    if (!criteria.length) return null;
    return {
      ...template,
      id: String(template.id || createId('checklist-template')),
      name,
      description: String(template.description || ''),
      criteria,
      builtIn: Boolean(template.builtIn),
      createdAt: String(template.createdAt || new Date().toISOString()),
      updatedAt: String(template.updatedAt || template.createdAt || new Date().toISOString())
    };
  }

  function normalizeToolsData(profileDb) {
    if (!profileDb || typeof profileDb !== 'object' || Array.isArray(profileDb)) {
      throw new TypeError('A profile database object is required.');
    }
    const existing = profileDb.tools && typeof profileDb.tools === 'object' && !Array.isArray(profileDb.tools)
      ? profileDb.tools
      : {};
    const assignmentIds = new Set((profileDb.assignments || []).map(item => String(item?.id || '')).filter(Boolean));
    const history = Array.isArray(existing.gradeSimulatorHistory)
      ? existing.gradeSimulatorHistory
        .map(entry => normalizeHistoryEntry(entry, assignmentIds))
        .filter(Boolean)
        .slice(0, SIMULATION_HISTORY_LIMIT)
      : [];
    const performanceChecklists = Array.isArray(existing.performanceChecklists)
      ? existing.performanceChecklists.map(normalizePerformanceChecklist).filter(Boolean)
      : [];
    const checklistIds = new Set(performanceChecklists.map(item => item.id));
    const performanceChecklistHistory = Array.isArray(existing.performanceChecklistHistory)
      ? existing.performanceChecklistHistory
        .map(entry => normalizeChecklistHistoryEntry(entry, checklistIds, assignmentIds))
        .filter(Boolean)
        .slice(0, CHECKLIST_HISTORY_LIMIT)
      : [];
    const performanceChecklistEntryHistory = Array.isArray(existing.performanceChecklistEntryHistory)
      ? existing.performanceChecklistEntryHistory
        .map(entry => normalizeChecklistEntryHistoryEntry(entry, checklistIds, assignmentIds))
        .filter(Boolean)
        .slice(0, CHECKLIST_ENTRY_HISTORY_LIMIT)
      : [];
    const performanceChecklistTemplates = Array.isArray(existing.performanceChecklistTemplates)
      ? existing.performanceChecklistTemplates.map(normalizeChecklistTemplate).filter(Boolean)
      : [];
    profileDb.tools = {
      ...existing,
      schemaVersion: Math.max(Number(existing.schemaVersion) || 0, TOOLS_SCHEMA_VERSION),
      gradeSimulatorHistory: history,
      performanceChecklists,
      performanceChecklistHistory,
      performanceChecklistEntryHistory,
      performanceChecklistTemplates
    };
    return profileDb.tools;
  }

  function activeLearners(assignment) {
    return Array.isArray(assignment?.learners)
      ? assignment.learners.filter(learner => learner && !learner.transferredOutTerm && !learner.transferredOutDate)
      : [];
  }

  function secureRandomInt(maxExclusive) {
    if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) {
      throw new RangeError('A positive random range is required.');
    }
    const cryptoApi = globalScope.crypto;
    if (!cryptoApi || typeof cryptoApi.getRandomValues !== 'function') {
      throw new Error('Secure randomization is unavailable on this device.');
    }
    const limit = Math.floor(0x100000000 / maxExclusive) * maxExclusive;
    const values = new Uint32Array(1);
    do {
      cryptoApi.getRandomValues(values);
    } while (values[0] >= limit);
    return values[0] % maxExclusive;
  }

  function shuffle(items, randomInt = secureRandomInt) {
    const result = Array.from(items || []);
    for (let index = result.length - 1; index > 0; index--) {
      const target = randomInt(index + 1);
      const value = result[index];
      result[index] = result[target];
      result[target] = value;
    }
    return result;
  }

  function groupCapacities(learnerCount, groupCount, randomInt) {
    const minimum = Math.floor(learnerCount / groupCount);
    const largerGroups = learnerCount % groupCount;
    const capacities = Array(groupCount).fill(minimum);
    shuffle(Array.from({ length: groupCount }, (_, index) => index), randomInt)
      .slice(0, largerGroups)
      .forEach(index => { capacities[index]++; });
    return capacities;
  }

  function randomizeGroups(learners, groupCount, mode = 'random', randomInt = secureRandomInt) {
    const roster = Array.from(learners || []);
    const count = Number(groupCount);
    const maximum = Math.min(20, roster.length);
    if (!Number.isInteger(count) || count < 2 || count > maximum) {
      throw new RangeError(`Choose between 2 and ${maximum} groups.`);
    }

    const capacities = groupCapacities(roster.length, count, randomInt);
    const groups = capacities.map((capacity, index) => ({
      index,
      capacity,
      members: [],
      sexCounts: { M: 0, F: 0, U: 0 }
    }));

    function addMember(group, learner, sexKey) {
      group.members.push(learner);
      group.sexCounts[sexKey]++;
    }

    if (mode !== 'balanced') {
      const randomized = shuffle(roster, randomInt);
      let cursor = 0;
      groups.forEach(group => {
        while (group.members.length < group.capacity) {
          addMember(group, randomized[cursor++], 'U');
        }
      });
      return groups.map(group => group.members);
    }

    const buckets = { M: [], F: [], U: [] };
    roster.forEach(learner => {
      const sex = String(learner.sex || '').trim().toUpperCase();
      buckets[sex === 'M' || sex === 'MALE' ? 'M' : sex === 'F' || sex === 'FEMALE' ? 'F' : 'U'].push(learner);
    });

    ['M', 'F', 'U'].forEach(sexKey => {
      shuffle(buckets[sexKey], randomInt).forEach(learner => {
        const available = groups.filter(group => group.members.length < group.capacity);
        const lowestSexCount = Math.min(...available.map(group => group.sexCounts[sexKey]));
        const sexCandidates = available.filter(group => group.sexCounts[sexKey] === lowestSexCount);
        const lowestSize = Math.min(...sexCandidates.map(group => group.members.length));
        const candidates = sexCandidates.filter(group => group.members.length === lowestSize);
        addMember(candidates[randomInt(candidates.length)], learner, sexKey);
      });
    });

    return groups.map(group => group.members);
  }

  function createNamePicker(learners, randomInt = secureRandomInt) {
    const roster = Array.from(learners || []);
    let remaining = [];
    let cycle = 0;

    function reset() {
      remaining = shuffle(roster, randomInt);
      cycle++;
      return status();
    }

    function draw() {
      if (roster.length === 0) return { learner: null, remaining: 0, cycle, restarted: false };
      const restarted = remaining.length === 0;
      if (restarted) reset();
      const learner = remaining.shift();
      return { learner, remaining: remaining.length, cycle, restarted };
    }

    function status() {
      return { remaining: remaining.length, total: roster.length, cycle };
    }

    return { draw, reset, status };
  }

  function assignmentLabel(assignment) {
    return `Grade ${assignment?.gradeLevel || ''} - ${assignment?.section || ''} (${assignment?.subject || ''})`;
  }

  function createSimulationSession(assignment, term = '1') {
    if (!assignment || typeof assignment !== 'object') throw new TypeError('A class assignment is required.');
    const normalizedTerm = ['1', '2', '3'].includes(String(term)) ? String(term) : '1';
    return {
      id: createId('simulation-session'),
      assignmentId: String(assignment.id || ''),
      term: normalizedTerm,
      baseScores: clone(assignment.scores || {}),
      draft: clone(assignment),
      createdAt: new Date().toISOString()
    };
  }

  function sessionAssessment(session, assessmentId) {
    return (session?.draft?.assessments || []).find(item => item.id === assessmentId) || null;
  }

  function setSimulationScore(session, learnerId, assessmentId, rawValue) {
    if (!session?.draft) throw new TypeError('A simulation session is required.');
    const learner = (session.draft.learners || []).find(item => item.id === learnerId);
    const assessment = sessionAssessment(session, assessmentId);
    if (!learner || learner.transferredOutTerm || learner.transferredOutDate) {
      throw new Error('This learner is not eligible for score simulation.');
    }
    if (!assessment || String(assessment.term) !== String(session.term)) {
      throw new Error('This assessment does not belong to the selected term.');
    }
    if (!session.draft.scores) session.draft.scores = {};
    const key = `${learnerId}|${assessmentId}`;
    const text = String(rawValue ?? '').trim();
    if (text === '') {
      delete session.draft.scores[key];
      return;
    }
    const value = Number(text);
    const maxScore = Number(assessment.maxScore);
    if (!Number.isFinite(maxScore) || maxScore <= 0) {
      throw new RangeError('Set a positive HPS for this assessment in the Grading Sheet before simulating scores.');
    }
    if (!Number.isFinite(value) || value < 0 || value > maxScore) {
      throw new RangeError(`Enter a score from 0 to ${maxScore}.`);
    }
    session.draft.scores[key] = value;
  }

  function simulationChanges(session) {
    if (!session?.draft) return [];
    const assessmentIds = new Set((session.draft.assessments || [])
      .filter(item => String(item.term) === String(session.term))
      .map(item => String(item.id)));
    const learnerIds = new Set(activeLearners(session.draft).map(item => String(item.id)));
    const keys = new Set([
      ...Object.keys(session.baseScores || {}),
      ...Object.keys(session.draft.scores || {})
    ]);
    return Array.from(keys).filter(key => {
      const separator = key.indexOf('|');
      return separator > 0
        && learnerIds.has(key.slice(0, separator))
        && assessmentIds.has(key.slice(separator + 1));
    }).map(key => ({
      key,
      before: scoreState(session.baseScores, key),
      after: scoreState(session.draft.scores, key)
    })).filter(change => !equalScoreState(change.before, change.after));
  }

  function planSimulationApply(session, officialAssignment) {
    if (!officialAssignment || officialAssignment.id !== session?.assignmentId) {
      throw new Error('The simulation no longer matches the active class.');
    }
    const changes = simulationChanges(session);
    const conflicts = changes.filter(change => !equalScoreState(
      scoreState(officialAssignment.scores || {}, change.key),
      change.before
    ));
    return { changes, conflicts, canApply: changes.length > 0 && conflicts.length === 0 };
  }

  function applySimulation(session, officialAssignment) {
    const plan = planSimulationApply(session, officialAssignment);
    if (plan.changes.length === 0) throw new Error('There are no simulated score changes to apply.');
    if (plan.conflicts.length > 0) {
      throw new Error('Official scores changed while this simulation was open.');
    }
    if (!officialAssignment.scores) officialAssignment.scores = {};
    plan.changes.forEach(change => writeScoreState(officialAssignment.scores, change.key, change.after));
    return {
      id: createId('grade-simulation'),
      assignmentId: officialAssignment.id,
      assignmentLabel: assignmentLabel(officialAssignment),
      term: session.term,
      appliedAt: new Date().toISOString(),
      changes: clone(plan.changes),
      status: 'applied',
      revertedAt: ''
    };
  }

  function planSimulationRevert(historyEntry, officialAssignment) {
    const entry = normalizeHistoryEntry(historyEntry);
    if (!entry || !officialAssignment || officialAssignment.id !== entry.assignmentId) {
      throw new Error('The saved simulation history no longer matches this class.');
    }
    const ready = [];
    const conflicts = [];
    entry.changes.forEach(change => {
      const current = scoreState(officialAssignment.scores || {}, change.key);
      (equalScoreState(current, change.after) ? ready : conflicts).push({ ...change, current });
    });
    return { ready, conflicts };
  }

  function revertSimulation(historyEntry, officialAssignment, resolutions = {}) {
    const plan = planSimulationRevert(historyEntry, officialAssignment);
    if (!officialAssignment.scores) officialAssignment.scores = {};
    const restored = [];
    const kept = [];
    plan.ready.forEach(change => {
      writeScoreState(officialAssignment.scores, change.key, change.before);
      restored.push(change.key);
    });
    plan.conflicts.forEach(change => {
      if (resolutions[change.key] === 'restore') {
        writeScoreState(officialAssignment.scores, change.key, change.before);
        restored.push(change.key);
      } else {
        kept.push(change.key);
      }
    });
    historyEntry.status = kept.length > 0 ? 'partially-reverted' : 'reverted';
    historyEntry.revertedAt = new Date().toISOString();
    return { restored, kept };
  }

  function defaultChecklistCriteria() {
    return [
      {
        label: 'Recitation',
        destinationComponent: 'TRACKING',
        scoringMode: 'CHECK',
        pointsPerCheck: 1,
        maxPointsPerSession: 1,
        maxPointsPerTerm: null
      },
      {
        label: 'Notebook',
        destinationComponent: 'TRACKING',
        scoringMode: 'CHECK',
        pointsPerCheck: 1,
        maxPointsPerSession: 1,
        maxPointsPerTerm: null
      },
      {
        label: 'Assignment',
        destinationComponent: 'TRACKING',
        scoringMode: 'CHECK',
        pointsPerCheck: 1,
        maxPointsPerSession: 1,
        maxPointsPerTerm: null
      }
    ];
  }

  function createPerformanceChecklist(assignment, term = '1', options = {}) {
    if (!assignment || typeof assignment !== 'object' || !assignment.id) {
      throw new TypeError('A class assignment is required.');
    }
    const normalizedTerm = ['1', '2', '3'].includes(String(term)) ? String(term) : '1';
    const now = new Date().toISOString();
    const sourceCriteria = Array.isArray(options.criteria) && options.criteria.length
      ? options.criteria
      : defaultChecklistCriteria();
    const criteria = sourceCriteria
      .map((criterion, index) => normalizeChecklistCriterion({ ...criterion, order: index }, index))
      .filter(Boolean);
    if (!criteria.length) throw new Error('Add at least one checklist criterion.');
    const checklist = normalizePerformanceChecklist({
      id: createId('performance-checklist'),
      assignmentId: String(assignment.id),
      schoolYear: String(assignment.schoolYear || ''),
      term: normalizedTerm,
      mapePart: String(options.mapePart || ''),
      title: String(options.title || 'Performance Checklist'),
      status: 'active',
      criteria,
      sessions: [{
        id: createId('checklist-session'),
        date: String(options.date || now.slice(0, 10)),
        title: String(options.sessionTitle || 'Session 1'),
        entries: {},
        createdAt: now,
        updatedAt: now
      }],
      publicationTargets: {
        WW: normalizePublicationTarget(null),
        PT: normalizePublicationTarget(null)
      },
      createdAt: now,
      updatedAt: now
    });
    return checklist;
  }

  function createChecklistCriterion(rawCriterion, existingCriteria = []) {
    const normalized = normalizeChecklistCriterion(rawCriterion, existingCriteria.length);
    if (!normalized) throw new Error('Enter a criterion name.');
    const duplicate = existingCriteria.some(item => item.id !== normalized.id
      && String(item.label || '').trim().toLowerCase() === normalized.label.toLowerCase());
    if (duplicate) throw new Error('A criterion with this name already exists.');
    return normalized;
  }

  function addChecklistSession(checklist, options = {}) {
    if (!checklist || typeof checklist !== 'object') throw new TypeError('A performance checklist is required.');
    const now = new Date().toISOString();
    const session = normalizeChecklistSession({
      id: createId('checklist-session'),
      date: String(options.date || now.slice(0, 10)),
      title: String(options.title || `Session ${(checklist.sessions || []).length + 1}`),
      entries: {},
      createdAt: now,
      updatedAt: now
    }, new Set((checklist.criteria || []).map(item => item.id)));
    checklist.sessions = [...(checklist.sessions || []), session];
    checklist.updatedAt = now;
    return session;
  }

  function checklistEntry(checklist, sessionId, learnerId, criterionId) {
    const session = (checklist?.sessions || []).find(item => item.id === sessionId);
    return session?.entries?.[learnerId]?.[criterionId] || null;
  }

  function setChecklistEntry(checklist, assignment, sessionId, learnerId, criterionId, rawValue, metadata = {}) {
    if (!checklist || String(checklist.assignmentId) !== String(assignment?.id)) {
      throw new Error('The checklist no longer matches the active class.');
    }
    const session = (checklist.sessions || []).find(item => item.id === sessionId);
    const criterion = (checklist.criteria || []).find(item => item.id === criterionId);
    const learner = (assignment.learners || []).find(item => item.id === learnerId);
    if (!session) throw new Error('The selected checklist session is unavailable.');
    if (!criterion) throw new Error('The selected criterion is unavailable.');
    if (!session.entries || typeof session.entries !== 'object') session.entries = {};
    if (!session.entries[learnerId]) session.entries[learnerId] = {};
    const text = String(rawValue ?? '').trim();
    if (text === '') {
      delete session.entries[learnerId][criterionId];
      if (!Object.keys(session.entries[learnerId]).length) delete session.entries[learnerId];
      session.updatedAt = new Date().toISOString();
      checklist.updatedAt = session.updatedAt;
      return null;
    }
    if (!criterion.active) throw new Error('The selected criterion is unavailable.');
    if (!learner || learner.transferredOutTerm || learner.transferredOutDate) {
      throw new Error('This learner is not eligible for a new checklist entry.');
    }
    const points = Number(text);
    if (!Number.isFinite(points) || points < 0 || points > criterion.maxPointsPerSession) {
      throw new RangeError(`Enter points from 0 to ${criterion.maxPointsPerSession}.`);
    }
    const now = new Date().toISOString();
    const previous = session.entries[learnerId][criterionId];
    const entry = {
      ...(previous && typeof previous === 'object' ? previous : {}),
      points,
      note: String(metadata.note ?? previous?.note ?? ''),
      updatedAt: now,
      updatedByDeviceId: String(metadata.deviceId || previous?.updatedByDeviceId || '')
    };
    session.entries[learnerId][criterionId] = entry;
    session.updatedAt = now;
    checklist.updatedAt = now;
    return entry;
  }

  function writeChecklistEntryState(checklist, sessionId, learnerId, criterionId, state) {
    const session = (checklist?.sessions || []).find(item => item.id === sessionId);
    if (!session) return false;
    if (!session.entries || typeof session.entries !== 'object') session.entries = {};
    if (!state) {
      if (session.entries[learnerId]) {
        delete session.entries[learnerId][criterionId];
        if (!Object.keys(session.entries[learnerId]).length) delete session.entries[learnerId];
      }
    } else {
      if (!session.entries[learnerId]) session.entries[learnerId] = {};
      session.entries[learnerId][criterionId] = clone(state);
    }
    const now = new Date().toISOString();
    session.updatedAt = now;
    checklist.updatedAt = now;
    return true;
  }

  function applyChecklistEntryTransaction(checklist, assignment, rawChanges, options = {}) {
    if (!Array.isArray(rawChanges) || !rawChanges.length) throw new Error('No checklist entry changes were provided.');
    const uniqueChanges = new Map();
    rawChanges.forEach(change => {
      if (!change) return;
      const key = `${change.sessionId}|${change.learnerId}|${change.criterionId}`;
      if (!uniqueChanges.has(key)) uniqueChanges.set(key, { ...change });
      else uniqueChanges.get(key).value = change.value;
    });
    const changes = [];
    try {
      uniqueChanges.forEach(change => {
        const before = checklistEntry(
          checklist,
          change.sessionId,
          change.learnerId,
          change.criterionId
        );
        setChecklistEntry(
          checklist,
          assignment,
          change.sessionId,
          change.learnerId,
          change.criterionId,
          change.value,
          options.metadata || {}
        );
        const after = checklistEntry(
          checklist,
          change.sessionId,
          change.learnerId,
          change.criterionId
        );
        if (JSON.stringify(before) !== JSON.stringify(after)) {
          changes.push({
            sessionId: change.sessionId,
            learnerId: change.learnerId,
            criterionId: change.criterionId,
            before: before ? clone(before) : null,
            after: after ? clone(after) : null
          });
        }
      });
    } catch (error) {
      changes.slice().reverse().forEach(change => writeChecklistEntryState(
        checklist,
        change.sessionId,
        change.learnerId,
        change.criterionId,
        change.before
      ));
      throw error;
    }
    if (!changes.length) throw new Error('The checklist already contains the selected values.');
    return {
      id: createId('checklist-entry-change'),
      checklistId: checklist.id,
      assignmentId: assignment.id,
      operation: ['entry', 'bulk', 'session-reset', 'term-reset', 'criterion-clear'].includes(options.operation)
        ? options.operation
        : 'entry',
      label: String(options.label || ''),
      createdAt: new Date().toISOString(),
      changes,
      status: 'applied',
      revertedAt: ''
    };
  }

  function planChecklistEntryUndo(historyEntry, checklist) {
    const entry = normalizeChecklistEntryHistoryEntry(historyEntry);
    if (!entry || !checklist || entry.checklistId !== checklist.id) {
      throw new Error('The checklist change history no longer matches this checklist.');
    }
    const conflicts = entry.changes.filter(change => {
      const current = checklistEntry(
        checklist,
        change.sessionId,
        change.learnerId,
        change.criterionId
      );
      return JSON.stringify(current || null) !== JSON.stringify(change.after || null);
    });
    return { changes: entry.changes, conflicts, canUndo: conflicts.length === 0 };
  }

  function undoChecklistEntryTransaction(historyEntry, checklist) {
    const plan = planChecklistEntryUndo(historyEntry, checklist);
    if (!plan.canUndo) {
      throw new Error('One or more checklist entries changed after this action. The newer entries were preserved.');
    }
    plan.changes.slice().reverse().forEach(change => writeChecklistEntryState(
      checklist,
      change.sessionId,
      change.learnerId,
      change.criterionId,
      change.before
    ));
    historyEntry.status = 'reverted';
    historyEntry.revertedAt = new Date().toISOString();
    return { restored: plan.changes.length };
  }

  function createChecklistTemplate(checklist, name, description = '') {
    if (!checklist || typeof checklist !== 'object') throw new TypeError('A performance checklist is required.');
    const templateName = String(name || '').trim();
    if (!templateName) throw new Error('Enter a template name.');
    const now = new Date().toISOString();
    return normalizeChecklistTemplate({
      id: createId('checklist-template'),
      name: templateName,
      description: String(description || ''),
      criteria: (checklist.criteria || []).map(criterion => ({
        ...clone(criterion),
        id: createId('template-criterion')
      })),
      builtIn: false,
      createdAt: now,
      updatedAt: now
    });
  }

  function checklistCriteriaFromTemplate(template) {
    const normalized = normalizeChecklistTemplate(template);
    if (!normalized) throw new Error('The selected checklist template is invalid.');
    return normalized.criteria.map((criterion, index) => normalizeChecklistCriterion({
      ...clone(criterion),
      id: createId('checklist-criterion'),
      order: index
    }, index));
  }

  function roundScore(value) {
    return Math.round((Number(value) + Number.EPSILON) * 10000) / 10000;
  }

  function checklistLearnerTotals(checklist, assignment) {
    const learnerIds = new Set((assignment?.learners || []).map(item => String(item.id || '')).filter(Boolean));
    const totals = {};
    learnerIds.forEach(learnerId => {
      totals[learnerId] = { TRACKING: 0, WW: 0, PT: 0, criteria: {} };
    });
    (checklist?.criteria || []).forEach(criterion => {
      learnerIds.forEach(learnerId => {
        let criterionTotal = 0;
        (checklist.sessions || []).forEach(session => {
          const entry = session.entries?.[learnerId]?.[criterion.id];
          if (entry && Number.isFinite(Number(entry.points))) criterionTotal += Number(entry.points);
        });
        if (criterion.maxPointsPerTerm) criterionTotal = Math.min(criterionTotal, criterion.maxPointsPerTerm);
        criterionTotal = roundScore(criterionTotal);
        totals[learnerId].criteria[criterion.id] = criterionTotal;
        totals[learnerId][normalizedChecklistComponent(criterion.destinationComponent)] = roundScore(
          totals[learnerId][normalizedChecklistComponent(criterion.destinationComponent)] + criterionTotal
        );
      });
    });
    return totals;
  }

  function hasPublishedChecklistContributions(checklist) {
    return ['WW', 'PT'].some(component =>
      Object.values(checklist?.publicationTargets?.[component]?.publishedContributions || {})
        .some(value => Number(value) > 0)
    );
  }

  function checklistEntryCount(session) {
    return Object.values(session?.entries || {}).reduce((total, learnerEntries) =>
      total + Object.keys(learnerEntries && typeof learnerEntries === 'object' ? learnerEntries : {}).length
    , 0);
  }

  function clearChecklistEntries(checklist, scope = 'session', sessionId = '') {
    if (!checklist || typeof checklist !== 'object') throw new TypeError('A performance checklist is required.');
    if (hasPublishedChecklistContributions(checklist)) {
      throw new Error('Revert all published checklist points before resetting checklist entries.');
    }
    const sessions = scope === 'term'
      ? (checklist.sessions || [])
      : (checklist.sessions || []).filter(item => item.id === sessionId);
    if (!sessions.length) throw new Error('The checklist session to reset is unavailable.');
    const cleared = sessions.reduce((total, session) => total + checklistEntryCount(session), 0);
    const now = new Date().toISOString();
    sessions.forEach(session => {
      session.entries = {};
      session.updatedAt = now;
    });
    checklist.updatedAt = now;
    return { cleared, sessions: sessions.length, scope: scope === 'term' ? 'term' : 'session' };
  }

  function validateChecklistPublication(checklist, assignment, component, assessmentId) {
    const normalizedComponent = String(component || '').toUpperCase();
    if (!['WW', 'PT'].includes(normalizedComponent)) {
      throw new Error('Checklist points can only be published to Written Work or Performance Task.');
    }
    if (!checklist || String(checklist.assignmentId) !== String(assignment?.id)) {
      throw new Error('The checklist no longer matches the active class.');
    }
    const assessment = (assignment.assessments || []).find(item => String(item.id) === String(assessmentId));
    if (!assessment
      || String(assessment.term) !== String(checklist.term)
      || String(assessment.component) !== normalizedComponent
      || String(assessment.mapePart || '') !== String(checklist.mapePart || '')) {
      throw new Error('Choose a matching assessment from this class, term, component, and MAPEH strand.');
    }
    const maxScore = Number(assessment.maxScore);
    if (!Number.isFinite(maxScore) || maxScore <= 0) {
      throw new Error('Set a positive HPS for the target assessment before publishing checklist points.');
    }
    const target = normalizePublicationTarget(checklist.publicationTargets?.[normalizedComponent]);
    const hasPublishedPoints = Object.values(target.publishedContributions).some(value => Number(value) > 0);
    if (hasPublishedPoints && target.assessmentId && target.assessmentId !== assessment.id) {
      throw new Error('Revert the previous checklist publication before selecting a different target assessment.');
    }
    return { component: normalizedComponent, assessment, maxScore, target };
  }

  function linkChecklistPublicationTarget(checklist, assignment, component, assessmentId) {
    const validated = validateChecklistPublication(checklist, assignment, component, assessmentId);
    if (!checklist.publicationTargets) checklist.publicationTargets = {};
    checklist.publicationTargets[validated.component] = {
      ...validated.target,
      assessmentId: validated.assessment.id
    };
    checklist.updatedAt = new Date().toISOString();
    return checklist.publicationTargets[validated.component];
  }

  function planChecklistPublication(checklist, assignment, component, assessmentId) {
    const validated = validateChecklistPublication(checklist, assignment, component, assessmentId);
    const totals = checklistLearnerTotals(checklist, assignment);
    const changes = [];
    const blocked = [];
    const contributionsAfter = { ...validated.target.publishedContributions };
    const scoreStatesAfter = { ...validated.target.publishedScoreStates };
    activeLearners(assignment).forEach(learner => {
      const learnerId = String(learner.id);
      const total = finiteNonNegative(totals[learnerId]?.[validated.component], 0);
      const published = finiteNonNegative(validated.target.publishedContributions[learnerId], 0);
      const requestedDelta = roundScore(total - published);
      if (requestedDelta === 0) return;
      const key = `${learnerId}|${validated.assessment.id}`;
      const before = scoreState(assignment.scores || {}, key);
      if (!before.present) {
        blocked.push({ learnerId, key, reason: 'blank-score', total, published, requestedDelta });
        return;
      }
      const expectedPublishedScore = validated.target.publishedScoreStates[learnerId];
      if (published > 0 && expectedPublishedScore && !equalScoreState(before, expectedPublishedScore)) {
        blocked.push({ learnerId, key, reason: 'score-changed-after-publication', total, published, requestedDelta });
        return;
      }
      const unclamped = roundScore(before.value + requestedDelta);
      const afterValue = roundScore(Math.max(0, Math.min(validated.maxScore, unclamped)));
      const appliedDelta = roundScore(afterValue - before.value);
      if (appliedDelta === 0) {
        blocked.push({
          learnerId,
          key,
          reason: requestedDelta > 0 ? 'hps-limit' : 'zero-limit',
          total,
          published,
          requestedDelta
        });
        return;
      }
      const publishedAfter = roundScore(Math.max(0, published + appliedDelta));
      contributionsAfter[learnerId] = publishedAfter;
      scoreStatesAfter[learnerId] = { present: true, value: afterValue };
      changes.push({
        learnerId,
        key,
        before,
        after: { present: true, value: afterValue },
        total,
        publishedBefore: published,
        publishedAfter,
        requestedDelta,
        appliedDelta,
        overflow: roundScore(requestedDelta - appliedDelta)
      });
    });
    return {
      checklistId: checklist.id,
      assignmentId: assignment.id,
      assessmentId: validated.assessment.id,
      assessmentTitle: String(validated.assessment.title || validated.assessment.component),
      component: validated.component,
      term: checklist.term,
      maxScore: validated.maxScore,
      publicationBefore: clone(validated.target),
      publicationAfter: {
        assessmentId: validated.assessment.id,
        lastPublishedAt: '',
        publishedContributions: contributionsAfter,
        publishedScoreStates: scoreStatesAfter
      },
      changes,
      blocked,
      canApply: changes.length > 0
    };
  }

  function comparableChecklistPlan(plan) {
    return {
      checklistId: plan.checklistId,
      assignmentId: plan.assignmentId,
      assessmentId: plan.assessmentId,
      component: plan.component,
      maxScore: plan.maxScore,
      changes: plan.changes.map(change => ({
        key: change.key,
        before: change.before,
        after: change.after,
        publishedBefore: change.publishedBefore,
        publishedAfter: change.publishedAfter
      })),
      blocked: plan.blocked.map(item => ({ key: item.key, reason: item.reason, requestedDelta: item.requestedDelta }))
    };
  }

  function applyChecklistPublication(checklist, assignment, reviewedPlan) {
    const freshPlan = planChecklistPublication(
      checklist,
      assignment,
      reviewedPlan?.component,
      reviewedPlan?.assessmentId
    );
    if (JSON.stringify(comparableChecklistPlan(freshPlan)) !== JSON.stringify(comparableChecklistPlan(reviewedPlan))) {
      throw new Error('Checklist entries or official scores changed after the review opened. Review the publication again.');
    }
    if (!freshPlan.changes.length) throw new Error('There are no checklist point changes to publish.');
    if (!assignment.scores) assignment.scores = {};
    freshPlan.changes.forEach(change => writeScoreState(assignment.scores, change.key, change.after));
    const appliedAt = new Date().toISOString();
    freshPlan.publicationAfter.lastPublishedAt = appliedAt;
    if (!checklist.publicationTargets) checklist.publicationTargets = {};
    checklist.publicationTargets[freshPlan.component] = clone(freshPlan.publicationAfter);
    checklist.updatedAt = appliedAt;
    return {
      id: createId('checklist-publication'),
      checklistId: checklist.id,
      assignmentId: assignment.id,
      assessmentId: freshPlan.assessmentId,
      component: freshPlan.component,
      term: checklist.term,
      appliedAt,
      changes: clone(freshPlan.changes.map(change => ({
        key: change.key,
        before: change.before,
        after: change.after
      }))),
      publicationBefore: clone(freshPlan.publicationBefore),
      publicationAfter: clone(freshPlan.publicationAfter),
      status: 'applied',
      revertedAt: ''
    };
  }

  function planChecklistPublicationRevert(historyEntry, checklist, assignment) {
    const entry = normalizeChecklistHistoryEntry(historyEntry);
    if (!entry
      || !checklist
      || checklist.id !== entry.checklistId
      || !assignment
      || assignment.id !== entry.assignmentId) {
      throw new Error('The checklist publication history no longer matches this class.');
    }
    const scoreConflicts = entry.changes.filter(change => !equalScoreState(
      scoreState(assignment.scores || {}, change.key),
      change.after
    ));
    const currentTarget = normalizePublicationTarget(checklist.publicationTargets?.[entry.component]);
    const publicationConflict = JSON.stringify(currentTarget) !== JSON.stringify(entry.publicationAfter);
    return {
      changes: entry.changes,
      scoreConflicts,
      publicationConflict,
      canRevert: scoreConflicts.length === 0 && !publicationConflict
    };
  }

  function revertChecklistPublication(historyEntry, checklist, assignment) {
    const plan = planChecklistPublicationRevert(historyEntry, checklist, assignment);
    if (!plan.canRevert) {
      throw new Error('Scores or checklist publication data changed after this publication. Preserve the newer data and review it manually.');
    }
    if (!assignment.scores) assignment.scores = {};
    plan.changes.forEach(change => writeScoreState(assignment.scores, change.key, change.before));
    checklist.publicationTargets[historyEntry.component] = clone(historyEntry.publicationBefore);
    checklist.updatedAt = new Date().toISOString();
    historyEntry.status = 'reverted';
    historyEntry.revertedAt = checklist.updatedAt;
    return { restored: plan.changes.map(change => change.key) };
  }

  const api = {
    TOOLS_SCHEMA_VERSION,
    SIMULATION_HISTORY_LIMIT,
    CHECKLIST_HISTORY_LIMIT,
    CHECKLIST_ENTRY_HISTORY_LIMIT,
    CHECKLIST_COMPONENTS,
    CHECKLIST_SCORING_MODES,
    clone,
    activeLearners,
    secureRandomInt,
    shuffle,
    randomizeGroups,
    createNamePicker,
    assignmentLabel,
    normalize: normalizeToolsData,
    createSimulationSession,
    setSimulationScore,
    simulationChanges,
    planSimulationApply,
    applySimulation,
    planSimulationRevert,
    revertSimulation,
    defaultChecklistCriteria,
    createPerformanceChecklist,
    createChecklistCriterion,
    addChecklistSession,
    checklistEntry,
    setChecklistEntry,
    applyChecklistEntryTransaction,
    planChecklistEntryUndo,
    undoChecklistEntryTransaction,
    createChecklistTemplate,
    checklistCriteriaFromTemplate,
    checklistLearnerTotals,
    hasPublishedChecklistContributions,
    checklistEntryCount,
    clearChecklistEntries,
    linkChecklistPublicationTarget,
    planChecklistPublication,
    applyChecklistPublication,
    planChecklistPublicationRevert,
    revertChecklistPublication,
    scoreState,
    equalScoreState
  };

  globalScope.TeacherToolsCore = api;
  globalScope.ToolsData = {
    normalize: normalizeToolsData,
    schemaVersion: TOOLS_SCHEMA_VERSION
  };
  globalScope.GradeSimulator = {
    createSession: createSimulationSession,
    setScore: setSimulationScore,
    changes: simulationChanges,
    planApply: planSimulationApply,
    apply: applySimulation,
    planRevert: planSimulationRevert,
    revert: revertSimulation
  };
  globalScope.PerformanceChecklist = {
    create: createPerformanceChecklist,
    createCriterion: createChecklistCriterion,
    addSession: addChecklistSession,
    entry: checklistEntry,
    setEntry: setChecklistEntry,
    applyEntryTransaction: applyChecklistEntryTransaction,
    planEntryUndo: planChecklistEntryUndo,
    undoEntryTransaction: undoChecklistEntryTransaction,
    createTemplate: createChecklistTemplate,
    criteriaFromTemplate: checklistCriteriaFromTemplate,
    totals: checklistLearnerTotals,
    hasPublishedContributions: hasPublishedChecklistContributions,
    clearEntries: clearChecklistEntries,
    linkTarget: linkChecklistPublicationTarget,
    planPublication: planChecklistPublication,
    applyPublication: applyChecklistPublication,
    planRevert: planChecklistPublicationRevert,
    revertPublication: revertChecklistPublication
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
