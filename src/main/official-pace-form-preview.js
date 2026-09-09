'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const XLSX = require('xlsx');

const SHEET_NAME = 'PACE - GRADE 1';
const START_ROW = 3;
const END_ROW = 309;
const START_COL = 2;
const END_COL = 17;

let cachedLayout = null;
let cachedCatalog = null;

function templatePath() {
  return path.join(__dirname, '..', 'assets', 'official-ecr', 'grade1-pace-sf9.xlsx');
}

function catalogContext() {
  if (cachedCatalog) return cachedCatalog;
  const sandbox = { console };
  vm.createContext(sandbox);
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, '..', 'renderer', 'js', 'pace-catalog.js'), 'utf8'),
    sandbox
  );
  cachedCatalog = sandbox;
  return sandbox;
}

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function normalizeLabel(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\u00a0/g, ' ')
    .replace(/['’]/g, "'")
    .replace(/sounda/g, 'sounds')
    .replace(/syllabic/g, 'syllable')
    .replace(/naipaliliwanag/g, 'naipaliwanag')
    .replace(/responsable/g, 'responsible')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function encodeAddr(r, c) {
  return XLSX.utils.encode_cell({ r, c });
}

function subjectKeyFromHeader(text) {
  const value = String(text || '').replace(/\s+/g, ' ').trim().toUpperCase();
  if (value === 'READING AND LITERACY') return 'reading';
  if (value === 'LANGUAGE') return 'language';
  if (value === 'MATHEMATICS') return 'mathematics';
  if (value.includes('GOOD MANNERS AND RIGHT CONDUCT')) return 'gmrc';
  if (value === 'MAKABANSA') return 'makabansa';
  return '';
}

function isPageTitle(text) {
  return /PERFORMANCE AND COMPETENCY EVALUATION/i.test(String(text || ''));
}

function isRatingFormula(formula) {
  if (!formula || !/VLOOKUP/i.test(formula)) return false;
  return !/TERM\s*[123]\s+SUMMARY|INPUT DATA/i.test(formula);
}

function termFromFormula(formula, col, termBand) {
  const match = String(formula || '').match(/TERM\s*([123])/i);
  if (match) return match[1];
  if (col === 6 || col === 15) return '1';
  if (col === 7 || col === 16) return '2';
  if (col === 8 || col === 17) return '3';
  return termBand || '';
}

function skillCodesForSubject(subjectKey) {
  if (subjectKey === 'reading') return ['listen', 'speak', 'read', 'write'];
  if (subjectKey === 'language') return ['listen', 'speak'];
  return [];
}

function identityKindFromLabel(text) {
  const value = String(text || '').replace(/:$/, '').trim().toUpperCase();
  if (value === 'LRN') return 'lrn';
  if (value === 'NAME') return 'name';
  if (value === 'SECTION') return 'section';
  return '';
}

function cellRoleFromText(text) {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  if (isPageTitle(value)) return 'title';
  if (subjectKeyFromHeader(value)) return 'subject';
  if (/^Term\s*[123]$/i.test(value)) return 'term-band';
  if (/^(T1|T2|T3)$/i.test(value)) return 'term-head';
  if (/^(No\.|Learning Competencies|Rating|Nililinang na Pagpapahalaga|Performance Standard)$/i.test(value)) {
    return 'col-head';
  }
  return '';
}

function findCatalogItem(subjectKey, term, number, label) {
  const catalog = catalogContext();
  const subject = catalog.PACE_GRADE1_CATALOG && catalog.PACE_GRADE1_CATALOG.subjects
    ? catalog.PACE_GRADE1_CATALOG.subjects[subjectKey]
    : null;
  if (!subject) return null;
  const termNum = Number(term) || 0;
  const items = subject.items.filter(item => !item.terms || !item.terms.length || item.terms.includes(termNum));
  const numbered = items.filter(item => Number(item.number) === Number(number));
  if (numbered.length === 1) return numbered[0];
  const query = normalizeLabel(String(label || '').replace(/^[a-g]\.\s*/i, ''));
  const pool = numbered.length ? numbered : items;
  let best = null;
  let bestScore = 0;
  for (const item of pool) {
    const candidates = [item.title].concat(item.details || []);
    for (const candidate of candidates) {
      const normalized = normalizeLabel(candidate);
      if (!normalized || !query) continue;
      let score = 0;
      if (normalized === query) score = 1000 + normalized.length;
      else if (query.startsWith(normalized) || normalized.startsWith(query)) score = 500 + Math.min(normalized.length, query.length);
      else if (query.slice(0, 24) === normalized.slice(0, 24) && query.length >= 18) score = 300;
      else if (normalized.includes(query) || query.includes(normalized)) score = 200 + Math.min(normalized.length, query.length);
      if (score > bestScore) {
        bestScore = score;
        best = item;
      }
    }
  }
  if (bestScore >= 200) return best;
  return numbered[0] || null;
}

function detailSkillFor(item, label, rowOffset, subjectKey) {
  const raw = String(label || '').trim();
  const lettered = raw.match(/^([a-g])\.\s*/i);
  if (item && Array.isArray(item.details) && item.details.length > 1) {
    if (lettered) return lettered[1].toLowerCase();
    const query = normalizeLabel(raw.replace(/^[a-g]\.\s*/i, ''));
    for (let index = 0; index < item.details.length; index += 1) {
      const detail = normalizeLabel(item.details[index]);
      if (!detail || !query) continue;
      if (query === detail || query.startsWith(detail) || detail.startsWith(query) || query.includes(detail) || detail.includes(query)) {
        return String.fromCharCode(97 + index);
      }
    }
  }
  if (lettered) return '';
  const codes = skillCodesForSubject(subjectKey);
  return codes[rowOffset] || '';
}

function buildMergeIndex(merges) {
  const skip = new Set();
  const origin = new Map();
  (merges || []).forEach(merge => {
    const startR = merge.s.r;
    const startC = merge.s.c;
    const endR = merge.e.r;
    const endC = merge.e.c;
    origin.set(`${startR},${startC}`, {
      r: startR,
      c: startC,
      er: endR,
      ec: endC,
      rs: endR - startR + 1,
      cs: endC - startC + 1
    });
    for (let row = startR; row <= endR; row += 1) {
      for (let col = startC; col <= endC; col += 1) {
        if (row === startR && col === startC) continue;
        skip.add(`${row},${col}`);
      }
    }
  });
  return { skip, origin };
}

function mergeAt(index, row, col) {
  return index.origin.get(`${row},${col}`) || {
    r: row,
    c: col,
    er: row,
    ec: col,
    rs: 1,
    cs: 1
  };
}

function coveringMerge(merges, row, col) {
  for (let i = 0; i < (merges || []).length; i += 1) {
    const merge = merges[i];
    if (merge.s.r <= row && merge.e.r >= row && merge.s.c <= col && merge.e.c >= col) {
      return {
        r: merge.s.r,
        c: merge.s.c,
        er: merge.e.r,
        ec: merge.e.c,
        rs: merge.e.r - merge.s.r + 1,
        cs: merge.e.c - merge.s.c + 1
      };
    }
  }
  return { r: row, c: col, er: row, ec: col, rs: 1, cs: 1 };
}

function displayValue(sheet, row, col) {
  const cell = sheet[encodeAddr(row, col)];
  if (!cell) return { v: '', f: '' };
  return {
    v: cell.v == null ? '' : String(cell.v),
    f: cell.f ? String(cell.f) : ''
  };
}

function usesRightBlock(subjectKey, col) {
  return col >= 15 && (subjectKey === 'reading' || subjectKey === 'language');
}

function labelForRating(sheet, merges, row, col, subjectKey) {
  const isRight = usesRightBlock(subjectKey, col);
  const labelCols = isRight ? [11, 12, 13, 14] : [3, 4, 5, 6];
  for (let cursor = row; cursor >= Math.max(START_ROW, row - 8); cursor -= 1) {
    for (let i = 0; i < labelCols.length; i += 1) {
      const covered = coveringMerge(merges, cursor, labelCols[i]);
      const displayed = displayValue(sheet, covered.r, covered.c);
      const text = String(displayed.v || '').trim();
      if (!text) continue;
      if (/^(t1|t2|t3|rating|no\.?|learning competencies)$/i.test(text)) continue;
      if (/^\d+$/.test(text)) continue;
      return { text, origin: covered, rowOffset: row - covered.r };
    }
  }
  return { text: '', origin: { r: row, c: col, rs: 1 }, rowOffset: 0 };
}

function numberForRating(sheet, merges, row, col, subjectKey) {
  const isRight = usesRightBlock(subjectKey, col);
  const numberCol = isRight ? 10 : 2;
  for (let cursor = row; cursor >= Math.max(START_ROW, row - 36); cursor -= 1) {
    const covered = coveringMerge(merges, cursor, numberCol);
    const displayed = displayValue(sheet, covered.r, covered.c);
    const text = String(displayed.v || '').trim();
    if (/^\d+$/.test(text)) return text;
  }
  return '';
}

function extractLayout() {
  const workbook = XLSX.readFile(templatePath(), { cellFormula: true });
  const sheet = workbook.Sheets[SHEET_NAME];
  if (!sheet) throw new Error('Official Grade 1 pack is missing the PACE - GRADE 1 sheet.');
  const merges = sheet['!merges'] || [];
  const index = buildMergeIndex(merges);
  const cells = [];
  const ratingCells = [];
  const identity = [];
  let subjectKey = '';
  let termBand = '';

  for (let row = START_ROW; row <= END_ROW; row += 1) {
    const header = displayValue(sheet, row, START_COL);
    const headerKey = subjectKeyFromHeader(header.v);
    if (headerKey) subjectKey = headerKey;
    if (/^Term\s*([123])$/i.test(String(header.v || '').trim())) {
      termBand = String(header.v).replace(/\D/g, '') || termBand;
    }
    for (let col = START_COL; col <= END_COL; col += 1) {
      const key = `${row},${col}`;
      if (index.skip.has(key)) continue;
      const span = mergeAt(index, row, col);
      const displayed = displayValue(sheet, row, col);
      const kind = identityKindFromLabel(displayed.v);
      if (kind) {
        let targetCol = col + 1;
        while (targetCol <= END_COL && index.skip.has(`${row},${targetCol}`)) targetCol += 1;
        identity.push({ kind, r: row, c: targetCol });
      }
      const rating = isRatingFormula(displayed.f);
      const record = {
        r: row,
        c: col,
        rs: span.rs,
        cs: span.cs,
        v: displayed.v,
        f: displayed.f,
        role: cellRoleFromText(displayed.v),
        kind: rating ? 'rating' : '',
        competencyId: '',
        term: '',
        skill: '',
        subjectKey
      };
      if (rating) {
        const term = termFromFormula(displayed.f, col, termBand);
        const label = labelForRating(sheet, merges, row, col, subjectKey);
        const number = numberForRating(sheet, merges, row, col, subjectKey);
        const item = findCatalogItem(subjectKey, term, number, label.text);
        record.kind = 'rating';
        record.term = term;
        record.competencyId = item ? item.id : '';
        record.skill = item ? detailSkillFor(item, label.text, label.rowOffset, subjectKey) : '';
        record.role = 'rating';
        ratingCells.push({
          addr: encodeAddr(row, col),
          r: row,
          c: col,
          competencyId: record.competencyId,
          term: record.term,
          skill: record.skill,
          subjectKey
        });
      }
      cells.push(record);
    }
  }

  identity.forEach(entry => {
    const cell = cells.find(item => item.r === entry.r && item.c === entry.c);
    if (cell) {
      cell.kind = entry.kind;
      cell.role = entry.kind;
    }
  });

  return {
    startRow: START_ROW,
    endRow: END_ROW,
    startCol: START_COL,
    endCol: END_COL,
    cells,
    ratingCells
  };
}

function getOfficialPaceFormLayout() {
  if (!cachedLayout) cachedLayout = extractLayout();
  return cachedLayout;
}

function schoolHeadMarkup(overlay) {
  const data = overlay || {};
  const school = String(data.school || data.schoolName || '').trim();
  const schoolId = String(data.schoolID || data.schoolId || '').trim();
  return `<header class="official-pace-school-head">
    <p class="official-pace-school" data-pace-kind="school">${escapeHtml(school)}</p>
    <p class="official-pace-school-label">School</p>
    <p class="official-pace-school-id" data-pace-kind="school-id">${escapeHtml(schoolId)}</p>
  </header>`;
}

function overlayValue(cell, overlay) {
  const data = overlay || {};
  if (cell.kind === 'lrn') return data.lrn || '';
  if (cell.kind === 'name') return data.name || '';
  if (cell.kind === 'section') return data.section || '';
  if (cell.kind === 'school') return data.school || data.schoolName || '';
  if (cell.kind === 'rating') {
    const addr = encodeAddr(cell.r, cell.c);
    const letters = data.letters || {};
    return letters[addr] || '';
  }
  if (cell.f) return '';
  return cell.v || '';
}

function cellClass(cell) {
  const roles = ['official-pace-cell'];
  if (cell.role) roles.push(`is-${cell.role}`);
  if (cell.kind && cell.kind !== cell.role) roles.push(`is-${cell.kind}`);
  return roles.join(' ');
}

function renderCell(cell, overlay) {
  const value = overlayValue(cell, overlay);
  const letterClass = cell.kind === 'rating' && value ? ` is-letter-${escapeHtml(value)}` : '';
  const attrs = [`class="${cellClass(cell)}${letterClass}"`];
  if (cell.rs > 1) attrs.push(`rowspan="${cell.rs}"`);
  if (cell.cs > 1) attrs.push(`colspan="${cell.cs}"`);
  if (cell.kind) attrs.push(`data-pace-kind="${escapeHtml(cell.kind)}"`);
  if (cell.kind === 'rating') {
    attrs.push(`data-pace-addr="${encodeAddr(cell.r, cell.c)}"`);
    if (cell.competencyId) attrs.push(`data-pace-id="${escapeHtml(cell.competencyId)}"`);
    if (cell.term) attrs.push(`data-pace-term="${escapeHtml(cell.term)}"`);
    attrs.push(`data-pace-skill="${escapeHtml(cell.skill || '')}"`);
    if (cell.competencyId) {
      attrs.push(`data-eclass-onclick="paceSelectOfficialFormCell('${escapeHtml(cell.competencyId)}','${escapeHtml(cell.term)}','${escapeHtml(cell.skill || '')}')"`);
    }
  }
  return `<td ${attrs.filter(Boolean).join(' ')}>${escapeHtml(value)}</td>`;
}

function renderOfficialPaceFormHtml(layout, overlay) {
  const source = layout || getOfficialPaceFormLayout();
  const byRow = new Map();
  source.cells.forEach(cell => {
    if (!byRow.has(cell.r)) byRow.set(cell.r, []);
    byRow.get(cell.r).push(cell);
  });
  const pages = [];
  let current = [];
  for (let row = source.startRow; row <= source.endRow; row += 1) {
    const rowCells = byRow.get(row) || [];
    const titleCell = rowCells.find(cell => cell.c === source.startCol && isPageTitle(cell.v));
    if (titleCell && current.length) {
      pages.push(current);
      current = [];
    }
    current.push({ row, cells: rowCells });
  }
  if (current.length) pages.push(current);

  const pageMarkup = pages.map(page => {
    const rows = page.map(entry => {
      const tds = entry.cells.map(cell => renderCell(cell, overlay)).join('');
      return `<tr>${tds}</tr>`;
    }).join('');
    return `<section class="official-pace-page"><table class="official-pace-sheet">${rows}</table></section>`;
  }).join('');

  return `<div class="official-pace-form">${schoolHeadMarkup(overlay)}${pageMarkup}</div>`;
}

function renderOfficialPaceForm(overlay) {
  return {
    html: renderOfficialPaceFormHtml(getOfficialPaceFormLayout(), overlay || {})
  };
}

module.exports = {
  templatePath,
  getOfficialPaceFormLayout,
  renderOfficialPaceFormHtml,
  renderOfficialPaceForm
};
