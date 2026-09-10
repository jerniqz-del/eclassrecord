'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const rendererRoot = path.join(root, 'src', 'renderer');
const security = fs.readFileSync(path.join(root, 'src', 'main', 'security-boundary.js'), 'utf8');
const index = fs.readFileSync(path.join(rendererRoot, 'index.html'), 'utf8');

function filesIn(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const resolved = path.join(directory, entry.name);
    return entry.isDirectory() ? filesIn(resolved) : [resolved];
  });
}

const applicationSources = [
  path.join(rendererRoot, 'index.html'),
  ...filesIn(path.join(rendererRoot, 'js')).filter(file => file.endsWith('.js'))
];
const inlineEvent = /<[^>]*\son(?:click|change|contextmenu|dragend|dragleave|dragover|dragstart|drop|input|keydown|keyup)=['"]/i;
const inlineStyle = /<[^>]*\sstyle=['"]/i;

applicationSources.forEach(file => {
  const source = fs.readFileSync(file, 'utf8');
  assert(!inlineEvent.test(source), 'Inline event attribute remains in ' + path.relative(root, file));
  assert(!inlineStyle.test(source), 'Inline style attribute remains in ' + path.relative(root, file));
});

assert(index.includes('css/runtime-generated.css'));
assert(index.includes('js/legacy-markup-runtime.js'));
const markup = fs.readFileSync(path.join(rendererRoot, 'js', 'legacy-markup-runtime.js'), 'utf8');
assert(markup.includes("'electronAPI'"));
assert(markup.includes("BLOCKED_MEMBERS = new Set(['__proto__', 'prototype', 'constructor', 'electronAPI'])"));
assert(markup.includes('function migrateInlineHandlers'), 'compressed modules still emit onclick; runtime must migrate them');
assert(markup.includes('migrateInlineHandlers(root)'), 'inserted Attendance markup must be migrated');
assert(security.includes('"script-src-attr \'none\'"'));
assert(security.includes('"style-src-attr \'none\'"'));
assert(!security.includes('"script-src-attr \'unsafe-inline\'"'));
assert(!/"style-src [^"]*'unsafe-inline'[^"]*https:\/\/fonts\.googleapis\.com"/.test(security));

console.log('Electron Phase 2 inline handler/style migration and strict attribute CSP tests passed.');
