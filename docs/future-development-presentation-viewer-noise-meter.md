# Temporary Presentation Viewer and Interactive Noise Meter

**Status:** Planned for future development

**Target workspace:** Teacher Tools

**Implementation branch:** `codex/offline-first-features`

**Operating model:** Offline, temporary, read-only, and independent of the
learner database

## 1. Objective

Add two tools to the existing Teacher Tools workspace:

1. **Presentation Viewer**
   - Opens a user-selected `.pptx` temporarily.
   - Presents it inside E-Class Record without requiring PowerPoint.
   - Never edits, copies, saves, backs up, or synchronizes the presentation.
   - Provides presenter controls and temporary teaching overlays.
   - Can begin from Slide 1 or the currently selected slide.
2. **Noise Meter**
   - Works as a standalone Teacher Tool.
   - Can also appear as an overlay during a presentation.
   - Measures relative classroom noise using the microphone.
   - Displays configurable visual and optional sound warnings.
   - Never records, transcribes, saves, or transmits audio.

Neither feature requires generative AI, an internet connection, or a cloud
service.

## 2. Confirmed Scope

### Presentation Viewer

- Temporary `.pptx` opening.
- Read-only slide rendering.
- Thumbnail sidebar.
- Current and next-slide previews.
- Previous, next, first, last, and direct slide navigation.
- Present from beginning.
- Present from selected slide.
- Single-display presentation.
- Dual-display presenter and audience mode.
- Timer.
- Stopwatch.
- Noise Meter overlay.
- Drawing tools.
- Resizable pointer.
- Mini Name Picker.
- Random Wheel.
- Dice and Coin Flip.
- Quick Group Generator.
- Simple icebreaker activities.
- Black and white screens.

### Standalone Noise Meter

- Microphone selection.
- Relative noise-level display.
- Calibration.
- Adjustable threshold.
- Sustained-noise detection.
- Warning cooldown.
- Editable attention message.
- Visual themes.
- Optional chime or shush sound.
- Full-screen attention display.

### Explicitly Excluded

- Editing PowerPoint content.
- Saving changes into the `.pptx`.
- Presentation libraries or recent-file history.
- Copying presentations into AppData.
- Presentation backups.
- OneDrive synchronization of presentations.
- Presentation recovery.
- Cloud rendering.
- Generative AI.
- Legacy `.ppt` support in the first release.
- PowerPoint macros.
- Full PowerPoint animation compatibility.
- Guaranteed rendering of embedded OLE objects.
- Certified decibel measurement.
- Audio recording or speech recognition.

## 3. Current Application Assessment

The feature is not currently implemented.

Reusable infrastructure already available:

- Teacher Tools registry.
- Random Student Picker.
- Group Generator.
- Secure randomization.
- Offline classroom games.
- Active class and learner access.
- Electron native file dialogs.
- Multiple-window support.
- Context isolation.
- Restricted preload interfaces.
- Full-screen controls.
- Offline smoke testing.
- Obfuscated production builds.
- Help Center and interactive tours.

The current Teacher Tools are registered in:

```text
src/renderer/js/teacher-tools.js
src/renderer/js/teacher-tools-core.js
```

## 4. Tool Placement

The Teacher Tools order will be:

1. Group Randomizer.
2. Name Picker.
3. Grade Simulator.
4. Presentation Viewer.
5. Noise Meter.
6. Offline Games.

Internal tool IDs:

```text
presentation
noise-meter
```

The Presentation Viewer tab will act as the launcher and session-status screen.
The presentation workspace will open in a separate E-Class Record window so
untrusted PPTX content cannot access the main database interface. This remains
an in-app feature and will not launch PowerPoint or a web browser.

## 5. Architecture

