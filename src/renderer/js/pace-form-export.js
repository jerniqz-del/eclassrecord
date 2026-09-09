/**
 * Official Grade 1 Individual PACE Form: merge-field map, HTML preview, and Word fill.
 * Template: src/main/templates/pace-form-individual.docx ({school}, {001}…{406}).
 */
(function initPaceFormExport(globalScope) {
  'use strict';

  var PACE_FORM_HEADER_KEYS = ['schoolID', 'school', 'term', 'name', 'lrn', 'class'];

  function formEsc(value) {
    if (typeof globalScope.esc === 'function') return globalScope.esc(value);
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formXmlEscape(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function learnerFormName(learner) {
    if (typeof globalScope.learnerDisplayName === 'function') return globalScope.learnerDisplayName(learner);
    return learner?.name || [learner?.lastName, learner?.firstName].filter(Boolean).join(', ') || '';
  }

  function currentFormTerm() {
    return String((globalScope.db && globalScope.db.currentTerm) || '1');
  }

  function ratingFor(assignment, learnerId, competencyId, term, skill) {
    if (!competencyId || typeof globalScope.paceGetRating !== 'function') return '';
    return globalScope.paceGetRating(assignment, learnerId, competencyId, term, skill) || '';
  }

  function medianOf(assignment, learnerId, competencyId, term, skills) {
    const letters = (skills || []).map(skill => ratingFor(assignment, learnerId, competencyId, term, skill)).filter(Boolean);
    if (typeof globalScope.paceMedianLetter === 'function') return globalScope.paceMedianLetter(letters) || '';
    return letters[0] || '';
  }

  /**
   * Official Term 1 squares. `cells` are merge tags; null is a gray N/A square.
   * `kinds` matches L/S/R/C (or L/S, or R).
   */
  var PACE_FORM_SECTIONS = [
    {
      title: 'READING AND LITERACY',
      kinds: ['L', 'S', 'R', 'C'],
      groups: [
        {
          label: 'Phonological Awareness (oracy for literacy)',
          rows: [
            { number: '1', id: 'rl-01', skill: '', text: 'Chant rhymes and poems.', cells: ['001', '002', null, null] },
            { number: '2', id: 'rl-02', skill: '', text: 'Segment a two to three syllable word into its syllable parts.', cells: ['003', '004', null, null] },
            { number: '3', id: 'rl-03', skill: '', text: 'Identify rhyming words in nursery rhymes, poems, and chants.', cells: ['005', '006', null, null] },
            { number: '4', id: 'rl-04', skill: '', text: 'Say two or three words that rhyme.', cells: ['007', '008', null, null] },
            { number: '5', id: 'rl-05', skill: '', text: 'Identify initial sounds (vowels, consonants, and semi-vowels, if any).', cells: ['009', '010', null, null] }
          ]
        },
        {
          label: 'Phonics and Word Study (sounds to words)',
          rows: [
            { number: '6', id: 'rl-06', skill: '', text: 'Produce the sound of the letters of L1.', cells: ['011', '012', '013', null] },
            { number: '7', id: 'rl-07', skill: '', text: 'Identify the letters in L1.', cells: ['014', '015', '016', null] },
            { number: '8', id: 'rl-08', skill: '', text: 'Isolate sounds (consonants and vowels) in a word (beginning and/or ending).', cells: ['017', '018', '019', null] },
            { number: '9', id: 'rl-09', skill: '', text: 'Substitute individual sounds in simple words to make new words.', cells: ['020', '021', '022', null] },
            { number: '10', id: 'rl-10', skill: '', text: 'Sound out words accurately.', cells: ['023', '024', '025', null] }
          ]
        },
        {
          label: 'Vocabulary and Word Knowledge',
          rows: [
            { number: '11', id: 'rl-11', skill: '', text: 'Use vocabulary referring to self, family, school, community and environment.', cells: ['026', '027', '028', null] },
            { number: '12', text: 'Identify words with different functions (naming and describing words).', cells: [null, null, null, null], heading: true },
            { number: '', id: 'rl-12', skill: 'a', text: 'Words that label persons, places, things, animals, actions, situations, ideas and emotions', cells: ['029', '030', '031', '032'] },
            { number: '', id: 'rl-12', skill: 'b', text: 'Words that describe persons, places, things, animals, actions, situations, ideas and emotions', cells: ['033', '034', '035', '036'] },
            { number: '13', id: 'rl-13', skill: '', text: 'Read high-frequency words accurately for meaning.', cells: ['037', '038', '039', null] },
            { number: '14', id: 'rl-14', skill: '', text: 'Read content-specific words (Math, Makabansa, and GMRC) accurately for meaning.', cells: ['040', '041', '042', null] },
            { number: '15', id: 'rl-15', skill: '', text: 'Write words legibly and correctly.', cells: ['043', '044', '045', '046'] }
          ]
        },
        {
          label: 'Book and Print Knowledge (book knowledge & print awareness)',
          rows: [
            { number: '16', id: 'rl-16', skill: '', text: 'Recognize environmental print (symbols).', cells: ['047', '048', '049', null] },
            { number: '17', id: 'rl-17', skill: '', text: 'Recognize the parts of the book (cover page, title page, etc.)', cells: ['050', '051', '052', null] },
            { number: '18', id: 'rl-18', skill: '', text: 'Recognize proper eye movement skills in reading: left to right, top to bottom, and return sweep', cells: ['053', '054', '055', null] },
            { number: '20', text: 'Comprehend stories.', cells: [null, null, null, null], heading: true },
            { number: '', id: 'rl-20', skill: 'a', text: 'Note important details in stories (character, setting, and events).', cells: ['056', '057', null, null] },
            { number: '', id: 'rl-20', skill: 'b', text: 'Sequence events in stories.', cells: ['058', '059', null, null] },
            { number: '', id: 'rl-20', skill: 'c', text: 'Infer the character’s feelings and traits.', cells: ['060', '061', null, null] },
            { number: '', id: 'rl-20', skill: 'd', text: 'Predict possible ending.', cells: ['062', '063', null, null] },
            { number: '', id: 'rl-20', skill: 'e', text: 'Relate story events to one’s experience.', cells: ['064', '065', null, null] },
            { number: '21', text: 'Comprehend informational text.', cells: [null, null, null, null], heading: true },
            { number: '', id: 'rl-21', skill: 'a', text: 'Note significant details in informational texts (list and describe).', cells: ['066', '067', null, null] },
            { number: '', id: 'rl-21', skill: 'b', text: 'Identify problem and solution.', cells: ['068', '069', '070', null] }
          ]
        },
        {
          label: 'Creating and Composing Texts (discourse)',
          rows: [
            { number: '22', text: 'Narrate one’s personal experiences.', cells: [null, null, null, null], heading: true },
            { number: '', id: 'rl-22', skill: 'a', text: 'oneself and family', cells: [null, '071', null, '072'] },
            { number: '23', id: 'rl-23', skill: '', text: 'Use own words in retelling myths, legends, fables, and narrative poems.', cells: [null, '073', null, null] },
            { number: '24', text: 'Express ideas about:', cells: [null, null, null, null], heading: true },
            { number: '', id: 'rl-24', skill: '', text: 'oneself', cells: [null, '074', null, '075'] },
            { number: '25', id: 'rl-25', skill: '', text: 'Respond creatively to texts (myths, legends, fables and narrative poems).', cells: [null, '076', null, '077'] }
          ]
        }
      ]
    },
    {
      title: 'LANGUAGE',
      kinds: ['L', 'S'],
      groups: [
        {
          label: 'Language for Interacting with Others',
          rows: [
            { number: '1', text: 'Talk about one’s personal experiences.', cells: [null, null], heading: true },
            { number: '', id: 'ln-01', skill: 'a', text: 'a. oneself', cells: ['101', '102'] },
            { number: '2', text: 'Participate in classroom interactions using verbal and non-verbal responses.', cells: [null, null], heading: true },
            { number: '', id: 'ln-02', skill: 'a', text: 'a. Respond to teacher’s instructions', cells: ['103', '104'] },
            { number: '', id: 'ln-02', skill: 'b', text: 'b. Ask and respond to questions', cells: ['105', '106'] },
            { number: '3', text: 'Interact purposely and participate in conversations and discussions, in pairs, in groups, or in whole-class discussions.', cells: [null, null], heading: true },
            { number: '', id: 'ln-03', skill: 'a', text: 'a. Make requests', cells: ['107', '108'] },
            { number: '', id: 'ln-03', skill: 'b', text: 'b. Offer information', cells: ['109', '110'] },
            { number: '', id: 'ln-03', skill: 'c', text: 'c. Communicate needs', cells: ['111', '112'] },
            { number: '', id: 'ln-03', skill: 'd', text: 'd. Clarify information', cells: ['113', '114'] },
            { number: '', id: 'ln-03', skill: 'e', text: 'e. Seek help', cells: ['115', '116'] },
            { number: '', id: 'ln-03', skill: 'f', text: 'f. Take part in or take turns in conversation or discussion', cells: ['117', '118'] },
            { number: '4', text: 'Use common and socially acceptable expressions (e.g., greetings, leave-taking)', cells: [null, null], heading: true },
            { number: '', id: 'ln-04', skill: 'a', text: 'a. Use simple and appropriate personal greetings', cells: ['119', '120'] },
            { number: '', id: 'ln-04', skill: 'b', text: 'b. Use familiar terms of address', cells: ['121', '122'] },
            { number: '', id: 'ln-04', skill: 'c', text: 'c. Greet and respond appropriately to greetings', cells: ['123', '124'] },
            { number: '5', id: 'ln-05', skill: '', text: 'Share confidently thoughts, preferences, needs, feelings, and ideas with peers, teachers and other adults.', cells: ['125', '126'] }
          ]
        },
        {
          label: 'Language for Developing and Expressing Ideas',
          rows: [
            { number: '6', text: 'Express ideas using a variety of symbols (e.g., drawings, emojis, scribbles)', cells: [null, null], heading: true },
            { number: '', id: 'ln-06', skill: 'a', text: 'a. oneself', cells: ['127', '128'] },
            { number: '7', text: 'Use words to represent ideas and events.', cells: [null, null], heading: true },
            { number: '', id: 'ln-07', skill: 'a', text: 'a. words that represent people, animals and objects, locations (naming words)', cells: ['129', '130'] },
            { number: '', id: 'ln-07', skill: 'b', text: 'b. words that represent activities and situations (action words)', cells: ['131', '132'] },
            { number: '', id: 'ln-07', skill: 'c', text: 'c. words that represent qualities or attributes (describing words)', cells: ['133', '134'] },
            { number: '8', text: 'Use high-frequency and content-specific words.', cells: [null, null], heading: true },
            { number: '', id: 'ln-08', skill: 'a', text: 'a. oneself', cells: ['135', '136'] },
            { number: '9', text: 'Use language to express connections between ideas.', cells: [null, null], heading: true },
            { number: '', id: 'ln-09', skill: 'a', text: 'a. express compare and contrast', cells: ['137', '138'] },
            { number: '', id: 'ln-09', skill: 'b', text: 'b. express cause and effect', cells: ['139', '140'] },
            { number: '', id: 'ln-09', skill: 'c', text: 'c. use time words to relate ideas', cells: ['141', '142'] },
            { number: '10', id: 'ln-10', skill: '', text: 'Participate in and contribute to group oral language activities (e.g., singing, chanting, sabayang bigkas)', cells: ['143', '144'] },
            { number: '11', id: 'ln-11', skill: '', text: 'Notice the features (e.g., sounds, intonation, signs) of their first language and other languages in familiar contexts.', cells: ['145', '146'] },
            { number: '12', text: 'Recognize how a change in intonation (volume, pitch) and body language can change the meanings of utterances/expressions.', cells: [null, null], heading: true },
            { number: '', id: 'ln-12', skill: 'a', text: 'a. Recognize the difference between statements, questions, commands, and exclamations.', cells: ['147', '148'] },
            { number: '', id: 'ln-12', skill: 'b', text: 'b. Respond to change of tones and cues through facial expressions, gestures and actions', cells: ['149', '150'] },
            { number: '13', text: 'Recognize how language reflects cultural practices and norms.', cells: [null, null], heading: true },
            { number: '', id: 'ln-13', skill: 'a', text: 'a. Share about the language(s) spoken at home', cells: ['151', '152'] },
            { number: '', id: 'ln-13', skill: 'b', text: 'b. Share words and phrases in their language', cells: ['153', '154'] },
            { number: '', id: 'ln-13', skill: 'c', text: 'c. Notice how local names of streets, places and landmarks have origins in their language', cells: ['155', '156'] },
            { number: '', id: 'ln-13', skill: 'd', text: 'd. Explore local terms for food and their origins.', cells: ['157', '158'] }
          ]
        },
        {
          label: 'Interacting with Texts',
          rows: [
            { number: '14', id: 'ln-14', skill: '', text: 'View and listen to a range of texts for enjoyment and interest.', cells: ['159', '160'] },
            { number: '15', id: 'ln-15', skill: '', text: 'Recognize icons and symbols in various texts found in familiar contexts (e.g., printed and digital texts, books, magazines, environmental print).', cells: ['161', '162'] },
            { number: '16', text: 'Engage with or respond to a range of texts.', cells: [null, null], heading: true },
            { number: '', id: 'ln-16', skill: 'a', text: 'a. View or listen to spoken texts', cells: ['163', '164'] },
            { number: '', id: 'ln-16', skill: 'b', text: 'b. Identify a variety of purposes for viewing and listening to texts', cells: ['165', '166'] },
            { number: '', id: 'ln-16', skill: 'c', text: 'c. Discuss what is interesting or entertaining in a text', cells: ['167', '168'] },
            { number: '', id: 'ln-16', skill: 'd', text: 'd. Express personal preferences', cells: ['169', '170'] },
            { number: '17', id: 'ln-17', skill: '', text: 'Give reason/s for choosing books/texts for enjoyment and interest.', cells: ['171', '172'] }
          ]
        },
        {
          label: 'Creating Texts',
          rows: [
            { number: '18', text: 'Record and report ideas and events using some learnt vocabulary.', cells: [null, null], heading: true },
            { number: '', id: 'ln-18', skill: 'a', text: 'a. Note and report main points', cells: ['173', '174'] },
            { number: '', id: 'ln-18', skill: 'b', text: 'b. Sequence up to three key events', cells: ['175', '176'] },
            { number: '', id: 'ln-18', skill: 'c', text: 'c. Relate ideas or events to one’s experience', cells: ['177', '178'] },
            { number: '19', id: 'ln-19', skill: '', text: 'Use own words in retelling information from various texts (e.g., legends, fables, and jokes).', cells: ['179', '180'] },
            { number: '20', text: 'Draw and discuss information or ideas from a range of texts (e.g., stories, images)', cells: [null, null], heading: true },
            { number: '', id: 'ln-20', skill: 'a', text: 'a. Note and describe main points (e.g., main characters and events)', cells: ['181', '182'] },
            { number: '', id: 'ln-20', skill: 'b', text: 'b. Sequence up to three key events', cells: ['183', '184'] },
            { number: '', id: 'ln-20', skill: 'c', text: 'c. Infer the character’s feelings and traits', cells: ['185', '186'] },
            { number: '', id: 'ln-20', skill: 'd', text: 'd. Predict possible things', cells: ['187', '188'] },
            { number: '', id: 'ln-20', skill: 'e', text: 'e. Relate ideas or events to one’s experience', cells: ['189', '190'] },
            { number: '', text: 'f. Draw and discuss information or ideas from a range of texts (e.g., stories, images)', cells: ['191', '192'] }
          ]
        }
      ]
    },
    {
      title: 'MATHEMATICS',
      kinds: ['R'],
      groups: [
        {
          label: 'Number and Algebra',
          rows: [
            { number: '1', id: 'ma-t1-01', skill: '', text: 'Count up to 100 (includes counting up or down from a given number and identifying a number that is 1 more or 1 less than a given number).', cells: ['201'] },
            { number: '2', id: 'ma-t1-02', skill: '', text: 'Read and write numerals up to 100.', cells: ['202'] },
            { number: '3', id: 'ma-t1-03', skill: '', text: 'Recognize and represent numbers up to 100 using a variety of concrete and pictorial models (e.g., number line, block or bar models, and numerals).', cells: ['203'] },
            { number: '4', id: 'ma-t1-04', skill: '', text: 'Compare two numbers up to 20.', cells: ['204'] },
            { number: '5', id: 'ma-t1-05', skill: '', text: 'Order numbers up to 20 from smallest to largest, and vice versa.', cells: ['205'] },
            { number: '6', id: 'ma-t1-06', skill: '', text: 'Describe the position of objects using ordinal numbers: 1st, 2nd, 3rd, up to 10th.', cells: ['206'] },
            { number: '7', id: 'ma-t1-07', skill: '', text: 'Compose and decompose numbers up to 10 using concrete materials.', cells: ['207'] },
            { number: '8', id: 'ma-t1-08', skill: '', text: 'Illustrate addition of numbers with sums up to 20 using a variety of concrete and pictorial models and describe addition as “counting up,” and “putting together.”', cells: ['208'] },
            { number: '9', id: 'ma-t1-09', skill: '', medianFrom: ['a', 'b'], text: 'Illustrate by applying the following properties of addition, using sums up to 20:', cells: ['209'] },
            { number: '', id: 'ma-t1-09', skill: 'a', text: 'The sum of zero and any number is equal to the number.', cells: ['210'] },
            { number: '', id: 'ma-t1-09', skill: 'b', text: 'Changing the order of the addends does not change the sum.', cells: ['211'] },
            { number: '10', id: 'ma-t1-10', skill: '', text: 'Solve problems (given orally or in pictures) involving addition with sums up to 20.', cells: ['212'] }
          ]
        },
        {
          label: 'Measurement and Geometry',
          rows: [
            { number: '11', id: 'ma-t1-11', skill: '', text: 'Identify simple 2-dimensional shapes (triangle, rectangle, square) of different size and in different orientation.', cells: ['213'] },
            { number: '12', id: 'ma-t1-12', skill: '', text: 'Compare and distinguish 2-dimensional shapes according to features such as sides and corners.', cells: ['214'] },
            { number: '13', id: 'ma-t1-13', skill: '', text: 'Compose and decompose triangles, squares, and rectangles.', cells: ['215'] },
            { number: '14', id: 'ma-t1-14', skill: '', text: 'Measure the length of an object and the distance between two objects using non-standard units.', cells: ['216'] },
            { number: '15', id: 'ma-t1-15', skill: '', text: 'Compare lengths and distances using non-standard units.', cells: ['217'] },
            { number: '16', id: 'ma-t1-16', skill: '', text: 'Solve problems involving lengths and distances using non-standard units.', cells: ['218'] }
          ]
        }
      ]
    },
    {
      title: 'GOOD MANNERS AND RIGHT CONDUCT',
      kinds: ['Rating'],
      groups: [
        {
          label: '',
          rows: [
            { number: '1', id: 'gm-t1-01', skill: '', text: 'Tiwala sa Sarili (Self-Confidence)', cells: ['301'] },
            { number: '2', id: 'gm-t1-02', skill: '', text: 'Pagiging Totoo (Sincerity)', cells: ['302'] },
            { number: '3', id: 'gm-t1-03', skill: '', text: 'Tiyaga (Perseverance)', cells: ['303'] },
            { number: '4', id: 'gm-t1-04', skill: '', text: 'Madasalin (Prayerful)', cells: ['304'] },
            { number: '5', id: 'gm-t1-05', skill: '', text: 'Mapagpasalamat (Gratitude)', cells: ['305'] },
            { number: '6', id: 'gm-t1-06', skill: '', text: 'Magalang (Respectful)', cells: ['306'] },
            { number: '7', id: 'gm-t1-07', skill: '', text: 'Kalinisan (Cleanliness)', cells: ['307'] }
          ]
        }
      ]
    },
    {
      title: 'MAKABANSA',
      kinds: ['Rating'],
      groups: [
        {
          label: '',
          rows: [
            { number: '1', id: 'mk-t1-01', skill: '', text: 'Nailalarawan na ang bawat tao ay may iba’t ibang:', cells: ['401'] },
            { number: '', id: 'mk-t1-01', skill: '', text: 'a. Katangiang Pisikal', cells: ['402'] },
            { number: '', id: 'mk-t1-01', skill: '', text: 'b. Pangangailangan', cells: ['403'] },
            { number: '', id: 'mk-t1-01', skill: '', text: 'c. Interes at Kakayahan', cells: ['404'] },
            { number: '2', id: 'mk-t1-02', skill: '', text: 'Naipaliwanag ang karapatan at tungkulin ng bawat bata.', cells: ['405'] },
            { number: '3', id: 'mk-t1-03', skill: '', text: 'Napahahalagahan ang indibidwalidad ng bawat tao.', cells: ['406'] }
          ]
        }
      ]
    }
  ];

  function eachFormRow(visit) {
    PACE_FORM_SECTIONS.forEach(section => {
      section.groups.forEach(group => group.rows.forEach(row => visit(row, section)));
    });
  }

  function skillKindCode(kind) {
    if (kind === 'L') return 'listen';
    if (kind === 'S') return 'speak';
    if (kind === 'R') return 'read';
    if (kind === 'C') return 'write';
    return '';
  }

  function paceFormExportFilename(learner, term) {
    const raw = learnerFormName(learner) || 'Learner';
    const safe = String(raw).replace(/[<>:"/\\|?*]/g, ' ').replace(/\s+/g, ' ').trim() || 'Learner';
    return `${safe} PACE Form Term ${term}.docx`;
  }

  function paceFormSchoolName(school, assignment) {
    return String(
      (school && (school.schoolName || school.name))
      || (assignment && assignment.schoolName)
      || ''
    );
  }

  function paceFormSchoolId(school, assignment) {
    return String(
      (school && (school.schoolId || school.schoolID))
      || (assignment && assignment.schoolId)
      || ''
    );
  }

  function paceFormReplacements(assignment, learner, school, term) {
    const values = {
      school: paceFormSchoolName(school, assignment),
      schoolID: paceFormSchoolId(school, assignment),
      term: `TERM ${term}`,
      name: learnerFormName(learner),
      lrn: String(learner?.lrn || ''),
      class: String(assignment?.section || '')
    };
    const perSkill = assignment && assignment.pace && assignment.pace.skillRatingMode === 'per-skill';
    eachFormRow((row, section) => {
      if (!row.cells) return;
      row.cells.forEach((tag, index) => {
        if (!tag) return;
        let letter = '';
        if (row.id && row.medianFrom) {
          letter = medianOf(assignment, learner.id, row.id, term, row.medianFrom);
        } else if (row.id) {
          const kindSkill = skillKindCode((section.kinds || [])[index]);
          if (perSkill && !row.skill && kindSkill) {
            letter = ratingFor(assignment, learner.id, row.id, term, kindSkill);
          } else {
            letter = ratingFor(assignment, learner.id, row.id, term, row.skill || '');
          }
        }
        values[tag] = letter;
      });
    });
    return values;
  }

  function fillWordXml(xml, replacements) {
    const map = replacements && typeof replacements === 'object' ? replacements : {};
    const keys = Object.keys(map).sort((left, right) => right.length - left.length);
    function apply(text) {
      let next = String(text || '');
      keys.forEach(key => {
        const value = formXmlEscape(map[key] == null ? '' : map[key]);
        next = next.split(`{${key}}`).join(value);
        next = next.split(`{ ${key} }`).join(value);
      });
      return next;
    }
    let filled = String(xml || '').replace(/<w:p\b[\s\S]*?<\/w:p>/g, para => {
      const parts = [];
      para.replace(/<w:t([^>]*)>([^<]*)<\/w:t>/g, (_all, _attrs, text) => {
        parts.push(text);
        return _all;
      });
      const joined = parts.join('');
      const next = apply(joined);
      if (next === joined) return apply(para);
      let used = false;
      return para.replace(/<w:t([^>]*)>([^<]*)<\/w:t>/g, (all, attrs) => {
        if (used) return `<w:t${attrs}></w:t>`;
        used = true;
        const withSpace = /xml:space=/.test(attrs) ? attrs : `${attrs} xml:space="preserve"`;
        return `<w:t${withSpace}>${next}</w:t>`;
      });
    });
    return apply(filled);
  }

  function kindClass(kind) {
    if (kind === 'L') return 'listen';
    if (kind === 'S') return 'speak';
    if (kind === 'R') return 'read';
    if (kind === 'C') return 'write';
    return 'rating';
  }

  function squareCell(tag, values, kind) {
    if (!tag) return '<td class="pace-form-sq is-na"></td>';
    const letter = values[tag] || '';
    return `<td class="pace-form-sq is-${kindClass(kind)}">${formEsc(letter)}</td>`;
  }

  function paceFormPreviewMarkupForTerm(assignment, learner, school, term) {
    const values = paceFormReplacements(assignment, learner, school, term);
    const sections = PACE_FORM_SECTIONS.map(section => {
      const head = section.kinds.map(kind => `<th class="pace-form-sq is-${kindClass(kind)}">${formEsc(kind)}</th>`).join('');
      const body = section.groups.map(group => {
        const label = group.label ? `<tr class="pace-form-strand"><td colspan="${section.kinds.length + 2}">${formEsc(group.label)}</td></tr>` : '';
        const rows = group.rows.map(row => {
          const squares = (row.cells || []).map((tag, index) => squareCell(tag, values, section.kinds[index])).join('');
          const heading = row.heading ? ' is-parent' : '';
          return `<tr class="${heading.trim()}"><td>${formEsc(row.number || '')}</td><td>${formEsc(row.text || '')}</td>${squares}</tr>`;
        }).join('');
        return label + rows;
      }).join('');
      return `<section class="pace-form-section"><h2>${formEsc(section.title)}</h2><table class="pace-form-table"><thead><tr><th>No.</th><th>Learning Competency</th>${head}</tr></thead><tbody>${body}</tbody></table></section>`;
    }).join('');
    return `
      <article class="pace-form-sheet">
        <header class="pace-form-banner">
          <p class="pace-form-school"><strong>${formEsc(values.school || '—')}</strong> · ${formEsc(values.schoolID || '—')}</p>
          <h1>Performance and Competency Evaluation (PACE) Form</h1>
          <p class="pace-form-term">${formEsc(values.term)} – Individual Learners Report</p>
        </header>
        <dl class="pace-form-meta">
          <div><dt>School</dt><dd>${formEsc(values.school || '—')}</dd></div>
          <div><dt>Name</dt><dd>${formEsc(values.name || '—')}</dd></div>
          <div><dt>LRN</dt><dd>${formEsc(values.lrn || '—')}</dd></div>
          <div><dt>Section</dt><dd>${formEsc(values.class || '—')}</dd></div>
        </dl>
        ${sections}
        <p class="pace-form-legend">Colored squares are rated this term. Gray squares are not applicable. Letters: A Advancing, B Benchmarking, C Connecting, D Developing, E Emerging.</p>
      </article>
    `;
  }

  function paceFormPreviewMarkup(assignment, learner, school, term) {
    const terms = term == null || term === '' || term === 'all'
      ? ['1', '2', '3']
      : [String(term)];
    return terms.map(one => paceFormPreviewMarkupForTerm(assignment, learner, school, one)).join('');
  }

  var officialFormSkeleton = '';
  var officialFormPending = null;

  function findOfficialFormHosts() {
    if (typeof document === 'undefined') return [];
    const query = typeof document.querySelector === 'function'
      ? selector => document.querySelector(selector)
      : () => null;
    return [query('#paceOfficialFormHost'), query('#paceFormPreviewSheet')].filter(Boolean);
  }

  function ensureOfficialSkeleton() {
    if (officialFormSkeleton) return Promise.resolve(officialFormSkeleton);
    const api = globalScope.electronAPI;
    if (!api || typeof api.getOfficialPaceFormHtml !== 'function') return Promise.resolve('');
    if (!officialFormPending) {
      officialFormPending = Promise.resolve(api.getOfficialPaceFormHtml({}))
        .then(result => {
          officialFormSkeleton = result && result.html ? String(result.html) : '';
          return officialFormSkeleton;
        })
        .catch(() => '');
    }
    return officialFormPending;
  }

  function syncOfficialPaceFormDom(root, assignment, learner) {
    if (!root || !assignment || !learner) return;
    const name = learnerFormName(learner);
    const lrn = learner.lrn || '';
    const section = assignment.section || '';
    const school = paceFormSchoolName(globalScope.db, assignment);
    const schoolId = paceFormSchoolId(globalScope.db, assignment);
    const list = selector => (typeof root.querySelectorAll === 'function' ? Array.from(root.querySelectorAll(selector)) : []);
    list('[data-pace-kind="name"]').forEach(el => { el.textContent = name; });
    list('[data-pace-kind="lrn"]').forEach(el => { el.textContent = lrn; });
    list('[data-pace-kind="section"]').forEach(el => { el.textContent = section; });
    list('[data-pace-kind="school"]').forEach(el => { el.textContent = school; });
    list('[data-pace-kind="school-id"]').forEach(el => { el.textContent = schoolId; });
    const focus = globalScope.paceUi && globalScope.paceUi.officialFocus;
    list('[data-pace-kind="rating"]').forEach(el => {
      const id = el.getAttribute('data-pace-id');
      const term = el.getAttribute('data-pace-term');
      const skill = el.getAttribute('data-pace-skill') || '';
      const letter = id && typeof globalScope.paceGetRating === 'function'
        ? (globalScope.paceGetRating(assignment, learner.id, id, term, skill) || '')
        : '';
      el.textContent = letter;
      el.className = String(el.className || '').replace(/\bis-letter-[A-E]\b/g, '').replace(/\bis-focused\b/g, '').trim();
      if (letter) el.className = `${el.className} is-letter-${letter}`.trim();
      if (focus && focus.competencyId === id && String(focus.term) === String(term) && String(focus.skill || '') === String(skill)) {
        el.className = `${el.className} is-focused`.trim();
      }
    });
  }

  function officialPreviewLearner(assignment, fallback) {
    const context = formContext();
    if (context && context.assignment === assignment) {
      return selectedPreviewLearner(context) || fallback;
    }
    return fallback;
  }

  function mountOfficialPaceForm(host, assignment, learner) {
    if (!host || !assignment || !learner) return Promise.resolve(false);
    const person = host.id === 'paceFormPreviewSheet'
      ? officialPreviewLearner(assignment, learner)
      : learner;
    return ensureOfficialSkeleton().then(html => {
      if (!html) return false;
      const scroll = host.scrollTop || 0;
      if (typeof host.querySelector !== 'function' || !host.querySelector('.official-pace-form')) {
        host.innerHTML = html;
      }
      syncOfficialPaceFormDom(host, assignment, person);
      host.scrollTop = scroll;
      return true;
    });
  }

  function paceRefreshOfficialForm() {
    const assignment = typeof globalScope.currentAssignment === 'function' ? globalScope.currentAssignment() : null;
    if (!assignment || typeof globalScope.isGrade1PaceAssignment !== 'function' || !globalScope.isGrade1PaceAssignment(assignment)) {
      return Promise.resolve(false);
    }
    const term = currentFormTerm();
    const learners = formLearners(assignment, term);
    const selected = officialPreviewLearner(assignment, null);
    const indexed = learners[globalScope.paceUi ? globalScope.paceUi.learnerIndex : 0] || learners[0] || null;
    const hosts = findOfficialFormHosts();
    if (!hosts.length) return Promise.resolve(false);
    return Promise.all(hosts.map(host => {
      const learner = host.id === 'paceFormPreviewSheet' ? (selected || indexed) : (indexed || selected);
      return learner ? mountOfficialPaceForm(host, assignment, learner) : Promise.resolve(false);
    })).then(results => results.some(Boolean));
  }

  function formLearners(assignment, term) {
    if (typeof globalScope.paceClassEligibleLearners === 'function') {
      return globalScope.paceClassEligibleLearners(assignment, term);
    }
    return assignment?.learners || [];
  }

  function formContext() {
    const assignment = typeof globalScope.currentAssignment === 'function' ? globalScope.currentAssignment() : null;
    if (!assignment || typeof globalScope.isGrade1PaceAssignment !== 'function' || !globalScope.isGrade1PaceAssignment(assignment)) {
      return null;
    }
    const term = currentFormTerm();
    const learners = formLearners(assignment, term);
    const school = globalScope.db || {};
    return { assignment, term, learners, school };
  }

  function selectedPreviewLearner(context) {
    const id = globalScope.paceUi?.formLearnerId || '';
    return context.learners.find(learner => learner.id === id)
      || (globalScope.paceUi?.mode === 'individual' ? context.learners[globalScope.paceUi.learnerIndex] : null)
      || context.learners[0]
      || null;
  }

  function paceFormPreviewRenderSheet() {
    const root = typeof document !== 'undefined' && typeof document.querySelector === 'function'
      ? document.querySelector('#paceFormPreviewSheet')
      : document.getElementById('paceFormPreviewSheet');
    const context = formContext();
    if (!root || !context) return;
    const learner = selectedPreviewLearner(context);
    if (!learner) {
      root.innerHTML = '<p class="text-muted">Add learners before exporting the Individual PACE Form.</p>';
      return;
    }
    if (globalScope.paceUi) globalScope.paceUi.formLearnerId = learner.id;
    mountOfficialPaceForm(root, context.assignment, learner).then(mounted => {
      if (!mounted) root.innerHTML = paceFormPreviewMarkup(context.assignment, learner, context.school);
    });
  }

  function closePaceFormPreview() {
    document.getElementById('paceFormPreviewModal')?.remove();
    document.body.classList.remove('print-pace-form');
  }

  function openPaceFormPreview() {
    const context = formContext();
    if (!context) return;
    if (!context.learners.length) {
      if (typeof globalScope.toast === 'function') globalScope.toast('Add learners before exporting the Individual PACE Form.', 'warning');
      return;
    }
    closePaceFormPreview();
    const learner = selectedPreviewLearner(context);
    if (globalScope.paceUi) globalScope.paceUi.formLearnerId = learner?.id || '';
    const options = context.learners.map(person => {
      const selected = person.id === learner?.id ? ' selected' : '';
      return `<option value="${formEsc(person.id)}"${selected}>${formEsc(learnerFormName(person))}</option>`;
    }).join('');
    const overlay = document.createElement('div');
    overlay.id = 'paceFormPreviewModal';
    overlay.className = 'modal-overlay pace-form-preview-modal';
    overlay.innerHTML = `
      <div class="modal pace-form-preview-dialog" role="dialog" aria-labelledby="paceFormPreviewTitle">
        <div class="modal__title" id="paceFormPreviewTitle">Individual PACE Form preview</div>
        <div class="pace-form-preview-toolbar">
          <label class="field">
            <span class="field-label">Learner</span>
            <select id="paceFormLearnerSelect" class="field-select" data-eclass-onchange="paceFormPreviewSelectLearner(this.value)">${options}</select>
          </label>
          <p class="text-muted">This is the official PACE - GRADE 1 sheet. Letters update as you rate. Choose a learner to refresh the same template, then print or save a Word file for the open term.</p>
        </div>
        <div class="modal__body pace-form-preview-body" id="paceFormPreviewSheet"></div>
        <div class="modal__actions">
          <button type="button" class="btn btn-cancel btn-sm" data-eclass-onclick="closePaceFormPreview()">Close</button>
          <button type="button" class="btn btn-ghost btn-sm" data-eclass-onclick="printPaceFormPreview()">Print</button>
          <button type="button" class="btn btn-primary btn-sm" data-eclass-onclick="exportPaceFormCurrent()">Export Individual PACE Form</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', event => {
      if (event.target === overlay) closePaceFormPreview();
    });
    paceFormPreviewRenderSheet();
  }

  function paceFormPreviewSelectLearner(learnerId) {
    if (globalScope.paceUi) globalScope.paceUi.formLearnerId = String(learnerId || '');
    paceFormPreviewRenderSheet();
  }

  function printPaceFormPreview() {
    const sheet = document.getElementById('paceFormPreviewSheet');
    const host = document.getElementById('paceFormPrint');
    if (!sheet || !host) return;
    host.innerHTML = sheet.innerHTML;
    document.body.classList.add('print-pace-form');
    window.print();
    document.body.classList.remove('print-pace-form');
  }

  async function exportPaceFormCurrent() {
    const context = formContext();
    if (!context) return;
    const learner = selectedPreviewLearner(context);
    if (!learner) {
      if (typeof globalScope.toast === 'function') globalScope.toast('Choose a learner first.', 'warning');
      return;
    }
    const filename = paceFormExportFilename(learner, context.term);
    const replacements = paceFormReplacements(context.assignment, learner, context.school, context.term);
    if (!globalScope.electronAPI || typeof globalScope.electronAPI.exportPaceForm !== 'function') {
      if (typeof globalScope.toast === 'function') globalScope.toast('Word export is available in the desktop app.', 'warning');
      return;
    }
    const result = await globalScope.electronAPI.exportPaceForm({ filename, replacements, term: context.term });
    if (result?.success && typeof globalScope.toast === 'function') {
      globalScope.toast(`Saved ${filename}`, 'success');
    } else if (result?.error && typeof globalScope.toast === 'function') {
      globalScope.toast(result.error, 'error');
    }
  }

  globalScope.PACE_FORM_SECTIONS = PACE_FORM_SECTIONS;
  globalScope.PACE_FORM_HEADER_KEYS = PACE_FORM_HEADER_KEYS;
  globalScope.fillWordXml = fillWordXml;
  globalScope.paceFormExportFilename = paceFormExportFilename;
  globalScope.paceFormReplacements = paceFormReplacements;
  globalScope.paceFormPreviewMarkup = paceFormPreviewMarkup;
  globalScope.openPaceFormPreview = openPaceFormPreview;
  globalScope.closePaceFormPreview = closePaceFormPreview;
  globalScope.paceFormPreviewSelectLearner = paceFormPreviewSelectLearner;
  globalScope.printPaceFormPreview = printPaceFormPreview;
  globalScope.exportPaceFormCurrent = exportPaceFormCurrent;
  globalScope.syncOfficialPaceFormDom = syncOfficialPaceFormDom;
  globalScope.paceRefreshOfficialForm = paceRefreshOfficialForm;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      fillWordXml,
      paceFormExportFilename,
      paceFormReplacements,
      paceFormPreviewMarkup,
      PACE_FORM_SECTIONS
    };
  }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
