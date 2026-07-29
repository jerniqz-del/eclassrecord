/**
 * E-Class Record App — Help Center Controller
 * Manages category tab selection, text filtering, and guides documentation.
 */

let helpActiveCategory = 'getting_started';

const HELP_CATEGORIES = [
  { id: 'getting_started', name: '🚀 Getting Started' },
  { id: 'roster_management', name: '👥 Roster Management' },
  { id: 'grading_scoring', name: '📊 Grading & Scoring' },
  { id: 'direct_transfers', name: '🔄 Direct Transfers' },
  { id: 'deped_policies', name: '📋 DepEd Policies & Rules' },
  { id: 'backups_settings', name: '⚙️ Backups & Settings' },
  { id: 'change_history', name: 'Change History & Patches' }
];

function renderImplementationHistoryGuide() {
  const history = (typeof APP_CHANGELOG !== 'undefined' && APP_CHANGELOG && Array.isArray(APP_CHANGELOG.history))
    ? APP_CHANGELOG.history
    : [];

  const latestVersion = typeof APP_CHANGELOG !== 'undefined' && APP_CHANGELOG && APP_CHANGELOG.version
    ? APP_CHANGELOG.version
    : 'current';

  const cards = history.map(entry => `
    <div class="change-history-entry">
      <div class="change-history-entry__header">
        <strong>${esc(entry.version)}</strong>
        <span>${esc(entry.date || '')}</span>
      </div>
      <div class="change-history-grid">
        <div>
          <h5>Implemented changes</h5>
          <ul>${(entry.changes || []).map(item => `<li>${esc(item)}</li>`).join('')}</ul>
        </div>
        <div>
          <h5>Patches that worked</h5>
          <ul>${(entry.worked || []).map(item => `<li>${esc(item)}</li>`).join('')}</ul>
        </div>
        <div>
          <h5>Patches adjusted</h5>
          <ul>${(entry.adjusted || []).map(item => `<li>${esc(item)}</li>`).join('')}</ul>
        </div>
      </div>
    </div>
  `).join('');

  return `
    <p>This guide documents the app changes from the first Electron foundation through the latest v${esc(latestVersion)} update set. It separates the core implemented changes from patches that worked and patches that were later adjusted after testing or release use.</p>

    <div class="help-highlight-box">
      <strong>Repository document:</strong> A fuller engineering history is also kept in <code>docs/implementation-history.md</code>.
    </div>

    ${cards || `
      <div class="help-highlight-box">
        No detailed changelog history is available in this build.
      </div>
    `}
  `;
}

