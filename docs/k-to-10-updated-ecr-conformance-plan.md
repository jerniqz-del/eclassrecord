# K to 10 Updated ECR Conformance Plan

Last reviewed: 2026-09-09  
Source pack: `K to 10 (Updated)` official workbooks dated 2026-09-08  
App baseline: E-Class Record 1.10.0  
Active goal: complete Phases A–G with a test-then-integrity gate before each next phase. Phase 0 is done.

This plan compares the updated DepEd Excel ECR / PACE / SF9 files with the app and sequences the work needed to match their **functionality and usability**. It does not copy password protection, 50+50 hardcoded Excel slots, or sheet-protection passwords from the official files.

This plan compares the updated DepEd Excel ECR / PACE / SF9 files with the app and sequences the work needed to match their **functionality and usability**. It does not copy password protection, 50+50 hardcoded Excel slots, or sheet-protection passwords from the official files.

## 1. Files reviewed

| Official workbook | Intended user | Core sheets |
| --- | --- | --- |
| `UPDATED [Kinder] E-Class Record with SF9.xlsx` | Kinder adviser | INPUT DATA, TERM 1–3 SUMMARY, SF9, attendance |
| `UPDATED [Grade 1] ECR, PACE Form, and SF9.xlsx` | Grade 1 (file also notes G1–G3) adviser | INPUT DATA, per-subject PACE matrices, PACE form, TERM summaries, SF9, attendance |
| `UPDATED [Grades 2-10] … Science, Math, English, Filipino, Araling Panlipunan.xlsx` | Academic subject teacher | INPUT DATA, TERM 1–3, FINAL GRADES, HELPER |
| `UPDATED [Grades 2-10] … GMRC and Values Education.xlsx` | GMRC / Values teacher | Same, with domain-split WW/PT |
| `UPDATED [Grades 2-10] … Music and Arts, Physical Education and Health.xlsx` | MAPEH teacher | Per-term Music & Arts + PE & Health, consolidated finals |
| `UPDATED [Grades 2-10] … EPP-TLE.xlsx` | EPP/TLE teacher (single component) | TERM 1–3 + finals, skills weights |
| `UPDATED [Grades 2-10] … EPP-TLE - per component.xlsx` | TLE teacher (ICT + specialization) | ICT/AFA/FCS/IA sheets and weighted term grade |

## 2. What already matches

These official rules are already in the grading engine or Grade 1 PACE workspace.

- Three terms, not four quarters.
- Academic subjects: **5 WW + 3 PT + ST1/ST2/TE**, weights **20 / 50 / 30**.
- Skills subjects (MAPEH, EPP/TLE): same column counts, weights **20 / 60 / 20**.
- Examinations combine as **ST1 30% + ST2 30% + TE 40%**, then that percentage score is multiplied by the examination component weight.
- Initial Grade = WW WS + PT WS + Exam WS; Term Grade = DO 15 adjusted transmutation (floor 60 in SY 2026-2027).
- HELPER descriptor bands: 90–100 Advancing, 80–89 Benchmarking, 75–79 Connecting, 65–74 Developing, 60–64 Emerging.
- Final numeric grade = rounded average of the three term grades; Passed if ≥ 75.
- MAPEH term grade = rounded average of Music & Arts and PE & Health; MAPEH final = average of the three term MAPEH grades.
- Male/female roster split exists in Teaching Load sorting; LRN and birthdate exist on learners.
- Grade 1 is descriptive A–E (PACE), not WW/PT math. Homeroom covers Reading and Literacy, Language, Mathematics, GMRC, and Makabansa.
- Individual PACE Form export and class increment/set/undo already exist.
- Attendance is already a first-class module (SF2), though not the Grade 1 SF9 attendance block.

Do **not** rebuild the academic 20/50/30 or skills 20/60/20 engines. Reuse them.

## 3. Gaps that block official-file conformance

### P0 — Correctness vs the new files

1. **GMRC / Values Education domain weights**  
   Official GMRC is still 20/50/30 overall, but WW and PT are **not equally averaged**:
   - WW Cognitive 5 scores × **10%**
   - WW Affective 5 scores × **10%**
   - PT Cognitive 3 scores × **10%**
   - PT Affective 3 scores × **10%**
   - PT Behavioral 3 scores × **30%**
   - Examinations **30%** (same ST1/ST2/TE 30/30/40 split)  
   The app stores one WW pool and one PT pool. A GMRC class scored that way will not match the official sheet.

