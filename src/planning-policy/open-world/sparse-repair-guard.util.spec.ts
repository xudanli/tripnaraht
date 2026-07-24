import {
  isOpenWorldElasticPoiRef,
  isSparseIntentionalSlackActive,
  shouldSkipAggressivePoiRepairForSparseContext,
} from '../open-world/sparse-repair-guard.util';

describe('sparse-repair-guard.util', () => {
  it('detects sparse intentional slack from decisionContext', () => {
    expect(
      isSparseIntentionalSlackActive({
        userIntent: {},
        tripState: {},
        environmentState: {},
        systemState: {},
        constraints: {
          feasible: true,
          violations: [],
          decisionContext: {
            sparseProfileId: 'sparse_polar_svalbard',
            intentionalSlack: [{ reasonCode: 'WEATHER_WINDOW', minutesReserved: 240 }],
          },
        },
      }),
    ).toBe(true);
  });

  it('skips repair for provisional poi refs', () => {
    expect(isOpenWorldElasticPoiRef('provisional_disco_kayak_gl')).toBe(true);
    expect(shouldSkipAggressivePoiRepairForSparseContext(undefined, 'provisional_disco_kayak_gl')).toBe(true);
  });
});
