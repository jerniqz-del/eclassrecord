/**
 * Grade 1 PACE (Performance and Competency Evaluation) catalog.
 * Encoded from the SY 2026-2027 PACE Form Booklet (MATATAG). Do not scrape Word at runtime.
 */
var PACE_CATALOG_ID = 'grade1-matatag-2026';
var PACE_CATALOG_VERSION = 1;
var PACE_LETTERS = Object.freeze(['E', 'D', 'C', 'B', 'A']);
var PACE_LETTER_RANK = Object.freeze({ E: 1, D: 2, C: 3, B: 4, A: 5 });
var PACE_LETTER_LABELS = Object.freeze({
  A: 'Advancing (Namumukod-tangi)',
  B: 'Benchmarking (Naipamamalas)',
  C: 'Connecting (Natutungo)',
  D: 'Developing (Nagpapaunlad)',
  E: 'Emerging (Nagsisimula)'
});
var PACE_SKILL_LABELS = Object.freeze({
  listen: 'Listening',
  speak: 'Speaking',
  read: 'Reading',
  write: 'Copying and Guided Writing'
});

function paceItem(id, number, title, options) {
  const settings = options && typeof options === 'object' ? options : {};
  return Object.freeze({
    id,
    number,
    title,
    details: Object.freeze((settings.details || []).slice()),
    detailSkills: Object.freeze((settings.detailSkills || []).map(list => Object.freeze((list || []).slice()))),
    terms: Object.freeze((settings.terms || [1, 2, 3]).slice()),
    skills: Object.freeze((settings.skills || []).slice()),
    group: settings.group || '',
    standard: settings.standard || ''
  });
}

var READING_SKILLS = ['listen', 'speak', 'read', 'write'];
var LANGUAGE_SKILLS = ['listen', 'speak'];
var PACE_SKILLS_LS = Object.freeze(['listen', 'speak']);
var PACE_SKILLS_LSR = Object.freeze(['listen', 'speak', 'read']);
var PACE_SKILLS_SC = Object.freeze(['speak', 'write']);
var PACE_SKILLS_S = Object.freeze(['speak']);

var PACE_GRADE1_SUBJECT_ORDER = Object.freeze([
  'reading',
  'language',
  'mathematics',
  'gmrc',
  'makabansa',
  'ape'
]);
var PACE_HOMEROOM_SUBJECT = 'Grade 1';
var PACE_HOMEROOM_SUBJECT_KEYS = Object.freeze([
  'reading',
  'language',
  'mathematics',
  'gmrc',
  'makabansa'
]);

