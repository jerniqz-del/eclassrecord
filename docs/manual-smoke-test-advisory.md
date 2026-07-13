# Advisory Class Manual Smoke-Test Checklist

Run this checklist on a disposable profile and retain screenshots or notes for failed steps.

## Dashboard and setup

- [ ] Launch with no internet connection; the app opens without a blank screen or blocking error.
- [ ] Advisory Class is the first Dashboard card when there are zero teaching loads.
- [ ] Add and reorder teaching loads; the Advisory card remains fixed and the other cards retain their order.
- [ ] Create an Advisory Class with required and optional school fields; restart and confirm persistence.
- [ ] Attempt a second active Advisory Class for the same school year; confirm it is prevented.
- [ ] Archive the class and confirm its records are preserved.

## Roster

- [ ] Add, edit, and remove a learner manually; verify LRN and required-name validation.
- [ ] Bulk-paste valid, malformed, duplicate-LRN, and duplicate-name rows; import only selected valid rows.
- [ ] Upload a representative SF1 file and review extracted learners before saving.
- [ ] Copy a teaching-load roster; confirm the source roster is unchanged.
- [ ] Exercise exact LRN, unique normalized-name, unmatched, and ambiguous-name cases.

## Export and privacy

- [ ] From a subject card, export Term 1 and cancel once before saving successfully.
- [ ] Confirm the privacy notice is required and the native dialog says **Grade Transfer File**.
- [ ] Inspect the JSON: it contains only Term 1 numeric final grades and required metadata.
- [ ] Confirm raw scores, assessment/HPS data, attendance, and Terms 2–3 are absent.
- [ ] Repeat export and confirm unique export IDs and safe filenames.

## Import, mapping, and conflicts

- [ ] Preview a valid file; confirm preview does not change grades or history.
- [ ] Import matching LRNs and verify matrix, subject, source, completion, and history updates.
- [ ] Try wrong school year, grade, section, term, malformed JSON, unsupported schema, duplicate learners, and out-of-range grades; confirm clear rejection.
- [ ] Manually map unmatched rows; confirm two rows cannot map to the same learner.
- [ ] Reimport the exact file; confirm duplicate detection.
- [ ] Import a corrected file; confirm it is identified and existing grades require keep/replace decisions.
- [ ] Test individual and apply-to-all conflict choices; confirm no silent overwrite.
- [ ] Force or simulate an import failure; confirm no partial grade or history records remain.
- [ ] Undo an import; then modify a resulting grade and confirm unsafe undo is refused.

## Backup, restore, integrity, and offline operation

- [ ] Download a backup after importing several subjects and terms.
- [ ] Restore it in a disposable profile/session; verify class, roster, subjects, grades, sources, conflicts, and history.
- [ ] Restore an older backup without Advisory data; confirm normal migration and no loss of teaching loads.
- [ ] Attempt a corrupted backup with broken Advisory references; confirm current data is not replaced.
- [ ] Run Database Integrity Check; confirm Advisory issues are reported without automatic deletion.
- [ ] Disconnect networking and repeat export/import/undo; confirm all actions work locally.
- [ ] Restart and verify Dashboard completion and grade matrix are unchanged.

## Automated companion checks

From the repository, run `npm test`, `npm run smoke:offline`, and `npm run build`. Record command output, app version, Windows version, and any deviations from this manual checklist.