```text
Teacher Tools
  |
  +-- Presentation Viewer Tool
  |     |
  |     +-- Temporary Session Manager
  |           |
  |           +-- Sandboxed Presentation Workspace
  |                 |
  |                 +-- Presenter Controls
  |                 +-- Audience Window
  |
  +-- Noise Meter Tool
        |
        +-- Microphone Session Manager

Current Class Roster
  |
  +-- Sanitized Temporary Roster
        |
        +-- Mini Name Picker / Group Generator
```

### Main E-Class Record Window

Responsibilities:

- Teacher Tools registration.
- Profile and class selection.
- Sanitized learner-name snapshots.
- Presentation session status.
- Opening and closing the presentation workspace.

It will not parse PPTX content.

### Presentation Workspace Window

Responsibilities:

- PPTX rendering.
- Slide thumbnails.
- Presenter controls.
- Teaching overlays.
- Current and next-slide previews.

Required security configuration:

```text
contextIsolation: true
nodeIntegration: false
sandbox: true
webSecurity: true
```

It receives only a narrowly scoped presentation API.

### Audience Window

Responsibilities:

- Current slide.
- Black or white screen.
- Pointer.
- Temporary drawings.
- Timer or stopwatch.
- Name Picker reveal.
- Noise warning.

It receives no database, backup, synchronization, update, or general filesystem
APIs.

## 6. Renderer Strategy

The initial technical candidate is `@aiden0z/pptx-renderer`, pinned to an exact
tested version. It renders PPTX content locally through HTML and SVG and provides
single-slide rendering, thumbnails, navigation, lazy loading, and safety limits
for untrusted ZIP content.

Documented limitations include animations, transitions, OLE objects, equations,
some advanced effects, and complete EMF/WMF rendering. The renderer must pass a
technical compatibility and security spike before it becomes a permanent
dependency.

The renderer will be isolated behind an internal adapter:

```javascript
PresentationRenderer.open(bytes, options)
PresentationRenderer.getSlideCount()
PresentationRenderer.renderSlide(index, container)
PresentationRenderer.renderThumbnail(index, container)
PresentationRenderer.destroy()
```

No application code outside the adapter should call the third-party renderer
directly.

### Packaging

Store the pinned standalone browser build under:

```text
src/renderer/vendor/pptx-renderer/
```

Store its license under:

```text
src/renderer/vendor/pptx-renderer/LICENSE
```

The production obfuscation process must exclude:

```text
src/renderer/vendor/**
```

The renderer must never be loaded from a CDN.

## 7. Temporary Presentation Lifecycle

### Opening a Presentation

1. Teacher selects Presentation Viewer.
2. Teacher presses **Open Presentation**.
3. The native file dialog accepts `.pptx`.
4. The main process validates the selected file.
5. The main process opens the file in read-only mode.
6. The file is loaded into a temporary memory buffer.
7. The file handle is immediately closed.
8. A cryptographically random session ID is generated.
9. The presentation workspace opens.
10. The renderer parses the memory buffer.
11. Slide 1 becomes selected.
12. Thumbnails load progressively.

### File Validation

- The file must exist and be a regular file.
- The extension must be `.pptx`.
- It must have a valid ZIP/OOXML signature.
- Required PPTX package entries must exist.
- Source and expanded-package sizes must remain within configured limits.
- Slide count must remain within the configured limit.
- Invalid relationship targets must be rejected.
- Password-protected and encrypted files must be rejected.
- Macro-enabled `.pptm` files must be rejected.
- Legacy `.ppt` files must be rejected.

Proposed initial limits:

| Limit | Initial value |
| --- | ---: |
| Source file | 100 MB |
| Slides | 250 |
| Expanded package | 500 MB |
| ZIP entries | 10,000 |
| Individual media item | 50 MB |
| Embedded fonts | Renderer safe default |

These limits must be finalized after performance testing.

### Closing a Presentation

Closing the workspace will:

- Close the audience window.
- Stop the timer and stopwatch.
- Release the microphone.
- Clear drawings.
- Remove pointer state.
- Destroy slide and thumbnail renderers.
- Revoke Blob URLs.
- Clear roster snapshots.
- Clear presentation buffers.
- Close the presentation session.
- Release all remaining references for garbage collection.

