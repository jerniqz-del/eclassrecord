# E-Class Record v1.5.0

This release adds a dedicated Advisory Class workspace and strengthens the app's offline grade-transfer, backup-integrity, and account-recovery workflows.

## What's New

- Added a dedicated Advisory Class page for official rosters, subject sources, consolidated grades, and reports.
- Added fully offline Grade Transfer Files with validation, learner matching, conflict review, corrected re-imports, history, and undo support.
- Added Special Class setup with additional subjects and configurable special-program grading percentages.
- Added offline QR-based PIN recovery and stronger encrypted-profile compatibility.
- Added individual subject artwork and refined class-card, report, and export actions.

## Improvements

- Strengthened database checksums, atomic saves, recovery snapshots, backup validation, and older-backup restoration.
- Improved Advisory Grade Record navigation, scrolling, headers, subject widths, and General Average presentation.
- Expanded automated coverage for migrations, backups, Advisory workflows, special-program grading, and offline operation.

## Compatibility

Existing profiles, teaching loads, learner records, scores, attendance, grading formulas, backups, and PIN-protected data remain supported. Database migrations preserve unknown fields and reject unsupported future formats rather than overwriting them.
