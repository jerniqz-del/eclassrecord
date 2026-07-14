# Grade Transfer File Schema v1.0

Grade Transfer Files are UTF-8 JSON documents for offline exchange of one subject’s final grades for one term. The media type is `application/json`; the recommended extension is `.json`.

## Envelope

```json
{
  "format": "eclass-record-grade-export",
  "schemaVersion": "1.0",
  "exportId": "unique-export-id",
  "exportedAt": "2026-07-13T01:00:00.000Z",
  "appVersion": "1.4.6",
  "school": { "name": "Example School", "schoolId": "123456" },
  "teacher": { "name": "Teacher A" },
  "schoolYear": "2026-2027",
  "class": {
    "id": "local-source-class-id",
    "name": "Mathematics 4 - Molave",
    "gradeLevel": "4",
    "section": "Molave"
  },
  "subject": {
    "name": "Campus Journalism",
    "normalizedKey": "CAMPUS JOURNALISM",
    "isSpecialProgramSubject": true,
    "specialProgramWeights": [10, 70, 20]
  },
  "term": { "number": 1, "label": "Term 1" },
  "learners": [
    {
      "learnerId": "local-source-learner-id",
      "lrn": "123456789012",
      "lastName": "Cruz",
      "firstName": "Juan",
      "middleName": "Santos",
      "extensionName": "",
      "fullName": "Cruz, Juan Santos",
      "finalGrade": 88,
      "gradeStatus": "final",
      "remarks": ""
    }
  ]
}
```

## Validation rules

- `format` must equal `eclass-record-grade-export` and `schemaVersion` must equal `1.0`.
- `exportId` must be present and unique per export; `exportedAt` must be a valid ISO-8601 timestamp.
- Root `schoolYear`, class grade level and section, subject name and normalized key, and `term.number` are required. Supported term numbers are `1`, `2`, and `3`.
- `learners` must be a non-empty array. Each row needs first and last name plus one finite numeric `finalGrade` from 60 through 100.
- LRNs, when present, are 12 digits and must not be duplicated in the file.
- Raw scores, assessment columns, HPS, attendance, and grades from other terms are outside this schema and must not be exported.
- Unknown properties may be retained for forward compatibility, but importers must not treat them as authoritative grade data.
- `subject.isSpecialProgramSubject` and `subject.specialProgramWeights` are optional v1.0 fields. When marked special, weights must contain three whole percentages from 0 to 100 totaling 100. The file must match an active special subject in an active Special Class. Older unmarked files may match an active special subject by normalized name with a review warning.
- The adviser&apos;s `includeInGeneralAverage` choice is local Advisory configuration and is never overwritten by a teacher&apos;s Grade Transfer File.

## Matching and identity

Import uses exact LRN matching first. Normalized-name fallback is allowed only when it resolves uniquely. Source-local IDs are provenance only and are not assumed to identify a learner on another computer. Manual mappings must be one-to-one within an import.

## Duplicate, correction, and conflict handling

The importer calculates a deterministic file fingerprint and records `exportId`. An already-applied exact file is rejected as a duplicate. A changed file with the same export context is presented as a corrected re-export. A grade key is unique by Advisory Class, Advisory learner, subject, and term. If that key already exists, import requires an explicit keep-or-replace decision.

Every confirmed import creates an immutable audit batch with filename, fingerprint, source context, counts, decisions, and undo metadata. Import is transactional: any failure restores the pre-import snapshot.

## Versioning

`schemaVersion` follows major/minor notation. A new major version may change required structure and must not be accepted silently by a v1.0 importer. A minor-compatible reader may ignore unknown optional fields while continuing to enforce all v1.0 identity, scope, privacy, and final-grade rules.