var PACE_GRADE1_CATALOG = Object.freeze({
  id: PACE_CATALOG_ID,
  version: PACE_CATALOG_VERSION,
  gradeLevel: 1,
  subjects: Object.freeze({
    reading: Object.freeze({
      subjectNames: Object.freeze(['Reading and Literacy']),
      yearLong: true,
      items: Object.freeze([
        paceItem('rl-01', 1, 'Chant rhymes and poems.', { group: 'Phonological Awareness', skills: PACE_SKILLS_LS }),
        paceItem('rl-02', 2, 'Segment a two to three syllable word into its syllable parts.', { group: 'Phonological Awareness', skills: PACE_SKILLS_LS }),
        paceItem('rl-03', 3, 'Identify rhyming words in nursery rhymes, poems, and chants.', { group: 'Phonological Awareness', skills: PACE_SKILLS_LS }),
        paceItem('rl-04', 4, 'Say two or three words that rhyme.', { group: 'Phonological Awareness', skills: PACE_SKILLS_LS }),
        paceItem('rl-05', 5, 'Identify initial sounds (vowels, consonants, and semi-vowels, if any).', { group: 'Phonological Awareness', skills: PACE_SKILLS_LS }),
        paceItem('rl-06', 6, 'Produce the sound of the letters of L1.', { group: 'Phonics and Word Study', skills: PACE_SKILLS_LSR }),
        paceItem('rl-07', 7, 'Identify the letters in L1.', { group: 'Phonics and Word Study', skills: PACE_SKILLS_LSR }),
        paceItem('rl-08', 8, 'Isolate sounds (consonants and vowels) in a word (beginning and/or ending).', { group: 'Phonics and Word Study', skills: PACE_SKILLS_LSR }),
        paceItem('rl-09', 9, 'Substitute individual sounds in simple words to make new words.', { group: 'Phonics and Word Study', skills: PACE_SKILLS_LSR }),
        paceItem('rl-10', 10, 'Sound out words accurately.', { group: 'Phonics and Word Study', skills: PACE_SKILLS_LSR }),
        paceItem('rl-11', 11, 'Use vocabulary referring to self, family, school, community and environment.', { group: 'Vocabulary and Word Knowledge', skills: PACE_SKILLS_LSR }),
        paceItem('rl-12', 12, 'Identify words with different functions (naming and describing words).', {
          group: 'Vocabulary and Word Knowledge',
          skills: READING_SKILLS,
          details: [
            'Words that label persons, places, things, animals, actions, situations, ideas and emotions',
            'Words that describe persons, places, things, animals, actions, situations, ideas and emotions'
          ]
        }),
        paceItem('rl-13', 13, 'Read high-frequency words accurately for meaning.', { group: 'Vocabulary and Word Knowledge', skills: PACE_SKILLS_LSR }),
        paceItem('rl-14', 14, 'Read content-specific words (Math, Makabansa, and GMRC) accurately for meaning.', { group: 'Vocabulary and Word Knowledge', skills: PACE_SKILLS_LSR }),
        paceItem('rl-15', 15, 'Write words legibly and correctly.', { group: 'Vocabulary and Word Knowledge', skills: READING_SKILLS }),
        paceItem('rl-16', 16, 'Recognize environmental print (symbols).', { group: 'Book and Print Knowledge', skills: PACE_SKILLS_LSR }),
        paceItem('rl-17', 17, 'Recognize the parts of the book (cover page, title page, etc.).', { group: 'Book and Print Knowledge', skills: PACE_SKILLS_LSR }),
        paceItem('rl-18', 18, 'Recognize proper eye movement skills in reading: left to right, top to bottom, and return sweep.', { group: 'Book and Print Knowledge', skills: PACE_SKILLS_LSR }),
        paceItem('rl-19', 19, 'Read sentences with appropriate speed, accuracy and expression.', { group: 'Book and Print Knowledge', skills: PACE_SKILLS_LSR }),
        paceItem('rl-20', 20, 'Comprehend stories.', {
          group: 'Book and Print Knowledge',
          skills: PACE_SKILLS_LS,
          details: [
            'Note important details in stories (character, setting, and events).',
            'Sequence events in stories.',
            'Infer the character\'s feelings and traits.',
            'Predict possible ending.',
            'Relate story events to one\'s experience.',
            'Identify cause and effect of events.',
            'Identify problem and solution in stories.'
          ]
        }),
        paceItem('rl-21', 21, 'Comprehend informational text.', {
          group: 'Book and Print Knowledge',
          skills: PACE_SKILLS_LSR,
          details: [
            'Note significant details in informational texts (list and describe).',
            'Identify problem and solution.'
          ],
          detailSkills: [PACE_SKILLS_LS, PACE_SKILLS_LSR]
        }),
        paceItem('rl-22', 22, 'Narrate one\'s personal experiences.', {
          group: 'Creating and Composing Texts',
          skills: PACE_SKILLS_SC,
          details: ['oneself and family', 'school', 'community']
        }),
        paceItem('rl-23', 23, 'Use own words in retelling myths, legends, fables, and narrative poems.', { group: 'Creating and Composing Texts', skills: PACE_SKILLS_S }),
        paceItem('rl-24', 24, 'Express ideas about oneself, school, and community.', { group: 'Creating and Composing Texts', skills: PACE_SKILLS_SC }),
        paceItem('rl-25', 25, 'Respond creatively to texts (myths, legends, fables and narrative poems).', { group: 'Creating and Composing Texts', skills: PACE_SKILLS_SC })
      ])
    }),
    language: Object.freeze({
      subjectNames: Object.freeze(['Language']),
      yearLong: true,
      items: Object.freeze([
        paceItem('ln-01', 1, 'Talk about one\'s personal experiences.', { group: 'Language for Interacting with Others', skills: LANGUAGE_SKILLS, details: ['oneself', 'school', 'community'] }),
        paceItem('ln-02', 2, 'Participate in classroom interactions using verbal and non-verbal responses.', { group: 'Language for Interacting with Others', skills: LANGUAGE_SKILLS, details: ['Respond to teacher\'s instructions', 'Ask and respond to questions'] }),
        paceItem('ln-03', 3, 'Interact purposely and participate in conversations and discussions, in pairs, in groups, or in whole-class discussions.', { group: 'Language for Interacting with Others', skills: LANGUAGE_SKILLS, details: ['Make requests', 'Offer information', 'Communicate needs', 'Clarify information', 'Seek help', 'Take part in or take turns in conversation or discussion'] }),
        paceItem('ln-04', 4, 'Use common and socially acceptable expressions (e.g., greetings, leave-taking).', { group: 'Language for Interacting with Others', skills: LANGUAGE_SKILLS, details: ['Use simple and appropriate personal greetings', 'Use familiar terms of address', 'Greet and respond appropriately to greetings'] }),
        paceItem('ln-05', 5, 'Share confidently thoughts, preferences, needs, feelings, and ideas with peers, teachers and other adults.', { group: 'Language for Interacting with Others', skills: LANGUAGE_SKILLS }),
        paceItem('ln-06', 6, 'Express ideas using a variety of symbols (e.g., drawings, emojis, scribbles).', { group: 'Language for Developing and Expressing Ideas', skills: LANGUAGE_SKILLS, details: ['oneself', 'school', 'community'] }),
        paceItem('ln-07', 7, 'Use words to represent ideas and events.', { group: 'Language for Developing and Expressing Ideas', skills: LANGUAGE_SKILLS, details: ['naming words', 'action words', 'describing words'] }),
        paceItem('ln-08', 8, 'Use high-frequency and content-specific words.', { group: 'Language for Developing and Expressing Ideas', skills: LANGUAGE_SKILLS, details: ['oneself', 'school', 'community'] }),
        paceItem('ln-09', 9, 'Use language to express connections between ideas.', { group: 'Language for Developing and Expressing Ideas', skills: LANGUAGE_SKILLS, details: ['compare and contrast', 'cause and effect', 'time words'] }),
        paceItem('ln-10', 10, 'Participate in and contribute to group oral language activities (e.g., singing, chanting, sabayang bigkas).', { group: 'Language for Developing and Expressing Ideas', skills: LANGUAGE_SKILLS }),
        paceItem('ln-11', 11, 'Notice the features (e.g., sounds, intonation, signs) of their first language and other languages in familiar contexts.', { group: 'Language for Developing and Expressing Ideas', skills: LANGUAGE_SKILLS }),
        paceItem('ln-12', 12, 'Recognize how a change in intonation (volume, pitch) and body language can change the meanings of utterances/expressions.', { group: 'Language for Developing and Expressing Ideas', skills: LANGUAGE_SKILLS, details: ['Recognize the difference between statements, questions, commands, and exclamations.', 'Respond to change of tones and cues through facial expressions, gestures and actions'] }),
        paceItem('ln-13', 13, 'Recognize how language reflects cultural practices and norms.', { group: 'Language for Developing and Expressing Ideas', skills: LANGUAGE_SKILLS, details: ['Share about the language(s) spoken at home', 'Share words and phrases in their language', 'Notice how local names of streets, places and landmarks have origins in their language', 'Explore local terms for food and their origins.'] }),
        paceItem('ln-14', 14, 'View and listen to a range of texts for enjoyment and interest.', { group: 'Interacting with Texts', skills: LANGUAGE_SKILLS }),
        paceItem('ln-15', 15, 'Recognize icons and symbols in various texts found in familiar contexts (e.g., printed and digital texts, books, magazines, environmental print).', { group: 'Interacting with Texts', skills: LANGUAGE_SKILLS }),
        paceItem('ln-16', 16, 'Engage with or respond to a range of texts.', { group: 'Interacting with Texts', skills: LANGUAGE_SKILLS, details: ['View or listen to spoken texts', 'Identify a variety of purposes for viewing and listening to texts', 'Discuss what is interesting or entertaining in a text', 'Express personal preferences'] }),
        paceItem('ln-17', 17, 'Give reason/s for choosing books/texts for enjoyment and interest.', { group: 'Interacting with Texts', skills: LANGUAGE_SKILLS }),
        paceItem('ln-18', 18, 'Record and report ideas and events using some learnt vocabulary.', { group: 'Creating Texts', skills: LANGUAGE_SKILLS, details: ['Note and report main points', 'Sequence up to three key events', 'Relate ideas or events to one\'s experience'] }),
        paceItem('ln-19', 19, 'Use own words in retelling information from various texts (e.g., legends, fables, and jokes).', { group: 'Creating Texts', skills: LANGUAGE_SKILLS }),
        paceItem('ln-20', 20, 'Draw and discuss information or ideas from a range of texts (e.g., stories, images).', { group: 'Creating Texts', skills: LANGUAGE_SKILLS, details: ['Note and describe main points', 'Sequence up to three key events', 'Infer the character\'s feelings and traits', 'Predict possible things', 'Relate ideas or events to one\'s experience'] })
      ])
    }),
    mathematics: Object.freeze({
      subjectNames: Object.freeze(['Mathematics']),
      yearLong: false,
      items: Object.freeze([
        paceItem('ma-t1-01', 1, 'Count up to 100 (includes counting up or down from a given number and identifying a number that is 1 more or 1 less than a given number).', { terms: [1], group: 'Number and Algebra' }),
        paceItem('ma-t1-02', 2, 'Read and write numerals up to 100.', { terms: [1], group: 'Number and Algebra' }),
        paceItem('ma-t1-03', 3, 'Recognize and represent numbers up to 100 using a variety of concrete and pictorial models (e.g., number line, block or bar models, and numerals).', { terms: [1], group: 'Number and Algebra' }),
        paceItem('ma-t1-04', 4, 'Compare two numbers up to 20.', { terms: [1], group: 'Number and Algebra' }),
        paceItem('ma-t1-05', 5, 'Order numbers up to 20 from smallest to largest, and vice versa.', { terms: [1], group: 'Number and Algebra' }),
        paceItem('ma-t1-06', 6, 'Describe the position of objects using ordinal numbers: 1st, 2nd, 3rd, up to 10th.', { terms: [1], group: 'Number and Algebra' }),
        paceItem('ma-t1-07', 7, 'Compose and decompose numbers up to 10 using concrete materials.', { terms: [1], group: 'Number and Algebra' }),
        paceItem('ma-t1-08', 8, 'Illustrate addition of numbers with sums up to 20 using a variety of concrete and pictorial models and describe addition as "counting up" and "putting together."', { terms: [1], group: 'Number and Algebra' }),
        paceItem('ma-t1-09', 9, 'Illustrate by applying the properties of addition, using sums up to 20.', { terms: [1], group: 'Number and Algebra', details: ['The sum of zero and any number is equal to the number.', 'Changing the order of the addends does not change the sum.'] }),
        paceItem('ma-t1-10', 10, 'Solve problems (given orally or in pictures) involving addition with sums up to 20.', { terms: [1], group: 'Number and Algebra' }),
        paceItem('ma-t1-11', 11, 'Identify simple 2-dimensional shapes (triangle, rectangle, square) of different size and in different orientation.', { terms: [1], group: 'Measurement and Geometry' }),
        paceItem('ma-t1-12', 12, 'Compare and distinguish 2-dimensional shapes according to features such as sides and corners.', { terms: [1], group: 'Measurement and Geometry' }),
        paceItem('ma-t1-13', 13, 'Compose and decompose triangles, squares, and rectangles.', { terms: [1], group: 'Measurement and Geometry' }),
        paceItem('ma-t1-14', 14, 'Measure the length of an object and the distance between two objects using non-standard units.', { terms: [1], group: 'Measurement and Geometry' }),
        paceItem('ma-t1-15', 15, 'Compare lengths and distances using non-standard units.', { terms: [1], group: 'Measurement and Geometry' }),
        paceItem('ma-t1-16', 16, 'Solve problems involving lengths and distances using non-standard units.', { terms: [1], group: 'Measurement and Geometry' }),
        paceItem('ma-t2-01', 1, 'Order numbers up to 100 from smallest to largest, and vice versa.', { terms: [2], group: 'Number and Algebra' }),
        paceItem('ma-t2-02', 2, 'Count by 2s, 5s and 10s up to 100.', { terms: [2], group: 'Number and Algebra' }),
        paceItem('ma-t2-03', 3, 'Determine the place value of a digit in a 2-digit number, the value of a digit, and the digit of a number given its place value.', { terms: [2], group: 'Number and Algebra', details: ['place value of a digit', 'value of a digit', 'digit of a number given its place value'] }),
        paceItem('ma-t2-04', 4, 'Decompose any 2-digit number into tens and ones.', { terms: [2], group: 'Number and Algebra' }),
        paceItem('ma-t2-05', 5, 'Add numbers by expressing addends as tens and ones (expanded form).', { terms: [2], group: 'Number and Algebra' }),
        paceItem('ma-t2-06', 6, 'Add numbers with sums up to 100 without regrouping, using a variety of concrete and pictorial models.', { terms: [2], group: 'Number and Algebra', details: ['2-digit and 1-digit numbers', '2-digit and 2-digit numbers'] }),
        paceItem('ma-t2-07', 7, 'Solve problems (given orally or in pictures) involving addition with sums up to 100 without regrouping.', { terms: [2], group: 'Number and Algebra' }),
        paceItem('ma-t2-08', 8, 'Illustrate subtraction involving numbers up to 20 using a variety of concrete and pictorial models and describe subtraction as "taking away."', { terms: [2], group: 'Number and Algebra' }),
        paceItem('ma-t2-09', 9, 'Find the missing number in addition or subtraction sentences involving numbers up to 20.', { terms: [2], group: 'Number and Algebra' }),
        paceItem('ma-t2-10', 10, 'Write an equivalent expression to a given addition or subtraction expression (e.g., 2 + 3 = 1 + 4; 10 - 5 = 6 - 1).', { terms: [2], group: 'Number and Algebra' }),
        paceItem('ma-t2-11', 11, 'Solve subtraction problems (given orally or in pictures) where both numbers are less than 20.', { terms: [2], group: 'Number and Algebra' }),
        paceItem('ma-t2-12', 12, 'Subtract numbers where both numbers are less than 100 using concrete and pictorial models, without regrouping.', { terms: [2], group: 'Number and Algebra', details: ['2-digit minus 1-digit numbers', '2-digit minus 2-digit numbers'] }),
        paceItem('ma-t2-13', 13, 'Subtract numbers by expressing minuends and subtrahends as tens and ones (expanded form), without regrouping.', { terms: [2], group: 'Number and Algebra' }),
        paceItem('ma-t2-14', 14, 'Collect data in one variable through a simple interview.', { terms: [2], group: 'Data and Probability' }),
        paceItem('ma-t2-15', 15, 'Present data in a pictograph without a scale.', { terms: [2], group: 'Data and Probability' }),
        paceItem('ma-t2-16', 16, 'Interpret a pictograph without a scale.', { terms: [2], group: 'Data and Probability' }),
        paceItem('ma-t2-17', 17, 'Organize data in a pictograph without a scale into a table.', { terms: [2], group: 'Data and Probability' }),
        paceItem('ma-t3-01', 1, 'Determine the next term/s in a repeating pattern.', { terms: [3], group: 'Number and Algebra' }),
        paceItem('ma-t3-02', 2, 'Create repeating patterns using objects, images, or numbers.', { terms: [3], group: 'Number and Algebra' }),
        paceItem('ma-t3-03', 3, 'Illustrate 1/2 and 1/4 as parts of a whole.', { terms: [3], group: 'Number and Algebra' }),
        paceItem('ma-t3-04', 4, 'Compare 1/2 and 1/4 using models.', { terms: [3], group: 'Number and Algebra' }),
        paceItem('ma-t3-05', 5, 'Count halves and quarters.', { terms: [3], group: 'Number and Algebra' }),
        paceItem('ma-t3-06', 6, 'Recognize coins (excluding centavo coins) and bills up to ₱100 and their notations.', { terms: [3], group: 'Number and Algebra' }),
        paceItem('ma-t3-07', 7, 'Determine the value of a number of bills and/or a number of coins (excluding centavo coins) up to ₱100.', { terms: [3], group: 'Number and Algebra' }),
        paceItem('ma-t3-08', 8, 'Compare different denominations of peso coins (excluding centavo coins) and bills up to ₱100.', { terms: [3], group: 'Number and Algebra' }),
        paceItem('ma-t3-09', 9, 'Solve 1-step problems involving addition of money where the sum is up to ₱100, or subtraction of money where both amounts are less than ₱100.', { terms: [3], group: 'Number and Algebra' }),
        paceItem('ma-t3-10', 10, 'Identify the position of objects moved in half turn or in quarter turn, in clockwise or in counter-clockwise direction, given an initial facing direction.', { terms: [3], group: 'Measurement and Geometry' }),
        paceItem('ma-t3-11', 11, 'Read and write time by the hour, half hour, and quarter hour using an analog clock.', { terms: [3], group: 'Measurement and Geometry' }),
        paceItem('ma-t3-12', 12, 'Give the days of the week and months of the year in the correct order.', { terms: [3], group: 'Measurement and Geometry' }),
        paceItem('ma-t3-13', 13, 'Determine the day and month of the year using a calendar.', { terms: [3], group: 'Measurement and Geometry' }),
        paceItem('ma-t3-14', 14, 'Solve problems involving time (hour, half hour, quarter hour, days in a week, and months in a year).', { terms: [3], group: 'Measurement and Geometry' })
      ])
    }),
    gmrc: Object.freeze({
      subjectNames: Object.freeze(['Good Manners and Right Conduct (GMRC)']),
      yearLong: false,
      items: Object.freeze([
        paceItem('gm-t1-01', 1, 'Tiwala sa Sarili (Self-Confidence)', { terms: [1], standard: 'Naipakikita ang tiwala sa sarili sa pamamagitan ng paggamit ng mga batayang impormasyon sa mga angkop na sitwasyon.' }),
        paceItem('gm-t1-02', 2, 'Pagiging Totoo (Sincerity)', { terms: [1], standard: 'Naipakikita ang pagiging totoo sa pamamagitan ng mabuting pakikipag-ugnayan sa kapwa.' }),
        paceItem('gm-t1-03', 3, 'Tiyaga (Perseverance)', { terms: [1], standard: 'Naipakikita ang pagiging matiyaga sa pamamagitan ng palagiang pagtatabi ng mga naipong pera sa alkansiya o mga gamit sa lagayan.' }),
        paceItem('gm-t1-04', 4, 'Madasalin (Prayerful)', { terms: [1], standard: 'Naipakikita ang pagiging madasalin sa pamamagitan ng wastong kilos at salita sa pananalangin.' }),
        paceItem('gm-t1-05', 5, 'Mapagpasalamat (Gratitude)', { terms: [1], standard: 'Naipakikita ang pagiging mapagpasalamat sa pamamagitan ng pag-iingat ng mga yamang mula sa kapaligiran.' }),
        paceItem('gm-t1-06', 6, 'Magalang (Respectful)', { terms: [1], standard: 'Naipakikita ang pagiging magalang sa pamamagitan ng mga angkop na kilos na napagbibigyang-halaga sa mga karapatang tinatamasa bilang bata.' }),
        paceItem('gm-t1-07', 7, 'Kalinisan (Cleanliness)', { terms: [1], standard: 'Naipakikita ang kalinisan sa pamamagitan ng palagiang pagsunod sa mga alituntunin sa paglilinis ng katawan ayon sa gabay ng pamilya, tagapangalaga, o nakatatanda.' }),
        paceItem('gm-t2-01', 1, 'Magalang (Respectful)', { terms: [2], standard: 'Naipakikita ang pagiging magalang sa pamamagitan ng wastong pagtugon sa nakatatanda.' }),
        paceItem('gm-t2-02', 2, 'Responsible (Responsible)', { terms: [2], standard: 'Naipakikita ang pagiging responsable sa pamamagitan ng pagkukusa sa mga munting gawain sa pamayanan ayon sa sariling kakayahan.' }),
        paceItem('gm-t2-03', 3, 'Matulungin (Helpful)', { terms: [2], standard: 'Naipakikita ang pagiging matulungin sa pamamagitan ng pagtulong sa mga gawain ng pamilya ayon sa sariling kakayahan.' }),
        paceItem('gm-t2-04', 4, 'Matulungin sa nakatatanda (Helpful)', { terms: [2], standard: 'Naipakikita ang pagiging matulungin sa nakatatanda sa pamamagitan ng mga gawaing makatutulong at makapagbibigay-ginhawa sa kanila nang may pagsasaalang-alang sa ligtas na paraan.' }),
        paceItem('gm-t2-05', 5, 'Madasalin (Prayerful)', { terms: [2], standard: 'Nakapagsasanay sa pagiging madasalin sa pamamagitan ng pakikilahok sa pananalangin ng pamilya.' }),
        paceItem('gm-t2-06', 6, 'Kalinisan (Cleanliness)', { terms: [2], standard: 'Naipakikita ang kalinisan sa pamamagitan ng pakikibahagi sa mga gawain ng pangangalaga sa kapaligiran.' }),
        paceItem('gm-t2-07', 7, 'Masunurin (Obedient)', { terms: [2], standard: 'Naipakikita ang pagiging masunurin sa pamamagitan ng pagtali sa mga mabuting gawi ng mga Pilipino.' }),
        paceItem('gm-t2-08', 8, 'Tiwala sa Sarili (Self-Confidence)', { terms: [2], standard: 'Naipakikita ang tiwala sa sarili sa pamamagitan ng pagsasagawa ng mga gawain na nakatutulong sa sarili at sa kapwa bilang bahagi ng tagubilin ng pamilya.' }),
        paceItem('gm-t2-09', 9, 'Mapagbigay (Generosity)', { terms: [2], standard: 'Naipakikita ang pagiging mapagbigay sa pamamagitan ng kusang-loob na pagbabahagi ng anumang mayroon siya.' }),
        paceItem('gm-t3-01', 1, 'Magalang (Respectful)', { terms: [3], standard: 'Naipakikita ang pagiging magalang sa pamamagitan ng pagtali sa mga tagubilin at alituntunin ng pook-dalanginan.' }),
        paceItem('gm-t3-02', 2, 'Kalinisan (Cleanliness)', { terms: [3], standard: 'Naipakikita ang kalinisan sa pamamagitan ng palagiang pagpapaalala sa kapwa-bata ng wastong pag-iingat ng kaayusan at kalinisan ng kapaligiran.' }),
        paceItem('gm-t3-03', 3, 'Mapagmalasakit (Compassion)', { terms: [3], standard: 'Naipakikita ang pagiging mapagmalasakit sa pamamagitan ng panghihikayat sa kapwa na maligaya sa mga simpleng gawain ng pangangalaga ng kapaligiran.' }),
        paceItem('gm-t3-04', 4, 'Mapagbigay (Generosity)', { terms: [3], standard: 'Naipakikita ang pagiging mapagbigay sa pamamagitan ng kusang-loob na pagbabahagi ng anumang mayroon siya.' }),
        paceItem('gm-t3-05', 5, 'Mabuting Mamamayan (Good Citizenship)', { terms: [3], standard: 'Nakapagsasanay sa pagiging mabuting mamamayan sa pamamagitan ng kusang-loob na pagtulong sa pamilya sa mga gawaing pampamayanan.' }),
        paceItem('gm-t3-06', 6, 'Magalang sa pamayanan (Respectful)', { terms: [3], standard: 'Nakapagsasanay sa pagiging magalang sa pamamagitan ng angkop na kilos sa iba\'t ibang pagkakataon na nagpapakita sa pamayanan.' }),
        paceItem('gm-t3-07', 7, 'Mapagmalasakit sa kapaligiran (Compassion)', { terms: [3], standard: 'Naipakikita ang pagiging mapagmalasakit sa pamamagitan ng panghihikayat sa kapwa na maligaya sa mga simpleng gawain ng pangangalaga ng kapaligiran.' }),
        paceItem('gm-t3-08', 8, 'Pagmamahal sa Bayan (Love of Country)', { terms: [3], standard: 'Naipakikita ang pagiging makabansa sa pamamagitan ng palagiang pagsunod sa mga panuntunan para sa mga sagisag ng bayan.' })
      ])
    }),
    makabansa: Object.freeze({
      subjectNames: Object.freeze(['Makabansa']),
      yearLong: false,
      items: Object.freeze([
        paceItem('mk-t1-01', 1, 'Nailalarawan na ang bawat tao ay may iba\'t ibang katangiang pisikal, pangangailangan, interes at kakayahan.', { terms: [1] }),
        paceItem('mk-t1-02', 2, 'Naipaliwanag ang karapatan at tungkulin ng bawat bata.', { terms: [1] }),
        paceItem('mk-t1-03', 3, 'Napahahalagahan ang indibidwalidad ng bawat tao.', { terms: [1] }),
        paceItem('mk-t2-01', 1, 'Naipaliwanag ang konsepto ng pamilya batay sa bumubuo nito tulad ng two-parent, solo parent, extended family, at iba pa.', { terms: [2] }),
        paceItem('mk-t2-02', 2, 'Naipaliwanag ang papel at tungkulin ng mga kasapi ng pamilya.', { terms: [2] }),
        paceItem('mk-t2-03', 3, 'Napahahalagahan ang papel at tungkulin ng mga kasapi ng pamilya.', { terms: [2] }),
        paceItem('mk-t3-01', 1, 'Nailalahad ang mga batayang impormasyon tulad ng pangalan, pinagmulan, laki at lawak, kinaroroonan, at kwento ng sariling paaralan.', { terms: [3] }),
        paceItem('mk-t3-02', 2, 'Naipaliwanag ang tungkulin ng mga taong bumubuo sa paaralan tulad ng punong-guro, guro, doktor, nars, dyanitor, mag-aaral at iba pa.', { terms: [3] }),
        paceItem('mk-t3-03', 3, 'Natutukoy ang kahalagahan ng mga palatandaan at estruktura mula sa tahanan patungo sa paaralan.', { terms: [3] }),
        paceItem('mk-t3-04', 4, 'Napahahalagahan ang sariling paaralan bilang bahagi ng pamayanan.', { terms: [3] }),
        paceItem('mk-t3-05', 5, 'Natutukoy ang iba pang kasapi ng pamayanan na umaagapay sa pamilya at paaralan.', { terms: [3] }),
        paceItem('mk-t3-06', 6, 'Naipaliwanag ang papel ng mga kasapi ng kinabibilangang pamayanan.', { terms: [3] }),
        paceItem('mk-t3-07', 7, 'Napahahalagahan ang papel ng mga kasapi ng kinabibilangang pamayanan.', { terms: [3] })
      ])
    }),
    ape: Object.freeze({
      subjectNames: Object.freeze(['Arts and Physical Education']),
      yearLong: true,
      items: Object.freeze([
        paceItem('ape-01', 1, 'Overall developmental rating for Arts and Physical Education.', { group: 'Overall' })
      ])
    })
  })
});

