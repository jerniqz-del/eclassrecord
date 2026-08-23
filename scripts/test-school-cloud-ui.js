const assert = require('assert');
const fs = require('fs');
const path = require('path');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

const ui = read('src/renderer/js/school-cloud-ui.js');
const css = read('src/renderer/css/school-cloud.css');
const index = read('src/renderer/index.html');
const preload = read('src/main/preload.js');
const main = read('src/main/main.js');

assert(ui.includes('client().featureStatus()'), 'School Cloud UI is not protected by the feature flag');
assert(ui.includes('type="password" minlength="64" maxlength="64"'), 'sensitive connection and content-key inputs are not masked and bounded');
assert(ui.includes('Personnel Activation Code'), 'personnel activation-code entry is missing');
assert(ui.includes('schoolCloudStorageMode'), 'local-versus-cloud migration choice is missing');
assert(!ui.includes('schoolCloudTeacherEmail'), 'Google/email-bound teacher onboarding remains');
assert(ui.includes('GUIDED SCHOOL SETUP'), 'ICT guided setup is missing');
assert(ui.includes('schoolCloudBootstrapForm'), 'school bootstrap form is missing');
assert(ui.includes('Download Recovery Pack'), 'school recovery-pack handoff is missing');
assert(ui.includes("role() === 'school-ict'"), 'ICT-only teacher account management is missing');
assert(ui.includes("role() === 'school-head'"), 'School Head approval controls are missing');
assert(ui.includes('permanent activation code'), 'permanent personnel-code handoff is missing');
assert(ui.includes('client().decryptEnvelope(approval.envelope'), 'School Head cannot decrypt and review approval details');
assert(ui.includes("state.contentKey && !item.contentError"), 'blind approval is not blocked while encrypted details are locked');
assert(ui.includes('End Other Session &amp; Continue'), 'single-active-admin-session takeover UI is missing');
assert(ui.includes('schoolCloudBackupButton'), 'encrypted backup control is missing');
assert(ui.includes('schoolCloudRestoreButton'), 'encrypted restore control is missing');
assert(ui.includes('state.contentKey = \'\';'), 'school content key is not cleared from renderer memory');
assert(!ui.includes('localStorage'), 'School Cloud UI must not persist credentials in localStorage');
assert(!ui.includes('sessionStorage'), 'School Cloud UI must not persist credentials in sessionStorage');
assert(css.includes('@media (max-width: 980px)'), 'School Cloud UI lacks a narrow-window layout');
assert(index.indexOf('school-cloud-client.js') < index.indexOf('school-cloud-ui.js'), 'School Cloud UI loads before its client');
assert(index.includes('css/school-cloud.css'), 'School Cloud stylesheet is not loaded');
assert(preload.includes('listSchoolCloudConnections'), 'redacted connection discovery is missing from preload');
assert(preload.includes('bootstrapSchoolCloud'), 'secure School Cloud bootstrap bridge is missing from preload');
assert(main.includes("'school-cloud:connections'"), 'redacted connection discovery is missing from main process');
assert(main.includes("'school-cloud:bootstrap'"), 'secure School Cloud bootstrap IPC is missing from main process');

console.log('School Cloud feature-gated administration UI security tests passed.');