const HELP_TOPICS = [
  {
    id: 'create_profile',
    category: 'getting_started',
    title: 'Creating and Managing Profiles',
    keywords: 'profile create password pin teacher name division region login security encrypt',
    content: `
      <p>Before managing student records, you need a personal user profile. Your profile encrypts all local data securely under a 6-digit passcode.</p>
      <h5>How to Create a Profile:</h5>
      <ol>
        <li>Upon launching the application, click on <strong>Create New Profile</strong> on the profile selection screen.</li>
        <li>Enter your full name, desired 6-digit PIN, and confirm it.</li>
        <li>Once created, select your profile and enter your PIN to enter the dashboard.</li>
      </ol>
      <div class="help-highlight-box">
        <strong>🔒 Security Note:</strong> All databases are stored offline on your local computer. The developer has no access to your files or passwords. Keep your 6-digit PIN safe!
      </div>
    `
  },
  {
    id: 'add_class_load',
    category: 'getting_started',
    title: 'Adding a Teaching Class Load',
    keywords: 'class load subject grade section school year teaching load custom subject group',
    content: `
      <p>Class Loads represent your teaching schedule for different subjects and sections.</p>
      <h5>Steps to Add a Teaching Load:</h5>
      <ol>
        <li>Open the <strong>Teaching Load</strong> view from the sidebar.</li>
        <li>Click <strong>Add Class Load</strong> from the Dashboard card or empty-state action.</li>
        <li>Select the <strong>Grade Level</strong>, enter the <strong>Section</strong> name, and pick the <strong>School Year</strong>.</li>
        <li>Select the <strong>Subject</strong> from the dropdown (or select <em>Custom Subject</em> to type your own subject name).</li>
        <li>Click <strong>Add Teaching Load</strong> to save it to your roster panel.</li>
      </ol>
    `
  },
  {
    id: 'enroll_learners',
    category: 'roster_management',
    title: 'Adding or Enrolling Learners in a Class',
    keywords: 'enroll enrollment enrol enrolment register add learner learners student students roster sf1 upload import bulk transferred transferee new learner class list lrn names teaching load',
    content: `
      <p>In this app, enrolling learners means adding them to the selected class roster in the <strong>Teaching Load</strong> page. You can add one learner manually or use one of the import shortcuts inside the Add New Learner modal.</p>
      <h5>Ways to Add Learners:</h5>
      <ol>
        <li>Open <strong>Teaching Load</strong> from the sidebar.</li>
        <li>Select the class where the learners should be added.</li>
        <li>Click <strong>Add Learner</strong> in the Class Roster card.</li>
        <li>For one learner, enter the LRN, name, and sex, then click <strong>Add Learner</strong>.</li>
        <li>For many learners, use the shortcuts under <strong>Other Ways to Add Learners</strong>: <strong>Upload SF1</strong>, <strong>Import Roster from Other Class</strong>, <strong>Bulk Add Learners</strong>, or <strong>Import Transferred Learner</strong>.</li>
      </ol>
      <div class="help-highlight-box">
        <strong>Tip:</strong> Use <strong>Upload SF1</strong> when you already have the official SF1 spreadsheet. Use <strong>Bulk Add Learners</strong> when you want to paste many names at once.
      </div>
    `
  },
  {
    id: 'add_learner',
    category: 'roster_management',
    title: 'Manually Adding Learners',
    keywords: 'add learner learners enroll enrollment enrol enrolment student lrn first name last name middle name sex boy girl male female roster entry manual encode new learner',
    content: `
      <p>You can add students manually to a class roster one at a time using the Add Learner modal.</p>
      <h5>How to Add a Learner:</h5>
      <ol>
        <li>Open <strong>Teaching Load</strong> from the sidebar.</li>
        <li>Select your active class from the dropdown menu.</li>
        <li>Click the <strong>Add Learner</strong> button at the top-right of the Class Roster card.</li>
        <li>Provide the 12-digit <strong>LRN</strong> (Learner Reference Number), <strong>Last Name</strong>, <strong>First Name</strong>, <strong>Middle Name</strong> (optional), and select their <strong>Sex</strong> (Male or Female).</li>
        <li>Press <strong>Enter</strong> or click <strong>Add Learner</strong> to save the learner.</li>
      </ol>
    `
  },
  {
    id: 'sort_roster',
    category: 'roster_management',
    title: 'Sorting and Arranging the Roster',
    keywords: 'sort roster alphabetical group sex male female boy girl DepEd standard arrange',
    content: `
      <p>Official Department of Education (DepEd) forms require student rosters to be grouped by gender (Boys first, then Girls) and sorted alphabetically within each group.</p>
      <h5>Sorting Your Class Roster:</h5>
      <ol>
        <li>Select your class in the <strong>Teaching Load</strong> view.</li>
        <li>Click the <strong>Sort Roster</strong> button on the roster card toolbar.</li>
        <li>The system will automatically arrange all boys alphabetically from A to Z, followed by all girls from A to Z, recalculating display names and indexes instantly.</li>
      </ol>
    `
  },
  {
    id: 'import_sf1',
    category: 'roster_management',
    title: 'Importing Roster from official SF1 Excel Spreadsheet',
    keywords: 'import sf1 excel school form 1 load roster upload spreadsheet parse automatic copy enroll enrollment learner learners student list official lis',
    content: `
      <p>Avoid typing student profiles manually by importing the official <strong>School Form 1 (SF1)</strong> spreadsheet directly into the app.</p>
      <h5>Steps to Upload SF1:</h5>
      <ol>
        <li>Select the target class section in the <strong>Teaching Load</strong> view.</li>
        <li>Click <strong>Add Learner</strong> in the Class Roster card.</li>
        <li>Click <strong>Upload SF1</strong> under <strong>Other Ways to Add Learners</strong>.</li>
        <li>Select the Excel sheet (.xls / .xlsx) from your computer.</li>
        <li>The system will extract student LRNs, names, and gender details automatically, filter out duplicates, and append them directly to the roster.</li>
      </ol>
      <div class="help-highlight-box">
        <strong>💡 Pro-Tip:</strong> The SF1 parser automatically filters headers, margins, and footnotes, making it extremely easy to load raw school databases.
      </div>
    `
  },
  {
    id: 'import_roster_class',
    category: 'roster_management',
    title: 'Cloning and Importing Rosters from Other Classes',
    keywords: 'clone copy roster import class other section load year merge overwrite combine duplicate enroll enrollment learners students same section',
    content: `
      <p>If you teach multiple subjects to the same section, you can copy the roster of one class load to another without re-typing or re-uploading spreadsheets.</p>
      <h5>How to Clone a Roster:</h5>
      <ol>
        <li>Open your target class load under <strong>Teaching Load</strong>.</li>
        <li>Click <strong>Add Learner</strong> in the Class Roster card.</li>
        <li>Click <strong>Import Roster from Other Class</strong> under <strong>Other Ways to Add Learners</strong>.</li>
        <li>A modal will list all other classes configured in your profile. Select the source class.</li>
        <li>Choose a Mode:
          <ul>
            <li><strong>Merge:</strong> Copy only missing students, keeping all current student records and grades intact.</li>
            <li><strong>Overwrite:</strong> Fully replace the current roster with the selected roster. This will reset any grades already entered for the current class.</li>
          </ul>
        </li>
        <li>Click the confirm button to execute the clone.</li>
      </ol>
    `
  },
  {
    id: 'score_entry',
    category: 'grading_scoring',
    title: 'Entering and Editing Scores in the Table',
    keywords: 'score input table cell written works ww performance task pt assessment qa zero-based calculate weights term final summary',
    content: `
      <p>The Grading Sheet is a responsive grid layout aligned with DepEd scoring divisions.</p>
      <h5>Scoring Mechanics:</h5>
      <ul>
        <li>Select the <strong>Grading Sheet</strong> view from the sidebar or open a class card from the Dashboard.</li>
        <li>Navigate to the desired term (Term 1, 2, or 3) using the tabs at the top.</li>
        <li>Click directly inside any score cell and type a numerical mark.</li>
        <li>Values must be between <strong>0</strong> and the <strong>Highest Possible Score (HPS)</strong> configured for that column.</li>
        <li>The table recalculates total scores, weighted percentages, initial grades, and translated letter descriptors in real-time as you type.</li>
      </ul>
    `
  },
  {
    id: 'advisory_class_workflow',
    category: 'grading_scoring',
    title: 'Advisory Class and Offline Grade Files',
    keywords: 'advisory adviser class roster grade transfer export import json offline conflict source history undo backup privacy',
    content: `
      <p>The fixed <strong>Advisory Class</strong> card is the adviser&apos;s central roster and grade-consolidation workspace. Grade Transfer Files move final grades by USB drive, local folder, or another offline method; they never contain raw scores or attendance.</p>
      <h5>Set Up and Consolidate Grades:</h5>
      <ol>
        <li>Open the first Dashboard card, select the grade level, enter the section, adviser, school year, and school details. The standard subjects for that grade level are added automatically. You may immediately choose a Dashboard class to begin the roster.</li>
        <li>Use <strong>Manage Roster</strong> to open the separate roster dialog, then copy another class, upload SF1, bulk-paste, or add learners manually. Review warnings before saving.</li>
        <li>A subject teacher opens a teaching-load card, chooses <strong>Export Grades</strong>, selects one term, reviews the privacy notice, and saves the JSON Grade Transfer File. For MAPEH, save <strong>Music &amp; Arts</strong> and <strong>PE &amp; Health</strong> as separate files.</li>
        <li>The adviser opens the Advisory Class and selects <strong>Import Grade Transfer File</strong>. The app reads the school year, grade, section, subject, and term from the file and validates them before showing learner matches.</li>
        <li>Use <strong>Assign Source</strong> beside a subject to choose a Grade Transfer File, a matching class in this app, or manual entry. A Grade Transfer File does not require an expected class or term because those details are detected automatically.</li>
        <li>Use the <strong>Grade Sources</strong>, <strong>Manage Roster</strong>, and <strong>Advisory Settings</strong> page tabs to inspect provenance, review learners, or review class details. Focused editing tools open from their corresponding page.</li>
        <li>The <strong>Grade Record</strong> tab freezes LRN / Official Name while you scroll. Equal-width grade columns and stronger borders separate subjects. Hide or show Terms 1–3, and select a subject heading to sort learners by that subject final.</li>
        <li>Music &amp; Arts and PE &amp; Health produce one <strong>MAPEH Average</strong> for every term and one MAPEH final. Only the combined MAPEH final is counted with the other subjects in the General Average.</li>
        <li>The red <strong>Reset Advisory Class</strong> button in the upper-right can save a ZIP with separate subject-term files before removal.</li>
      </ol>
      <div class="help-highlight-box">
        <strong>Privacy and safety:</strong> Confirm the destination before sharing a file. Keep backups because transfer files contain learner names, LRNs, and final grades. Reimporting the same file is detected, and existing grades are never silently overwritten.
      </div>
    `
  },
  {
    id: 'quick_grade',
    category: 'grading_scoring',
    title: 'Using Quick Grade Entry Modal',
    keywords: 'quick grade entry sequentially sequential keyboard navigate enter arrows modal shortcut wizard speed keyboard',
    content: `
      <p>Entering scores cell-by-cell on a large grid can be tedious. The <strong>Quick Grade Entry</strong> wizard provides a streamlined sequential interface.</p>
      <h5>Using Quick Grade:</h5>
      <ol>
        <li>On the Grading Sheet view, select a term sheet and click <strong>Quick Grade Entry</strong> on the toolbar.</li>
        <li>Select the specific assessment (e.g. WW 1, PT 2) you want to grade.</li>
        <li>Type the student's score and press <strong>Enter</strong>. The app automatically saves the score and advances to the next student.</li>
        <li>Use the <strong>Up and Down Arrows</strong> to navigate between students without saving, or press <strong>Esc</strong> to close the modal.</li>
      </ol>
    `
  },
  {
    id: 'spectator_mode',
    category: 'grading_scoring',
    title: 'Spectator Mode (Blurring Grades)',
    keywords: 'spectator blur hide grades privacy onlooker eyeball button settings auto-blur hide grades',
    content: `
      <p>When presenting in front of classrooms or showing a student their score, you might want to conceal other students' marks for privacy.</p>
      <h5>How to Blurring Grades:</h5>
      <ul>
        <li>Click the <strong>Blur Grades</strong> eyeball button next to the class record title.</li>
        <li>All student scores, weighted totals, and grades will instantly blur, hiding them from onlookers.</li>
        <li>Click the eyeball button again to unblur.</li>
        <li>To enable blurring automatically on startup, go to <strong>Settings</strong> and check the <strong>Auto-blur Grades</strong> preference.</li>
      </ul>
    `
  },
  {
    id: 'learner_grades_card',
    category: 'grading_scoring',
    title: 'Viewing Individual Learner Progress Cards',
    keywords: 'view learner grades individual student card report check progress print report download summary card profile progress',
    content: `
      <p>You can view and inspect a student's full academic record across all terms in a single, unified profile report card.</p>
      <h5>Steps to View Learner Progress:</h5>
      <ol>
        <li>Go to the <strong>Grading Sheet</strong> view.</li>
        <li>Click the <strong>View Learner's Grades</strong> button on the toolbar.</li>
        <li>Select a student from the dropdown menu.</li>
        <li>Toggle the term checkboxes (Term 1, Term 2, Term 3, Summary) to filter what details are shown.</li>
        <li>You can view their scores breakdown, averages, descriptive grades, and download/print this specific student's card.</li>
      </ol>
    `
  },
  {
    id: 'teacher_tools',
    category: 'grading_scoring',
    title: 'Teacher Tools Workspace',
    keywords: 'tools group randomizer name picker grade simulator performance checklist recitation notebook assignment written work performance task games sudoku 2048 minesweeper active class temporary preview apply publish revert',
    content: `
      <p>Open <strong>Tools</strong> below Attendance for classroom utilities and short offline games. Group Randomizer, Name Picker, Grade Simulator, and Performance Checklist share the app's Active Class selection.</p>
      <h5>Classroom Utilities:</h5>
      <ul>
        <li><strong>Group Randomizer:</strong> Create complete-random or sex-balanced groups, then copy or print the temporary result.</li>
        <li><strong>Name Picker:</strong> Draw every eligible learner once before the bag resets.</li>
        <li><strong>Grade Simulator:</strong> Try raw-score changes on a detached preview. Nothing is saved until you review and apply the change summary.</li>
        <li><strong>Performance Checklist:</strong> Start with a standard checklist or a saved template, then record Recitation, Notebook, Assignment, or custom criteria per class and term. Search, missing-entry filters, Bulk Mark, learner notes, and the Mini Name Picker make daily recording faster.</li>
        <li><strong>Offline Games:</strong> Play locally bundled Sudoku, 2048, or Minesweeper without network access.</li>
      </ul>
      <h5>Publishing Checklist Points:</h5>
      <ol>
        <li>Create a checklist and assign every criterion to Tracking Only, Written Work, or Performance Task.</li>
        <li>Start today's dated session, then record entries in the grid, with Bulk Mark, or with the Mini Name Picker.</li>
        <li>Select <strong>Review Grade Contributions</strong> and choose the Written Work or Performance Task card.</li>
        <li>Choose an existing assessment with a valid HPS and inspect every before-and-after score.</li>
        <li>Verify the profile PIN before publishing. Reopening Publish without new entries will not add the same points twice.</li>
      </ol>
      <h5>Resetting a Checklist:</h5>
      <ol>
        <li>Open <strong>More Actions</strong>, then select <strong>Reset Checklist</strong>.</li>
        <li>Choose whether to clear the current session, one criterion, every session in the selected term, or only the Mini Name Picker draw cycle.</li>
        <li>If points were published, revert every applicable Published Point History entry first.</li>
        <li>Data-clearing resets require PIN verification and create a local restore point before removing entries.</li>
      </ol>
      <p>Use <strong>Undo Last Entry</strong> for the latest compatible edit or bulk action. If a newer change touches the same entry, the app preserves it and refuses the undo. Open <strong>Checklist Tutorial</strong> from More Actions for a read-only guided walkthrough.</p>
      <div class="help-highlight-box">
        <strong>Record safety:</strong> Tracking Only checklist entries never affect grades. Blank official scores are excluded, published scores cannot exceed HPS, and publishing or reverting checklist points uses the protected save path with a reversible history.
      </div>
    `
  },
  {
    id: 'direct_transfer_how',
    category: 'direct_transfers',
    title: 'How Direct Student Transfers Work',
    keywords: 'direct transfer student move copy class section grades term transfer out transfer in class assignment sync',
    content: `
      <p>When a student transfers from one section to another section, they should not lose their academic marks. The <strong>Direct Transfer</strong> feature transfers the learner and automatically copies their scores.</p>
      <h5>How to Perform a Direct Transfer:</h5>
      <ol>
        <li>Go to <strong>Teaching Load</strong> and select the student's current class load.</li>
        <li>Locate the student under the Class Roster list and click their <strong>Manage</strong> button.</li>
        <li>Scroll down to the <strong>Transfer Student Directly</strong> panel.</li>
        <li>Select the <strong>Destination Class Load</strong> and choose the <strong>Exit Term</strong> (e.g. exiting in Term 2).</li>
        <li>Click <strong>Execute Direct Transfer</strong>.</li>
      </ol>
      <h5>System Actions during Transfer:</h5>
      <ul>
        <li>The student is marked as <strong>Transferred Out</strong> (labeled <em>TO</em>) in their original class, freezing their record.</li>
        <li>A cloned profile is added to the destination class.</li>
        <li>All scores from previous terms (up to the exit term) are carried over and stored under their <strong>Transferred In (TI)</strong> profile database, calculating correctly in the destination averages.</li>
      </ul>
    `
  },
  {
    id: 'deped_order_15',
    category: 'deped_policies',
    title: 'DepEd Order No. 15 s. 2026 Guidelines',
    keywords: 'deped order 15 s 2026 assessment count written works performance tasks 3-5 2-3 transitional rules weighting examinations descriptors scale annex c letter grade',
    content: `
      <p>This application is designed specifically to comply with the transitional guidelines set in <strong>DepEd Order No. 15 s. 2026</strong>.</p>
      <h5>Key Policy Rules Applied:</h5>
      <ul>
        <li><strong>Recommended assessment pacing:</strong> For Grades 4&ndash;12, Table 3 recommends <strong>3&ndash;5 Written Works</strong>, <strong>2&ndash;3 Performance Tasks</strong>, and <strong>2 Summative Tests plus 1 Term Examination</strong> per learning area, per term. DepEd describes these ranges as flexible guidance rather than fixed compliance requirements.</li>
        <li><strong>Grades 1&ndash;3:</strong> Teachers determine a sufficient and manageable quantity of assessment evidence; DO 15 does not prescribe a numeric WW/PT range for these grades.</li>
        <li><strong>Component weighting:</strong> Grades 4&ndash;10 and Grades 11&ndash;12 use the prescribed WW, PT, and examination weights for their applicable learning area or SHS subject classification.</li>
        <li><strong>Zero-based calculations:</strong> Computations are adjusted so that zero scores are not inflated, representing actual student performance.</li>
        <li><strong>Descriptive Grading Scale:</strong> Grades are translated to letters:
          <ul>
            <li><strong>A (Outstanding):</strong> 90–100</li>
            <li><strong>B (Very Satisfactory):</strong> 85–89</li>
            <li><strong>C (Satisfactory):</strong> 80–84</li>
            <li><strong>D (Fairly Satisfactory):</strong> 75–79</li>
            <li><strong>E (Did Not Meet Expectations):</strong> Below 75</li>
          </ul>
        </li>
      </ul>
    `
  },
  {
    id: 'trimester_vs_quarter',
    category: 'deped_policies',
    title: 'Trimester Layouts (Key Stage 2)',
    keywords: 'trimester layout key stage 2 ks2 quarterly policy columns columns columns reset weighting',
    content: `
      <p>Depending on the profile settings, the application supports both standard quarterly terms and <strong>Key Stage 2 (KS2) Trimester</strong> schemas.</p>
      <h5>Universal Trimester Layout:</h5>
      <ul>
        <li>In <strong>Settings</strong>, you can enable <strong>Use Universal Trimester Layout</strong>.</li>
        <li>This forces all classes to use the Key Stage 2 structure: <strong>5 WW columns, 3 PT columns, and 3 ST/TE columns</strong> per term.</li>
        <li>Warning: Enabling or disabling this resets assessment headers that mismatch the new format, so configure this preference before scoring!</li>
      </ul>
    `
  },
  {
    id: 'show_numerical_equivalents',
    category: 'deped_policies',
    title: 'Numerical Equivalents (Annex C)',
    keywords: 'numerical equivalents annex c range letter grade settings display table pdf report display scale',
    content: `
      <p>By default, transitional records display letter descriptors (A, B, C, D, E) for term grades. You can display their numerical range equivalents next to the letters.</p>
      <h5>How to Enable:</h5>
      <ol>
        <li>Go to the <strong>Settings</strong> view.</li>
        <li>Under <strong>Preferences</strong>, check <strong>Show Numerical Equivalents (DO 15 s. 2026 Annex C)</strong>.</li>
        <li>Grading tables, print sheets, and PDF exports will now display ranges (e.g. <em>A (90-100)</em> instead of just <em>A</em>).</li>
      </ol>
    `
  },
  {
    id: 'backups_guide',
    category: 'backups_settings',
    title: 'Downloading & Uploading Database Backups',
    keywords: 'backup download upload backup json export database restore restore reset transfer data offline copy secondary safety',
    content: `
      <p>Keep your records safe and sync them across multiple computers using manual JSON backup files.</p>
      <h5>Downloading a Backup:</h5>
      <ul>
        <li>Click the <strong>Download Backup</strong> button in the app header.</li>
        <li>A secure JSON file containing all your profiles, assignments, and grades will be saved to your computer.</li>
      </ul>
      <h5>Uploading / Restoring a Backup:</h5>
      <ul>
        <li>Click <strong>Upload Backup</strong> in the header.</li>
        <li>Select your backup JSON file.</li>
        <li>You will be prompted to enter the 6-digit PIN of the active profile to confirm and unlock the restored database.</li>
      </ul>
    `
  },
  {
    id: 'secondary_backup',
    category: 'backups_settings',
    title: 'OneDrive Backup & Multi-PC Sync — Step-by-Step',
    keywords: 'secondary auto-backup shared folder directory path onedrive copy rolling cloud sync recovery id another pc conflicts offline create new id connect existing id always keep on this device tutorial',
    content: `
      <p>Use this guide to protect a PIN-enabled profile in OneDrive and safely connect it to another PC. Local saving and manual backups remain available even when OneDrive is offline.</p>
      <div class="help-highlight-box">
        <strong>Before you begin:</strong> Install and sign in to the OneDrive desktop app on every PC. Use a dedicated, locally available subfolder inside OneDrive—not the OneDrive root. If needed, right-click the folder in File Explorer and choose <strong>Always keep on this device</strong>.
      </div>
      <p>For an explanation without changing anything, select <strong>Start Interactive Tour</strong> in the OneDrive Backup & Sync card. The dedicated tour stays in Settings and only highlights the backup controls.</p>
      <h5>Part 1 — Set up the main PC:</h5>
      <ol>
        <li>Unlock the profile that already contains the records you want to keep.</li>
        <li>Open <strong>Settings → OneDrive Backup & Sync</strong>.</li>
        <li>Confirm that <strong>Backup Recovery ID</strong> is empty, then select <strong>Create New ID</strong>.</li>
        <li>Verify the current six-digit profile PIN.</li>
        <li>Select a dedicated folder inside OneDrive, such as <code>OneDrive\\E-Class Record Backups</code>.</li>
        <li>Wait while the app validates the folder, creates a restore point, generates the Recovery ID, and verifies the first encrypted revision.</li>
        <li>Select <strong>Copy</strong> and keep the Recovery ID available for the other PC. Keep the profile PIN separately.</li>
        <li>Wait for <strong>Folder Up to Date</strong>, then also wait for the OneDrive app to report that syncing is complete.</li>
      </ol>
      <p>Do not manually rename, move, edit, or combine files inside the generated <code>E-Class Record\\&lt;Recovery ID&gt;</code> structure.</p>
      <h5>Part 2 — Connect another PC:</h5>
      <ol>
        <li>Sign in to the same OneDrive account and wait for the folder to download.</li>
        <li>Make the folder locally available with <strong>Always keep on this device</strong>.</li>
        <li>Create or open the PIN-enabled local profile that will receive the records. It must not already have a Recovery ID.</li>
        <li>Open <strong>Settings → OneDrive Backup & Sync</strong>, paste the ID from the main PC, and select <strong>Connect Existing ID</strong>.</li>
        <li>Verify the current local profile PIN, then select the corresponding local copy of the same OneDrive folder.</li>
        <li>Enter the same six-digit PIN used by the profile on the main PC.</li>
        <li>Let the app scan and validate the encrypted repository before writing anything.</li>
        <li>If both PCs contain data, review the comparison. Unique and non-conflicting records are preserved; differing values require your choice.</li>
        <li>Complete the review and wait for <strong>Folder Up to Date</strong>.</li>
      </ol>
      <p>A wrong PIN, damaged file, canceled review, or interrupted connection leaves the previous local profile unchanged. The Recovery ID finds the encrypted profile; it does not replace the PIN.</p>
      <h5>Profiles Found in OneDrive:</h5>
      <ol>
        <li>Open Settings and select <strong>Refresh</strong> under <strong>Profiles Found in OneDrive</strong>.</li>
        <li>Match the profile name and Recovery ID.</li>
        <li>Select <strong>Connect</strong> for a synchronized profile or <strong>View Backup</strong> for an ordinary recovery copy.</li>
      </ol>
      <h5>Normal daily use:</h5>
      <ul>
        <li>Work normally. E-Class Record saves and verifies the local database before publishing encrypted changes.</li>
        <li>Before changing PCs, wait for both <strong>Folder Up to Date</strong> and OneDrive's own completed-sync status.</li>
        <li>On the next PC, wait for OneDrive to download, then use <strong>Check Now</strong> under <strong>Advanced backup and device settings</strong>.</li>
        <li>If <strong>Review Changes</strong> appears, resolve the differences before continuing.</li>
        <li>If OneDrive is unavailable, continue locally. The app will scan again when the folder returns.</li>
      </ul>
      <h5>If the profile is not available yet:</h5>
      <p>Check OneDrive on both PCs, then choose <strong>Wait and Check Again</strong>. Choosing <strong>Continue Working Offline</strong> keeps the Recovery ID empty and writes no shared files, so you can safely retry <strong>Connect Existing ID</strong> later.</p>
      <div class="help-highlight-box">
        <strong>Safety:</strong> Do not start a new identity merely because OneDrive is delayed. Do not select <strong>Start New Identity</strong> unless you intentionally want to separate this PC from the other synchronized PCs. Keep periodic manual JSON backups as an additional recovery path.
      </div>
    `
  },
  {
    id: 'ota_updates',
    category: 'backups_settings',
    title: 'Over-the-Air App Updates',
    keywords: 'ota update app version checking check updates latest release github online software updates ota rolling version',
    content: `
      <p>E-Class Record App checks for updates automatically on startup when connected to the internet.</p>
      <h5>How to Update Manually:</h5>
      <ol>
        <li>Go to <strong>Settings</strong>.</li>
        <li>Locate the <strong>Over-the-Air Updates</strong> card.</li>
        <li>Click <strong>Check for Updates</strong>. If a new version is found, click <strong>Update Now</strong> to download and apply it automatically.</li>
      </ol>
    `
  },
  {
    id: 'clear_data',
    category: 'backups_settings',
    title: 'Clearing Local Data (Danger Zone)',
    keywords: 'clear data danger zone delete erase reset factory profile uninstall erase everything permanent warning',
    content: `
      <p>If you want to completely clear all data from this computer (e.g. when changing computers or resetting the system), use the App Danger Zone.</p>
      <div class="help-highlight-box" style="border-left-color: var(--color-error-500)">
        <strong>⚠️ CRITICAL WARNING:</strong> Clearing local data is permanent and cannot be undone. Always download a manual backup before performing a reset!
      </div>
      <h5>Steps to Clear:</h5>
      <ol>
        <li>Go to <strong>Settings</strong>.</li>
        <li>Scroll down to the <strong>App Danger Zone</strong> card.</li>
        <li>Click <strong>Clear Local Data</strong> and type in the confirmation prompt. The app will wipe all profiles and restart fresh.</li>
      </ol>
    `
  },
  {
    id: 'implementation_history',
    category: 'change_history',
    title: 'Implementation History and Patch Notes',
    keywords: 'implementation history changelog release notes patches worked adjusted version latest updates beginning feature timeline',
    content: renderImplementationHistoryGuide
  }
];