No application-authored presentation, thumbnail, annotation, or cache file will
remain on disk.

## 8. Presentation Session State

All session state remains in memory:

```javascript
{
  sessionId: "",
  fileName: "",
  fileSize: 0,
  slideCount: 0,

  selectedSlideIndex: 0,
  presentedSlideIndex: 0,

  workspaceReady: false,
  audienceReady: false,
  presenterActive: false,
  selectedDisplayId: "",

  blankMode: "none",
  renderWarnings: [],

  timer: {},
  stopwatch: {},
  pointer: {},
  annotationsBySlide: new Map(),
  namePicker: {},
  icebreaker: {},
  noiseMeter: {}
}
```

Indexes are zero-based internally and displayed as one-based slide numbers. No
part of this object is written to the profile database.

## 9. IPC Interfaces

### Main-Window Presentation API

```javascript
openTemporaryPresentation()
openPresentationWorkspace(sessionId, rosterSnapshot)
getPresentationSessionStatus()
closePresentationSession(sessionId)
onPresentationSessionChanged(callback)
```

### Presentation-Workspace API

Expose through a separate restricted preload:

```javascript
loadPresentationSession(sessionId)
listPresentationDisplays()
startAudiencePresentation(request)
sendPresentationCommand(command)
stopAudiencePresentation()
closePresentationWorkspace()
acquireMicrophone()
releaseMicrophone()
saveLocalToolPreferences(preferences)
```

### Audience API

```javascript
loadAudienceSession(sessionId)
onPresentationCommand(callback)
reportAudienceReady()
reportAudienceError(error)
```

### Allowed Command Types

```text
go-to-slide
black-screen
white-screen
clear-blank-screen
pointer-show
pointer-move
pointer-hide
annotation-batch
annotation-clear
timer-state
stopwatch-state
name-picker-result
icebreaker-state
noise-level
noise-warning
close-audience
```

Every command must be validated for:

- Correct sender window.
- Correct session ID.
- Valid slide index.
- Finite coordinates.
- Maximum text length.
- Maximum annotation points.
- Allowed colors and tool types.
- Allowed command type.

Unknown commands must be rejected.

## 10. Presentation Viewer Interface

### Empty State

Show:

- Presentation Viewer title.
- **Open Presentation** button.
- `.pptx` support notice.
- Read-only notice.
- Temporary-session notice.

Suggested notice:

> Open a PowerPoint presentation for temporary viewing. E-Class Record will not
> edit, save, back up, or synchronize the file.

### Loaded State

Thumbnail sidebar:

- Virtualized thumbnail list.
- Slide number.
- Selected-slide indicator.
- Render-warning indicator.
- Keyboard focus.
- Automatic scrolling to the selected slide.

Main preview:

- Selected slide.
- Previous and next controls.
- First and last controls.
- Slide-number input.
- Fit to window.
- Zoom.
- Reload selected slide.
- Rendering status.
- Compatibility warnings.

Presentation actions:

- **Present from Beginning**.
- **Present from Selected Slide — Slide X**.
- **Close Presentation**.

Selecting a thumbnail changes `selectedSlideIndex` but does not begin presenting.

## 11. Present From Selected Slide

### From the Beginning

Triggered by:

- **Present from Beginning**.
- `F5`.

```text
startIndex = 0
```

### From the Selected Slide

Triggered by:

- **Present from Selected Slide — Slide X**.
- `Shift + F5`.

```text
startIndex = selectedSlideIndex
```

### Start Sequence

1. Confirm a presentation is loaded.
2. Confirm the selected index is valid.
3. Render the selected slide successfully.
4. Ask for the target display when more than one is available.
5. Create the audience window hidden.
6. Load the presentation into the audience renderer.
7. Navigate to `startIndex`.
8. Wait for the audience to report that the slide rendered.
9. Show and full-screen the audience window.
10. Set `presentedSlideIndex = startIndex`.
11. Render current and next-slide presenter previews.
12. Enable presentation shortcuts and overlays.

