(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ScoreHistory = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const MAX_ENTRIES = 10000;

  function hasScore(value) {
    return value !== undefined && value !== null && value !== '' && Number.isFinite(Number(value));
  }

  function normalizedValue(value) {
    return hasScore(value) ? Number(value) : null;
  }

  function splitScoreKey(key) {
    const separator = String(key || '').lastIndexOf('|');
    if (separator < 1) return null;
    return {
      learnerId: String(key).slice(0, separator),
      assessmentId: String(key).slice(separator + 1)
    };
  }

  function assessmentTerm(assignment, assessmentId) {
    const assessment = (assignment?.assessments || []).find(item => String(item.id) === String(assessmentId));
    return String(assessment?.term || '1');
  }

  function ensure(assignment) {
    if (!assignment || typeof assignment !== 'object') return [];
    if (!Array.isArray(assignment.scoreHistory)) assignment.scoreHistory = [];
    assignment.scoreHistory = assignment.scoreHistory.filter(entry => entry && typeof entry === 'object');
    return assignment.scoreHistory;
  }

  function createId() {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
    return `score-history-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function record(assignment, change) {
    if (!assignment || !change) return null;
    const previousValue = normalizedValue(change.previousValue);
    const newValue = normalizedValue(change.newValue);
    if (previousValue === newValue || (previousValue === null && newValue === null)) return null;

    const entry = {
      id: change.id || createId(),
      learnerId: String(change.learnerId || ''),
      assessmentId: String(change.assessmentId || ''),
      term: String(change.term || assessmentTerm(assignment, change.assessmentId)),
      previousValue,
      newValue,
      source: String(change.source || 'grading-sheet'),
      changedAt: change.changedAt || new Date().toISOString()
    };
    if (!entry.learnerId || !entry.assessmentId) return null;

    const history = ensure(assignment);
    history.push(entry);
    if (history.length > MAX_ENTRIES) history.splice(0, history.length - MAX_ENTRIES);
    return entry;
  }

  function recordDiff(assignment, beforeScores, afterScores, source, changedAt) {
    const before = beforeScores || {};
    const after = afterScores || {};
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    const entries = [];
    keys.forEach(key => {
      const ids = splitScoreKey(key);
      if (!ids) return;
      const entry = record(assignment, {
        ...ids,
        previousValue: before[key],
        newValue: after[key],
        source,
        changedAt
      });
      if (entry) entries.push(entry);
    });
    return entries;
  }

  function forCell(assignment, learnerId, assessmentId) {
    return ensure(assignment)
      .filter(entry => String(entry.learnerId) === String(learnerId)
        && String(entry.assessmentId) === String(assessmentId))
      .slice()
      .sort((left, right) => String(right.changedAt || '').localeCompare(String(left.changedAt || '')));
  }

  return { MAX_ENTRIES, hasScore, ensure, record, recordDiff, forCell, splitScoreKey };
});