2. **TLE per-component term grade**  
   Official per-component file:
   - Term 1: ICT **25%** + AFA **75%**
   - Term 2: ICT **25%** + FCS **75%**
   - Term 3: ICT **25%** + IA **75%**
   - Final = average of those three term grades  
   The app has one TLE subject. MAPEH-style sub-tabs are the closest pattern to reuse.

3. **Grade 1 PACE skill squares**  
   Official Reading/Language matrices still have separate **Listening / Speaking / Reading / Copying** cells per competency. The app stores **one letter per competency** (or lettered part) and copies it onto every live square at export. Teachers using the official Excel rate those squares independently.

4. **Filipino descriptor wording on SF9**  
   Official: *Naipamamalas*, *Nagpapaunlad*. App: *Napamamalas*, *Napauunlad*. Align labels and help text to the official SF9 legend, including the longer English descriptions.

5. **Excel export template**  
   `excel-exporter.js` still fills a generic `Templates.xlsx` layout (5 WW / 3 PT / ST1 ST2 TE). It does not emit the updated official workbooks (GMRC domains, MAPEH twin sheets, TLE components, Grade 1 PACE matrices, or SF9).

### P1 — Missing official products

6. **Kindergarten class record + SF9**  
   Advisory UI already lists Kindergarten as “Not yet available”. The official file is a developmental A–E (or equivalent) matrix across:
   - Sensory Perceptual and Motor
   - Socio-emotional
   - Cognitive
   - Language / literacy strands on SF9  
   plus attendance and an SF9 progress card. This is a new grade band, not an extension of WW/PT.

7. **Grade 1 / Kinder SF9 (Learner’s Progress Report Card)**  
   Official SF9 is **narrative + attendance + letter legend + transfer certificate**, not a subject-grade grid. Fields:
   - What Your Child Can Do / Mga Nagagawa (per term)
   - What Your Child Is Learning To Improve / Dapat Linangin (per term)
   - Age at beginning and end of SY from birthdate
   - Monthly days present vs school days  
   The app has learner-grade PDFs and SF2, not this card.

8. **Grade 1 adviser class summaries**  
   Official file is one adviser workbook: INPUT DATA → subject PACE sheets → PACE form → term narrative summary → SF9. The app is teacher-load first (one class record per load) with Advisory as a separate grade-collection surface. Conformance means an **adviser Grade 1 pack** that can print/export the official set from PACE ratings + narratives + attendance.

9. **Grades 2–3 column preset**  
   Official 2–10 academic file uses **5 WW + 3 PT** for every grade in that pack. The app seeds Grades 1–3 with **4 WW + 4 PT** (`keyStage1Template`). Grade 1 no longer uses those columns for the official letter; Grades 2–3 numeric classes should seed 5/3 unless DepEd still allows teacher discretion.

### P2 — Usability to match how teachers use the Excel files

10. **INPUT DATA hub**  
    Official files start on a single school/roster sheet (region, division, school ID, school head, teacher, subject, grade, section, males, females). The app splits this across Settings, Teaching Load, and roster. Add an “Official pack” preview that shows the same fields before export, not a duplicate database.

11. **Labeling**  
    Official headers: *Written / Oral Works (WWs)*, *Product / Performance Tasks (PTs)*, *Examinations (EXs)*, *Initial Grade*, *Term Grade*, *Descriptor*. The app uses WW / PT / ST1 / ST2 / TE / IG / TG. Keep internal codes; show official names on print/export and optional sheet headers.

12. **Final grade blank until three terms exist**  
    Official `FINAL GRADES` leaves Final Grade empty unless Term 1–3 are all present (`COUNT < 3`). The app averages whatever terms have data. Match official blanking on **official Excel/PDF export**; keep in-app running average as a teacher aid with a clear “unofficial until 3 terms” hint.

13. **Sex-separated print layout**  
    Official term sheets list males, then females, 50 rows each. In-app grid can stay mixed; official exports should follow the Excel order.

14. **Grade 1 PACE live form**  
    Official PACE sheet is a three-term booklet that updates from the class matrices when the learner name changes. The app already has Individual PACE Form preview with a learner picker. Extend that preview to the **updated three-term PACE sheet**, not only Term 1 Word merge tags.

15. **Attendance on SF9**  
    Grade 1/Kinder SF9 needs school days per month and days present. Map from Attendance Tracker (June–April, with September split across Term 1/2 as in the official sheet) instead of a second attendance database.

