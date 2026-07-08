# E-Class Record v1.4.5

This public update brings together the restored v1.4 feature set, the new global sidebar sponsor system, Help Assistant improvements, Dashboard refinements, learner transfer tools, and release-safety fixes.

## What's New

- Added a persistent sidebar sponsor carousel with owner-managed global ads.
- Added a hidden owner ad editor opened with `Ctrl + Alt + Shift + A`.
- Added Cloudflare relay support for global sidebar ads through `/ads/sidebar` and protected owner saves through `/admin/sidebar-ads`.
- Cached the latest successful remote ads so offline users still see safe sponsor content, with bundled ads as the final fallback.
- Moved the sidebar ad placement to the bottom of the sidebar body, directly above the `Collapse Sidebar` divider.
- Added Dashboard grid/list view switching and saved the teacher's preferred view locally.
- Added drag-and-drop class card ordering on the Dashboard.
- Moved the `Add Class Load` card to the end of the Dashboard list.
- Simplified class card assessment previews into compact summary lines.
- Made non-control class card areas open the Grading Sheet while preserving the Reports button behavior.
- Added clean learner transfer across classes for early-school-year roster correction when no grades have been recorded.
- Improved the Edit Learner Information modal so it stays inside the page boundary.
- Expanded the Help Assistant knowledge behavior, answer formatting, and Start Over flow.
- Added Ask the Community relay support with privacy-aware payloads and toast-style question prompts.
- Added the Attendance Tracker page and SF2 attendance PDF download flow.
- Removed the editable term selector from Take Roll Call and improved roll-call modal behavior.
- Added Escape-key modal closing for active modals without bypassing required gates.
- Optimized the Assessment Details modal layout for faster editing and small-screen use.
- Moved Teaching Load roster import actions into the Add New Learner modal.
- Moved `Delete This Class` beside `Proceed to Grading Sheet`.
- Moved Grading Sheet Undo/Redo into the app header and moved `View Learner's Grades` beside `Quick Grade Entry`.
- Improved HPS readability and grading table height behavior.
- Added Welcome Terms acceptance gating with separate What’s New and Terms modals.
- Added safe commit, checkpoint, build, and release helpers to protect source files and create restore points.

## Compatibility Notes

- Existing class records, learner rosters, scores, backups, and grading formulas remain compatible.
- Community Help and global sidebar ads require internet access; offline FAQ answers and bundled/cached ads continue to work.
- Sidebar sponsor content is hidden from print and PDF output.
- The hidden ad editor requires the Cloudflare `ADS_ADMIN_TOKEN`; normal users cannot edit global ads in Settings.

## Update Notes

- This release is intended to be published as a public GitHub update.
- Installed apps may detect the update after the release assets and `latest.yml` are published.
