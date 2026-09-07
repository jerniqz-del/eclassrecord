'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const baseline = require('../config/electron-modernization-schema-baseline.json');

function source(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function numericConstant(relativePath, expression, label) {
  const match = source(relativePath).match(expression);
  if (!match) throw new Error(`Could not locate ${label} in ${relativePath}.`);
  return Number(match[1]);
}

const checks = [
  ['databaseProfile', 'src/renderer/js/database.js', /const DB_VERSION = (\d+);/, 'DB_VERSION'],
  ['databaseRoot', 'src/renderer/js/database.js', /const ROOT_DB_VERSION = (\d+);/, 'ROOT_DB_VERSION'],
  ['backupEnvelope', 'src/renderer/js/security.js', /const BACKUP_FORMAT_VERSION = (\d+);/, 'BACKUP_FORMAT_VERSION'],
  ['advisory', 'src/renderer/js/advisory-data.js', /const ADVISORY_SCHEMA_VERSION = (\d+);/, 'ADVISORY_SCHEMA_VERSION'],
  ['teacherTools', 'src/renderer/js/teacher-tools-core.js', /const TOOLS_SCHEMA_VERSION = (\d+);/, 'TOOLS_SCHEMA_VERSION'],
  ['profileDeletionBackup', 'src/renderer/js/profile-management.js', /const PROFILE_BACKUP_VERSION = (\d+);/, 'PROFILE_BACKUP_VERSION'],
  ['mobileSnapshot', 'src/renderer/js/mobile-sync-companion.js', /formatVersion:\s*(\d+),/, 'mobile snapshot formatVersion'],
  ['mobileUpdateManifest', 'src/main/mobile-update-channel.js', /schemaVersion:\s*(\d+),/, 'mobile update schemaVersion'],
];

const errors = [];
for (const [key, file, expression, label] of checks) {
  const actual = numericConstant(file, expression, label);
  const expected = baseline.versions[key];
  if (actual !== expected) errors.push(`${label} changed from ${expected} to ${actual}.`);
}

const databaseSource = source('src/renderer/js/database.js');
if (!databaseSource.includes('Number(db.version) > DB_VERSION')) {
  errors.push('Profile database future-version rejection guard is missing.');
}
if (!databaseSource.includes('Number(dbRoot.version) > ROOT_DB_VERSION')) {
  errors.push('Root database future-version rejection guard is missing.');
}

if (errors.length) {
  console.error('Electron modernization migration safety gate failed:');
  errors.forEach(error => console.error(`- ${error}`));
  console.error(baseline.changePolicy);
  process.exit(1);
}

console.log(`Migration safety gate passed for ${checks.length} persisted formats (v${baseline.baselineAppVersion} baseline).`);
