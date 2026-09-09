/**
 * Grade 1 PACE rating engine: per-learner A–E cells, median term letter, class set/increment, undo.
 */
function paceEnsureStore(assignment) {
  if (!assignment || typeof assignment !== 'object') return null;
  if (!assignment.pace || typeof assignment.pace !== 'object') {
    assignment.pace = {
      catalogId: typeof PACE_CATALOG_ID !== 'undefined' ? PACE_CATALOG_ID : 'grade1-matatag-2026',
      catalogVersion: typeof PACE_CATALOG_VERSION !== 'undefined' ? PACE_CATALOG_VERSION : 1,
      ratings: {},
      termLetterOverride: {},
      narratives: {}
    };
  }
  if (!assignment.pace.ratings || typeof assignment.pace.ratings !== 'object') assignment.pace.ratings = {};
  if (!assignment.pace.termLetterOverride || typeof assignment.pace.termLetterOverride !== 'object') {
    assignment.pace.termLetterOverride = {};
  }
  if (!assignment.pace.narratives || typeof assignment.pace.narratives !== 'object') assignment.pace.narratives = {};
  if (!assignment.pace.termSummaries || typeof assignment.pace.termSummaries !== 'object') assignment.pace.termSummaries = {};
  if (!assignment.pace.skillRatingMode) assignment.pace.skillRatingMode = 'single-letter';
  return assignment.pace;
}

function paceNormalizeLetter(value) {
  const letter = String(value || '').trim().toUpperCase();
  return PACE_LETTER_RANK[letter] ? letter : '';
}

function paceIsLetter(value) {
  return Boolean(paceNormalizeLetter(value));
}

function paceAnnexCRange(letter) {
  const normalized = paceNormalizeLetter(letter);
  if (normalized === 'A') return '90-100';
  if (normalized === 'B') return '80-89';
  if (normalized === 'C') return '75-79';
  if (normalized === 'D') return '65-74';
  if (normalized === 'E') return '0-64';
  return '';
}

function paceRatingKey(learnerId, competencyId, term, skill) {
  return `${learnerId}|${competencyId}|${term}|${skill || ''}`;
}

function paceParseRatingKey(key) {
  const parts = String(key || '').split('|');
  return {
    learnerId: parts[0] || '',
    competencyId: parts[1] || '',
    term: parts[2] || '',
    skill: parts[3] || ''
  };
}

function paceDetailSkillCode(index) {
  return String.fromCharCode(97 + index);
}

function paceHasLetteredParts(item) {
  return Boolean(item?.details && item.details.length > 1);
}

function paceUsesPerSkillRating(assignment) {
  return paceEnsureStore(assignment)?.skillRatingMode === 'per-skill';
}

function paceCellSkills(item, assignment) {
  if (!item) return [''];
  if (paceHasLetteredParts(item)) {
    return item.details.map((_, index) => paceDetailSkillCode(index));
  }
  if (assignment && paceUsesPerSkillRating(assignment) && Array.isArray(item.skills) && item.skills.length) {
    return item.skills.slice();
  }
  return [''];
}

function paceCellNumber(item, skillIndex) {
  const number = item?.number ?? '';
  if (!paceHasLetteredParts(item)) return String(number);
  return `${number}.${paceDetailSkillCode(skillIndex)}`;
}

function paceCellCaption(item, skill, skillIndex) {
  if (paceHasLetteredParts(item)) return item.details[skillIndex] || '';
  if (skill && typeof PACE_SKILL_LABELS !== 'undefined' && PACE_SKILL_LABELS[skill]) return PACE_SKILL_LABELS[skill];
  return '';
}

function paceLetterTooltip(letter) {
  const code = String(letter || '').toUpperCase();
  const label = (typeof PACE_LETTER_LABELS !== 'undefined' && PACE_LETTER_LABELS[code]) || '';
  return label ? `${code} — ${label}` : code;
}

function paceResolveSubject(assignment, subject) {
  if (subject) return subject;
  if (typeof paceWorkingSubject === 'function') return paceWorkingSubject(assignment);
  return assignment?.subject || '';
}

