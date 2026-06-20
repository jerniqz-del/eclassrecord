/**
 * E-Class Record — Electron SF1 Reader Module
 *
 * Parses Excel files (.xlsx, .xls) and delimited text files (.csv, .txt)
 * into a standard 2D table array.
 */

const XLSX = require('xlsx');
const fs = require('fs');

/**
 * Parses a CSV line respecting quotes.
 * @param {string} line A single line text from a CSV file.
 * @returns {string[]} Array of fields.
 */
function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line.charAt(i);
    if (ch === '"') {
      if (inQuote && line.charAt(i + 1) === '"') {
        cur += '"';
        i++;
      } else {
        inQuote = !inQuote;
      }
    } else if (ch === ',' && !inQuote) {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

/**
 * Parses a plain text delimited file.
 * @param {string} text File content.
 * @returns {string[][]} 2D array.
 */
function readDelimitedTable(text) {
  const rows = [];
  const lines = text.replace(/\r/g, '').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === '') continue;
    rows.push(parseCsvLine(line));
  }
  return rows;
}

/**
 * Reads an SF1 file and parses it into a 2D array.
 * @param {string} filePath Absolute path to the file.
 * @returns {string[][]} The parsed table.
 */
function readSf1Table(filePath) {
  const lower = filePath.toLowerCase();
  
  if (lower.endsWith('.csv') || lower.endsWith('.txt')) {
    try {
      const workbook = XLSX.readFile(filePath);
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      return XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false, defval: '' });
    } catch (e) {
      console.warn('XLSX failed to parse delimited file, falling back to manual parser:', e);
      const content = fs.readFileSync(filePath, 'utf8');
      return readDelimitedTable(content);
    }
  }

  // Read Excel file
  const workbook = XLSX.readFile(filePath);
  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];
  return XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false, defval: '' });
}

module.exports = {
  readSf1Table
};
