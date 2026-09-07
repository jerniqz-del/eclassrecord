const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

const helper = read('android', 'app', 'src', 'main', 'java', 'com', 'example', 'eclassrecordmobile', 'data', 'DatabaseHelper.kt');
const model = read('android', 'app', 'src', 'main', 'java', 'com', 'example', 'eclassrecordmobile', 'data', 'DataModel.kt');
const sync = read('android', 'app', 'src', 'main', 'java', 'com', 'example', 'eclassrecordmobile', 'ui', 'SyncScreen.kt');
const review = read('android', 'app', 'src', 'main', 'java', 'com', 'example', 'eclassrecordmobile', 'ui', 'PushChangeReviewDialog.kt');
const lan = read('android', 'app', 'src', 'main', 'java', 'com', 'example', 'eclassrecordmobile', 'data', 'LanSyncManager.kt');
const ble = read('android', 'app', 'src', 'main', 'java', 'com', 'example', 'eclassrecordmobile', 'data', 'BleServerManager.kt');

assert.match(model, /data class PendingChangeReviewItem/);
assert.match(model, /val affectsExisting: Boolean/);
assert.match(model, /data class PendingChangeReview/);
assert.match(helper, /AUTHORITATIVE_FILE_NAME/);
assert.match(helper, /private var lastAuthoritative: SyncPayload\?/);
assert.match(helper, /fun reviewPendingChanges\(\): PendingChangeReview/);
assert.match(helper, /fun pendingChanges\(changeIds: Collection<String>\? = null\)/);
assert.match(helper, /previous\.isNotBlank\(\) && previous != next/);
assert.match(helper, /field = field/);
assert.match(helper, /saveAuthoritativeSnapshot/);
assert.match(review, /Review mobile changes/);
assert.match(review, /Safe to add/);
assert.match(review, /May affect already written data/);
assert.match(review, /These write into empty scores/);
assert.match(review, /These replace a score, attendance mark, calendar event/);
assert.match(sync, /beginPushReview/);
assert.match(sync, /showPushReview/);
assert.match(sync, /selectedPushChangeIds = review\.safe\.map/);
assert.match(sync, /PushChangeReviewDialog/);
assert.match(sync, /Back to review/);
assert.match(sync, /selectedPushChangeIds/);
assert.match(lan, /changeIds: Collection<String>\? = null/);
assert.match(lan, /DatabaseHelper\.pendingChanges\(changeIds\)/);
assert.match(ble, /changeIds: Collection<String>\? = null/);
assert.match(ble, /DatabaseHelper\.pendingChanges\(changeIds\)/);
assert.match(sync, /LanSyncManager\.pushChanges\([\s\S]*selectedPushChangeIds/);
assert.match(sync, /syncScoresToDesktop\([\s\S]*if \(pushPinRequired\) pushPin else ""/);

console.log('Mobile push review tests passed.');
