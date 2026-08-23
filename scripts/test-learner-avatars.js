const assert = require('assert');
const fs = require('fs');
const path = require('path');
const avatars = require('../src/renderer/js/learner-avatars.js');

const root = path.resolve(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const learners = (count, sex, prefix = sex || 'neutral') => Array.from({ length: count }, (_, index) => ({
  id: `${prefix}-${index + 1}`,
  lrn: String(100000000000 + index),
  firstName: `Learner ${index + 1}`,
  lastName: prefix,
  sex
}));

assert.strictEqual(avatars.MALE_IDS.length, 50, 'Male avatar library must contain 50 presets.');
assert.strictEqual(avatars.FEMALE_IDS.length, 50, 'Female avatar library must contain 50 presets.');
assert.strictEqual(new Set(avatars.MALE_IDS).size, 50, 'Male avatar IDs must be unique.');
assert.strictEqual(new Set(avatars.FEMALE_IDS).size, 50, 'Female avatar IDs must be unique.');
assert.strictEqual(avatars.presets('').length, 1, 'Unspecified sex must use one neutral fallback.');

const maleRoster = learners(50, 'M', 'male');
const femaleRoster = learners(50, 'F', 'female');
avatars.assignRoster(maleRoster);
avatars.assignRoster(femaleRoster);
assert.strictEqual(new Set(maleRoster.map(item => item.avatarPresetId)).size, 50);
assert.strictEqual(new Set(femaleRoster.map(item => item.avatarPresetId)).size, 50);
assert(maleRoster.every(item => avatars.categoryForId(item.avatarPresetId) === 'M'));
assert(femaleRoster.every(item => avatars.categoryForId(item.avatarPresetId) === 'F'));

const overflowRoster = learners(51, 'M', 'overflow');
avatars.assignRoster(overflowRoster);
assert.strictEqual(new Set(overflowRoster.map(item => item.avatarPresetId)).size, 50,
  'Avatar presets may repeat only after all 50 in the matching category are used.');

const neutral = { id: 'neutral-1', sex: '' };
avatars.assignRoster([neutral]);
assert.strictEqual(neutral.avatarPresetId, avatars.NEUTRAL_ID);

const stableRoster = learners(12, 'F', 'stable');
avatars.assignRoster(stableRoster);
const firstAssignment = stableRoster.map(item => item.avatarPresetId);
avatars.assignRoster(stableRoster);
assert.deepStrictEqual(stableRoster.map(item => item.avatarPresetId), firstAssignment,
  'Automatic avatar assignment must remain stable.');

const automatic = { id: 'sex-change', sex: 'M' };
avatars.assignRoster([automatic]);
automatic.sex = 'F';
avatars.assignRoster([automatic]);
assert.strictEqual(avatars.categoryForId(automatic.avatarPresetId), 'F',
  'Automatic avatars must follow a corrected learner sex.');

const manual = { id: 'manual-choice', sex: 'M' };
avatars.setManualPreset(manual, avatars.FEMALE_IDS[7]);
manual.sex = 'F';
avatars.assignRoster([manual]);
assert.strictEqual(manual.avatarPresetId, avatars.FEMALE_IDS[7],
  'A valid manual choice must remain unchanged.');

const existingRoster = learners(5, 'M', 'existing');
avatars.assignRoster(existingRoster);
const existingIds = existingRoster.map(item => item.avatarPresetId);
const newcomer = { id: 'newcomer', sex: 'M' };
avatars.assignNewLearner(newcomer, existingRoster);
assert.deepStrictEqual(existingRoster.map(item => item.avatarPresetId), existingIds,
  'Previewing a new learner must not modify the existing roster.');
assert(!existingIds.includes(newcomer.avatarPresetId),
  'A new learner should avoid an already-used preset while capacity remains.');

const sharedLrn = '123456789012';
const profile = {
  assignments: [
    { learners: [{ id: 'linked-source', lrn: sharedLrn, sex: 'M' }] },
    { learners: [{ id: 'linked-copy', lrn: sharedLrn, sex: 'M' }] }
  ],
  advisory: {
    learners: [{ id: 'linked-advisory', linkedLearnerId: 'linked-source', lrn: sharedLrn, sex: 'M' }]
  }
};
avatars.assignDatabase(profile);
const sharedIds = [
  profile.assignments[0].learners[0].avatarPresetId,
  profile.assignments[1].learners[0].avatarPresetId,
  profile.advisory.learners[0].avatarPresetId
];
assert.strictEqual(new Set(sharedIds).size, 1,
  'The same LRN must keep the same avatar across class and Advisory records.');

const rendered = avatars.renderLearner(maleRoster[0], { size: 'sm', decorative: false });
assert(rendered.includes('<svg') && rendered.includes('data-avatar-id="male-avatar-'));
assert(!/<script|onerror=|javascript:/i.test(rendered), 'Rendered avatar markup must remain inert.');

const indexSource = read('src/renderer/index.html');
const databaseSource = read('src/renderer/js/database.js');
const learnerSource = read('src/renderer/js/learners.js');
const componentStyles = read('src/renderer/css/components.css');
const transferSource = read('src/renderer/js/import-export.js');
const mobileSyncSource = read('src/renderer/js/mobile-sync.js')
  + read('src/renderer/js/mobile-sync-companion.js');
const recordSource = read('src/renderer/js/record-table.js');
const toolsSource = read('src/renderer/js/teacher-tools.js');
const mainSource = read('src/main/main.js');

assert(indexSource.includes('css/learner-avatars.css') && indexSource.includes('js/learner-avatars.js'));
assert(databaseSource.includes('LearnerAvatars.assignDatabase(db)'));
assert(learnerSource.includes('addLearnerAvatarPicker') && learnerSource.includes('editLearnerAvatarPicker'));
const addLearnerModalSource = learnerSource.slice(
  learnerSource.indexOf('function showAddLearnerModal()'),
  learnerSource.indexOf('function sortLearners()')
);
assert(addLearnerModalSource.includes('class="modal learner-manage-modal"'),
  'The Add Learner modal must keep its expanded avatar picker inside a scrollable dialog.');
assert(/\.learner-manage-modal \.modal__body\s*\{[^}]*overflow-y:\s*auto;/s.test(componentStyles),
  'Learner modal bodies must remain vertically scrollable.');
assert(transferSource.includes('avatarPresetId') && transferSource.includes('avatarAssignment'));
assert(mobileSyncSource.includes('avatarPresetId') && mobileSyncSource.includes('avatarAssignment'));
assert(recordSource.includes('LearnerAvatars.renderLearner'));
assert(toolsSource.includes('function learnerAvatar('));
assert(mainSource.includes("'LearnerAvatars'") && mainSource.includes('learnerAvatars: true'));

console.log('Learner avatar tests passed.');
