const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const mainSource = fs.readFileSync(path.join(root, 'src', 'main', 'main.js'), 'utf8');
const printCss = fs.readFileSync(path.join(root, 'src', 'renderer', 'css', 'print.css'), 'utf8');

assert(
  mainSource.includes('const isSelfContainedSf2Report = /^School Form 2 \\(SF2\\)\\b/i.test'),
  'SF2 PDF exports must be recognized as self-contained reports'
);
assert(
  mainSource.includes('const includeHeader = options?.includeHeader ?? !isSelfContainedSf2Report;'),
  'SF2 PDF exports must suppress the shared PDF header unless explicitly overridden'
);

assert(
  printCss.includes('@page attendance-sf2 { size: A4 landscape; margin: 10mm; }'),
  'SF2 must use a named landscape page without changing unrelated print jobs'
);
assert(
  printCss.includes('body.support-print-mode.support-print-attendance:not(.sf2-export-print-mode) .view-section[data-view="attendance"]'),
  'standard Attendance printing must reveal the Attendance view'
);
assert(
  printCss.includes('body.support-print-mode.support-print-attendance:not(.sf2-export-print-mode) #attendanceReportPrintable'),
  'standard Attendance printing must reveal the printable Attendance report'
);
assert(
  printCss.includes('body.support-print-mode.support-print-attendance.sf2-export-print-mode > *:not(#attendanceSf2ReportPrint)'),
  'only the SF2 export mode may hide the app in favor of the hidden SF2 clone'
);
assert(
  !printCss.includes('body.support-print-mode.support-print-attendance > *:not(#attendanceSf2ReportPrint)'),
  'standard Attendance printing must not be hidden by the SF2-only selector'
);

console.log('Attendance PDF and print regression tests passed.');