The audience window must not appear as a blank white window while loading.

If the selected slide cannot render, do not start Presenter Mode. Show the
slide-specific error and offer:

- Retry.
- Select another slide.
- Present from the previous valid slide.
- Present from the next valid slide.

## 12. Presenter Mode

### Presenter Workspace

Display:

- Current slide.
- Next slide.
- Thumbnail strip.
- Slide number.
- Presentation clock.
- Timer.
- Stopwatch.
- Pointer controls.
- Drawing controls.
- Name Picker.
- Icebreakers.
- Noise Meter.
- Audience-visibility toggles.
- End Presentation.

### Audience Window

- Display the slide at the correct aspect ratio.
- Use letterboxing when needed.
- Show no application controls.
- Hide the normal mouse cursor unless pointer mode is active.
- Render temporary overlays above the slide.

### Display Selection

Use Electron's screen API to identify:

- Primary display.
- Connected projector or secondary monitor.
- Display bounds.
- Scale factor.
- Selected display.

If a projector is disconnected:

1. Pause slide commands.
2. Move the audience window to the primary display.
3. Leave full-screen temporarily.
4. Warn the presenter.
5. Preserve the current slide and overlays.
6. Allow the teacher to resume.

## 13. Keyboard Controls

| Key | Action |
| --- | --- |
| `F5` | Present from beginning |
| `Shift + F5` | Present from selected slide |
| `Right`, `Page Down`, or `Space` | Next slide |
| `Left` or `Page Up` | Previous slide |
| `Home` | First slide |
| `End` | Last slide |
| Slide number and `Enter` | Go to slide |
| `B` | Toggle black screen |
| `W` | Toggle white screen |
| `T` | Open Timer |
| `S` | Open Stopwatch |
| `L` | Toggle laser pointer |
| `D` | Toggle drawing mode |
| `E` | Eraser |
| `Ctrl + Z` | Undo drawing |
| `Ctrl + Shift + Z` | Redo drawing |
| `Esc` | Exit the active overlay or presentation |

Shortcuts are active only while the presentation workspace has focus. Typing
inside an input must not trigger presentation shortcuts.

## 14. Drawing and Pointer System

### Coordinate System

Store coordinates normalized to the slide canvas:

```text
x: 0.0–1.0
y: 0.0–1.0
```

Coordinates must be calculated from the actual displayed slide bounds rather
than the entire window because letterboxing changes the usable area.

### Drawing Tools

- Pen.
- Highlighter.
- Straight line.
- Rectangle.
- Circle.
- Eraser.
- Undo.
- Redo.
- Clear current slide.

Stroke representation:

```javascript
{
  id: "",
  slideIndex: 0,
  tool: "pen",
  color: "#ef4444",
  opacity: 1,
  width: 4,
  points: [{ x: 0.2, y: 0.4 }]
}
```

Controls:

- Maximum points per stroke.
- Point decimation.
- Maximum strokes per slide.
- Batched audience updates.
- Maximum update frequency.

Annotations remain while navigating between slides but are discarded when the
presentation closes.

### Pointer Types

- Laser.
- Arrow.
- Circle.
- Spotlight.
- Highlighter cursor.

Adjustable properties:

- Size.
- Color.
- Opacity.
- Trail.
- Audience visibility.

Pointer events should be limited to approximately 30 updates per second.

## 15. Timer and Stopwatch

### Timer

- Hours, minutes, and seconds.
- Start, pause, resume, and reset.
- Add or subtract time.
- Warning threshold.
- Final visual alert.
- Optional sound.
- Presenter-only or audience-visible.
- Movable and resizable audience overlay.

Use a target timestamp instead of subtracting one second per interval:

```javascript
remaining = endsAt - Date.now()
```

