# E-Class Record v1.9.0

Release date: August 10, 2026

## Dashboard Workplace

- Redesigned the dashboard as a complete teacher workplace while preserving Advisory Class and teaching-load cards.
- Added grading completion, HPS readiness, assessment mix, per-class score-entry progress, and term activity statistics.
- Added learner performance comparisons with a class-aware learner selector.
- Added a term-separated missing-grade view that excludes assessments without HPS and distinguishes complete and incomplete entries.
- Added a duplicate-inclusive or unique-learner toggle for the Learners statistic.
- Moved My Classes & Advisory into a pinned side panel with a static Advisory card, scrollable teaching loads, Add Class, and grid/list full view.

## Grading and Score Integrity

- Prevented scores higher than the assessment HPS while continuing to allow unrestricted scores when HPS is blank.
- Fixed grading-sheet mouse navigation so entering a grade and selecting another learner keeps the intended cell and scroll position.
- Added persistent score history for populated cells, including previous and new values, timestamp, term, assessment, and entry source.
- Extended score auditing across the grading sheet, Quick Grade, mobile sync, undo/redo, score transfer, column clearing, Grade Simulator, and checklist publication workflows.
- Fixed learner modal scrolling after switching avatar sex tabs.

## Calendar and Class Workflows

- Restored a dedicated School Calendar view with month navigation, local reminders, planned assessments, upcoming-event summaries, and optional DepEd calendar synchronization.
- Added a clearer calendar-grid icon to the sidebar.
- Corrected Classes & Advisory full-view stacking so Reports and Export Final Grades open above the class browser.

## Grade Submission

- Added an optional school grade-submission pilot for securely connecting subject teachers and advisers through a school-managed Cloudflare Worker.
- Preserved offline Grade Transfer files as the default workflow and retained privacy confirmation, adviser permissions, correction notes, and conflict protection.

## Compatibility

- Existing profiles, assessments, scores, learner avatars, Advisory records, encrypted backups, Shared Folder Sync data, and Grade Transfer files remain compatible.
- Score history begins with edits made in v1.9.0; earlier changes cannot be reconstructed from existing score values.
