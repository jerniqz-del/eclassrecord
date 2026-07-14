# Advisory Class Database Compatibility Contract

This document defines the data guarantees that Advisory Class updates must preserve. Official DepEd form export is outside this scope.

## Storage boundary

Advisory data is stored inside the active teacher profile under `profile.advisory`. Ordinary teaching loads remain in `profile.assignments`; Advisory operations must never move, rewrite, or delete them. Every mutation, backup, restore, import, reset, and integrity check must use the active-profile database accessor rather than a stale global database reference.

The current Advisory schema version is `1` and contains these collections:

| Collection | Parent and identity | Owned relationships |
| --- | --- | --- |
| `classes` | school year + grade level + section; one active class per school year | owns all other Advisory records |
| `learners` | class + unique 12-digit LRN when supplied | referenced by grades |
| `subjects` | class + normalized subject key | referenced by grades and source mappings |
| `grades` | class + learner + subject + term | optional import batch |
| `importBatches` | class + import/export audit identity | referenced by imported grades |
| `sourceMappings` | class + Advisory subject | points to its subject's expected source |

All records retain stable `id`, `createdAt`, and `updatedAt` values. Child records cannot be moved between Advisory classes after creation. Grade class, learner, subject, and term identity cannot be changed after creation; replacing a grade requires an explicit workflow decision.

## Compatibility invariants

1. **Non-destructive migration.** A profile without Advisory data receives empty version-1 collections. Existing teaching loads and unrelated profile fields remain unchanged. Running normalization repeatedly produces the same serialized result.
2. **Forward-field preservation.** Unknown top-level Advisory fields and unknown record fields survive normalization, JSON persistence, backup, and restore. A schema version newer than the app supports is retained and reported as a warning; it is never silently downgraded.
3. **Malformed-shape rejection.** If the Advisory store is not an object, or a known collection is present but is not an array, the operation fails before replacing any data.
4. **Required identity.** Classes require school year, grade level, section, and adviser. Learners require first and last names. Optional LRNs must be exactly 12 digits and unique within the class. Subjects require a display name and normalized key, unique within the class.
5. **Referential ownership.** A grade's learner, subject, and optional import batch must belong to the same class as the grade. A source mapping's subject must belong to the same class as the mapping.
6. **Finite, unique grades.** A grade requires a term and finite numeric final grade. Only one grade may exist for a class/learner/subject/term tuple.
7. **Safe lifecycle.** A class cannot be active and archived simultaneously. There can be only one active class for a school year.
8. **Explicit cascades.** Removing a learner removes only that learner's grades. Removing a subject removes only its grades and mappings. Removing an import batch removes only its imported grades. Removing a class removes all and only its owned Advisory records. Other Advisory classes and teaching loads remain intact.
9. **Restore before replace.** Backup restore normalizes and validates a detached copy. Broken references, duplicates, or malformed collections reject the restore before the current profile is replaced. Missing historical import-batch links remain warnings so older usable grade data is not discarded.
10. **Profile isolation.** Advisory actions affect only the currently selected teacher profile and survive root-database JSON save/reload without leaking into another profile.

These guarantees prevent silent loss or reassignment of known data. They do not promise that an older app understands the meaning of a future field; future schema changes still require an explicit migration and tests.

## Integrity error coverage

The integrity checker detects duplicate IDs in every collection, orphan class/learner/subject references, cross-class relationships, duplicate grades, duplicate subjects, duplicate active classes, incomplete class/learner/subject identity, invalid LRNs, missing grade terms, non-finite grades, and classes marked both active and archived. Newer schemas and missing historical import batches are warnings.

## Automated coverage matrix

| Area | Automated evidence |
| --- | --- |
| Migration, normalization, CRUD, cascades | `test:advisory-data`, `test:advisory-compatibility` |
| Future fields, malformed data, corruption, relationship ownership | `test:advisory-compatibility` |
| Profile separation and JSON restart round trip | `test:advisory-compatibility`, `test:advisory-e2e` |
| Dashboard setup, active class, dynamic sidebar | `test:advisory-dashboard`, offline smoke test |
| Manual/bulk/class roster import and matching | `test:advisory-roster`, offline smoke test |
| Grade Transfer validation, mapping, conflict decisions, rollback, undo | `test:grade-transfer`, `test:grade-conflicts`, `test:advisory-e2e` |
| Backup, encrypted backup, old backup migration, corrupt restore rejection | `test:advisory-backup`, `test:advisory-compatibility`, offline smoke test |
| Reset backup contents and Advisory-only reset | `test:advisory-redesign` |
| Dedicated page, tabs, default-hidden terms, scroll synchronization, zoom and layout | `test:advisory-redesign`, offline smoke test |
| Live integrity and backup/restore in the Electron renderer | offline smoke test |
| Realistic volume | `test:advisory-compatibility` (300 learners, 10 subjects, 3 terms, 9,000 grades) |

Run the complete non-packaging verification with:

```powershell
npm test
npm run smoke:offline
```

The manual workflow checklist remains in [manual-smoke-test-advisory.md](manual-smoke-test-advisory.md).

## Rules for future Advisory schema changes

- Never repurpose or change the meaning of an existing field in place. Add a field or introduce a new schema version.
- Bump `schemaVersion` only with a deterministic migration from every supported older version.
- Preserve unknown fields during reads and writes unless a documented migration deliberately removes one.
- Add fixtures for an older version, the current version, and a simulated newer version.
- Add corruption tests for every new relationship and cascade tests for every new owned record.
- Validate a detached backup before replacing active data.
- Test two teacher profiles, a JSON save/reload, an offline renderer run, and a representative large dataset.
- Keep official-form generation as a consumer of Advisory data, not as its source of truth.
