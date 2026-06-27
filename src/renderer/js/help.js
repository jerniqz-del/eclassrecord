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
    id: 'add_learner',
    category: 'roster_management',
    title: 'Manually Adding Learners',
    keywords: 'add learner student lrn first name last name middle name sex boy girl male female roster entry',
    content: `
      <p>You can add students manually to a class roster one at a time using the Add Learner modal.</p>
      <h5>How to Add a Learner:</h5>
      <ol>
        <li>Open <strong>Teaching Load</strong> from the sidebar.</li>
        <li>Select your active class from the dropdown menu.</li>
        <li>Click the <strong>Add Learner</strong> button at the top-right of the Class Roster card.</li>
        <li>Provide the 12-digit <strong>LRN</strong> (Learner Reference Number), <strong>Last Name</strong>, <strong>First Name</strong>, <strong>Middle Name</strong> (optional), and select their <strong>Sex</strong> (Male or Female).</li>
        <li>Press <strong>Enter</strong> or click <strong>Save</strong> to add the learner.</li>
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
    keywords: 'import sf1 excel school form 1 load roster upload spreadsheet parse automatic copy',
    content: `
      <p>Avoid typing student profiles manually by importing the official <strong>School Form 1 (SF1)</strong> spreadsheet directly into the app.</p>
      <h5>Steps to Upload SF1:</h5>
      <ol>
        <li>Select the target class section in the <strong>Teaching Load</strong> view.</li>
        <li>Click <strong>Upload SF1 Spreadsheet</strong> on the action toolbar.</li>
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
    keywords: 'clone copy roster import class other section load year merge overwrite combine duplicate',
    content: `
      <p>If you teach multiple subjects to the same section, you can copy the roster of one class load to another without re-typing or re-uploading spreadsheets.</p>
      <h5>How to Clone a Roster:</h5>
      <ol>
        <li>Open your target class load under <strong>Teaching Load</strong>.</li>
        <li>Click the <strong>Import Roster from Other Class</strong> action button.</li>
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
    keywords: 'deped order 15 s 2026 transitional rules zero-based weighting descriptors scale annex c letter grade',
    content: `
      <p>This application is designed specifically to comply with the transitional guidelines set in <strong>DepEd Order No. 15 s. 2026</strong>.</p>
      <h5>Key Policy Rules Applied:</h5>
      <ul>
        <li><strong>Transitional Grading:</strong> Standard subjects follow specific weighting partitions between Written Works (WW) and Performance Tasks (PT), removing traditional quarterly exams.</li>
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
        <li>This forces all classes to use the Key Stage 2 structure: <strong>5 WW columns, 3 PT columns, and 3 SA/TE columns</strong> per term.</li>
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
    title: 'Configuring Secondary Auto-Backup Folder',
    keywords: 'secondary auto-backup folder directory path onedrive google drive copy rolling daily cloud sync saving safety',
    content: `
      <p>Automate your safety net! You can link a cloud-synced folder (such as OneDrive, Dropbox, or Google Drive) to automatically copy your work.</p>
      <h5>How to Link a Backup Directory:</h5>
      <ol>
        <li>Navigate to the <strong>Settings</strong> view.</li>
        <li>Find the <strong>Secondary Auto-Backup Folder</strong> card.</li>
        <li>Click <strong>Select Folder</strong> and pick a directory.</li>
        <li>Every time you save or exit, the app writes:
          <ul>
            <li>A duplicate copy of the primary database.</li>
            <li>A rolling daily backup (kept up to 30 days) to prevent data loss.</li>
          </ul>
        </li>
      </ol>
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

function initHelpCenter() {
  const catList = document.getElementById('helpCategoryList');
  if (!catList) return;

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

// Bind to window load or trigger manually
document.addEventListener('DOMContentLoaded', () => {
  // Wait slightly to ensure layouts are fully ready
  setTimeout(() => {
    initHelpCenter();
  }, 200);
});
