/**
 * Pure data and algorithm layer for Teacher Tools.
 * This module is UI-independent so randomization and grade transactions can be
 * tested without loading Electron or the renderer.
 */
(function initTeacherToolsCore(globalScope) {
  'use strict';

  const TOOLS_SCHEMA_VERSION = 1;
  const SIMULATION_HISTORY_LIMIT = 10;

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
    profileDb.tools = {
      ...existing,
      schemaVersion: Math.max(Number(existing.schemaVersion) || 0, TOOLS_SCHEMA_VERSION),
      gradeSimulatorHistory: history
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

  const api = {
    TOOLS_SCHEMA_VERSION,
    SIMULATION_HISTORY_LIMIT,
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
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