## 4. Implementation phases

### Phase 0 — Existing-record safety (required before A–G)

Every later phase must keep already-entered databases intact. The app stores **raw scores, assessment IDs, learners, PACE letters, attendance, and Advisory transferred grades**. Term grades are computed on display, not stored as the source of truth.

**Contract**

| Data | After Phases A–G |
| --- | --- |
| Learners, LRNs, birthdates, sex | Unchanged |
| Score keys `learnerId\|assessmentId` and HPS | Unchanged; columns are never deleted |
| Grade 2–3 4 WW + 4 PT classes | Stay 4+4; only **new** classes may seed 5+3 |
| GMRC / Values term math | Stay pooled WW/PT (`scoringModel: pooled-ww-pt`) until the teacher opts into official domains. Layout is **whole-class** (Terms 1–3); do not mix pooled Term 1 with domain Term 2/3. SY 2026-2027 **new** GMRC stays pooled unless opted in; official domains default from SY 2027-2028. |
| TLE / EPP | Stay one component (`tleMode: single`) until the teacher opts into ICT+specialization. Same whole-class rule. SY 2026-2027 **new** TLE stays single unless opted in; per-component defaults from SY 2027-2028. |
| Grade 1 PACE letters | Same keys; L/S/R/C reads fall back to the one stored letter |
| Advisory `finalGrade` rows | Stay as transferred; they are not rewritten when teaching-load formulas change |
| Attendance / SF2 | Read-only source for SF9; no second attendance store |
| Database version | Stay additive (no forced `DB_VERSION` bump for these flags) |

**How the app enforces this**

- `columnPreset` freezes each class’s WW/PT counts on first open after this safety work.
- `ensureTemplateAssessments` keeps unmatched columns instead of dropping them.
- Extra WW/PT columns that already have evidence stay visible for every grade, not only Grades 7–12.
- New official layouts and formulas apply only to **new** classes or an explicit teacher opt-in. Do not switch by subject name or grade level alone.
- Descriptor and print-label changes (Phase A) must not rewrite stored grades.
- Official Excel/PDF export (Phase B) is output-only.
- Kinder (Phase F) is a new grade band and must not convert existing Grade 1 or Grade 2 records.

**Teacher-visible rule:** raw scores and letters already entered remain. Displayed GMRC or TLE numbers change only if that class is later opted into the official pack. A class that already encoded Term 1 on the old GMRC or TLE sheet should keep that sheet for Terms 2 and 3, or use **Duplicate to official sheet** to create a new class: learners and Term 1 final grades are copied, Term 1 is grades-only, and Terms 2–3 use the official layout. The original class is not changed.

### Execution protocol (mandatory)

Do not start the next phase until the current phase’s tests **and** the integrity gate pass. Order is A → C → B → D → E → F → G.

For each phase:

1. Write or extend automated tests for that phase first.
2. Implement only that phase.
3. Run the phase test script (`npm run test:k10-phase-a` … `test:k10-phase-g`).
4. Run `npm run test:k10-integrity` (existing-record safety, grade integrity, PACE, Senior High presets, record layout, and completed phase tests).
5. Update the status table below. If either gate fails, stop and fix.

| Phase | Status | Phase tests | Integrity |
| --- | --- | --- | --- |
| 0 Existing-record safety | Done | `test:ecr-record-safety` | n/a (this *is* the safety core) |
| A Labels, descriptors, G2–3 presets | Done | `test:k10-phase-a` passed | existing-record safety, grade integrity, PACE, Senior High, record layout passed |
| C GMRC domain scoring | Done | `test:k10-phase-c` passed | existing-record safety, grade integrity, PACE, Senior High, record layout, Phase A passed |
| B Official Excel/PDF packs | Done | `test:k10-phase-b` passed | existing-record safety, grade integrity, PACE, Senior High, record layout, Phase A, Phase C, Phase B passed |
| D TLE components | Done | `test:k10-phase-d` passed | existing-record safety, grade integrity, PACE, Senior High, record layout, Phase A, Phase C, Phase B, Phase D passed |
| E Grade 1 SF9 / PACE pack | Done | `test:k10-phase-e` passed | existing-record safety, grade integrity, PACE, Senior High, record layout, Phase A, Phase C, Phase B, Phase D, Phase E passed |
| F Kindergarten | Done | `test:k10-phase-f` passed | existing-record safety, grade integrity, PACE, Senior High, record layout, Phase A, Phase C, Phase B, Phase D, Phase E, Phase F passed |
| G In-app official usability | Done | `test:k10-phase-g` passed | existing-record safety, grade integrity, PACE, Senior High, record layout, Phase A, Phase C, Phase B, Phase D, Phase E, Phase F, Phase G passed |