function paceOverrideKey(learnerId, term, subject, assignment) {
  const subjectKey = assignment && typeof isPaceHomeroomAssignment === 'function' && isPaceHomeroomAssignment(assignment)
    ? (typeof paceSubjectKey === 'function' ? paceSubjectKey(paceResolveSubject(assignment, subject)) : '')
    : '';
  return subjectKey ? `${learnerId}|${term}|${subjectKey}` : `${learnerId}|${term}`;
}

function paceGetRating(assignment, learnerId, competencyId, term, skill) {
  const store = paceEnsureStore(assignment);
  const requested = paceNormalizeLetter(store.ratings[paceRatingKey(learnerId, competencyId, term, skill)]);
  if (requested) return requested;
  if (skill) {
    return paceNormalizeLetter(store.ratings[paceRatingKey(learnerId, competencyId, term, '')]);
  }
  return '';
}

function paceRatingAllowed(assignment, competencyId, term) {
  const item = typeof paceCompetencyById === 'function'
    ? paceCompetencyById(assignment?.subject, competencyId)
    : null;
  if (!item) return true;
  return typeof paceItemAppliesToTerm === 'function' ? paceItemAppliesToTerm(item, term) : true;
}

function paceSetRating(assignment, learnerId, competencyId, term, skill, letter) {
  const store = paceEnsureStore(assignment);
  const key = paceRatingKey(learnerId, competencyId, term, skill);
  const previous = paceNormalizeLetter(store.ratings[key]);
  if (!paceRatingAllowed(assignment, competencyId, term)) {
    return { key, previous, next: previous };
  }
  const next = paceNormalizeLetter(letter);
  if (next) store.ratings[key] = next;
  else delete store.ratings[key];
  return { key, previous, next };
}

function paceIncrementLetter(letter) {
  const current = paceNormalizeLetter(letter);
  if (!current) return '';
  const rank = PACE_LETTER_RANK[current];
  if (rank >= 5) return 'A';
  return PACE_LETTERS[rank];
}

function paceMedianLetter(letters) {
  const ranks = (letters || []).map(paceNormalizeLetter).filter(Boolean).map(letter => PACE_LETTER_RANK[letter]).sort((a, b) => a - b);
  if (!ranks.length) return '';
  const mid = Math.floor((ranks.length - 1) / 2);
  const rank = ranks[mid];
  return Object.keys(PACE_LETTER_RANK).find(letter => PACE_LETTER_RANK[letter] === rank) || '';
}

function paceActiveLearners(assignment) {
  return (assignment?.learners || []).filter(learner => {
    if (!learner || learner.transferredOutTerm) {
      const outTerm = parseInt(learner?.transferredOutTerm, 10);
      if (Number.isFinite(outTerm) && outTerm < 1) return false;
    }
    return Boolean(learner?.id);
  });
}

function paceTermCells(assignment, learnerId, term, subject) {
  const items = paceCompetenciesFor(paceResolveSubject(assignment, subject), term);
  const cells = [];
  items.forEach(item => {
    paceCellSkills(item, assignment).forEach(skill => {
      cells.push({
        competencyId: item.id,
        skill,
        letter: paceGetRating(assignment, learnerId, item.id, term, skill)
      });
    });
  });
  return cells;
}

function paceTermResult(assignment, learnerId, term, subject) {
  const resolved = paceResolveSubject(assignment, subject);
  const cells = paceTermCells(assignment, learnerId, term, resolved);
  const rated = cells.filter(cell => cell.letter);
  const override = paceNormalizeLetter(paceEnsureStore(assignment).termLetterOverride[paceOverrideKey(learnerId, term, resolved, assignment)]);
  const derived = paceMedianLetter(rated.map(cell => cell.letter));
  const letter = override || derived;
  return {
    letter: letter || null,
    derivedLetter: derived || null,
    override: override || '',
    rated: rated.length,
    expected: cells.length,
    hasData: rated.length > 0 || Boolean(override)
  };
}

function paceSetTermOverride(assignment, learnerId, term, letter, subject) {
  const store = paceEnsureStore(assignment);
  const key = paceOverrideKey(learnerId, term, subject, assignment);
  const next = paceNormalizeLetter(letter);
  if (next) store.termLetterOverride[key] = next;
  else delete store.termLetterOverride[key];
  return next;
}

function paceSetNarrative(assignment, learnerId, term, text, subject) {
  const store = paceEnsureStore(assignment);
  const key = paceOverrideKey(learnerId, term, subject, assignment);
  const next = String(text || '').trim();
  if (next) store.narratives[key] = next;
  else delete store.narratives[key];
  return next;
}

