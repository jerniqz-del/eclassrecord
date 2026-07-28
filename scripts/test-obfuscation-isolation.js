const assert = require('assert');
const path = require('path');
const { getIdentifiersPrefix } = require('./obfuscate');

const sourceRoot = path.resolve(__dirname, '../src');
const firstFile = path.join(sourceRoot, 'renderer/js/integrity.js');
const secondFile = path.join(sourceRoot, 'renderer/js/teacher-tools-core.js');

const firstPrefix = getIdentifiersPrefix(sourceRoot, firstFile);
const repeatedPrefix = getIdentifiersPrefix(sourceRoot, firstFile);
const secondPrefix = getIdentifiersPrefix(sourceRoot, secondFile);

assert.match(firstPrefix, /^_ecr_[a-f0-9]{12}_$/);
assert.strictEqual(firstPrefix, repeatedPrefix, 'A file must receive a stable identifier prefix.');
assert.notStrictEqual(
  firstPrefix,
  secondPrefix,
  'Separately obfuscated scripts must not share generated helper identifiers.'
);

console.log('Obfuscation isolation tests passed.');