### Phase A — Align labels, descriptors, and Grade 2–3 presets (low risk)

- Change displayed Filipino descriptors to **Naipamamalas** and **Nagpapaunlad**.
- Add official English descriptions from the SF9 legend (tooltips / print footer).
- Seed new Grade 2–3 numeric classes with 5 WW + 3 PT; leave existing classes untouched.
- Rename on-sheet print headers to Written/Oral Works, Product/Performance Tasks, Examinations.
- Tests: descriptor strings, `templateForGrade(2|3)`, print/PDF snapshot strings.

### Phase B — Official Excel / PDF export packs (teacher-visible win)

Ship **fill-the-official-file** exporters, one pack per workbook type, using the updated xlsx as templates (unlocked copies stored in `src/assets/official-ecr/`):

1. Academic 2–10  
2. GMRC / Values (after Phase C, or export with a warning until C lands)  
3. MAPEH (Music & Arts + PE & Health + finals)  
4. EPP-TLE single-component  
5. EPP-TLE per-component (after Phase D)  
6. Grade 1 PACE + SF9 (after Phase E)  
7. Kinder + SF9 (after Phase F)

Usability: “Export Official ECR” from the class record, with a field checklist (school ID, region, sex, LRN) and a preview of empty official cells.

Keep the current generic Excel export until teachers confirm the official pack.

Shipped in this phase: sanitized unlocked copies in `src/assets/official-ecr/` (password hint cells cleared), pack selection, fill of INPUT DATA + raw WW/PT/exam scores, GMRC domain columns, MAPEH twin term sheets, TLE-single, TLE per-component, Grade 1 PACE+SF9, Kindergarten SF9, OVERFLOW for roster over 50, and the Export Official ECR checklist.

### Phase C — GMRC / Values domain scoring

- Add assessment `domain`: `cognitive` | `affective` | `behavioral` (WW cognitive/affective, PT all three).
- Default **new** GMRC/Values templates: 5+5 WW, 3+3+3 PT, ST1/ST2/TE from **SY 2027-2028**. SY 2026-2027 new classes stay `scoringModel: pooled-ww-pt` unless the teacher opts in. Existing GMRC classes keep pooled WW/PT until an explicit opt-in.
- `computeTerm` for `scoringModel === gmrc-domains-2026` only: apply 10/10/10/10/30/30 as in the official sheet; do not equally average all PT items, and do not switch by subject name.
- Class record UI: grouped headers like the Excel file, not a flat WW/PT row.
- Advisory transfer still sends one term letter/number after transmutation.
- Tests with a fixture that must match Excel: known raw scores → same IG/TG as HELPER lookup.
- Mid-year path: **Duplicate to official sheet** copies an existing pooled GMRC class (learners + Term 1 finals) into a new `gmrc-domains-2026` class with Term 1 grade-only and official domains in Terms 2–3. The source class is unchanged.

### Phase D — TLE component workspace

Reuse MAPEH sub-tab UX:

- Components: ICT (all terms, 25%) plus term specialization AFA / FCS / IA (75%), only when `tleMode === per-component`. Existing TLE classes keep `tleMode: single`. New SY 2026-2027 TLE stays single unless opted in; new TLE from SY 2027-2028 defaults to per-component.
- Term grade = `ROUND(ICT*0.25 + spec*0.75)`.
- Final = average of three term grades when all exist.
- Allow the simple TLE workbook (one component, 20/60/20) as a school option for EPP or single-track TLE.
- Mid-year path: **Duplicate to official sheet** copies an existing single-component EPP/TLE class (learners + Term 1 finals) into a new `tleMode: per-component` class with Term 1 grade-only and ICT/specialization sheets in Terms 2–3.

### Phase E — Grade 1 official pack (PACE + narratives + SF9)

