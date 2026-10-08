import assert from 'node:assert/strict';
import test, { mock } from 'node:test';

const OWNER = 'owner-service-area';
const originalArea = {
  mode: 'cities',
  cities: [{ city: 'Halifax', region: 'NS', country: 'CA' }]
};
const row = {
  ownerId: OWNER,
  businessTypesJson: '[]',
  knowledgeBaseJson: JSON.stringify({
    about: 'Existing business',
    hours: 'Weekdays',
    services: '',
    policies: '',
    faqs: '',
    neverSay: [],
    draft: false,
    serviceArea: originalArea
  }),
  calendarJson: '{}',
  operatorEnabled: 0,
  onboardingStep: 5,
  updatedAt: '2026-09-29T12:00:00.000Z'
};

function ownerQuery(sql) {
  return {
    get(ownerId) {
      if (/SELECT \* FROM businessProfiles WHERE ownerId = \?/.test(sql) && ownerId === OWNER) {
        return { ...row };
      }
      if (/FROM users WHERE id = \?/.test(sql) && ownerId === OWNER) {
        return {id:OWNER,businessName:'Synthetic service area',plan:'Operator',planStatus:'active',timezone:'UTC'};
      }
      throw new Error(`Unexpected onboarding test read: ${sql}`);
    },
    run(...values) {
      if (/^INSERT OR IGNORE INTO businessProfiles/.test(sql)) {
        return { changes: 0 };
      }
      if (!/^UPDATE businessProfiles SET /.test(sql)) {
        throw new Error(`Unexpected onboarding test write: ${sql}`);
      }
      const assignments = sql.slice(
        sql.indexOf('SET ') + 4,
        sql.indexOf(' WHERE ownerId')
      ).split(', ').map(value => value.split(' = ')[0]);
      const ownerId = values.at(-1);
      assert.equal(ownerId, OWNER);
      assignments.forEach((column, index) => { row[column] = values[index]; });
      return { changes: 1 };
    }
  };
}

if (typeof mock.module !== 'function') {
  test('knowledge-base service-area persistence (requires Node module mocks)', { skip: true }, () => {});
} else {
  mock.module(new URL('../server/src/db.js', import.meta.url).href, {
    namedExports: {
      ownerQuery,
      db: {
        transaction(work) {
          return (...args) => work(...args);
        }
      }
    }
  });
  const { saveKnowledgeBase } = await import(`../server/src/onboardingService.js?service-area-test=${Date.now()}`);

  test('legacy knowledge-base saves preserve an existing structured service area', () => {
    const saved = saveKnowledgeBase(OWNER, {
      about: 'Updated business',
      hours: 'Monday to Friday',
      services: 'Roofing',
      policies: '',
      faqs: '',
      neverSay: [],
      draft: false
    });
    assert.deepEqual(saved.knowledgeBase.serviceArea, originalArea);
    assert.deepEqual(JSON.parse(row.knowledgeBaseJson).serviceArea, originalArea);
  });

  test('supplied service areas are canonicalized and invalid shapes do not overwrite saved coverage', () => {
    const saved = saveKnowledgeBase(OWNER, {
      about: 'Updated business',
      serviceArea: {
        mode: 'cities',
        cities: [{ city: '  Dartmouth  ', region: ' NS ', country: 'ca' }]
      }
    });
    assert.deepEqual(saved.knowledgeBase.serviceArea, {
      mode: 'cities',
      cities: [{ city: 'Dartmouth', region: 'NS', country: 'CA' }]
    });
    const before = row.knowledgeBaseJson;
    assert.throws(
      () => saveKnowledgeBase(OWNER, {
        about: 'Should not persist',
        serviceArea: { mode: 'radius', radiusKm: 25 }
      }),
      error => error?.code === 'INVALID_REQUEST' && error?.statusCode === 400
    );
    assert.equal(row.knowledgeBaseJson, before);
  });
}
