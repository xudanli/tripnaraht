/**
 * Minimal Iceland Guide fixture for Decision Lab (1 day, 2 POIs).
 */

import type { TripWorldState } from '../../trips/decision/world-model';
import type { TripPlan } from '../../trips/decision/plan-model';
import type { DecisionCandidate } from '../../decision-runtime/contracts/decision-candidate';
import type { CanonicalConstraintReport } from '../../decision-runtime/constraints/contracts/canonical-constraint-report';
import { buildGuideTripWorldState } from '../../guide-to-plan/utils/guide-world-state.util';
import type { GuideItineraryDraft } from '../../guide-to-plan/services/guide-plan-builder.service';

export const ICELAND_MINIMAL_FIXTURE_ID = 'iceland_guide_minimal_v1';

export function icelandMinimalDraft(): GuideItineraryDraft {
  return {
    totalDays: 1,
    variant: 'balanced',
    sourceConfidence: 0.85,
    warnings: [],
    days: [
      {
        day: 1,
        date: '2026-08-15',
        items: [
          {
            name: '蓝湖',
            type: 'poi',
            source: 'guide',
            startTime: '10:00',
            endTime: '12:00',
            candidateId: 'slot_blue_lagoon',
          },
          {
            name: '雷克雅未克',
            type: 'poi',
            source: 'guide',
            startTime: '14:00',
            endTime: '17:00',
            candidateId: 'slot_reykjavik',
          },
        ],
        activityCount: 2,
      },
    ],
  };
}

export function icelandMinimalWorldState(): TripWorldState {
  return buildGuideTripWorldState({
    countryCode: 'IS',
    travelContext: {
      startDate: '2026-08-15',
      countryCode: 'IS',
      transportMode: 'self_drive',
    },
    draft: icelandMinimalDraft(),
    sessionId: 'lab_fixture_session',
  });
}

export function icelandMinimalPlan(): TripPlan {
  return {
    version: 'v1',
    createdAt: new Date().toISOString(),
    days: [
      {
        day: 1,
        date: '2026-08-15',
        timeSlots: [
          {
            id: 'slot_blue_lagoon',
            time: '10:00',
            endTime: '12:00',
            title: '蓝湖',
            type: 'sightseeing',
            poiId: 'slot_blue_lagoon',
          },
          {
            id: 'slot_reykjavik',
            time: '14:00',
            endTime: '17:00',
            title: '雷克雅未克',
            type: 'sightseeing',
            poiId: 'slot_reykjavik',
          },
        ],
      },
    ],
  };
}

export function icelandMinimalCandidate(): DecisionCandidate {
  return {
    candidateId: 'balanced',
    label: '平衡',
    source: 'LEGACY_TRIP_PLANNING',
    plan: icelandMinimalPlan(),
    utilityHint: 0.72,
    createdAt: new Date().toISOString(),
  };
}

/** Two candidates with different drive load for lex vs utility comparison */
export function icelandMinimalMultiCandidateFixture(): DecisionCandidate[] {
  const lightPlan = icelandMinimalPlan();
  const heavyPlan: TripPlan = {
    ...icelandMinimalPlan(),
    days: [
      {
        ...icelandMinimalPlan().days[0],
        timeSlots: icelandMinimalPlan().days[0].timeSlots.map((slot, idx) => ({
          ...slot,
          id: `heavy_${slot.id}`,
          travelLegFromPrev:
            idx === 0
              ? undefined
              : {
                  mode: 'drive',
                  from: { lat: 63.4, lng: -19.0 },
                  to: { lat: 64.1, lng: -21.9 },
                  durationMin: 180,
                },
        })),
      },
    ],
  };

  return [
    {
      candidateId: 'balanced',
      label: '平衡',
      source: 'LEGACY_TRIP_PLANNING',
      plan: lightPlan,
      utilityHint: 0.85,
      createdAt: new Date().toISOString(),
    },
    {
      candidateId: 'conservative',
      label: '保守',
      source: 'LEGACY_TRIP_PLANNING',
      plan: heavyPlan,
      utilityHint: 0.65,
      createdAt: new Date().toISOString(),
    },
  ];
}

export function icelandMinimalConstraintReport(tripId: string): CanonicalConstraintReport {
  return {
    schemaId: 'tripnara.canonical_constraint_report@v1',
    tripId,
    evaluatedAt: new Date().toISOString(),
    assertions: [],
    completeness: {
      roads: 'MISSING',
      weather: 'MISSING',
      hazards: 'MISSING',
      ferries: 'MISSING',
      openingHours: 'MISSING',
    },
    overallStatus: 'UNVERIFIED',
    degraded: false,
    degradedReasons: [],
  };
}

/** Two candidates with utility vs lex divergence for REAL-MULTI smoke materialize. */
export function icelandMinimalMultiMaterializeFixture(): DecisionCandidate[] {
  const lightPlan = icelandMinimalPlan();
  const heavyPlan: TripPlan = {
    ...icelandMinimalPlan(),
    days: [
      {
        ...icelandMinimalPlan().days[0],
        timeSlots: icelandMinimalPlan().days[0].timeSlots.map((slot, idx) => ({
          ...slot,
          id: `heavy_${slot.id}`,
          travelLegFromPrev:
            idx === 0
              ? undefined
              : {
                  mode: 'drive',
                  from: { lat: 63.4, lng: -19.0 },
                  to: { lat: 64.1, lng: -21.9 },
                  durationMin: 240,
                },
        })),
      },
    ],
  };

  return [
    {
      candidateId: 'balanced',
      label: '平衡',
      source: 'LEGACY_TRIP_PLANNING',
      plan: lightPlan,
      utilityHint: 0.62,
      createdAt: new Date().toISOString(),
    },
    {
      candidateId: 'conservative',
      label: '保守',
      source: 'LEGACY_TRIP_PLANNING',
      plan: heavyPlan,
      utilityHint: 0.92,
      createdAt: new Date().toISOString(),
    },
  ];
}

/** Feasible per-candidate reports for REAL-MULTI smoke (avoids ROAD_DATA_NOT_LOADED re-eval). */
export function icelandMinimalMultiFeasibleConstraintReports(
  tripId: string,
  candidateIds: string[],
): Record<string, CanonicalConstraintReport> {
  const out: Record<string, CanonicalConstraintReport> = {};
  for (const candidateId of candidateIds) {
    out[candidateId] = {
      schemaId: 'tripnara.canonical_constraint_report@v1',
      tripId,
      candidateId,
      evaluatedAt: new Date().toISOString(),
      assertions: [],
      completeness: {
        roads: 'COMPLETE',
        weather: 'COMPLETE',
        hazards: 'COMPLETE',
        ferries: 'COMPLETE',
        openingHours: 'MISSING',
      },
      overallStatus: 'FEASIBLE',
      degraded: false,
      degradedReasons: [],
    };
  }
  return out;
}