### Stopwatch

- Start.
- Pause.
- Resume.
- Reset.
- Optional laps.
- Presenter-only or audience-visible.

Timer and stopwatch state disappear when the presentation session closes.

## 16. Mini Name Picker and Icebreakers

### Temporary Roster

The main renderer provides only:

```javascript
{
  assignmentId: "",
  label: "Grade 6 - Narra (Mathematics)",
  learners: [
    { id: "", displayName: "" }
  ]
}
```

Exclude:

- LRN.
- Birthdate.
- Grades.
- Attendance.
- Parent data.
- Health notes.
- Contact information.

### Name Picker

Reuse the existing no-repeat picker logic.

- Class selector.
- Pick learner.
- Pick another.
- Reset cycle.
- Presenter preview.
- Audience reveal.
- Reduced-motion support.

Selections are not saved.

### Initial Icebreakers

- Random Wheel.
- Dice Roller.
- Coin Flip.
- Quick Group Generator.
- This or That.
- Random Number.
- Short movement-break prompt.

Activities appear over the presentation and return to the same slide when
closed.

## 17. Standalone Noise Meter

### Controls

- Start Listening.
- Stop Listening.
- Microphone selector.
- Calibrate.
- Sensitivity.
- Threshold.
- Sustained-noise duration.
- Cooldown.
- Theme.
- Attention message.
- Sound on/off.
- Test Warning.

### Measurement

Use:

```text
navigator.mediaDevices.getUserMedia()
AudioContext
MediaStreamAudioSourceNode
AnalyserNode
```

Processing:

1. Read time-domain samples.
2. Calculate RMS amplitude.
3. Convert to relative dBFS.
4. Apply exponential smoothing.
5. Map calibrated quiet and loud references to 0–100.
6. Compare against the configured threshold.
7. Require sustained noise before warning.
8. Apply hysteresis and cooldown.

The interface must say **Relative Noise Level**, not certified decibels.

Proposed defaults:

| Setting | Default |
| --- | ---: |
| Threshold | 70 |
| Sustained duration | 1.5 seconds |
| Warning cooldown | 10 seconds |
| Clear hysteresis | Threshold minus 5 |
| Display updates | 15–30 per second |
| Sound | Off |

### Themes

- Traffic Light.
- Classroom Mascot.
- Quiet Library.
- Space Mission.
- Minimal Meter.

Default attention message:

```text
Please lower your voices.
```

### Feedback Prevention

When the app plays a warning:

1. Suspend noise-trigger evaluation.
2. Play the bundled local warning.
3. Wait for the sound to finish.
4. Add a short guard interval.
5. Resume listening.
6. Apply the normal cooldown.

## 18. Microphone Permission and Privacy

Implement a singleton microphone-session manager.

- Access begins only after **Start Listening**.
- Only one E-Class Record window can own the microphone.
- The main process tracks the authorized window.
- Permission is limited to audio.
- Camera permission is always rejected.
- Remote content is always rejected.
- Permission is released when Stop is pressed.
- All media tracks are stopped during cleanup.
- The AudioContext is closed.
- Profile locking closes microphone access.
- Application exit closes microphone access.
- `MediaRecorder` is never used.
- Audio samples are never stored or transmitted.

Persistent listening notice:

> Microphone active — audio is measured locally and is not recorded.

## 19. Local Preferences

Presentation contents and session state are never persisted.

The following non-presentation preferences may be stored locally per device:

- Preferred display.
- Pointer style.
- Timer sound setting.
- Noise Meter theme.
- Noise threshold.
- Noise sensitivity.
- Warning cooldown.
- Attention message.

They must remain outside:

- Profile database.
- Backups.
- OneDrive synchronization.
- Learner-data merge logic.

Use a versioned local preference object:

```javascript
{
  version: 1,
  preferredDisplayId: "",
  pointer: {},
  noiseMeter: {}
}
```

Provide a **Reset Tool Preferences** action.

