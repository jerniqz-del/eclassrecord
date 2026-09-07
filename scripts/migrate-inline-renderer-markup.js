'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const rendererRoot = path.join(root, 'src', 'renderer');
const eventNames = [
  'click', 'change', 'contextmenu', 'dragend', 'dragleave',
  'dragover', 'dragstart', 'drop', 'input', 'keydown', 'keyup'
];

function filesIn(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const resolved = path.join(directory, entry.name);
    if (entry.isDirectory()) return filesIn(resolved);
    return [resolved];
  });
}

function migrate(content) {
  let result = content;
  eventNames.forEach(eventName => {
    const rollback = new RegExp('(\\s)data-eclass-on' + eventName + '(\\s*=)', 'g');
    result = result.replace(rollback, '$1on' + eventName + '$2');
    const expression = new RegExp('(<[^>]*\\s)on' + eventName + '=([' + "'\\\"" + '])', 'g');
    result = result.replace(expression, '$1data-eclass-on' + eventName + '=$2');
  });
  result = result.replace(/(\s)data-eclass-style(\s*=)/g, '$1style$2');
  result = result.replace(/(<[^>]*\s)style=(['"])/g, '$1data-eclass-style=$2');
  return result;
}

function main() {
  const write = process.argv.includes('--write');
  const targets = [
    path.join(rendererRoot, 'index.html'),
    ...filesIn(path.join(rendererRoot, 'js')).filter(file => file.endsWith('.js'))
  ];
  let changed = 0;
  targets.forEach(file => {
    const before = fs.readFileSync(file, 'utf8');
    const after = migrate(before);
    if (before === after) return;
    changed += 1;
    if (write) fs.writeFileSync(file, after);
  });
  console.log(JSON.stringify({ write, scanned: targets.length, changed }, null, 2));
  if (!write && changed) process.exitCode = 1;
}

main();
