/**
 * Build DecisionState + RAG stubs for offline decision-closure golden capture.
 */
import type { E2ECase } from './e2e-case.types';
import type { DecisionState, OptimizationHints } from '../../../decision/kernel/decision-state.types';
import type { ChunkRetrievalResult } from '../../../rag/services/chunk-retrieval.service';
import fs from 'fs';
import path from 'path';
import { itineraryToRoutePlanDraft } from '../../../decision/kernel/dso-to-trips-converter';
import { decisionStateToTripWorldState } from '../../../decision/kernel/dso-to-trips-converter';
import { convertRoutePlanDraftToTripPlan } from '../../decision/tot/plan-converter';
import { materializeRagChunksToWorldStore } from '../../../world/materialize-rag-world-constraints';

export type StormStrategyDoc = {
  strategySignals?: {
    roads?: Array<{ id: string; name?: string; status?: string; reason?: string }>;
    weather_severity?: string;
    wind_speed_mps?: number;
  };
};

const COUNTRY_DESTINATION: Record<string, string> = {
  IS: 'Iceland',
  NZ: 'New Zealand',
  AU: 'Australia',
  JP: 'Japan',
};

const COUNTRY_RAG_SEED_FILE: Record<string, string> = {
  IS: 'iceland-road-constraint-chunks.p0.json',
  NZ: 'nz-road-constraint-chunks.p0.json',
  AU: 'au-road-constraint-chunks.p0.json',
  JP: 'jp-road-constraint-chunks.p0.json',
};

/** Load P0 country RAG seed chunks for offline capture (no DB). */
export function loadCountryRagSeedChunks(countryCode: string): ChunkRetrievalResult[] {
  const file = COUNTRY_RAG_SEED_FILE[countryCode.toUpperCase()];
  if (!file) return [];
  const seedPath = path.join(process.cwd(), 'data', 'rag', file);
  if (!fs.existsSync(seedPath)) return [];
  const raw = JSON.parse(fs.readFileSync(seedPath, 'utf8')) as {
    chunks?: Array<{
      chunk_id: string;
      category: string;
      content: string;
      metadata?: Record<string, unknown>;
    }>;
  };
  return (raw.chunks ?? []).map(
    (c) =>
      ({
        id: c.chunk_id,
        chunkId: c.chunk_id,
        category: c.category,
        content: c.content,
        score: 0.9,
        metadata: c.metadata,
      }) as unknown as ChunkRetrievalResult,
  );
}

/** Minimal DSO for CGUS adapter replay (aligned with replay-cgus-real-fixtures). */
export function buildDsoFromE2ECase(testCase: E2ECase): DecisionState {
  const days = Math.max(1, testCase.expected?.finalState?.planDays ?? 3);
  const itemsPerDay = 2;
  const mkTime = (h: number, m: number) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  const mkWin = (h: number, m: number) => ({
    start: mkTime(h, m),
    end: mkTime(h, m + 30 > 59 ? 59 : m + 30),
  });
  const itinerary = {
    request_id: `e2e-${testCase.id}`,
    days: Array.from({ length: days }).map((_, dayIdx) => ({
      items: Array.from({ length: itemsPerDay }).map((__, itemIdx) => {
        const startH = 9 + itemIdx * 2;
        return {
          id: `fixture-item-${dayIdx}-${itemIdx}`,
          type: 'poi',
          start_window: mkWin(startH, 0),
          end_window: mkWin(startH + 1, 0),
          location_ref: {
            place_id: `fixture-poi-${dayIdx}-${itemIdx}`,
            name: `POI ${dayIdx}-${itemIdx}`,
            coordinates: { lat: 63.4 + dayIdx * 0.05, lng: -19.0 - itemIdx * 0.03 },
          },
          metadata: {
            distance_meters: 5000 + dayIdx * 1000,
            travel_duration_min_from_prev: 25,
          },
        };
      }),
    })),
  };

  const violations: Array<{ type: string; severity: 'HARD' | 'SOFT'; degree: number; detail: string }> =
    testCase.expected?.abuExpected?.action === 'REJECT'
      ? [{ type: 'DEM_VIOLATION', severity: 'HARD', degree: 1, detail: 'fixture:abu_reject' }]
      : [];

  return {
    requestId: `e2e-${testCase.id}`,
    systemState: { requestId: `e2e-${testCase.id}` },
    environmentState: {
      month: testCase.input?.season,
      countryCode: testCase.input?.countryCode ?? 'IS',
      routeDirectionId: testCase.expected?.routeDirectionId ?? `fixture-rd-${testCase.id}`,
    },
    tripState: { planDraft: itinerary },
    constraints: { violations, feasible: violations.filter((v) => v.severity === 'HARD').length === 0 },
    userIntent: {
      destination: COUNTRY_DESTINATION[testCase.input?.countryCode ?? 'IS'] ?? 'Iceland',
      countryCode: testCase.input?.countryCode ?? 'IS',
      styleTags: testCase.input?.userProfile?.preferredRouteTypes,
    },
  } as DecisionState;
}

