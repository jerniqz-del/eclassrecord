'use strict';

const FIXED_TIME = '2026-01-15T08:00:00.000Z';
const TEST_PIN = '135790';
const RECOVERY_ID = 'ECR-2345-6789-ABCD-EFGH-JKLM';

function assignment(id = 'synthetic-class-001', learnerCount = 2) {
  const learners = Array.from({ length: learnerCount }, (_, index) => ({
    id: `synthetic-learner-${String(index + 1).padStart(3, '0')}`,
    lrn: `900000000${String(index + 1).padStart(3, '0')}`,
    lastName: `TestLast${String(index + 1).padStart(3, '0')}`,
    firstName: `TestFirst${String(index + 1).padStart(3, '0')}`,
    sex: index % 2 === 0 ? 'M' : 'F',
  }));
  return {
    id,
    gradeLevel: '6',
    section: 'Synthetic Section',
    subject: 'Mathematics',
    schoolYear: '2026-2027',
    learners,
    assessments: [{ id: 'synthetic-assessment-001', term: '1', maxScore: 20, name: 'Synthetic Assessment' }],
    scores: Object.fromEntries(learners.map((learner, index) => [`${learner.id}|synthetic-assessment-001`, index % 21])),
  };
}

function profileData(overrides = {}) {
  return {
    version: 7,
    lastUpdatedAt: FIXED_TIME,
    teacherName: 'Synthetic Teacher 001',
    schoolName: 'Synthetic School 001',
    schoolYear: '2026-2027',
    currentAssignmentId: 'synthetic-class-001',
    currentTerm: '1',
    activeView: 'dashboard',
    assignments: [assignment()],
    advisory: { schemaVersion: 2, classes: [], learners: [], subjects: [], grades: {}, settings: {} },
    ...overrides,
  };
}

function profile(id, overrides = {}) {
  return {
    id,
    name: `Synthetic Profile ${id}`,
    pinEnabled: false,
    salt: '',
    pinHash: '',
    secondaryBackupPath: '',
    backupRecoveryId: '',
    backupRecoveryIdHistory: [],
    sharedFolderSync: {
      enabled: false,
      baseRevisionId: '',
      ownRevisionId: '',
      integratedRevisionIds: [],
      lastPublishedDigest: '',
      lastFolderWriteAt: '',
      lastCheckedAt: '',
      lastError: '',
    },
    createdAt: FIXED_TIME,
    lastUpdatedAt: FIXED_TIME,
    recovery: null,
    data: profileData(),
    ...overrides,
  };
}

function root(profiles = [], activeProfileId = '') {
  return { version: 7, lastUpdatedAt: FIXED_TIME, profiles, activeProfileId };
}

function fixtures() {
  const plain = profile('plain-001');
  const protectedProfile = profile('protected-001', {
    pinEnabled: true,
    salt: '00112233445566778899aabbccddeeff',
    pinHash: 'pbkdf2-sha256$310000$7f4f94e13cf0efb105e5f55b871624dc32338be8114d1d841a7872ba765d22db',
    data: {
      secureBackup: true,
      encryptionVersion: 2,
      cipher: 'AES-GCM',
      kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: 310000 },
      salt: '00112233445566778899aabbccddeeff',
      iv: '00112233445566778899aabb',
      ciphertext: '00112233445566778899aabbccddeeff',
    },
  });
  const shared = profile('shared-001', {
    backupRecoveryId: RECOVERY_ID,
    secondaryBackupPath: 'D:/Synthetic-OneDrive/E-Class Record',
    sharedFolderSync: {
      enabled: true,
      baseRevisionId: 'synthetic-base-001',
      ownRevisionId: 'synthetic-revision-001',
      integratedRevisionIds: [],
      lastPublishedDigest: '0'.repeat(64),
      lastFolderWriteAt: FIXED_TIME,
      lastCheckedAt: FIXED_TIME,
      lastError: '',
    },
  });
  const advisory = profile('advisory-001', {
    data: profileData({
      advisory: {
        schemaVersion: 2,
        classes: [{ id: 'synthetic-advisory-class-001', gradeLevel: '6', section: 'Synthetic Section' }],
        learners: [{ id: 'synthetic-advisory-learner-001', firstName: 'TestFirst001', lastName: 'TestLast001' }],
        subjects: [{ id: 'synthetic-subject-001', name: 'Mathematics' }],
        grades: {},
        settings: {},
      },
    }),
  });
  const large = profile('large-001', {
    data: profileData({ assignments: [assignment('synthetic-large-class-001', 250)] }),
  });
  return {
    empty: root(),
    singleProfile: root([profile('single-001')], 'single-001'),
    multiProfile: root([profile('multi-001'), profile('multi-002')], 'multi-001'),
    encryptedProfile: root([protectedProfile], 'protected-001'),
    unprotectedProfile: root([plain], 'plain-001'),
    pairedMobile: {
      database: root([profile('paired-001')], 'paired-001'),
      pairing: {
        schemaVersion: 2,
        desktopId: '11111111-1111-4111-a111-111111111111',
        profileId: 'paired-001',
        mobileDeviceId: '22222222-2222-4222-a222-222222222222',
        certificateFingerprint: 'a'.repeat(64),
        pairedAt: FIXED_TIME,
      },
    },
    sharedFolder: root([shared], 'shared-001'),
    advisory: root([advisory], 'advisory-001'),
    largeClass: root([large], 'large-001'),
    corrupted: '{"version":7,"profiles":[',
    legacyBackup: {
      version: 1,
      teacherName: 'Synthetic Legacy Teacher',
      schoolName: 'Synthetic Legacy School',
      schoolYear: '2025-2026',
      assignments: [assignment('synthetic-legacy-class-001', 1)],
    },
  };
}

module.exports = { FIXED_TIME, TEST_PIN, RECOVERY_ID, assignment, profileData, profile, root, fixtures };