function paceSubjectKey(subject) {
  const value = String(subject || '').toLowerCase();
  if (value.includes('reading')) return 'reading';
  if (value === 'language' || value.startsWith('language ')) return 'language';
  if (value.includes('math')) return 'mathematics';
  if (value.includes('gmrc') || value.includes('good manners')) return 'gmrc';
  if (value.includes('makabansa')) return 'makabansa';
  if (value.includes('arts') || value.includes('physical education')) return 'ape';
  return '';
}

function paceSubjectCatalog(subject) {
  const key = paceSubjectKey(subject);
  return key ? PACE_GRADE1_CATALOG.subjects[key] : null;
}

function paceSubjectTone(subject) {
  return paceSubjectKey(subject) || '';
}

function paceSubjectDisplayName(subject) {
  const catalog = paceSubjectCatalog(subject);
  return catalog?.subjectNames?.[0] || String(subject || '').trim();
}

function paceSubjectSortIndex(subject) {
  const key = paceSubjectKey(subject);
  const index = PACE_GRADE1_SUBJECT_ORDER.indexOf(key);
  return index < 0 ? PACE_GRADE1_SUBJECT_ORDER.length : index;
}

function paceGrade1SubjectNames() {
  return PACE_GRADE1_SUBJECT_ORDER.map(key => PACE_GRADE1_CATALOG.subjects[key]?.subjectNames?.[0]).filter(Boolean);
}

