/**
 * F208 travel-eta + DEM gold — soft registry entry.
 * Executed by `npm run test:f208-travel-dem-gold` (dem harness), not TD mock-engine replay.
 */

import { E2ECase } from '../e2e-case.types';

export const icelandF208TravelEtaDemGoldCase: E2ECase = {
  id: 'iceland-f208-travel-eta-dem-gold-001',
  name: 'F208 — Route ETA + DEM terrain + F-road vehicle gate',
  description:
    'ETA-L2-PROD-01：TravelSegmentEnrichment + AUTO terrain + L2 Shadow；' +
    '金样矩阵 5 案（4WD ALLOW / 2WD REJECT / CLOSED REPLACE / 环岛无缓冲 / global DEM）；' +
    'harness: src/trips/dem/harness/f208-travel-eta-dem-gold.spec.ts',
  input: {
    userProfile: {
      pacePreference: 'MEDIUM',
      riskTolerance: 'MEDIUM',
      preferredRouteTypes: ['highlands', 'froad'],
    },
    season: 7,
    countryCode: 'IS',
    userQuery: '7 月自驾 F208，两驱车',
  },
  expected: {
    abuExpected: {
      action: 'REJECT',
      reasonCodes: ['OFFICIAL_IS_FROAD_2WD'],
    },
    finalState: {
      allowed: false,
    },
  },
  metadata: {
    tags: ['f208', 'travel-eta', 'dem', 'p0-gate'],
  },
};

export const ICELAND_TRAVEL_DEM_GOLD_FIXTURES: readonly E2ECase[] = [
  icelandF208TravelEtaDemGoldCase,
];
