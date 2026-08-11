# Classroom Management Roadmap

Implemented in local checkpoints after v1.9.0. This work does not change the application version and does not publish a release.

## Delivered features

- Independent themes for Group Randomizer and Name Picker, including shared-theme preview and reduced-motion/Low-Spec behavior.
- Class- and term-scoped participation-star events with award, undo, protected reset, standings, picker modes, attendance filtering, and CSV export.
- Performance Checklist activities with soft deletion/restoration, numerical or multi-item checklist scoring, duplication, detailed exports, and protected mode changes.
- Guided, learner-level checklist publication to compatible official assessments, including assessment creation, stale-state/overflow checks, atomic rollback, audit history, revert, and unlock.
- Selected-class Assessment Mix and prioritized Needs Attention dashboard cards with class filters and stable scrolling.
- A versioned DepEd Order No. 9, s. 2026 calendar source pack and virtual, local-only learner birthdays.
- Classroom Timer and Agenda, Participation Tracker, privacy-preserving Noise Meter, Seating Chart, Exit Ticket, Anecdotal Notes, Boat Race, and Class Duels.

## Data and migration behavior

Teacher Tools schema version 7 keeps unknown future fields and normalizes malformed optional records. New data remains inside the active profile:

- `appearancePreferences`
- `participationStarEvents`
- `classroomToolSessions`
- `performanceChecklists` and publication histories
- `calendarPreferences.sourcePacks` and calendar filters
- `classroomRoutines`
- `noiseMeterConfig`
- `seatingLayouts`
- `exitTickets`
- `anecdotalNotes`

Existing backups and Shared Folder Sync continue to use the profile database boundary. Legacy checklist data migrates to a single `Completed` check item. Future schema versions are never downgraded.

## Safety and privacy decisions

- Stars, exit tickets, timer sessions, and game points never write to official scores.
- Checklist publication is the only new workflow that can write official scores; it requires a learner-level review and applies atomically with rollback.
- Noise Meter requests microphone permission only after the teacher presses Start. It processes amplitude locally, retains aggregates only, never creates a recording, and releases its stream when paused or closed.
- Birthdays are generated virtually from the roster. They are not copied into stored calendar events and are excluded from remote sync and exports by default.
- Anecdotal notes are private profile data and are excluded from normal exports. Export requires typing `EXPORT PRIVATE NOTES`.
- Local teacher reminders are preserved when the official calendar pack refreshes; official source events are immutable.

## Official calendar source

The source pack uses [DepEd Order No. 9, s. 2026](https://www.deped.gov.ph/wp-content/uploads/DO_s2026_009r.pdf), verified August 11, 2026. Term 3 is stored as January 4–April 8, 2027. One scanned heading says 2026, but the order's summary table and January–April monthly pages establish 2027.

February 29 birthdays are shown on February 28 in non-leap years. The original birthdate is not modified.

## Verification

The full `npm test` suite and separate `npm run test:link-preview` security test pass. Focused coverage includes migrations, future-field round trips, class/term isolation, calendar boundaries, birthday deduplication/privacy, microphone mocks and resource release, seating locks, private-note export confirmation, point-ledger undo/history, and atomic checklist rollback.

## Recommended manual smoke test

1. Open Teacher Tools at desktop and narrow window widths; tab through every new control and verify visible focus.
2. Change the working class and term while each classroom tool is open; verify no participants, points, stars, or layouts cross contexts.
3. Start, pause, resume, skip, and reset a multi-segment routine; enter and leave fullscreen.
4. Start Noise Meter, deny permission once, then allow it; pause and close the tool and confirm the microphone indicator turns off.
5. Drag a seating card, repeat the move using the seat selector, lock a seat, randomize, mark absent, and print.
6. Record all three exit-ticket states and confirm the follow-up list.
7. Add and search a private note; confirm normal exports omit it and the protected private export requires the exact phrase.
8. Create Randomizer teams, open Boat Race, award/remove/undo points, then run learner and team duels with the timer.
9. Open the School Calendar in each boundary month, filter Official/Local/Birthdays, and verify a duplicated learner appears once.
10. Publish a checklist activity, deliberately create a stale/overflow case, verify it is blocked, then revert a valid publication.

No push, version bump, release, cloud dependency, or telemetry change is part of this roadmap.