## 20. Proposed Source Changes

### New Files

```text
src/main/presentation-session.js
src/main/presentation-preload.js

src/renderer/presentation-workspace.html
src/renderer/presentation-audience.html

src/renderer/js/presentation-tool.js
src/renderer/js/presentation-workspace.js
src/renderer/js/presentation-audience.js
src/renderer/js/presentation-renderer-adapter.js
src/renderer/js/presentation-overlays.js
src/renderer/js/noise-meter-core.js
src/renderer/js/noise-meter-tool.js

src/renderer/css/presentation-tool.css
src/renderer/css/presentation-workspace.css
src/renderer/css/presentation-audience.css
src/renderer/css/noise-meter.css

src/renderer/vendor/pptx-renderer/
src/renderer/assets/audio/classroom-attention.ogg

scripts/test-presentation-viewer.js
scripts/test-presentation-security.js
scripts/test-noise-meter.js
```

### Existing Files to Modify

`src/main/main.js`:

- Create the session manager.
- Add IPC handlers.
- Add display handling.
- Add presentation workspace and audience windows.
- Add microphone permission handlers.
- Close sessions before application exit.
- Extend Electron smoke testing.

`src/main/preload.js`:

- Add only the main-window presentation launcher APIs.
- Do not expose audience or raw session-buffer APIs.

`src/renderer/js/teacher-tools.js`:

- Add icons.
- Register Presentation Viewer.
- Register Noise Meter.
- Add activation and deactivation hooks.
- Preserve existing tool-state rules.

`src/renderer/index.html`:

- Add presentation and Noise Meter styles.
- Load their application modules before Teacher Tools initialization.

`scripts/obfuscate.js`:

- Exclude third-party vendor assets.
- Continue obfuscating application-owned presentation logic.

`package.json`:

```text
test:presentation-viewer
test:presentation-security
test:noise-meter
```

Append the tests to the complete test chain.

`scripts/test-teacher-tools.js`:

- Verify Presentation Viewer registration.
- Verify Noise Meter registration.
- Verify tool order.
- Verify deactivation hooks.
- Verify vendor isolation.
- Verify no database save call from presentation modules.

## 21. Implementation Phases

### Phase A — Renderer and Security Spike

Deliverables:

- Renderer adapter prototype.
- PPTX compatibility fixture set.
- Memory and performance measurements.
- Corrupted-file testing.
- Renderer license review.
- Go/no-go decision.

Gate:

- No production UI until renderer quality and cleanup are acceptable.

### Phase B — Temporary Viewer Under Teacher Tools

Deliverables:

- Presentation Viewer registration.
- `.pptx` selection.
- Temporary session.
- Slide preview.
- Virtualized thumbnails.
- Navigation.
- Close and cleanup.
- Unsupported-content warnings.

Gate:

- Original file hash and modification timestamp remain unchanged.
- No presentation files appear in AppData.
- The database remains unchanged.

### Phase C — Presenter and Audience Windows

Deliverables:

- One-screen mode.
- Dual-screen mode.
- Current and next previews.
- Start from beginning.
- Start from selected slide.
- Projector selection.
- Keyboard navigation.
- Black and white screens.

Gate:

- The audience opens on the requested slide without a blank flash.
- Projector disconnection does not terminate the app.

### Phase D — Teaching Overlays

Deliverables:

- Timer.
- Stopwatch.
- Pointer.
- Drawing tools.
- Mini Name Picker.
- Icebreakers.
- Normalized coordinate synchronization.

Gate:

- All overlays remain temporary.
- Nothing modifies the PPTX or learner records.

### Phase E — Standalone Noise Meter

Deliverables:

- Teacher Tools tab.
- Microphone management.
- Calibration.
- Relative level.
- Threshold.
- Warning.
- Themes.
- Privacy interface.

Gate:

- Permission denial and device removal are safe.
- No audio recording or persistence exists.

### Phase F — Presentation Noise Meter

