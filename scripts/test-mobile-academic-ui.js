const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const workspace = read('android', 'app', 'src', 'main', 'java', 'com', 'example', 'eclassrecordmobile', 'ui', 'AcademicWorkspace.kt');
const feature = read('android', 'app', 'src', 'main', 'java', 'com', 'example', 'eclassrecordmobile', 'ui', 'DesktopFeatureScreen.kt');
const gradingDetail = read('android', 'app', 'src', 'main', 'java', 'com', 'example', 'eclassrecordmobile', 'ui', 'ClassDetailScreen.kt');
const main = read('android', 'app', 'src', 'main', 'java', 'com', 'example', 'eclassrecordmobile', 'ui', 'main', 'PremiumMainScreen.kt');

assert.match(feature, /ModernCalendarScreen/);
assert.match(feature, /ModernAttendanceScreen/);
assert.match(workspace, /fun ModernCalendarScreen/);
assert.match(workspace, /val days = \(0 until 42\)/);
assert.match(workspace, /Previous month/);
assert.match(workspace, /event dot/);
assert.match(workspace, /fun ModernAttendanceScreen/);
assert.match(workspace, /Mark everyone present/);
assert.match(workspace, /Find learner/);
assert.match(workspace, /listOf\("present" to "Present", "absent" to "Absent", "tardy" to "Late", "excused" to "Excused"\)/);
assert.match(workspace, /fun ModernClassesTab/);
assert.match(workspace, /Search subject, grade, or section/);
assert.match(workspace, /Grading completion/);
assert.match(workspace, /fun ModernGradingTab/);
assert.match(workspace, /Needs attention/);
assert.match(workspace, /Continue unfinished scores/);
assert.match(main, /ModernClassesTab/);
assert.match(main, /ModernGradingTab/);
assert.match(gradingDetail, /sheet-detail-completion/);
assert.match(gradingDetail, /grading-sheet-mode/);
assert.match(gradingDetail, /slideInHorizontally/);

console.log('Modern Calendar, Attendance, Classes, and Grading UI tests passed.');
