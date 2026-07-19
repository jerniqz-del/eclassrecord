# E-Class Record v1.6.8

This release improves update delivery, performance on older PCs, and Advisory Class grade review.

## What’s new

- Added automatic daily update checks, optional background downloads, progress reporting, and a save-protected **Restart and Update** workflow.
- Added a device-local **Low-Spec Mode** that reduces visual effects, keeps sidebar content static, delays optional background activity, and provides a PC-based recommendation.
- Improved the Advisory Learner Grade Record so consolidated **MAPEH** always appears before **Music & Arts** and **PE & Health**.
- Added expandable **Term 1–3 General Averages** alongside the final General Average.
- Added an optional **Decimal View** for all visible Advisory grades.
- Corrected Decimal View to show exact, unrounded final calculations—for example, `77 + 80 + 81` now displays `79.33` instead of `79.00`.
- Added term-average columns to detailed Learner Grade Record print previews and PDFs while keeping official rounded grades unchanged in normal view.

## Compatibility and safety

- Existing profiles and backups remain compatible.
- Low-Spec Mode and Decimal View are device-local display preferences and do not alter stored grades.
- Automatic update installation saves active work before restarting the app.

## Verification

- Full automated regression suite passed.
- Offline desktop startup and renderer smoke tests passed.
- Grade Transfer, Advisory backup, corrected re-import, compatibility, and end-to-end workflows passed.