/** Enrich storm DSO with high entropy + strategy-signal HARD violations. */
export function enrichStormDsoForCapture(dso: DecisionState, storm: StormStrategyDoc): DecisionState {
  const violations = [...(dso.constraints?.violations ?? [])];
  for (const road of storm.strategySignals?.roads ?? []) {
    if (String(road.status ?? '').toUpperCase() === 'CLOSED') {
      violations.push({
        type: 'WORLD_ROAD_CLOSED',
        severity: 'HARD',
        degree: 1,
        detail: `${road.id}:${road.reason ?? 'closed'}`,
      });
    }
  }
  if (storm.strategySignals?.weather_severity === 'RED_ALERT') {
    violations.push({
      type: 'WORLD_WEATHER_BLIZZARD',
      severity: 'HARD',
      degree: 1,
      detail: 'storm:red_alert',
    });
  }
  const hard = violations.filter((v) => v.severity === 'HARD');
  return {
    ...dso,
    uncertaintyProfile: {
      hasUncertainty: true,
      entropy01: 0.91,
      ess: 120,
      source: 'capture-storm-fixture',
    },
    constraints: {
      ...dso.constraints,
      violations,
      feasible: hard.length === 0,
    },
  } as unknown as DecisionState;
}

/** Synthetic RAG chunks from storm strategySignals (no DB). */
export function buildStormStrategyRagChunks(storm: StormStrategyDoc): ChunkRetrievalResult[] {
  const chunks: ChunkRetrievalResult[] = [];
  for (const road of storm.strategySignals?.roads ?? []) {
    chunks.push({
      id: `storm-road-${road.id}`,
      chunkId: `storm-road-${road.id}`,
      category: 'ROAD_STATUS',
      content: `${road.id} ${road.name ?? ''} CLOSED ${road.reason ?? ''}`.trim(),
      score: 0.95,
      metadata: {
        roadId: road.id,
        countryCode: 'IS',
        status: 'CLOSED',
        affected_slot_ids: ['day1-drive-south'],
      },
    } as unknown as ChunkRetrievalResult);
  }
  if (storm.strategySignals?.weather_severity === 'RED_ALERT') {
    chunks.push({
      id: 'storm-weather-1',
      chunkId: 'storm-weather-1',
      category: 'RISK_INFO',
      content: 'BLIZZARD RED_ALERT south coast Iceland',
      score: 0.9,
      metadata: { date: '2026-01-16', countryCode: 'IS' },
    } as unknown as ChunkRetrievalResult);
  }
  return chunks;
}

/**
 * Offline merge: RAG chunks → WorldConstraintStore summary (capture script; avoids CGUS overlay throw).
 */
export function mergeRagMaterializationIntoHints(
  hints: OptimizationHints,
  state: DecisionState,
  chunks: ChunkRetrievalResult[],
): OptimizationHints {
  if (!chunks.length) return hints;
  const planDraft = state.tripState?.planDraft;
  if (!planDraft || typeof planDraft !== 'object') return hints;
  const routeDirectionId = (state.environmentState as { routeDirectionId?: string })?.routeDirectionId ?? 'unknown';
  const tripId = state.systemState?.requestId ?? state.requestId ?? 'unknown';
  const plan = itineraryToRoutePlanDraft(planDraft as import('../../../agent/interfaces/trip-plan.interface').Itinerary, tripId, routeDirectionId);
  const tripWorld = decisionStateToTripWorldState(state);
  const tripPlan = convertRoutePlanDraftToTripPlan(plan as any, tripWorld as any);
  const tripDates = tripPlan?.days?.map((d: { date: string }) => d.date) ?? [];
  const mat = materializeRagChunksToWorldStore(chunks, { tripDates, tripPlan: tripPlan as any });
  if (!mat) return hints;
  const audit = hints.metaDecisionAudit ?? '';
  const ragSuffix = `ragWorld=${mat.appliedEvents}`;
  return {
    ...hints,
    metaDecisionAudit: audit.includes('ragWorld') ? audit : `${audit} ${ragSuffix}`.trim(),
    worldConstraintMaterialization: {
      appliedEvents: mat.appliedEvents,
      roadIds: mat.roadIds,
      weatherDates: mat.weatherDates,
      storeVersion: mat.storeVersion,
    },
  };
}

/** Strip volatile fields before writing golden JSON. */
export function sanitizeHintsForGolden(hints: OptimizationHints): Record<string, unknown> {
  return {
    method: hints.method,
    recommendedAlternativeId: hints.recommendedAlternativeId,
    metaDecisionAudit: hints.metaDecisionAudit,
    decisionVerdict: hints.decisionVerdict,
    decisionVerdictNarrationZh: hints.decisionVerdictNarrationZh,
    worldConstraintMaterialization: hints.worldConstraintMaterialization,
    alternatives: hints.alternatives?.map((a) => ({
      id: a.id,
      score: a.score,
      expected_utility: a.expectedUtility,
      feasibility_probability: a.feasibilityProbability,
    })),
  };
}