let helpCenterInitialized = false;

function initHelpCenter() {
  if (helpCenterInitialized) return;
  const catList = document.getElementById('helpCategoryList');
  if (!catList) return;
  helpCenterInitialized = true;

  // Render categories
  catList.innerHTML = HELP_CATEGORIES.map(cat => `
    <li class="help-cat-item ${cat.id === helpActiveCategory ? 'help-cat-item--active' : ''}" 
        id="helpCat-${cat.id}" 
        onclick="setHelpCategory('${cat.id}')">
      <span>${cat.name}</span>
    </li>
  `).join('');

  renderHelpContent();
}

window.ensureHelpCenterInitialized = initHelpCenter;

function setHelpCategory(catId) {
  helpActiveCategory = catId;
  
  // Highlight active
  document.querySelectorAll('.help-cat-item').forEach(el => {
    el.classList.remove('help-cat-item--active');
  });
  const activeEl = document.getElementById(`helpCat-${catId}`);
  if (activeEl) {
    activeEl.classList.add('help-cat-item--active');
  }

  // Clear search input and search filter
  const searchInput = document.getElementById('helpSearchInput');
  if (searchInput) {
    searchInput.value = '';
  }
  const clearBtn = document.getElementById('helpSearchClearBtn');
  if (clearBtn) {
    clearBtn.style.display = 'none';
  }

  renderHelpContent();
}