Deliverables:

- Presenter Noise Meter.
- Audience overlay.
- Resizing and positioning.
- Warning cooldown.
- Feedback prevention.
- Single microphone ownership.

Gate:

- Standalone and presenter meters cannot capture simultaneously.

### Phase G — Hardening and Release Preparation

Deliverables:

- Help Center articles.
- Interactive tour.
- Compatibility notice.
- Keyboard-shortcut guide.
- Privacy notice.
- Full regression suite.
- Installer validation.
- Offline smoke test.
- Third-party license notices.

Gate:

- All existing tests pass.
- The packaged installer works without internet, PowerPoint, or LibreOffice.

## 22. Required Test Matrix

### PPTX Files

- Empty presentation.
- One slide.
- More than 100 slides.
- 4:3, 16:9, and custom dimensions.
- Text and images.
- Tables.
- Charts.
- SmartArt.
- Grouped shapes.
- Missing and embedded fonts.
- SVG.
- EMF/WMF fallback.
- Embedded video and audio.
- Animations and transitions.
- Password-protected file.
- Corrupted file.
- Renamed non-PPTX file.
- Oversized file.
- ZIP bomb.
- External hyperlink.
- Remote image relationship.

### Presentation Behavior

- Start from Slide 1.
- Start from a middle slide.
- Start from the final slide.
- Start after thumbnail selection.
- Start after keyboard selection.
- Selected slide fails rendering.
- Previous and next at boundaries.
- Black and white screens.
- Exit and resume.
- One and two monitors.
- Projector removed.
- DPI scaling.
- Window resize.
- Application minimize.
- Profile lock.
- Application exit.

### Overlays

- Drawing alignment at every supported aspect ratio.
- Pointer alignment.
- Undo and redo.
- Slide-specific drawings.
- Resize during drawing.
- Timer accuracy after minimize.
- Stopwatch accuracy.
- Name Picker no-repeat cycle.
- Closing an icebreaker restores the slide.
- Reduced-motion mode.

### Noise Meter

- No microphone.
- Permission denied or revoked.
- Microphone disconnected.
- Multiple microphones.
- Very quiet input.
- Continuous loud input.
- Short loud spike.
- Warning cooldown.
- App warning sound feedback.
- Standalone-to-presenter ownership transfer.
- Profile lock.
- Application exit.

## 23. Final Acceptance Criteria

The feature is complete only when:

- Presentation Viewer appears under Teacher Tools.
- Noise Meter appears under Teacher Tools.
- A teacher can open a `.pptx` without PowerPoint.
- The presentation works without internet.
- The source file is never modified.
- The app creates no persistent presentation copy.
- The presentation is excluded from backups and synchronization.
- The root database schema remains unchanged.
- The teacher can select any valid slide.
- **Present from Beginning** starts at Slide 1.
- **Present from Selected Slide** starts at the selected slide.
- Presenter current and next-slide previews are correct.
- The audience receives the correct slide and overlays.
- Timer and stopwatch remain accurate.
- Drawings and pointers scale correctly.
- Name Picker uses the selected class without exposing unnecessary learner data.
- Noise Meter measures only relative sound level.
- Microphone access is explicit and visible.
- No audio is recorded, stored, transcribed, or transmitted.
- Closing the session clears all temporary content.
- Corrupted or hostile files cannot overwrite or expose the database.
- Existing grading, attendance, Advisory Class, backup, recovery, and OneDrive
  tests continue passing.
- The packaged installer contains every renderer, audio, style, and script asset
  required for offline use.

## References

- PPTX renderer documentation and limitations:
  https://github.com/aiden0z/pptx-renderer
- Electron session and permission APIs:
  https://www.electronjs.org/docs/latest/api/session
- Electron security guidance:
  https://www.electronjs.org/docs/latest/tutorial/security

This document is a future-development plan. It is not a released feature,
version commitment, or approval to change the database compatibility contract.
