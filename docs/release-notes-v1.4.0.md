# E-Class Record v1.4.0

This update expands v1.4.0 from an attendance-only release into a broader recovery and usability release. It keeps existing grading formulas, scores, summaries, backups, and profile data compatible with v1.3.3.

## What's New

- Added the Attendance Tracker page for class attendance records, learner attendance views, printable attendance logs, and PDF output.
- Added the SF2 attendance preview/download flow and renamed the visible SF2 action to `Download PDF`.
- Added a persistent sponsored message holder in the sidebar with expanded and collapsed states.
- Added a floating Help Assistant chatbox with offline FAQ answers, suggested questions, feedback controls, and `Start Over`.
- Added Ask the Community support through the managed online relay when the app is connected to the internet.
- Added community question toast notifications with `Preview` and `Dismiss`.
- Locked the production Community Help relay into the app so users do not need to paste or edit a relay URL.
- Removed the editable Community Help Relay URL setting and reduced polling to 5 minutes for free-tier capacity.
- Added Terms & Conditions acceptance to the Welcome flow, saved by Terms version.
- Moved `What's New...` release notes into a separate modal.
- Moved the full Terms & Conditions document into a separate modal linked from the checkbox label.
- Refreshed Welcome modal highlights to focus on the latest main app features.
- Moved Grading Sheet Undo and Redo into the top header beside `Download Backup`.
- Moved `View Learner's Grades` beside `Quick Grade Entry` inside the Class Record panel.
- Expanded the Class Record table area and improved HPS readability.
- Moved Teaching Load roster import actions into the Add New Learner modal.
- Renamed `Upload SF1 Spreadsheet` to `Upload SF1`.
- Moved `Delete This Class` beside `Proceed to Grading Sheet`.
- Added a local Community Help relay package for deployments that need a small HTTP relay.
- Replaced the risky build flow with a safer build wrapper that restores readable source after packaging.

## Compatibility Notes

- Existing v1.3.3 databases open normally.
- Existing backups remain importable.
- Grades, formulas, assessment scores, Summary pages, and class record calculations are unchanged.
- Community Help works only when online; the local Help Assistant FAQ continues to work offline.
- Sidebar sponsor content is not included in print/PDF output.