function paceHomeroomSubjectNames() {
  return PACE_HOMEROOM_SUBJECT_KEYS.map(key => PACE_GRADE1_CATALOG.subjects[key]?.subjectNames?.[0]).filter(Boolean);
}

function isPaceHomeroomAssignment(assignment) {
  if (parseInt(assignment?.gradeLevel, 10) !== 1) return false;
  if (assignment.paceHomeroom === true) return true;
  const subject = String(assignment?.subject || '').trim();
  return subject === PACE_HOMEROOM_SUBJECT || /^grade\s*1$/i.test(subject);
}

function paceWorkingSubject(assignment) {
  if (!isPaceHomeroomAssignment(assignment)) return assignment?.subject || '';
  const names = paceHomeroomSubjectNames();
  const fromUi = (typeof paceUi !== 'undefined' && paceUi.subject) ? paceUi.subject : '';
  const fromStore = assignment?.pace?.currentSubject || '';
  if (names.includes(fromUi)) return fromUi;
  if (names.includes(fromStore)) return fromStore;
  return names[0] || '';
}

function assignmentSubjectLabel(assignment) {
  if (isPaceHomeroomAssignment(assignment)) return 'All learning areas';
  return assignment?.subject || '';
}

function paceAllCompetenciesFor(subject) {
  const catalog = paceSubjectCatalog(subject);
  return catalog ? catalog.items.slice() : [];
}