function splitPaceRemarks(text) {
  const raw = String(text || '').trim();
  if (!raw) return { canDo: '', toImprove: '' };
  const parts = raw.split(/\n*(?:Dapat Linangin|What (?:Your Child )?Is Learning To Improve|To improve)\s*[:\-]\s*/i);
  const canDo = String(parts[0] || '')
    .replace(/^(?:Mga Nagagawa|What Your Child Can Do)\s*[:\-]\s*/i, '')
    .trim();
  const toImprove = parts.length > 1 ? parts.slice(1).join('\n').trim() : '';
  return { canDo, toImprove };
}

function paceTermSummaryKey(learnerId, term) {
  return `${learnerId}|${term}`;
}

function paceSetTermSummary(assignment, learnerId, term, canDo, toImprove) {
  const store = paceEnsureStore(assignment);
  const key = paceTermSummaryKey(learnerId, term);
  const nextCan = String(canDo || '').trim();
  const nextImprove = String(toImprove || '').trim();
  if (!nextCan && !nextImprove) {
    delete store.termSummaries[key];
    return { canDo: '', toImprove: '' };
  }
  store.termSummaries[key] = { canDo: nextCan, toImprove: nextImprove };
  return store.termSummaries[key];
}

function paceTermSummary(assignment, learnerId, term, subject) {
  const store = paceEnsureStore(assignment);
  if (!store) return { canDo: '', toImprove: '' };
  const explicit = store.termSummaries[paceTermSummaryKey(learnerId, term)];
  if (explicit && (String(explicit.canDo || '').trim() || String(explicit.toImprove || '').trim())) {
    return { canDo: String(explicit.canDo || ''), toImprove: String(explicit.toImprove || '') };
  }
  let narrative = '';
  if (subject) narrative = store.narratives[paceOverrideKey(learnerId, term, subject, assignment)] || '';
  if (!narrative) {
    const prefix = `${learnerId}|${term}`;
    const match = Object.keys(store.narratives || {}).find(key => key === prefix || key.startsWith(`${prefix}|`));
    if (match) narrative = store.narratives[match];
  }
  return splitPaceRemarks(narrative);
}

function paceClassEligibleLearners(assignment, term) {
  const termNumber = parseInt(term, 10);
  return (assignment?.learners || []).filter(learner => {
    if (!learner?.id) return false;
    if (learner.transferredOutTerm && parseInt(learner.transferredOutTerm, 10) <= termNumber) return false;
    return true;
  });
}

function paceApplyChanges(assignment, changes) {
  const store = paceEnsureStore(assignment);
  const undo = [];
  (changes || []).forEach(change => {
    const key = change.key || paceRatingKey(change.learnerId, change.competencyId, change.term, change.skill);
    const previous = paceNormalizeLetter(store.ratings[key]);
    const next = paceNormalizeLetter(change.next);
    if (previous === next) return;
    undo.push({ key, previous, next });
    if (next) store.ratings[key] = next;
    else delete store.ratings[key];
  });
  if (undo.length) store.undo = undo;
  return undo;
}

function paceUndoLastBulk(assignment) {
  const store = paceEnsureStore(assignment);
  const undo = Array.isArray(store.undo) ? store.undo : [];
  if (!undo.length) return 0;
  undo.forEach(change => {
    if (change.previous) store.ratings[change.key] = change.previous;
    else delete store.ratings[change.key];
  });
  store.undo = [];
  return undo.length;
}

function paceClassSetChanges(assignment, item, term, skill, letter, options) {
  const settings = options && typeof options === 'object' ? options : {};
  const replace = settings.replace === true;
  const next = paceNormalizeLetter(letter);
  if (!item || !next) return [];
  if (typeof paceItemAppliesToTerm === 'function' && !paceItemAppliesToTerm(item, term)) return [];
  const learners = settings.learnerIds
    ? paceClassEligibleLearners(assignment, term).filter(learner => settings.learnerIds.includes(learner.id))
    : paceClassEligibleLearners(assignment, term);
  const changes = [];
  learners.forEach(learner => {
    const current = paceGetRating(assignment, learner.id, item.id, term, skill || '');
    if (!replace && current) return;
    if (current === next) return;
    changes.push({
      key: paceRatingKey(learner.id, item.id, term, skill || ''),
      next
    });
  });
  return changes;
}

