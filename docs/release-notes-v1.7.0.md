# E-Class Record v1.7.0

This release adds cross-PC backup discovery, encrypted shared-folder
synchronization, and a new Teacher Tools workspace while keeping local
Auto-save and profile encryption as the primary data-safety boundaries.

## What's New

- Added a Backup Recovery ID to each profile for finding the newest matching
  encrypted backup in a selected shared or cloud-synced folder.
- Added Shared Folder Sync with per-device encrypted revisions, visible status,
  automatic combination of independent edits, and explicit conflict review.
- Added Teacher Tools directly below Attendance in the sidebar.
- Added Group Randomizer with complete-random and sex-balanced modes, plus copy
  and print actions.
- Added a no-repeat Name Picker with a suspenseful, gradually slowing name
  roulette that resets after every learner has been drawn.
- Added Grade Simulator for previewing raw-score changes without touching the
  official record until the teacher reviews and confirms them.
- Added a compact Grade Simulator score matrix with one shared HPS header,
  evenly distributed score fields, and no horizontal scrolling through 200%
  zoom.
- Added PIN-confirmed simulation apply, stale-score protection, atomic saving,
  and up to ten reversible application records.
- Added locally bundled Sudoku, 2048, and Minesweeper games in isolated,
  network-blocked frames.

## Data Safety

- Grouping results, name draws, and game progress are temporary and are not
  written to profile databases, backups, analytics, or Shared Folder Sync.
- Grade Simulator previews use detached class copies and do not trigger
  Auto-save, backup writes, or synchronization.
- Applied simulations use the normal verified save path, so encrypted profiles,
  rolling backups, Recovery ID backups, and Shared Folder Sync include the
  resulting official scores and compact rollback history.
- Older databases and backups remain supported. Missing Teacher Tools data is
  initialized during normalization without changing existing class records.