- Optional **per-skill L/S/R/C rating** on Reading and Language (`skillRatingMode` stays `single-letter` for existing data). Reads already fall back to the one stored letter; do not rewrite old keys.
- Term summary fields on the Grade 1 class: *Mga Nagagawa* and *Dapat Linangin* (can start from existing PACE remarks, then split).
- Age at BoSY / EoSY from birthdate (official file uses 8 Jun 2026 and 8 Apr 2027; drive dates from the school calendar).
- Generate SF9 PDF/print from adviser view: narrative + legend + attendance + transfer block.
- Replace/extend Individual PACE Form with the **three-term official PACE sheet** from this pack (learner picker already exists).
- Individual PACE Form (Word export, HTML fallback, and official sheet preview) prints the school name from Settings, with a labeled School field next to Name / LRN / Section.
- Arts and Physical Education: official Grade 1 file has no APE page. Keep the app’s placeholder competency until a district APE PACE sheet exists; do not invent columns.

### Phase F — Kindergarten

- Enable Kindergarten as a teaching load / advisory grade.
- Catalog the developmental items from TERM SUMMARY / SF9 (do not scrape Excel at runtime; encode a versioned catalog like Grade 1 PACE).
- Rating UX can reuse Grade 1 class/individual letter controls, with domain navigation instead of learning areas.
- SF9 Kinder export + attendance summary.
- No WW/PT/transmutation for Kinder.

### Phase G — In-app usability so teachers do not need Excel for daily work

- Group headers keep official names (Written / Oral Works, Product / Performance Tasks, Examinations); short WW/PT/EX codes stay in cells and tooltips. The in-app header-name toggle was removed.
- GMRC domain headers and TLE/MAPEH component switcher that feel like the Excel tabs (Term 1 ICT, Term 1 AFA, …).
- Shortcut-friendly rating already added for Grade 1; extend letter keys to Kinder and GMRC letters if those stay A–E.
- Running vs official final: show “Official final appears after Term 3” on the summary.
- Export wizard that fills INPUT DATA from Settings + roster and opens the correct pack.

Shipped in this phase: MAPEH/TLE Excel-style term tabs (`Term 1 Music & Arts`, `Term 1 ICT`, `Term 1 AFA`, …) including the previously missing MAPEH tab switcher, Kindergarten A–E letter keys via the existing PACE keyboard, the official-final hint on numeric summaries, and an Export Official ECR wizard that fills INPUT DATA from Settings (including district/city/school head) plus the roster, writes Kinder letters into the pack, and selects the matching workbook. Existing GMRC stays pooled and existing TLE stays single-component until opt-in. The official-column-names toggle was removed; header tooltips already explain WW/PT/EX.

## 5. What not to clone

- Sheet password `password123` and locked formula tabs. The app is the calculator; Excel is an output.
- Fixed 50 male + 50 female rows. Support real roster size.
- Blank Home splash sheets.
- Duplicating Attendance into a second store. SF9 should read SF2/Attendance Tracker.
- Using Excel as the system of record. Keep JSON database + official export.

## 6. Suggested build order

| Order | Phase | Why this order |
| --- | --- | --- |
| 0 | 0 | Freeze existing layouts/formulas before any official-pack change |
| 1 | A | Safe, visible, unblocks wording/layout mismatches |
| 2 | C | Largest numeric correctness gap for current G2–10 users |
| 3 | B (academic, MAPEH, single TLE) | Teachers can file official ECR without waiting for GMRC UI polish |
| 4 | D + B TLE-component | Depends on component data model |
| 5 | E | Grade 1 already has PACE; SF9/narratives/per-skill are additive |
| 6 | F | New grade band; largest new catalog |
| 7 | G | Polish after the data model is stable |

## 7. Verification

- Golden tests: one male and one female fixture per pack; compare IG, TG, descriptor, MAPEH average, TLE 25/75, GMRC domain WS, and final grade to Excel (values, not formulas).
- Export round-trip: fill official template, reopen in Excel, confirm HELPER-driven Term Grade still matches the app.
- SF9 print: name, LRN, birthdate, ages, three narrative blocks, attendance totals, legend wording.
- No change to stored raw scores when only labels or export templates change.
- Existing Grade 1 one-letter ratings remain valid; per-skill squares default to that letter until edited.

## 8. Open DepEd questions (do not guess in code)

- Whether Grades 2–3 in SY 2026-2027 should use this numeric 2–10 pack or the Grade 1 PACE/SF9 file (the Grade 1 INPUT sheet says it accepts Grade 1 to Grade 3).
- Whether GMRC domain scoring applies to Grade 2 Makabansa-era GMRC and Grade 7–10 Values Education identically (the same workbook is used for both).
- Whether APE for Grade 1 has a separate official PACE page later this SY.
- Official BoSY/EoSY dates for age (hard-coded 2026-06-08 / 2027-04-08 in the sample file).
