# Advisory Class and Offline Grade Transfer Guide

The fixed **Advisory Class** card is the adviser’s central workspace for one grade-and-section in a school year. It remains first on the Dashboard and does not replace or reorder teaching-load cards.

## 1. Create the Advisory Class

1. Open the first card on the Dashboard.
2. Enter the school year, grade level, section, adviser, and available school details.
3. Save. Only one Advisory Class can be active for the same school year.
4. To preserve a past class, edit it and select **Archive**. Archived data remains in backups.

## 2. Build and maintain the official roster

Open **Manage Roster**, then choose one of these local sources:

- **Copy from class** previews learners from an existing teaching load. The source class is not changed.
- **Upload SF1** reads an official local spreadsheet using the app’s existing SF1 reader.
- **Bulk paste** accepts multiple learner rows and lets you select only valid rows.
- **Add learner** records one learner manually; existing learners can be edited or removed.

The app matches learners by 12-digit LRN first. A normalized name is used only when it identifies exactly one learner. Resolve duplicate LRNs, duplicate names, ambiguous matches, and invalid required fields before saving.

## 3. Export final grades as a subject teacher

1. On the Dashboard, find the subject teaching-load card and choose **Export Grades**.
2. Select one term and review the class, subject, teacher, and learner totals.
3. Read and accept the privacy confirmation.
4. Save the `.json` Grade Transfer File to a local folder or removable drive.

The file contains only the selected term’s numeric final grades plus the minimum context needed to validate and match them. It does **not** contain raw assessment scores, HPS values, attendance, or unrelated terms.

## 4. Import grades as the adviser

1. Open the Advisory Class and choose **Import Grade File**.
2. Select the JSON file and review its school year, grade, section, subject, term, teacher, export time, and validation results.
3. Resolve unmatched rows by mapping each one to a different Advisory learner. Rows with invalid grades cannot be imported.
4. If a learner already has a grade for that subject and term, explicitly choose **Keep existing** or **Replace**. You may apply one decision to all displayed conflicts.
5. Confirm the import. Previewing never changes the database.

Exact duplicate files and corrected re-exports are identified. Existing grades are never silently overwritten. If an import fails, its transaction is rolled back.

## 5. Review consolidated records

- The grade matrix shows received and missing final grades by learner, subject, and term.
- **Subjects** controls the expected subject list and source details.
- **Grade Sources** shows which teacher, class, export, and import batch supplied each grade set.
- **Import History** records filename, export ID, timestamps, counts, conflicts, and decisions.
- **Undo** safely reverses an applicable import. It refuses to overwrite a grade that was changed after that import.

Dashboard completion is calculated from valid learner grades for every configured subject and all three terms; simply importing a file does not mark incomplete data as complete.

## Privacy, offline use, and backups

Grade Transfer Files contain personal learner data: names, LRNs, and final grades. Verify the destination, use trusted removable media, keep files only as long as needed, and follow school privacy procedures.

The grade-transfer workflow is fully offline. Internet access is not needed to create, review, import, or audit a transfer file.

**Download Backup** includes Advisory classes, learners, subjects, grades, source mappings, and import history. **Upload Backup** validates those relationships before replacing the current database. Older backups without Advisory data remain supported and receive an empty Advisory store during migration. Keep a recent backup before large roster or grade changes.
