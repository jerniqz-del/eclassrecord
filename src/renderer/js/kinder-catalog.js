/**
 * Kindergarten developmental catalog from the SY 2026-2027 official SF9.
 * Encoded from UPDATED [Kinder] E-Class Record with SF9. Do not scrape Excel at runtime.
 */
var KINDER_CATALOG_ID = 'kinder-matatag-2026';
var KINDER_CATALOG_VERSION = 1;

function isKinderGradeLevel(gradeLevel) {
  const value = String(gradeLevel || '').trim().toLowerCase();
  return value === '0' || value === 'k' || value.includes('kinder');
}

function isKinderAssignment(assignment) {
  return isKinderGradeLevel(assignment && assignment.gradeLevel);
}

function kinderItem(id, number, title, group, strand) {
  return Object.freeze({
    id,
    number,
    title,
    group: group || '',
    strand: strand || '',
    details: Object.freeze([]),
    terms: Object.freeze([1, 2, 3]),
    skills: Object.freeze([])
  });
}

var KINDER_DOMAIN_ORDER = Object.freeze([
  'Sensory Perceptual and Motor Development',
  'Socio-emotional Development',
  'Cognitive Development',
  'Language, Literacy, and Communication Development'
]);

var KINDER_CATALOG = Object.freeze({
  id: KINDER_CATALOG_ID,
  version: KINDER_CATALOG_VERSION,
  domains: Object.freeze([
    Object.freeze({
      name: 'Sensory Perceptual and Motor Development',
      items: Object.freeze([
        kinderItem('kd-sp-01', 1, 'Identifies external body parts and their functions', 'Sensory Perceptual and Motor Development'),
        kinderItem('kd-sp-02', 2, 'Identifies ways to care for and protects one’s body', 'Sensory Perceptual and Motor Development'),
        kinderItem('kd-sp-03', 3, 'Demonstrates gross motor skills (locomotor, non-locomotor)', 'Sensory Perceptual and Motor Development'),
        kinderItem('kd-sp-04', 4, 'Moves body parts as directed', 'Sensory Perceptual and Motor Development'),
        kinderItem('kd-sp-05', 5, 'Demonstrates fine motor skills (tearing, cutting, rolling, molding with playdough)', 'Sensory Perceptual and Motor Development')
      ])
    }),
    Object.freeze({
      name: 'Socio-emotional Development',
      items: Object.freeze([
        kinderItem('kd-se-01', 1, 'Identifies and expresses feelings in appropriate ways', 'Socio-emotional Development'),
        kinderItem('kd-se-02', 2, 'Recognizes and respect feelings of others', 'Socio-emotional Development'),
        kinderItem('kd-se-03', 3, 'Expresses needs and preferences', 'Socio-emotional Development'),
        kinderItem('kd-se-04', 4, 'Behaves appropriately in different situations', 'Socio-emotional Development'),
        kinderItem('kd-se-05', 5, 'Participates in classroom routines and activities', 'Socio-emotional Development'),
        kinderItem('kd-se-06', 6, 'Follows classroom and school rules', 'Socio-emotional Development'),
        kinderItem('kd-se-07', 7, 'Fulfills classroom responsibilities', 'Socio-emotional Development')
      ])
    }),
    Object.freeze({
      name: 'Cognitive Development',
      items: Object.freeze([
        kinderItem('kd-cg-01', 1, 'Identifies attributes of objects (color, shape, size)', 'Cognitive Development'),
        kinderItem('kd-cg-02', 2, 'Matches objects based on attributes', 'Cognitive Development'),
        kinderItem('kd-cg-03', 3, 'Describes objects based on attributes (shape, color, taste, texture)', 'Cognitive Development'),
        kinderItem('kd-cg-04', 4, 'Classifies objects by a single attribute (color, shape, size)', 'Cognitive Development'),
        kinderItem('kd-cg-05', 5, 'Reclassifies objects according to multiple attributes', 'Cognitive Development'),
        kinderItem('kd-cg-06', 6, 'Arranges objects according to specific attributes', 'Cognitive Development'),
        kinderItem('kd-cg-07', 7, 'Recognizes, extends and create patterns using concrete objects', 'Cognitive Development'),
        kinderItem('kd-cg-08', 8, 'Measures size, length, capacity and mass of objects using non-standard measuring tools', 'Cognitive Development'),
        kinderItem('kd-cg-09', 9, 'Identifies position of objects (in, on, over, under, top, bottom)', 'Cognitive Development'),
        kinderItem('kd-cg-10', 10, 'Compares quantities of objects (more/less)', 'Cognitive Development'),
        kinderItem('kd-cg-11', 11, 'Counts with one-to-one correspondence', 'Cognitive Development'),
        kinderItem('kd-cg-12', 12, 'Recognizes numerals', 'Cognitive Development'),
        kinderItem('kd-cg-13', 13, 'Matches numerals to objects', 'Cognitive Development'),
        kinderItem('kd-cg-14', 14, 'Adds and subtracts using concrete objects', 'Cognitive Development'),
        kinderItem('kd-cg-15', 15, 'Recognizes clock as measure of time (hours and minutes)', 'Cognitive Development'),
        kinderItem('kd-cg-16', 16, 'Shows awareness and care for the natural and physical environment', 'Cognitive Development'),
        kinderItem('kd-cg-17', 17, 'Talks about participation in cultural and religious activities', 'Cognitive Development'),
        kinderItem('kd-cg-18', 18, 'Shows awareness of the importance of caring for the natural and physical environment through simple practices (e.g., sorting trash, helping to clean up)', 'Cognitive Development'),
        kinderItem('kd-cg-19', 19, 'Predicts outcomes in familiar stories read aloud in class', 'Cognitive Development'),
        kinderItem('kd-cg-20', 20, 'Suggests solutions to problems in class activities and stories read aloud in class', 'Cognitive Development')
      ])
    }),
    Object.freeze({
      name: 'Language, Literacy, and Communication Development',
      items: Object.freeze([
        kinderItem('kd-ln-01', 1, 'Identifies familiar environmental sound', 'Language, Literacy, and Communication Development', 'Listening and Viewing'),
        kinderItem('kd-ln-02', 2, 'Recalls what happens first, middle and end in a story', 'Language, Literacy, and Communication Development', 'Listening and Viewing'),
        kinderItem('kd-ln-03', 3, 'Retells story in sequence', 'Language, Literacy, and Communication Development', 'Listening and Viewing'),
        kinderItem('kd-ln-04', 4, 'Follows 1-2 step instructions', 'Language, Literacy, and Communication Development', 'Listening and Viewing'),
        kinderItem('kd-ln-05', 5, 'Recognizes non-decodable words in and out of context automatically', 'Language, Literacy, and Communication Development', 'Sight Word Recognition'),
        kinderItem('kd-ln-06', 6, 'Recognizes sight words', 'Language, Literacy, and Communication Development', 'Sight Word Recognition'),
        kinderItem('kd-ln-07', 7, 'Identifies first and last name', 'Language, Literacy, and Communication Development', 'Speaking'),
        kinderItem('kd-ln-08', 8, 'Identifies classmates, teachers, family member', 'Language, Literacy, and Communication Development', 'Speaking'),
        kinderItem('kd-ln-09', 9, 'Identifies familiar objects at home, in school and in the community', 'Language, Literacy, and Communication Development', 'Speaking'),
        kinderItem('kd-ln-10', 10, 'Uses polite greetings and courteous expressions in varied situations', 'Language, Literacy, and Communication Development', 'Speaking'),
        kinderItem('kd-ln-11', 11, 'Retells personal experiences to story events', 'Language, Literacy, and Communication Development', 'Speaking'),
        kinderItem('kd-ln-12', 12, 'Expresses ideas and feelings using phrases and simple sentences', 'Language, Literacy, and Communication Development', 'Speaking'),
        kinderItem('kd-ln-13', 13, 'Orally segment sounds', 'Language, Literacy, and Communication Development', 'Phonological / Phonemic Awareness'),
        kinderItem('kd-ln-14', 14, 'Identifies uppercase letters', 'Language, Literacy, and Communication Development', 'Letter Knowledge'),
        kinderItem('kd-ln-15', 15, 'Identifies lowercase letters', 'Language, Literacy, and Communication Development', 'Letter Knowledge'),
        kinderItem('kd-ln-16', 16, 'Matches upper and lowercase letters', 'Language, Literacy, and Communication Development', 'Letter Knowledge'),
        kinderItem('kd-ln-17', 17, 'Identifies letter sounds', 'Language, Literacy, and Communication Development', 'Letter Sound Relationship'),
        kinderItem('kd-ln-18', 18, 'Matches letters and their corresponding sounds', 'Language, Literacy, and Communication Development', 'Letter Sound Relationship'),
        kinderItem('kd-ln-19', 19, 'Uses a variety of strategies to gain meaning of leveled texts', 'Language, Literacy, and Communication Development', 'Comprehension'),
        kinderItem('kd-ln-20', 20, 'Uses print and illustrations to make meaning', 'Language, Literacy, and Communication Development', 'Comprehension'),
        kinderItem('kd-ln-21', 21, 'Demonstrates book handling skills', 'Language, Literacy, and Communication Development', 'Concepts of Print'),
        kinderItem('kd-ln-22', 22, 'Distinguishes between letters, words, and sentences', 'Language, Literacy, and Communication Development', 'Concepts of Print'),
        kinderItem('kd-ln-23', 23, 'Demonstrates awareness of print (left to right and top to bottom)', 'Language, Literacy, and Communication Development', 'Concepts of Print'),
        kinderItem('kd-ln-24', 24, 'Traces/draws/copies shapes, designs, pictures', 'Language, Literacy, and Communication Development', 'Writing'),
        kinderItem('kd-ln-25', 25, 'Traces/copies/writes name, words', 'Language, Literacy, and Communication Development', 'Writing'),
        kinderItem('kd-ln-26', 26, 'Writes uppercase and lowercase letters', 'Language, Literacy, and Communication Development', 'Writing'),
        kinderItem('kd-ln-27', 27, 'Spells sight words', 'Language, Literacy, and Communication Development', 'Writing'),
        kinderItem('kd-ln-28', 28, 'Spells simple words phonetically', 'Language, Literacy, and Communication Development', 'Writing')
      ])
    })
  ])
});

