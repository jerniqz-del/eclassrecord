const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const ble = read('android', 'app', 'src', 'main', 'java', 'com', 'example', 'eclassrecordmobile', 'data', 'BleServerManager.kt');
const navigation = read('android', 'app', 'src', 'main', 'java', 'com', 'example', 'eclassrecordmobile', 'Navigation.kt');
const grading = read('android', 'app', 'src', 'main', 'java', 'com', 'example', 'eclassrecordmobile', 'ui', 'ClassDetailScreen.kt');
const quickGrade = read('android', 'app', 'src', 'main', 'java', 'com', 'example', 'eclassrecordmobile', 'ui', 'ScoreEntryScreen.kt');
const subjects = read('android', 'app', 'src', 'main', 'java', 'com', 'example', 'eclassrecordmobile', 'ui', 'main', 'SubjectVisuals.kt');

assert.match(ble, /val wasAuthorized = isAuthorized/);
assert.match(ble, /if \(!wasAuthorized\) \{/);
assert.match(ble, /connectionProgress = 1\s+connectionProgressLabel = "Receiving desktop records"/);
assert.match(ble, /receivedRatio \* 94/);
assert.match(navigation, /contentWindowInsets = WindowInsets\(0, 0, 0, 0\)/);
assert.match(navigation, /statusBarsPadding\(\)/);
assert.match(navigation, /if \(!imeVisible && !fluid\.useRailNavigation\) \{\s*PersistentAppDock/);
assert.doesNotMatch(quickGrade, /\.imePadding\(\)/);
assert.match(quickGrade, /delay\(450\)/);
assert.match(quickGrade, /LaunchedEffect\(textState\.text, currentIndex\)/);
assert.doesNotMatch(navigation, /key\(liveDataRevision\)/);
assert.match(quickGrade, /rememberSaveable\(assignmentId, assessmentId\)/);
assert.match(quickGrade, /currentIndex\.coerceIn/);
assert.match(quickGrade, /LazyColumn\(\s*modifier = Modifier\s*\.fillMaxWidth\(\)\s*\.weight\(1f\)/);
assert.match(grading, /modifier = Modifier.weight\(1f\).fillMaxWidth\(\)/);
assert.match(grading, /LazyColumn\(modifier = Modifier.weight\(1f\).fillMaxWidth\(\)\)/);
assert.match(grading, /listOf\("Assessments", "Individual", "Grid", "Summary"\)/);
assert.match(grading, /centered = true/);
assert.match(grading, /contentAlignment = if \(header \|\| centered\) Alignment\.Center/);
assert.match(subjects, /subjectIconWithoutWhiteBackground/);
assert.match(subjects, /background\.forEachIndexed/);

console.log('Mobile UI refinement tests passed.');