function paceClassSet(assignment, item, term, skill, letter, options) {
  return paceApplyChanges(assignment, paceClassSetChanges(assignment, item, term, skill, letter, options));
}

function paceClassSetRemaining(assignment, fromItemIndex, fromSkillIndex, term, letter, options) {
  const items = paceCompetenciesFor(paceResolveSubject(assignment), term);
  const changes = [];
  items.forEach((item, itemIndex) => {
    paceCellSkills(item).forEach((skill, skillIndex) => {
      if (itemIndex < fromItemIndex) return;
      if (itemIndex === fromItemIndex && skillIndex < fromSkillIndex) return;
      changes.push(...paceClassSetChanges(assignment, item, term, skill, letter, options));
    });
  });
  return paceApplyChanges(assignment, changes);
}

function paceFirstUnratedFocus(assignment, term) {
  const items = paceCompetenciesFor(paceResolveSubject(assignment), term);
  for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
    const skills = paceCellSkills(items[itemIndex]);
    for (let skillIndex = 0; skillIndex < skills.length; skillIndex++) {
      const counts = paceLetterCounts(assignment, items[itemIndex], term, skills[skillIndex]);
      if (counts.unrated > 0) return { itemIndex, skillIndex };
    }
  }
  return { itemIndex: 0, skillIndex: 0 };
}

function paceClearRatings(assignment, item, term, skill, learnerIds) {
  if (!item) return [];
  if (typeof paceItemAppliesToTerm === 'function' && !paceItemAppliesToTerm(item, term)) return [];
  const wanted = new Set((learnerIds || []).filter(Boolean));
  const learners = paceClassEligibleLearners(assignment, term).filter(learner => !wanted.size || wanted.has(learner.id));
  const changes = [];
  learners.forEach(learner => {
    const current = paceGetRating(assignment, learner.id, item.id, term, skill || '');
    if (!current) return;
    changes.push({
      key: paceRatingKey(learner.id, item.id, term, skill || ''),
      next: ''
    });
  });
  return paceApplyChanges(assignment, changes);
}

function paceIncrementLearners(assignment, item, term, skill, learnerIds) {
  if (!item) return [];
  const wanted = new Set((learnerIds || []).filter(Boolean));
  const learners = paceClassEligibleLearners(assignment, term).filter(learner => !wanted.size || wanted.has(learner.id));
  const changes = [];
  learners.forEach(learner => {
    const current = paceGetRating(assignment, learner.id, item.id, term, skill || '');
    const next = current ? paceIncrementLetter(current) : '';
    if (!next || next === current) return;
    changes.push({
      key: paceRatingKey(learner.id, item.id, term, skill || ''),
      next
    });
  });
  return paceApplyChanges(assignment, changes);
}

function paceLetterCounts(assignment, item, term, skill) {
  const counts = { A: 0, B: 0, C: 0, D: 0, E: 0, unrated: 0 };
  paceClassEligibleLearners(assignment, term).forEach(learner => {
    const letter = paceGetRating(assignment, learner.id, item?.id, term, skill || '');
    if (letter) counts[letter] += 1;
    else counts.unrated += 1;
  });
  return counts;
}

function paceIsGrade1Assignment(assignment) {
  return parseInt(assignment?.gradeLevel, 10) === 1;
}

function paceCopyYearLongTerm(assignment, fromTerm, toTerm) {
  const subject = paceResolveSubject(assignment);
  if (!paceIsYearLongSubject(subject)) return 0;
  const items = paceCompetenciesFor(subject, fromTerm);
  const changes = [];
  paceClassEligibleLearners(assignment, toTerm).forEach(learner => {
    items.forEach(item => {
      paceCellSkills(item, assignment).forEach(skill => {
        const source = paceGetRating(assignment, learner.id, item.id, fromTerm, skill);
        const dest = paceGetRating(assignment, learner.id, item.id, toTerm, skill);
        if (!source || dest) return;
        changes.push({
          key: paceRatingKey(learner.id, item.id, toTerm, skill),
          next: source
        });
      });
    });
  });
  return paceApplyChanges(assignment, changes).length;
}