function renderHelpContent(filteredTopics = null) {
  const contentPane = document.getElementById('helpContentPane');
  if (!contentPane) return;

  const topicsToShow = filteredTopics || HELP_TOPICS.filter(t => t.category === helpActiveCategory);

  if (topicsToShow.length === 0) {
    contentPane.innerHTML = `
      <div class="help-empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 48px; height: 48px; opacity: 0.5;">
          <circle cx="11" cy="11" r="8"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        </svg>
        <p style="margin: 0; font-size: var(--font-size-md);">No matching guides or tutorials found.</p>
        <p style="margin: 0; font-size: var(--font-size-sm); color: var(--text-tertiary);">Try searching with different keywords.</p>
      </div>
    `;
    return;
  }

  let html = '';
  
  if (filteredTopics) {
    html += `<h3 class="help-content-title">Search Results (${topicsToShow.length})</h3>`;
  } else {
    const cat = HELP_CATEGORIES.find(c => c.id === helpActiveCategory);
    html += `<h3 class="help-content-title">${cat ? cat.name : 'Guides & Tutorials'}</h3>`;
  }

  html += topicsToShow.map(topic => {
    const content = typeof topic.content === 'function' ? topic.content() : topic.content;
    return `
    <div class="help-guide-item" id="guide-${topic.id}">
      <h4 class="help-guide-title">
        <span>📖</span> ${topic.title}
      </h4>
      <div class="help-guide-text">
        ${content}
      </div>
    </div>
  `;
  }).join('');

  contentPane.innerHTML = html;
}

