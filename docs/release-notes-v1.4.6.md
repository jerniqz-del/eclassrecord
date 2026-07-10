# E-Class Record v1.4.6

This patch update improves attendance correctness, SF2 output, Assessment Details safety, Class Record stability, and score-entry workflow polish on top of the v1.4.5 public update.

## Highlights

- Fixed SF2 `MALE/FEMALE TOTAL Per Day` rows so they count present learners, not absences.
- Improved Excused and No Classes handling across roll call, attendance tables, legends, statistics, and SF2 output.
- Fixed Clear This Date, Mark All Present, and reopening saved roll-call dates with Excused or No Classes entries.
- Preserved Assessment Details data when saving titles, dates, descriptions, attachments, HPS, and scores.
- Kept Class Record assessment columns fixed by abbreviation and group position after custom title edits.
- Added arrow-key navigation for Grading Sheet score entry.
- Improved Transfer Scores styling and full preview flow.
- Tidied Attendance Tracker layout and compacted attendance statistics.
- Improved quick tour popup bounds and modal close behavior.

## v1.4 Feature Set Included

- Attendance Tracker with SF2 preview and PDF download.
- Floating Help Assistant with offline FAQ, Start Over, and Ask the Community.
- Dashboard grid/list view, drag-and-drop class ordering, and compact class card summaries.
- Global sidebar sponsor carousel with hidden owner ad editor and Cloudflare relay support.
- Teaching Load and Grading Sheet layout refinements.
- Welcome Terms gate with separate What's New and Terms modals.
- Assessment Score Transfer for correcting scores entered in the wrong assessment or class.
- Safe checkpoint, build, and release helpers with local restore points.

## Compatibility Notes

- Existing learner rosters, class records, scores, backups, and grading formulas remain compatible.
- This update does not change grade computation rules.
- Community Help and global sidebar ads still require internet access; offline FAQ answers and cached/bundled ads continue to work.

## Update Notes

- This release is intended as a public patch update for v1.4.5 users.
- Installed apps may detect the update after the GitHub release assets and `latest.yml` are published.