function paceCompetencyById(subject, competencyId) {
  const id = String(competencyId || '');
  const direct = paceAllCompetenciesFor(subject).find(item => item.id === id);
  if (direct) return direct;
  for (let index = 0; index < PACE_GRADE1_SUBJECT_ORDER.length; index++) {
    const items = PACE_GRADE1_CATALOG.subjects[PACE_GRADE1_SUBJECT_ORDER[index]]?.items || [];
    const found = items.find(item => item.id === id);
    if (found) return found;
  }
  return null;
}

function paceItemAppliesToTerm(item, term) {
  if (!item) return false;
  const termNumber = parseInt(term, 10);
  if (!Number.isFinite(termNumber)) return false;
  const terms = item.terms;
  if (!terms || !terms.length) return true;
  return terms.includes(termNumber);
}

function paceSkillDisplayLabel(code) {
  if (!code) return '';
  if (typeof PACE_SKILL_LABELS !== 'undefined' && PACE_SKILL_LABELS[code]) return PACE_SKILL_LABELS[code];
  return String(code);
}

function paceLiveSkills(item, detailIndex) {
  if (!item) return [];
  const parts = item.detailSkills;
  if (Number.isInteger(detailIndex) && Array.isArray(parts) && parts[detailIndex] && parts[detailIndex].length) {
    return parts[detailIndex].slice();
  }
  return Array.isArray(item.skills) ? item.skills.slice() : [];
}

function paceCompetenciesFor(subject, term) {
  return paceAllCompetenciesFor(subject).filter(item => paceItemAppliesToTerm(item, term));
}

function paceIsYearLongSubject(subject) {
  return Boolean(paceSubjectCatalog(subject)?.yearLong);
}

function paceItemCellCount(item) {
  if (item?.details && item.details.length > 1) return item.details.length;
  return 1;
}

function paceExpectedCellCount(subject, term) {
  return paceCompetenciesFor(subject, term).reduce((sum, item) => sum + paceItemCellCount(item), 0);
}