function filterHelpTopics() {
  const searchInput = document.getElementById('helpSearchInput');
  const clearBtn = document.getElementById('helpSearchClearBtn');
  if (!searchInput) return;

  const query = searchInput.value.toLowerCase().trim();
  if (clearBtn) {
    clearBtn.style.display = query.length > 0 ? 'flex' : 'none';
  }

  if (query.length === 0) {
    renderHelpContent();
    return;
  }

  // Search across keywords and title/content
  const matches = HELP_TOPICS.filter(t => {
    const topicContent = typeof t.content === 'function' ? t.content() : t.content;
    return t.title.toLowerCase().includes(query) || 
           t.keywords.toLowerCase().includes(query) || 
           String(topicContent).toLowerCase().includes(query);
  });

  // De-select category tabs highlights
  document.querySelectorAll('.help-cat-item').forEach(el => {
    el.classList.remove('help-cat-item--active');
  });

  renderHelpContent(matches);
}

function clearHelpSearch() {
  const searchInput = document.getElementById('helpSearchInput');
  if (searchInput) {
    searchInput.value = '';
  }
  filterHelpTopics();
}

function openHelpTopic(topicId) {
  const topic = HELP_TOPICS.find(item => item.id === topicId);
  if (!topic) return;
  if (typeof setView === 'function') setView('help');
  initHelpCenter();
  setHelpCategory(topic.category);
  setTimeout(() => {
    document.getElementById(`guide-${topic.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 0);
}

window.openHelpTopic = openHelpTopic;

// Bind to window load or trigger manually
document.addEventListener('DOMContentLoaded', () => {
  if (window.PerformanceMode?.isLowSpec?.()) return;
  // Wait slightly to ensure layouts are fully ready
  setTimeout(() => {
    initHelpCenter();
  }, 200);
});
