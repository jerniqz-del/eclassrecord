'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const manifest = require('../config/electron-phase0-rollback-artifact.json');
const packageJson = require('../package.json');

const errors = [];
if (packageJson.version !== manifest.appVersion) {
  errors.push(`Application version is ${packageJson.version}; rollback manifest expects ${manifest.appVersion}.`);
}

for (const artifact of manifest.artifacts) {
  const target = path.resolve(root, artifact.path);
  const relative = path.relative(root, target);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    errors.push(`Artifact path escapes the repository: ${artifact.path}`);
    continue;
  }
  if (!fs.existsSync(target)) {
    errors.push(`Missing artifact: ${artifact.path}`);
    continue;
  }
  const contents = fs.readFileSync(target);
  const digest = crypto.createHash('sha256').update(contents).digest('hex');
  if (contents.length !== artifact.bytes) errors.push(`${artifact.path} size differs: ${contents.length} != ${artifact.bytes}.`);
  if (digest !== artifact.sha256) errors.push(`${artifact.path} SHA-256 differs: ${digest} != ${artifact.sha256}.`);
}

if (errors.length) {
  console.error('Phase 0 rollback artifact verification failed:');
  errors.forEach(error => console.error(`- ${error}`));
  process.exit(1);
}

console.log(`Verified ${manifest.artifacts.length} v${manifest.appVersion} rollback artifacts by size and SHA-256${manifest.signed ? '.' : ' (unsigned baseline).'}`);
