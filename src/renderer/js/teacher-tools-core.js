/**
 * Pure data and algorithm layer for Teacher Tools.
 * This module is UI-independent so randomization and grade transactions can be
 * tested without loading Electron or the renderer.
 */
(function initTeacherToolsCore(globalScope) {
  'use strict';

  const TOOLS_SCHEMA_VERSION = 5;
  const SIMULATION_HISTORY_LIMIT = 10;
  const CHECKLIST_HISTORY_LIMIT = 20;
  const CHECKLIST_ENTRY_HISTORY_LIMIT = 50;
  const CHECKLIST_COMPONENTS = ['TRACKING', 'WW', 'PT'];
  const CHECKLIST_SCORING_MODES = ['CHECK', 'NUMERIC'];
  const TEACHER_TOOL_THEMES = ['classic', 'chalkboard', 'ocean', 'space', 'fiesta', 'high-contrast'];
  const CLASSROOM_TOOL_TYPES = [
    'timer-agenda', 'participation', 'noise-meter', 'seating-chart',
    'exit-ticket', 'anecdotal-notes', 'boat-race', 'class-duels'
  ];

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

  function auditScoreChange(assignment, change, source) {
    const ids = globalScope.ScoreHistory?.splitScoreKey(change?.key);
    if (!ids) return;
    globalScope.ScoreHistory.record(assignment, {
      ...ids,
      previousValue: change.before?.present ? change.before.value : null,
      newValue: change.after?.present ? change.after.value : null,
      source
    });
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

  function normalizedTerm(value) {
    return ['1', '2', '3'].includes(String(value)) ? String(value) : '1';
  }

  function normalizedTheme(value) {
    const theme = String(value || '').toLowerCase();
    return TEACHER_TOOL_THEMES.includes(theme) ? theme : 'classic';
  }

  function normalizeAppearancePreferences(value) {
    const existing = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    return {
      ...existing,
      groupRandomizerTheme: normalizedTheme(existing.groupRandomizerTheme),
      namePickerTheme: normalizedTheme(existing.namePickerTheme)
    };
  }

  function normalizeParticipationStarEvent(event, assignmentIds) {
    if (!event || typeof event !== 'object' || Array.isArray(event)) return null;
    const assignmentId = String(event.assignmentId || '');
    const learnerId = String(event.learnerId || '');
    if (!assignmentId || !learnerId || (assignmentIds && !assignmentIds.has(assignmentId))) return null;
    const awardedAt = String(event.awardedAt || '');
    if (!awardedAt || Number.isNaN(Date.parse(awardedAt))) return null;
    const reversedAt = String(event.reversedAt || '');
    return {
      ...event,
      id: String(event.id || createId('participation-star')),
      assignmentId,
      term: normalizedTerm(event.term),
      learnerId,
      awardedAt,
      source: String(event.source || 'name-picker'),
      note: String(event.note || '').slice(0, 160),
      reversedAt: reversedAt && !Number.isNaN(Date.parse(reversedAt)) ? reversedAt : ''
    };
  }

  function normalizeClassroomToolSession(session, assignmentIds) {
    if (!session || typeof session !== 'object' || Array.isArray(session)) return null;
    const assignmentId = String(session.assignmentId || '');
    const tool = String(session.tool || '');
    if (!assignmentId || !CLASSROOM_TOOL_TYPES.includes(tool)
      || (assignmentIds && !assignmentIds.has(assignmentId))) return null;
    return {
      ...session,
      id: String(session.id || createId('classroom-session')),
      assignmentId,
      term: normalizedTerm(session.term),
      tool,
      startedAt: String(session.startedAt || new Date().toISOString()),
      endedAt: String(session.endedAt || ''),
      events: Array.isArray(session.events)
        ? session.events.filter(item => item && typeof item === 'object').map(item => ({ ...item }))
        : []
    };
  }

  function normalizeCalendarPreferences(value) {
    const existing = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const filters = existing.filters && typeof existing.filters === 'object' && !Array.isArray(existing.filters)
      ? existing.filters : {};
    return {
      ...existing,
      filters: {
        ...filters,
        official: filters.official !== false,
        local: filters.local !== false,
        birthdays: filters.birthdays !== false,
        assignmentId: String(filters.assignmentId || 'all')
      },
      birthdayNotifications: Boolean(existing.birthdayNotifications),
      sourcePacks: Array.isArray(existing.sourcePacks)
        ? existing.sourcePacks.filter(pack => pack && typeof pack === 'object').map(pack => ({ ...pack })) : []
    };
  }

  function normalizeChecklistItem(item, index = 0) {
    if (!item || typeof item !== 'object') return null;
    const label = String(item.label || '').trim();
    if (!label) return null;
    return {
      ...item,
      id: String(item.id || createId('check-item')),
      label,
      pointValue: finiteNonNegative(item.pointValue, 1),
      color: String(item.color || ''),
      icon: String(item.icon || ''),
      active: item.active !== false,
      order: Number.isFinite(Number(item.order)) ? Number(item.order) : index
    };
  }

  function normalizedChecklistComponent(value) {
    const component = String(value || '').toUpperCase();
    return CHECKLIST_COMPONENTS.includes(component) ? component : 'TRACKING';
  }

  function standardChecklistType(value) {
    const standardTypes = ['recitation', 'notebook', 'assignment'];
    const candidates = value && typeof value === 'object'
      ? [value.standardType, value.label]
      : [value];
    return candidates
      .map(candidate => String(candidate || '').trim().toLowerCase())
      .find(candidate => standardTypes.includes(candidate))
      || '';
  }

  function isStandardNumericalChecklistLabel(value) {
    return Boolean(standardChecklistType(value));
  }

  function normalizeChecklistCriterion(criterion, index = 0) {
    if (!criterion || typeof criterion !== 'object') return null;
    const label = String(criterion.label || '').trim();
    if (!label) return null;
    const standardType = standardChecklistType(criterion);
    const requestedScoringMode = CHECKLIST_SCORING_MODES.includes(String(criterion.scoringMode || '').toUpperCase())
      ? String(criterion.scoringMode).toUpperCase()
      : 'CHECK';
    const scoringMode = Boolean(standardType)
      ? 'NUMERIC'
      : requestedScoringMode;
    let pointsPerCheck = optionalPositive(criterion.pointsPerCheck) || 1;
    const maxPointsPerSession = optionalPositive(criterion.maxPointsPerSession)
      || (scoringMode === 'CHECK' ? pointsPerCheck : 1);
    pointsPerCheck = Math.min(pointsPerCheck, maxPointsPerSession);
    const maxPointsPerTerm = optionalPositive(criterion.maxPointsPerTerm);
    const checkItems = (Array.isArray(criterion.checkItems) ? criterion.checkItems : [])
      .map(normalizeChecklistItem).filter(Boolean).slice(0, 10);
    if (scoringMode === 'CHECK' && checkItems.length === 0) {
      checkItems.push(normalizeChecklistItem({ label: 'Completed', pointValue: pointsPerCheck }));
    }
    return {
      ...criterion,
      id: String(criterion.id || createId('checklist-criterion')),
      label,
      standardType,
      destinationComponent: normalizedChecklistComponent(criterion.destinationComponent),
      scoringMode,
      pointsPerCheck,
      maxPointsPerSession,
      maxPointsPerTerm,
      checkItems,
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

  function normalizeChecklistSession(session, criteriaOrIds) {
    if (!session || typeof session !== 'object') return null;
    const criteria = Array.isArray(criteriaOrIds) ? criteriaOrIds : [];
    const criterionIds = criteriaOrIds instanceof Set
      ? criteriaOrIds
      : new Set(criteria.map(item => item.id));
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
    const normalizedSession = {
      ...session,
      id: String(session.id || createId('checklist-session')),
      date: String(session.date || new Date().toISOString().slice(0, 10)),
      title: String(session.title || 'Checklist Session').trim() || 'Checklist Session',
      entries,
      createdAt: String(session.createdAt || new Date().toISOString()),
      updatedAt: String(session.updatedAt || session.createdAt || new Date().toISOString())
    };
    normalizedSession.activity = normalizeChecklistActivity(
      session.activity,
      normalizedSession,
      criteria
    );
    return normalizedSession;
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
      publishedScoreStates: normalizeScoreStateMap(existing.publishedScoreStates),
      originalScoreStates: normalizeScoreStateMap(existing.originalScoreStates)
    };
  }

  function normalizeChecklistActivity(activity, session, criteria) {
    if (!activity || typeof activity !== 'object' || Array.isArray(activity)) return null;
    const criterionId = String(activity.criterionId || '');
    const criterion = (criteria || []).find(item => item.id === criterionId);
    if (!criterion) return null;
    const requestedScoringMode = CHECKLIST_SCORING_MODES.includes(String(activity.scoringMode || '').toUpperCase())
      ? String(activity.scoringMode).toUpperCase()
      : criterion.scoringMode;
    const scoringMode = isStandardNumericalChecklistLabel(criterion)
      ? 'NUMERIC'
      : requestedScoringMode;
    const maxPoints = optionalPositive(activity.maxPoints) || criterion.maxPointsPerSession;
    const pointsPerCheck = Math.min(
      optionalPositive(activity.pointsPerCheck) || criterion.pointsPerCheck || 1,
      maxPoints
    );
    return {
      ...activity,
      id: String(activity.id || session.id || createId('checklist-activity')),
      criterionId,
      title: String(activity.title || session.title || criterion.label).trim() || criterion.label,
      sequence: Math.max(1, Math.floor(finiteNonNegative(activity.sequence, 1))),
      destinationComponent: normalizedChecklistComponent(
        activity.destinationComponent || criterion.destinationComponent
      ),
      scoringMode,
      pointsPerCheck,
      maxPoints,
      allowNotes: activity.allowNotes === undefined
        ? Boolean(criterion.allowNotes)
        : Boolean(activity.allowNotes),
      status: activity.status === 'archived' ? 'archived' : 'active',
      publicationTarget: normalizePublicationTarget(activity.publicationTarget)
    };
  }

  function normalizePerformanceChecklist(checklist) {
    if (!checklist || typeof checklist !== 'object') return null;
    const assignmentId = String(checklist.assignmentId || '');
    if (!assignmentId) return null;
    const criteria = Array.isArray(checklist.criteria)
      ? checklist.criteria.map(normalizeChecklistCriterion).filter(Boolean)
      : [];
    const sessions = Array.isArray(checklist.sessions)
      ? checklist.sessions.map(item => normalizeChecklistSession(item, criteria)).filter(Boolean)
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
      activityId: String(entry.activityId || ''),
      activityTitle: String(entry.activityTitle || ''),
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
    const participationStarEvents = Array.isArray(existing.participationStarEvents)
      ? existing.participationStarEvents.map(event => normalizeParticipationStarEvent(event, assignmentIds)).filter(Boolean)
      : [];
    const classroomToolSessions = Array.isArray(existing.classroomToolSessions)
      ? existing.classroomToolSessions.map(session => normalizeClassroomToolSession(session, assignmentIds)).filter(Boolean)
      : [];
    profileDb.tools = {
      ...existing,
      schemaVersion: Math.max(Number(existing.schemaVersion) || 0, TOOLS_SCHEMA_VERSION),
      gradeSimulatorHistory: history,
      performanceChecklists,
      performanceChecklistHistory,
      performanceChecklistEntryHistory,
      performanceChecklistTemplates,
      appearancePreferences: normalizeAppearancePreferences(existing.appearancePreferences),
      participationStarEvents,
      classroomToolSessions,
      calendarPreferences: normalizeCalendarPreferences(existing.calendarPreferences)
    };
    return profileDb.tools;
  }

  function participationStarTotals(events, assignmentId, term) {
    const totals = {};
    (Array.isArray(events) ? events : []).forEach(event => {
      if (String(event?.assignmentId || '') !== String(assignmentId || '')
        || normalizedTerm(event?.term) !== normalizedTerm(term) || event?.reversedAt) return;
      const learnerId = String(event.learnerId || '');
      if (learnerId) totals[learnerId] = (totals[learnerId] || 0) + 1;
    });
    return totals;
  }

  function awardParticipationStar(tools, assignmentId, term, learnerId, options = {}) {
    if (!tools || typeof tools !== 'object') throw new TypeError('Teacher Tools data is required.');
    if (!assignmentId || !learnerId) throw new Error('A class and learner are required.');
    if (!Array.isArray(tools.participationStarEvents)) tools.participationStarEvents = [];
    const event = normalizeParticipationStarEvent({
      id: createId('participation-star'), assignmentId, term: normalizedTerm(term), learnerId,
      awardedAt: options.awardedAt || new Date().toISOString(), source: options.source || 'name-picker',
      note: options.note || '', reversedAt: ''
    });
    tools.participationStarEvents.push(event);
    return event;
  }

  function reverseParticipationStar(tools, eventId, reversedAt = new Date().toISOString()) {
    const event = (tools?.participationStarEvents || []).find(item => String(item?.id) === String(eventId));
    if (!event || event.reversedAt) return null;
    event.reversedAt = reversedAt;
    return event;
  }

  function undoLastParticipationStar(tools, assignmentId, term) {
    const event = [...(tools?.participationStarEvents || [])].reverse().find(item =>
      String(item?.assignmentId || '') === String(assignmentId || '')
      && normalizedTerm(item?.term) === normalizedTerm(term) && !item?.reversedAt);
    return event ? reverseParticipationStar(tools, event.id) : null;
  }

  function resetParticipationStars(tools, assignmentId, term, confirmation) {
    if (String(confirmation || '') !== `RESET TERM ${normalizedTerm(term)}`) {
      throw new Error(`Type RESET TERM ${normalizedTerm(term)} to confirm.`);
    }
    const reversedAt = new Date().toISOString();
    let count = 0;
    (tools?.participationStarEvents || []).forEach(event => {
      if (String(event?.assignmentId || '') === String(assignmentId || '')
        && normalizedTerm(event?.term) === normalizedTerm(term) && !event?.reversedAt) {
        event.reversedAt = reversedAt;
        count += 1;
      }
    });
    return count;
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
    plan.changes.forEach(change => {
      auditScoreChange(officialAssignment, change, 'teacher-tools-simulation');
      writeScoreState(officialAssignment.scores, change.key, change.after);
    });
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
      auditScoreChange(officialAssignment, { ...change, before: change.after, after: change.before }, 'teacher-tools-revert');
      writeScoreState(officialAssignment.scores, change.key, change.before);
      restored.push(change.key);
    });
    plan.conflicts.forEach(change => {
      if (resolutions[change.key] === 'restore') {
        auditScoreChange(officialAssignment, { ...change, before: change.current, after: change.before }, 'teacher-tools-revert');
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
        scoringMode: 'NUMERIC',
        pointsPerCheck: 1,
        maxPointsPerSession: 1,
        maxPointsPerTerm: null
      },
      {
        label: 'Notebook',
        destinationComponent: 'TRACKING',
        scoringMode: 'NUMERIC',
        pointsPerCheck: 1,
        maxPointsPerSession: 1,
        maxPointsPerTerm: null
      },
      {
        label: 'Assignment',
        destinationComponent: 'TRACKING',
        scoringMode: 'NUMERIC',
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
    const firstActivityTitle = String(
      options.activityTitle || `${criteria[0].label} 1`
    ).trim() || `${criteria[0].label} 1`;
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
        title: String(options.activityMode ? firstActivityTitle : options.sessionTitle || 'Session 1'),
        entries: {},
        activity: options.activityMode ? {
          criterionId: criteria[0].id,
          title: firstActivityTitle,
          sequence: 1,
          destinationComponent: criteria[0].destinationComponent,
          scoringMode: criteria[0].scoringMode,
          pointsPerCheck: criteria[0].pointsPerCheck,
          maxPoints: criteria[0].maxPointsPerSession,
          allowNotes: criteria[0].allowNotes
        } : null,
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
    }, checklist.criteria || []);
    checklist.sessions = [...(checklist.sessions || []), session];
    checklist.updatedAt = now;
    return session;
  }

  function addChecklistActivity(checklist, options = {}) {
    if (!checklist || typeof checklist !== 'object') throw new TypeError('A performance checklist is required.');
    const criterion = (checklist.criteria || []).find(item => item.id === String(options.criterionId || ''));
    if (!criterion || !criterion.active) throw new Error('Choose an active activity type.');
    const now = new Date().toISOString();
    const sequence = (checklist.sessions || []).filter(session =>
      session.activity?.criterionId === criterion.id
    ).length + 1;
    const title = String(options.title || `${criterion.label} ${sequence}`).trim();
    if (!title) throw new Error('Enter an activity title.');
    const sessionId = createId('checklist-session');
    const session = normalizeChecklistSession({
      id: sessionId,
      date: String(options.date || now.slice(0, 10)),
      title,
      entries: {},
      activity: {
        id: sessionId,
        criterionId: criterion.id,
        title,
        sequence,
        destinationComponent: options.destinationComponent || criterion.destinationComponent,
        scoringMode: options.scoringMode || criterion.scoringMode,
        pointsPerCheck: options.pointsPerCheck || criterion.pointsPerCheck,
        maxPoints: options.maxPoints || criterion.maxPointsPerSession,
        allowNotes: options.allowNotes === undefined ? criterion.allowNotes : options.allowNotes,
        publicationTarget: normalizePublicationTarget(null)
      },
      createdAt: now,
      updatedAt: now
    }, checklist.criteria || []);
    if (!session?.activity) throw new Error('The activity settings are invalid.');
    checklist.sessions = [...(checklist.sessions || []), session];
    checklist.updatedAt = now;
    return session;
  }

  function updateChecklistActivity(checklist, activityId, options = {}) {
    if (!checklist || typeof checklist !== 'object') throw new TypeError('A performance checklist is required.');
    const session = (checklist.sessions || []).find(item =>
      String(item.activity?.id || item.id) === String(activityId || '')
    );
    if (!session?.activity) throw new Error('The selected activity is unavailable.');
    const published = isChecklistActivityPublished(session);
    if (published) {
      throw new Error('Published activities are locked. Unlock this activity with your PIN before editing it.');
    }
    const maxPoints = optionalPositive(options.maxPoints) || session.activity.maxPoints;
    const oversizedEntry = Object.values(session.entries || {}).some(learnerEntries => {
      const entry = learnerEntries?.[session.activity.criterionId];
      return Number(entry?.points) > maxPoints;
    });
    if (oversizedEntry) {
      throw new Error('Reduce existing learner scores before lowering this activity HPS.');
    }
    const title = String(options.title || session.title).trim();
    const date = String(options.date || session.date);
    if (!title || !date) throw new Error('Enter an activity title and date.');
    session.title = title;
    session.date = date;
    session.activity = normalizeChecklistActivity({
      ...session.activity,
      title,
      destinationComponent: options.destinationComponent || session.activity.destinationComponent,
      scoringMode: options.scoringMode || session.activity.scoringMode,
      pointsPerCheck: options.pointsPerCheck || session.activity.pointsPerCheck,
      maxPoints,
      allowNotes: options.allowNotes === undefined
        ? session.activity.allowNotes
        : options.allowNotes
    }, session, checklist.criteria || []);
    const now = new Date().toISOString();
    session.updatedAt = now;
    checklist.updatedAt = now;
    return session;
  }

  function checklistActivityDefinition(checklist, sessionOrId) {
    const session = typeof sessionOrId === 'string'
      ? (checklist?.sessions || []).find(item => item.id === sessionOrId)
      : sessionOrId;
    if (!session?.activity) return null;
    const criterion = (checklist?.criteria || []).find(item => item.id === session.activity.criterionId);
    if (!criterion) return null;
    return {
      ...criterion,
      ...session.activity,
      id: criterion.id,
      activityId: session.activity.id || session.id,
      criterionId: criterion.id,
      maxPointsPerSession: session.activity.maxPoints
    };
  }

  function checklistSessionCriteria(checklist, sessionOrId) {
    const activity = checklistActivityDefinition(checklist, sessionOrId);
    return activity
      ? [activity]
      : (checklist?.criteria || []);
  }

  function checklistTableColumns(checklist) {
    return (checklist?.sessions || []).flatMap(session => {
      const activity = checklistActivityDefinition(checklist, session);
      if (activity) {
        return [{
          session,
          definition: activity,
          sessionId: session.id,
          criterionId: activity.criterionId,
          activityId: activity.activityId,
          title: activity.title,
          date: session.date,
          legacy: false
        }];
      }
      return (checklist?.criteria || []).map(criterion => ({
        session,
        definition: criterion,
        sessionId: session.id,
        criterionId: criterion.id,
        activityId: '',
        title: `${criterion.label} - ${session.title}`,
        date: session.date,
        legacy: true
      }));
    });
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
    const activityCriterion = checklistActivityDefinition(checklist, session);
    const learner = (assignment.learners || []).find(item => item.id === learnerId);
    if (!session) throw new Error('The selected checklist session is unavailable.');
    if (!criterion) throw new Error('The selected criterion is unavailable.');
    if (isChecklistActivityPublished(session)) {
      throw new Error('Published activities are locked. Unlock this activity with your PIN before editing learner points.');
    }
    if (activityCriterion && activityCriterion.criterionId !== criterion.id) {
      throw new Error('The selected activity does not accept this entry type.');
    }
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
    const entryDefinition = activityCriterion || criterion;
    if (!entryDefinition.active) throw new Error('The selected criterion is unavailable.');
    if (!learner || learner.transferredOutTerm || learner.transferredOutDate) {
      throw new Error('This learner is not eligible for a new checklist entry.');
    }
    const points = Number(text);
    if (!Number.isFinite(points) || points < 0 || points > entryDefinition.maxPointsPerSession) {
      throw new RangeError(`Enter points from 0 to ${entryDefinition.maxPointsPerSession}.`);
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
    const lockedActivity = plan.changes.some(change => {
      const session = (checklist?.sessions || []).find(item => item.id === change.sessionId);
      return isChecklistActivityPublished(session);
    });
    if (lockedActivity) {
      throw new Error('Published activities are locked. Unlock the activity with your PIN before undoing checklist entries.');
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
    const buckets = {};
    learnerIds.forEach(learnerId => {
      totals[learnerId] = { TRACKING: 0, WW: 0, PT: 0, criteria: {} };
      buckets[learnerId] = {};
    });
    (checklist?.sessions || []).forEach(session => {
      checklistSessionCriteria(checklist, session).forEach(definition => {
        const component = normalizedChecklistComponent(definition.destinationComponent);
        learnerIds.forEach(learnerId => {
          const entry = session.entries?.[learnerId]?.[definition.criterionId || definition.id];
          if (!entry || !Number.isFinite(Number(entry.points))) return;
          const criterionId = definition.criterionId || definition.id;
          if (!buckets[learnerId][criterionId]) {
            buckets[learnerId][criterionId] = { TRACKING: 0, WW: 0, PT: 0 };
          }
          buckets[learnerId][criterionId][component] = roundScore(
            buckets[learnerId][criterionId][component] + Number(entry.points)
          );
        });
      });
    });
    (checklist?.criteria || []).forEach(criterion => {
      learnerIds.forEach(learnerId => {
        let remaining = criterion.maxPointsPerTerm || Number.POSITIVE_INFINITY;
        let criterionTotal = 0;
        CHECKLIST_COMPONENTS.forEach(component => {
          const raw = finiteNonNegative(buckets[learnerId][criterion.id]?.[component], 0);
          const applied = Math.min(raw, remaining);
          remaining -= applied;
          criterionTotal = roundScore(criterionTotal + applied);
          totals[learnerId][component] = roundScore(totals[learnerId][component] + applied);
        });
        totals[learnerId].criteria[criterion.id] = criterionTotal;
      });
    });
    return totals;
  }

  function isPublicationTargetPublished(target) {
    const normalized = normalizePublicationTarget(target);
    return Boolean(
      normalized.lastPublishedAt
      || Object.keys(normalized.publishedContributions).length
      || Object.keys(normalized.publishedScoreStates).length
    );
  }

  function isChecklistActivityPublished(session) {
    return Boolean(session?.activity)
      && isPublicationTargetPublished(session.activity.publicationTarget);
  }

  function hasPublishedChecklistContributions(checklist) {
    const legacyPublished = ['WW', 'PT'].some(component =>
      isPublicationTargetPublished(checklist?.publicationTargets?.[component])
    );
    const activityPublished = (checklist?.sessions || []).some(isChecklistActivityPublished);
    return legacyPublished || activityPublished;
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
    freshPlan.changes.forEach(change => {
      auditScoreChange(assignment, change, 'checklist-publication');
      writeScoreState(assignment.scores, change.key, change.after);
    });
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

  function checklistActivityPublicationContext(checklist, assignment, activityId) {
    if (!checklist || String(checklist.assignmentId) !== String(assignment?.id)) {
      throw new Error('The checklist no longer matches the active class.');
    }
    const session = (checklist.sessions || []).find(item =>
      String(item.activity?.id || item.id) === String(activityId || '')
    );
    const activity = checklistActivityDefinition(checklist, session);
    if (!session || !activity) throw new Error('The selected activity is unavailable.');
    const component = normalizedChecklistComponent(activity.destinationComponent);
    if (!['WW', 'PT'].includes(component)) {
      throw new Error('Tracking Only activities cannot be published to official grades.');
    }
    const target = normalizePublicationTarget(session.activity.publicationTarget);
    return { session, activity, component, target };
  }

  function assessmentHasScores(assignment, assessmentId) {
    const suffix = `|${assessmentId}`;
    return Object.entries(assignment?.scores || {}).some(([key, value]) =>
      key.endsWith(suffix) && value !== '' && value !== null && value !== undefined
    );
  }

  function assessmentPublicationState(assessment) {
    return {
      title: String(assessment?.title || ''),
      maxScore: assessment?.maxScore === undefined ? '' : assessment.maxScore
    };
  }

  function equalAssessmentPublicationState(assessment, state) {
    return Boolean(assessment && state)
      && String(assessment.title || '') === String(state.title || '')
      && String(assessment.maxScore ?? '') === String(state.maxScore ?? '');
  }

  function checklistActivityTargetSuggestions(checklist, assignment, activityId) {
    const context = checklistActivityPublicationContext(checklist, assignment, activityId);
    const targetId = context.target.assessmentId;
    const suggestions = (assignment.assessments || []).filter(assessment =>
      String(assessment.term) === String(checklist.term)
      && String(assessment.component) === context.component
      && String(assessment.mapePart || '') === String(checklist.mapePart || '')
    ).map((assessment, index) => {
      const linkedElsewhere = (checklist.sessions || []).some(other =>
        other !== context.session
        && other.activity?.publicationTarget?.assessmentId === assessment.id
      ) || (
        (checklist.sessions || []).some(other => !other.activity)
        && checklist.publicationTargets?.[context.component]?.assessmentId === assessment.id
      );
      const empty = !assessmentHasScores(assignment, assessment.id);
      const configuredMax = Number(assessment.maxScore);
      const hasPositiveHps = Number.isFinite(configuredMax) && configuredMax > 0;
      const exactHps = hasPositiveHps
        && roundScore(configuredMax) === roundScore(context.activity.maxPointsPerSession);
      const requiresSetup = empty && !exactHps;
      const effectiveMax = requiresSetup
        ? context.activity.maxPointsPerSession
        : configuredMax;
      const overflowLearnerIds = [];
      const conflictLearnerIds = [];
      let contributionCount = 0;
      activeLearners(assignment).forEach(learner => {
        const learnerId = String(learner.id);
        const entry = context.session.entries?.[learnerId]?.[context.activity.criterionId];
        const key = `${learnerId}|${assessment.id}`;
        const before = scoreState(assignment.scores || {}, key);
        const wasPublished = targetId === assessment.id
          && Object.prototype.hasOwnProperty.call(context.target.publishedContributions, learnerId);
        if (!entry && !wasPublished) return;
        if (entry) contributionCount++;
        if (wasPublished) {
          const expected = context.target.publishedScoreStates[learnerId];
          if (!expected || !equalScoreState(before, expected)) {
            conflictLearnerIds.push(learnerId);
            return;
          }
        }
        const baseline = wasPublished
          ? context.target.originalScoreStates[learnerId] || { present: false, value: null }
          : before;
        const contribution = Math.min(
          finiteNonNegative(entry?.points, 0),
          context.activity.maxPointsPerSession
        );
        const projected = roundScore((baseline.present ? Number(baseline.value) : 0) + contribution);
        if (Number.isFinite(effectiveMax) && effectiveMax > 0 && projected > effectiveMax) {
          overflowLearnerIds.push(learnerId);
        }
      });
      const compatible = !linkedElsewhere
        && conflictLearnerIds.length === 0
        && Number.isFinite(effectiveMax)
        && effectiveMax > 0
        && overflowLearnerIds.length === 0;
      const rank = targetId === assessment.id
        ? -1
        : linkedElsewhere
          ? 5
          : empty && exactHps
            ? 0
            : empty
              ? 1
              : compatible
                ? 2
                : 4;
      return {
        assessment,
        assessmentId: assessment.id,
        title: String(assessment.title || assessment.component),
        configuredMax: hasPositiveHps ? configuredMax : null,
        effectiveMax,
        empty,
        exactHps,
        requiresSetup,
        linkedElsewhere,
        overflowLearnerIds,
        conflictLearnerIds,
        contributionCount,
        compatible,
        rank,
        sourceIndex: index,
        current: targetId === assessment.id,
        recommended: false
      };
    }).sort((left, right) =>
      left.rank - right.rank
      || left.sourceIndex - right.sourceIndex
    );
    const recommended = suggestions.find(item => item.compatible);
    if (recommended) recommended.recommended = true;
    return suggestions;
  }

  function validateChecklistActivityPublication(checklist, assignment, activityId, assessmentId) {
    const context = checklistActivityPublicationContext(checklist, assignment, activityId);
    const suggestion = checklistActivityTargetSuggestions(checklist, assignment, activityId)
      .find(item => String(item.assessmentId) === String(assessmentId));
    const assessment = suggestion?.assessment;
    if (!assessment) {
      throw new Error('Choose an assessment from this class, term, component, and MAPEH strand.');
    }
    if (suggestion.linkedElsewhere) {
      throw new Error('This official assessment is already linked to another checklist activity.');
    }
    if (!Number.isFinite(suggestion.effectiveMax) || suggestion.effectiveMax <= 0) {
      throw new Error('Set a positive HPS for this occupied assessment before adding checklist points.');
    }
    const duplicateTarget = (checklist.sessions || []).find(item =>
      item !== context.session
      && item.activity?.publicationTarget?.assessmentId === assessment.id
    );
    if (duplicateTarget) {
      throw new Error('This official assessment is already linked to another checklist activity.');
    }
    const hasPublishedPoints = Object.keys(context.target.publishedContributions).length > 0;
    if (hasPublishedPoints && context.target.assessmentId && context.target.assessmentId !== assessment.id) {
      throw new Error('Revert this activity publication before selecting a different target assessment.');
    }
    const assessmentBefore = assessmentPublicationState(assessment);
    const assessmentAfter = suggestion.requiresSetup
      ? {
        title: context.activity.title,
        maxScore: context.activity.maxPointsPerSession
      }
      : assessmentBefore;
    return {
      ...context,
      assessment,
      maxScore: suggestion.effectiveMax,
      suggestion,
      assessmentBefore,
      assessmentAfter
    };
  }

  function linkChecklistActivityPublicationTarget(checklist, assignment, activityId, assessmentId) {
    const validated = validateChecklistActivityPublication(
      checklist,
      assignment,
      activityId,
      assessmentId
    );
    if (!validated.suggestion.compatible) {
      if (validated.suggestion.overflowLearnerIds.length) {
        throw new Error(`${validated.suggestion.overflowLearnerIds.length} learner score${validated.suggestion.overflowLearnerIds.length === 1 ? '' : 's'} would exceed this assessment's HPS.`);
      }
      throw new Error('The selected assessment cannot safely accept these checklist points.');
    }
    validated.session.activity.publicationTarget = {
      ...validated.target,
      assessmentId: validated.assessment.id
    };
    checklist.updatedAt = new Date().toISOString();
    return validated.session.activity.publicationTarget;
  }

  function planChecklistActivityPublication(checklist, assignment, activityId, assessmentId) {
    const validated = validateChecklistActivityPublication(
      checklist,
      assignment,
      activityId,
      assessmentId
    );
    const changes = [];
    const blocked = [];
    const contributionsAfter = { ...validated.target.publishedContributions };
    const scoreStatesAfter = { ...validated.target.publishedScoreStates };
    const originalScoreStatesAfter = { ...validated.target.originalScoreStates };
    activeLearners(assignment).forEach(learner => {
      const learnerId = String(learner.id);
      const entry = validated.session.entries?.[learnerId]?.[validated.activity.criterionId];
      const wasPublished = Object.prototype.hasOwnProperty.call(
        validated.target.publishedContributions,
        learnerId
      );
      if (!entry && !wasPublished) return;
      const total = roundScore(Math.min(
        finiteNonNegative(entry?.points, 0),
        validated.activity.maxPointsPerSession
      ));
      const published = finiteNonNegative(validated.target.publishedContributions[learnerId], 0);
      const requestedDelta = roundScore(total - published);
      const key = `${learnerId}|${validated.assessment.id}`;
      const before = scoreState(assignment.scores || {}, key);
      const expectedPublishedScore = validated.target.publishedScoreStates[learnerId];
      if (wasPublished && (!expectedPublishedScore || !equalScoreState(before, expectedPublishedScore))) {
        blocked.push({ learnerId, key, reason: 'score-changed-after-publication', total, published, requestedDelta });
        return;
      }
      const original = wasPublished
        ? validated.target.originalScoreStates[learnerId] || { present: false, value: null }
        : before;
      const after = entry
        ? {
          present: true,
          value: roundScore((original.present ? Number(original.value) : 0) + total)
        }
        : original;
      if (after.present && Number(after.value) > validated.maxScore) {
        blocked.push({
          learnerId,
          key,
          reason: 'score-exceeds-hps',
          total,
          published,
          requestedDelta,
          projected: after.value,
          maxScore: validated.maxScore
        });
        return;
      }
      if (equalScoreState(before, after) && requestedDelta === 0) return;
      if (entry) {
        contributionsAfter[learnerId] = total;
        scoreStatesAfter[learnerId] = clone(after);
        originalScoreStatesAfter[learnerId] = clone(original);
      } else {
        delete contributionsAfter[learnerId];
        delete scoreStatesAfter[learnerId];
        delete originalScoreStatesAfter[learnerId];
      }
      changes.push({
        learnerId,
        key,
        before,
        after,
        total,
        publishedBefore: published,
        publishedAfter: entry ? total : 0,
        requestedDelta,
        appliedDelta: requestedDelta,
        overflow: 0
      });
    });
    return {
      checklistId: checklist.id,
      assignmentId: assignment.id,
      activityId: validated.activity.activityId,
      activityTitle: validated.activity.title,
      assessmentId: validated.assessment.id,
      assessmentTitle: String(validated.assessment.title || validated.assessment.component),
      component: validated.component,
      term: checklist.term,
      maxScore: validated.maxScore,
      assessmentBefore: clone(validated.assessmentBefore),
      assessmentAfter: clone(validated.assessmentAfter),
      publicationBefore: clone(validated.target),
      publicationAfter: {
        assessmentId: validated.assessment.id,
        lastPublishedAt: '',
        publishedContributions: contributionsAfter,
        publishedScoreStates: scoreStatesAfter,
        originalScoreStates: originalScoreStatesAfter
      },
      changes,
      blocked,
      canApply: changes.length > 0 && blocked.length === 0
    };
  }

  function comparableChecklistActivityPlan(plan) {
    return {
      checklistId: plan.checklistId,
      assignmentId: plan.assignmentId,
      activityId: plan.activityId,
      assessmentId: plan.assessmentId,
      component: plan.component,
      maxScore: plan.maxScore,
      assessmentBefore: plan.assessmentBefore,
      assessmentAfter: plan.assessmentAfter,
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

  function applyChecklistActivityPublication(checklist, assignment, reviewedPlan) {
    const freshPlan = planChecklistActivityPublication(
      checklist,
      assignment,
      reviewedPlan?.activityId,
      reviewedPlan?.assessmentId
    );
    if (JSON.stringify(comparableChecklistActivityPlan(freshPlan))
      !== JSON.stringify(comparableChecklistActivityPlan(reviewedPlan))) {
      throw new Error('Activity entries or official scores changed after the review opened. Review the publication again.');
    }
    if (freshPlan.blocked.length) {
      throw new Error('One or more learner scores would exceed HPS or conflict with newer official scores.');
    }
    if (!freshPlan.changes.length) throw new Error('There are no activity score changes to publish.');
    if (!assignment.scores) assignment.scores = {};
    const assessment = (assignment.assessments || []).find(item => item.id === freshPlan.assessmentId);
    if (!assessment || !equalAssessmentPublicationState(assessment, freshPlan.assessmentBefore)) {
      throw new Error('The target assessment changed after the review opened. Review the publication again.');
    }
    assessment.title = freshPlan.assessmentAfter.title;
    assessment.maxScore = freshPlan.assessmentAfter.maxScore;
    freshPlan.changes.forEach(change => {
      auditScoreChange(assignment, change, 'checklist-publication');
      writeScoreState(assignment.scores, change.key, change.after);
    });
    const appliedAt = new Date().toISOString();
    freshPlan.publicationAfter.lastPublishedAt = appliedAt;
    const session = (checklist.sessions || []).find(item =>
      String(item.activity?.id || item.id) === String(freshPlan.activityId)
    );
    if (!session?.activity) throw new Error('The selected activity is unavailable.');
    session.activity.publicationTarget = clone(freshPlan.publicationAfter);
    checklist.updatedAt = appliedAt;
    return {
      id: createId('checklist-publication'),
      checklistId: checklist.id,
      assignmentId: assignment.id,
      activityId: freshPlan.activityId,
      activityTitle: freshPlan.activityTitle,
      assessmentId: freshPlan.assessmentId,
      component: freshPlan.component,
      term: checklist.term,
      appliedAt,
      assessmentBefore: clone(freshPlan.assessmentBefore),
      assessmentAfter: clone(freshPlan.assessmentAfter),
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
    const activitySession = entry.activityId
      ? (checklist.sessions || []).find(item =>
        String(item.activity?.id || item.id) === String(entry.activityId)
      )
      : null;
    if (entry.activityId && !activitySession?.activity) {
      throw new Error('The published activity is no longer available.');
    }
    const currentTarget = normalizePublicationTarget(
      activitySession?.activity?.publicationTarget
      || checklist.publicationTargets?.[entry.component]
    );
    const publicationConflict = JSON.stringify(currentTarget) !== JSON.stringify(entry.publicationAfter);
    const assessment = (assignment.assessments || []).find(item => item.id === entry.assessmentId);
    const assessmentConflict = Boolean(entry.assessmentAfter)
      && !equalAssessmentPublicationState(assessment, entry.assessmentAfter);
    return {
      changes: entry.changes,
      scoreConflicts,
      publicationConflict,
      assessmentConflict,
      canRevert: scoreConflicts.length === 0 && !publicationConflict && !assessmentConflict
    };
  }

  function revertChecklistPublication(historyEntry, checklist, assignment) {
    const plan = planChecklistPublicationRevert(historyEntry, checklist, assignment);
    if (!plan.canRevert) {
      throw new Error('Scores or checklist publication data changed after this publication. Preserve the newer data and review it manually.');
    }
    if (!assignment.scores) assignment.scores = {};
    plan.changes.forEach(change => {
      auditScoreChange(assignment, { ...change, before: change.after, after: change.before }, 'checklist-publication-revert');
      writeScoreState(assignment.scores, change.key, change.before);
    });
    if (historyEntry.assessmentBefore) {
      const assessment = (assignment.assessments || []).find(item => item.id === historyEntry.assessmentId);
      if (!assessment) throw new Error('The target assessment is no longer available.');
      assessment.title = historyEntry.assessmentBefore.title;
      assessment.maxScore = historyEntry.assessmentBefore.maxScore;
    }
    if (historyEntry.activityId) {
      const session = (checklist.sessions || []).find(item =>
        String(item.activity?.id || item.id) === String(historyEntry.activityId)
      );
      if (!session?.activity) throw new Error('The published activity is no longer available.');
      session.activity.publicationTarget = clone(historyEntry.publicationBefore);
    } else {
      checklist.publicationTargets[historyEntry.component] = clone(historyEntry.publicationBefore);
    }
    checklist.updatedAt = new Date().toISOString();
    historyEntry.status = 'reverted';
    historyEntry.revertedAt = checklist.updatedAt;
    return { restored: plan.changes.map(change => change.key) };
  }

  function matchingAppliedActivityPublications(historyEntries, checklist, assignment, activityId) {
    return (Array.isArray(historyEntries) ? historyEntries : [])
      .map((entry, index) => ({
        entry: normalizeChecklistHistoryEntry(entry),
        index
      }))
      .filter(item => item.entry
        && item.entry.status === 'applied'
        && item.entry.checklistId === checklist?.id
        && item.entry.assignmentId === assignment?.id
        && item.entry.activityId === String(activityId || ''))
      .sort((left, right) => {
        const appliedOrder = String(right.entry.appliedAt).localeCompare(String(left.entry.appliedAt));
        return appliedOrder || left.index - right.index;
      });
  }

  function planChecklistActivityUnlock(historyEntries, checklist, assignment, activityId) {
    const session = (checklist?.sessions || []).find(item =>
      String(item.activity?.id || item.id) === String(activityId || '')
    );
    if (!session?.activity) throw new Error('The selected activity is unavailable.');
    if (!isChecklistActivityPublished(session)) {
      return {
        canUnlock: false,
        publicationIds: [],
        publications: 0,
        restoredScores: 0,
        error: 'This activity is not published.'
      };
    }
    const publications = matchingAppliedActivityPublications(
      historyEntries,
      checklist,
      assignment,
      activityId
    );
    if (!publications.length) {
      return {
        canUnlock: false,
        publicationIds: [],
        publications: 0,
        restoredScores: 0,
        error: 'The publication history required to restore official scores is unavailable.'
      };
    }
    const simulatedChecklist = clone(checklist);
    const simulatedAssignment = clone(assignment);
    let restoredScores = 0;
    try {
      publications.forEach(item => {
        const simulatedEntry = clone(item.entry);
        const result = revertChecklistPublication(
          simulatedEntry,
          simulatedChecklist,
          simulatedAssignment
        );
        restoredScores += result.restored.length;
      });
      const simulatedSession = (simulatedChecklist.sessions || []).find(item =>
        String(item.activity?.id || item.id) === String(activityId || '')
      );
      if (isChecklistActivityPublished(simulatedSession)) {
        throw new Error('Additional publication history is required before this activity can be unlocked.');
      }
      return {
        canUnlock: true,
        publicationIds: publications.map(item => item.entry.id),
        publications: publications.length,
        restoredScores,
        error: ''
      };
    } catch (error) {
      return {
        canUnlock: false,
        publicationIds: publications.map(item => item.entry.id),
        publications: publications.length,
        restoredScores: 0,
        error: error.message || 'The official scores changed after publication.'
      };
    }
  }

  function unlockChecklistActivity(historyEntries, checklist, assignment, activityId) {
    const plan = planChecklistActivityUnlock(
      historyEntries,
      checklist,
      assignment,
      activityId
    );
    if (!plan.canUnlock) {
      throw new Error(plan.error || 'This activity cannot be unlocked safely.');
    }
    const entriesById = new Map(
      (Array.isArray(historyEntries) ? historyEntries : []).map(entry => [String(entry?.id || ''), entry])
    );
    let restoredScores = 0;
    plan.publicationIds.forEach(publicationId => {
      const historyEntry = entriesById.get(publicationId);
      if (!historyEntry) throw new Error('The publication history changed. Reopen the unlock review.');
      restoredScores += revertChecklistPublication(historyEntry, checklist, assignment).restored.length;
    });
    const session = (checklist.sessions || []).find(item =>
      String(item.activity?.id || item.id) === String(activityId || '')
    );
    if (isChecklistActivityPublished(session)) {
      throw new Error('The activity still has published points and remains locked.');
    }
    return {
      publications: plan.publications,
      restoredScores
    };
  }

  const api = {
    TOOLS_SCHEMA_VERSION,
    SIMULATION_HISTORY_LIMIT,
    CHECKLIST_HISTORY_LIMIT,
    CHECKLIST_ENTRY_HISTORY_LIMIT,
    CHECKLIST_COMPONENTS,
    CHECKLIST_SCORING_MODES,
    TEACHER_TOOL_THEMES,
    CLASSROOM_TOOL_TYPES,
    clone,
    normalizeAppearancePreferences,
    normalizeParticipationStarEvent,
    normalizeClassroomToolSession,
    normalizeCalendarPreferences,
    normalizeChecklistItem,
    participationStarTotals,
    awardParticipationStar,
    reverseParticipationStar,
    undoLastParticipationStar,
    resetParticipationStars,
    isStandardNumericalChecklistLabel,
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
    addChecklistActivity,
    updateChecklistActivity,
    checklistActivityDefinition,
    checklistSessionCriteria,
    checklistTableColumns,
    checklistEntry,
    setChecklistEntry,
    applyChecklistEntryTransaction,
    planChecklistEntryUndo,
    undoChecklistEntryTransaction,
    createChecklistTemplate,
    checklistCriteriaFromTemplate,
    checklistLearnerTotals,
    isChecklistActivityPublished,
    hasPublishedChecklistContributions,
    checklistEntryCount,
    clearChecklistEntries,
    linkChecklistPublicationTarget,
    planChecklistPublication,
    applyChecklistPublication,
    linkChecklistActivityPublicationTarget,
    checklistActivityTargetSuggestions,
    planChecklistActivityPublication,
    applyChecklistActivityPublication,
    planChecklistPublicationRevert,
    revertChecklistPublication,
    planChecklistActivityUnlock,
    unlockChecklistActivity,
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
    addActivity: addChecklistActivity,
    updateActivity: updateChecklistActivity,
    activityDefinition: checklistActivityDefinition,
    sessionCriteria: checklistSessionCriteria,
    tableColumns: checklistTableColumns,
    entry: checklistEntry,
    setEntry: setChecklistEntry,
    applyEntryTransaction: applyChecklistEntryTransaction,
    planEntryUndo: planChecklistEntryUndo,
    undoEntryTransaction: undoChecklistEntryTransaction,
    createTemplate: createChecklistTemplate,
    criteriaFromTemplate: checklistCriteriaFromTemplate,
    totals: checklistLearnerTotals,
    isActivityPublished: isChecklistActivityPublished,
    hasPublishedContributions: hasPublishedChecklistContributions,
    clearEntries: clearChecklistEntries,
    linkTarget: linkChecklistPublicationTarget,
    planPublication: planChecklistPublication,
    applyPublication: applyChecklistPublication,
    linkActivityTarget: linkChecklistActivityPublicationTarget,
    activityTargetSuggestions: checklistActivityTargetSuggestions,
    planActivityPublication: planChecklistActivityPublication,
    applyActivityPublication: applyChecklistActivityPublication,
    planRevert: planChecklistPublicationRevert,
    revertPublication: revertChecklistPublication,
    planActivityUnlock: planChecklistActivityUnlock,
    unlockActivity: unlockChecklistActivity
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
