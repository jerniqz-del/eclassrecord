# Android academic workspace UI research

Audience: E-Class Record Android implementers  
Date: September 4, 2026  
Scope: Calendar, Attendance, Classes, and Grading Sheets on phones. Desktop data remains authoritative and mobile edits remain encrypted drafts until accepted.

## Direct design decision

Use state-driven Material 3 controls and lazy lists for accessibility and predictable behavior, while applying the project's 3D icons, elevated cards, gradients, and short state transitions as a visual layer. Avoid adding a calendar dependency because the required single-month/event-agenda experience is small enough to implement with the existing Java time and Compose APIs.

## Applied patterns

- Calendar: selectable month grid, locale-derived first weekday, visible event dots, previous/next/today navigation, and a focused agenda for the selected date.
- Attendance: class/date/term remain visible near the top; immediate totals communicate the state of the session; learner search and one-row status chips reduce repeated scrolling; mark everyone present accelerates the common case.
- Classes: persistent search, grade filters, consistent subject cards, learner/activity/attendance metrics, and grading completion on each card.
- Grading: overall term completion first, filters that prioritize unfinished sheets, component summary chips, and progressive transitions between assessment, individual, grid, and summary modes.
- Accessibility: Material buttons, chips, and fields retain their built-in semantics; custom calendar days and status actions use at least 48dp interaction height.

## Claim-to-source ledger

- Kizitonwose Calendar, Compose documentation, accessed September 4, 2026: demonstrates lazy month/week calendar surfaces, locale-aware weekday ordering, custom day content, selection, and event-style decoration. https://github.com/kizitonwose/Calendar/blob/main/docs/Compose.md
- Android Compose Samples, Android Open Source Project, accessed September 4, 2026: documents custom design systems, state-driven animation, search/filter layouts, and adaptive Material 3 patterns. https://github.com/android/compose-samples
- Jetsnack Search, Android Open Source Project, accessed September 4, 2026: uses explicit query state and separate empty, suggestion, and result states for fast filtering. https://github.com/android/compose-samples/blob/main/Jetsnack/app/src/main/java/com/example/jetsnack/ui/home/search/Search.kt
- AttendanceHub, WAHID-QANDIL, updated December 1, 2025, accessed September 4, 2026: an offline-first Compose/Material 3 teacher attendance implementation using immutable UI state and reactive flow. https://github.com/WAHID-QANDIL/AttendanceHub
- Compose search bar guidance, Android Developers, updated August 14, 2026, accessed September 4, 2026: recommends state-preserving query/filter behavior and lazy result lists. https://developer.android.com/develop/ui/compose/components/search-bar
- Compose date picker guidance, Android Developers, accessed September 4, 2026: distinguishes modal and docked date selection and recommends explicit state ownership. https://developer.android.com/develop/ui/compose/components/datepickers
- Compose accessibility API defaults, Android Developers, accessed September 4, 2026: recommends Material semantics and at least 48dp interactive targets. https://developer.android.com/develop/ui/compose/accessibility/api-defaults

## Limitations

Repository screenshots and patterns were used for interaction research, not copied source. Structural QA, Kotlin compilation, lint, and regression tests cover this implementation; visual inspection on multiple physical screen sizes remains a release smoke-test step.
