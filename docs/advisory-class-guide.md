# Advisory Class and Offline Grade Transfer Guide

The fixed **Advisory Class** card is the adviser’s central workspace for one grade-and-section in a school year. It remains first on the Dashboard and does not replace or reorder teaching-load cards.

## 1. Create the Advisory Class

1. Open the first card on the Dashboard.
2. Enter the school year, grade level, section, adviser, and available school details.
3. Optionally choose **Import learners from Other Class** to review a roster already present on the Dashboard immediately after setup.
4. Save. Only one Advisory Class can be active for the same school year.
5. To preserve a past class, edit it and select **Archive**. Archived data remains in backups.

After saving, the app automatically adds the standard subjects for the selected grade level. Open **Grade Sources** and choose **Assign Source** only when you want to change how a subject&apos;s grades will arrive.

### Special Classes

Select **This is a Special Class** during setup for programs such as Journalism or Science. Enter the program name, one required special subject, and an optional second special subject. For each one, choose whether it participates in the General Average. A Special Class can have at most two active special subjects.

Use **Advisory Settings** to rename special subjects, change their General Average choice, add the optional second subject, or turn off Special Class. Removing or disabling a special subject archives it: grades, source mappings, and import history remain stored and restorable. Regular classes cannot add extra subjects.

## 2. Build and maintain the official roster

Open the Advisory Class, then choose the **Manage Roster** tab. Import, add, edit, and remove actions are available directly in that tab. Focused previews and learner forms open only when an action needs them. Choose one of these local sources:

- **Copy from class** previews learners from an existing teaching load. The source class is not changed.
- **Upload SF1** reads an official local spreadsheet using the app’s existing SF1 reader.
- **Bulk paste** accepts multiple learner rows and lets you select only valid rows.
- **Add learner** records one learner manually; existing learners can be edited or removed.

The app matches learners by 12-digit LRN first. A normalized name is used only when it identifies exactly one learner. Resolve duplicate LRNs, duplicate names, ambiguous matches, and invalid required fields before saving.

## 3. Export final grades as a subject teacher

1. On the Dashboard, find the subject teaching-load card and choose **Export Grades**.
2. Select one term and review the class, subject, teacher, and learner totals.
   - For MAPEH, also choose **Music & Arts** or **PE & Health**. Save and send both components as separate Grade Transfer Files.
3. Read and accept the privacy confirmation.
4. Save the `.json` Grade Transfer File to a local folder or removable drive.

The file contains only the selected term’s numeric final grades plus the minimum context needed to validate and match them. It does **not** contain raw assessment scores, HPS values, attendance, or unrelated terms.

For a custom teaching load, select **Treat this as a Special-Program Subject** to set the Written Works, Performance Tasks, and combined Summative Tests & Term Examination percentages. Each value must be a whole number from 0 to 100 and all three must total 100. The internal ST1/ST2/Term Examination split remains 30%/30%/40%. Changing percentages after scores exist requires confirmation and recalculates grades without altering raw scores.

## 4. Import grades as the adviser

1. Open the Advisory Class and choose **Import Grade Transfer File**.
2. Select the JSON file. The app automatically reads its school year, grade, section, subject, and term, then compares them with the active Advisory Class before showing the review.
3. Resolve unmatched rows by mapping each one to a different Advisory learner. Rows with invalid grades cannot be imported.
4. If a learner already has a grade for that subject and term, explicitly choose **Keep existing** or **Replace**. You may apply one decision to all displayed conflicts.
5. Confirm the import. Previewing never changes the database.

Exact duplicate files and corrected re-exports are identified. Existing grades are never silently overwritten. If an import fails, its transaction is rolled back.

## 5. Review consolidated records

- The grade matrix shows received and missing final grades by learner, subject, and term.
- The **LRN / Official Name** column stays visible while the grade table scrolls horizontally.
- Subject finals and the General Average are shown by default. Choose **Show Terms 1–3** to expand every subject at once, or use the **+** beside an individual subject. The horizontal scrollbar above the table stays accessible near the top; hold **Shift** while using the mouse wheel to scroll left and right.
- Select a subject heading to sort learners by that subject final. Select it again to reverse the order, and a third time to restore roster order. Learners with missing finals stay at the end.
- The standard **Subjects** are supplied automatically from the Advisory Class grade level.
- **Grade Record**, **Grade Sources**, **Manage Roster**, and **Advisory Settings** are separate page tabs. Grade Sources also contains Import History. Roster management and Advisory-only settings are edited directly in their tabs.
- Long headings wrap. At higher zoom levels, compact labels such as FIL, ENG, MATH, SCI, AP, M&A, PE&H, LANG, R&L, and MKB keep every final-grade subject visible. MAPEH is tracked as separate **Music & Arts** and **PE & Health** subjects.
- **Grade Sources** lets you choose Grade Transfer File, a matching class in this app, or manual entry. There is no “Expected Source Class” to type for a Grade Transfer File because the file identifies its source automatically.
- **Import History** records filename, export ID, timestamps, counts, conflicts, and decisions.
- **Undo** safely reverses an applicable import. It refuses to overwrite a grade that was changed after that import.

Dashboard completion is calculated from valid learner grades for every configured subject and all three terms; simply importing a file does not mark incomplete data as complete.

The main Advisory Class table displays a computed final for every subject without horizontal overflow. Expanding a subject adds its Term 1, Term 2, and Term 3 columns. A subject final appears after all three term grades are available. Music & Arts and PE & Health produce a **MAPEH Average** for each term and a MAPEH final; only that combined MAPEH final is counted with the other subjects in the General Average. The General Average appears after every required subject has a complete final.

## Reset an Advisory Class

Choose the red **Reset Advisory Class** button in the upper-right of the Advisory Class page. The app offers three explicit choices:

- **Backup & Reset** saves a ZIP first. It contains the class settings, roster, import history, source mappings, and a separate JSON file for every configured subject and each of Terms 1–3. Reset proceeds only after the ZIP is saved successfully.
- **Reset Without Backup** removes the Advisory Class immediately after the explicit choice.
- **Cancel** leaves everything unchanged.

Resetting does not alter any subject teaching load or its roster, assessments, scores, or attendance.

## Privacy, offline use, and backups

Grade Transfer Files contain personal learner data: names, LRNs, and final grades. Verify the destination, use trusted removable media, keep files only as long as needed, and follow school privacy procedures.

The grade-transfer workflow is fully offline. Internet access is not needed to create, review, import, or audit a transfer file.

**Download Backup** includes Advisory classes, learners, subjects, grades, source mappings, and import history. **Upload Backup** validates those relationships before replacing the current database. Older backups without Advisory data remain supported and receive an empty Advisory store during migration. Keep a recent backup before large roster or grade changes.
