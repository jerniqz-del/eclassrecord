'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { createZip } = require('./zip-archive');
const { fillWordXml } = require('../renderer/js/pace-form-export');

function templatePath() {
  return path.join(__dirname, 'templates', 'pace-form-individual.docx');
}

function walkFiles(dir, base = dir, acc = []) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(full, base, acc);
    else acc.push(path.relative(base, full).replace(/\\/g, '/'));
  });
  return acc;
}

function fillPaceFormDocx(replacements) {
  const source = templatePath();
  if (!fs.existsSync(source)) throw new Error('The Individual PACE Form template is missing.');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pace-form-'));
  try {
    execFileSync('tar', ['-xf', source, '-C', tmp]);
    const docPath = path.join(tmp, 'word', 'document.xml');
    const xml = fs.readFileSync(docPath, 'utf8');
    fs.writeFileSync(docPath, fillWordXml(xml, replacements || {}), 'utf8');
    const files = walkFiles(tmp).map(name => ({
      name,
      content: fs.readFileSync(path.join(tmp, name))
    }));
    return createZip(files);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

module.exports = { fillPaceFormDocx, templatePath };