function kinderDomainNames() {
  return KINDER_DOMAIN_ORDER.slice();
}

function kinderAllItems() {
  return KINDER_CATALOG.domains.reduce((list, domain) => list.concat(domain.items.slice()), []);
}

function kinderCompetenciesFor(domain) {
  if (!domain) return kinderAllItems();
  const match = KINDER_CATALOG.domains.find(item => item.name === domain);
  return match ? match.items.slice() : [];
}

function kinderCompetencyById(id) {
  return kinderAllItems().find(item => item.id === id) || null;
}

function kinderTermResult(assignment, learnerId, term) {
  const items = typeof kinderAllItems === 'function' ? kinderAllItems() : [];
  const letters = items.map(item => (
    typeof paceGetRating === 'function' ? paceGetRating(assignment, learnerId, item.id, term, '') : ''
  )).filter(Boolean);
  const derived = typeof paceMedianLetter === 'function' ? paceMedianLetter(letters) : (letters[0] || '');
  return {
    letter: derived || null,
    rated: letters.length,
    expected: items.length,
    hasData: letters.length > 0
  };
}

if (typeof module === 'object' && module.exports) {
  module.exports = {
    KINDER_CATALOG_ID,
    KINDER_CATALOG_VERSION,
    KINDER_CATALOG,
    isKinderGradeLevel,
    isKinderAssignment,
    kinderDomainNames,
    kinderAllItems,
    kinderCompetenciesFor,
    kinderCompetencyById,
    kinderTermResult
  };
}
