/**
 * RFC-002 Phase 3 — minimal WorldModelContext for Canonical evaluate paths (any country).
 */

import type { WorldModelContext } from '../../decision/shared/world-model.types';
import type { RoadStatusAssertionPayload } from '../adapters/road-status-to-assertion.adapter';
import { normalizeDestinationCountryCode } from '../../../decision-runtime/packs/loader/country-pack-registry.util';

export function buildMinimalEvaluateWorld(input: {
  countryCode: string;
  roadId: string;
  roadStatus: RoadStatusAssertionPayload['status'];
  month?: number;
}): WorldModelContext {
  const countryCode = normalizeDestinationCountryCode(input.countryCode) ?? 'GLOBAL';
  const closed = input.roadStatus === 'CLOSED';
  return {
    physical: {
      countryCode,
      month: input.month ?? 2,
      demEvidence: [],
      roadStates: [
        {
          roadId: input.roadId.toUpperCase(),
          status: closed ? 'CLOSED' : 'OPEN',
          metadata: { lastVerifiedAt: new Date().toISOString() },
        },
      ],
      hazardZones: [],
      ferryStates: [],
    },
    human: {
      profileId: 'canonical_default',
      maxDailyAscentM: 1200,
      rollingAscent3DaysM: 2800,
      maxSlopePct: 25,
      preferredPace: 'MEDIUM',
      riskTolerance: 'MEDIUM',
      highAltitudeExperience: 'BASIC',
    },
    routeDirection: {
      id: `synthetic-${countryCode}`,
      countryCode,
      name: `${countryCode} synthetic evaluate`,
      philosophy: {
        mustVisitTags: [],
        nonNegotiableRules: [],
      },
    } as unknown as WorldModelContext['routeDirection'],
  };
}
