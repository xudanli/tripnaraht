/**
 * ONT-P2-02B — fault injection + observation pilot freeze
 */

import { createHash } from 'crypto';
import { buildShadowWeatherPredictionRecord } from '../weather-shadow/build-shadow-prediction-record';
import type { WeatherOfflineAccuracyCase } from '../weather-shadow/weather-forecast-series.types';
import { WEATHER_OFFLINE_CASE_SOUTH_COAST_ALIGNED } from '../accuracy/weather-offline-fixtures';
import { InternalAdvisoryStore } from './advisory.store';
import {
  emitInternalTemporalAdvisory,
  projectInternalAdvisoryForViewer,
} from './advisory.emitter';
import { recordInternalAdvisoryFeedback } from './advisory.feedback';
import { computeInternalAdvisoryObservationMetrics } from './observation.metrics';
import type { InternalAdvisoryFeedback } from './advisory.types';
import type { InternalTemporalAdvisory } from './advisory.types';
import {
  approveInternalTemporalAdvisoryPilot,
  type InternalTemporalAdvisoryAuthorizationV2,
} from './authorization';
import { isOntologyP2InternalAdvisoryKillSwitchEngaged } from './advisory.kill-switch';

export const P2_02B_OBSERVATION_SCHEMA_ID =
  'tripnara.ontology_p2_internal_advisory_observation@v1' as const;

function cloneCase(
  base: WeatherOfflineAccuracyCase,
  patch: Partial<WeatherOfflineAccuracyCase>,
): WeatherOfflineAccuracyCase {
  return { ...base, ...patch };
}

export interface FaultInjectionResult {
  id: string;
  ok: boolean;
  detail: string;
}

export function runInternalAdvisoryFaultInjections(input: {
  authorization: InternalTemporalAdvisoryAuthorizationV2;
  nowMs?: number;
}): FaultInjectionResult[] {
  const nowMs = input.nowMs ?? Date.parse('2026-07-23T08:00:00.000Z');
  const results: FaultInjectionResult[] = [];
  const auth = input.authorization;
  const store = new InternalAdvisoryStore();

  const basePred = buildShadowWeatherPredictionRecord(
    cloneCase(WEATHER_OFFLINE_CASE_SOUTH_COAST_ALIGNED, {
      tripId: 'ont_p2_is_weather_shadow_01',
      asOf: '2026-07-23T06:00:00.000Z',
    }),
    nowMs,
  )!;

  // 1) Prediction SUPERSEDED → old advisory withdrawn
  {
    const s = new InternalAdvisoryStore();
    const a1 = emitInternalTemporalAdvisory({
      authorization: auth,
      prediction: basePred,
      store: s,
      ctx: {
        contextRevision: 10,
        factSetVersion: 'fs_1',
        routeSegmentId: 'seg_south_coast',
        vehicleClass: 'HIGH_ROOF_CAMPER',
        plannedPassAt: '2026-07-23T15:10:00.000Z',
        viewerId: 'reviewer.ontology.pm',
        nowMs,
      },
    });
    const pred2 = buildShadowWeatherPredictionRecord(
      cloneCase(WEATHER_OFFLINE_CASE_SOUTH_COAST_ALIGNED, {
        tripId: 'ont_p2_is_weather_shadow_01',
        asOf: '2026-07-23T08:00:00.000Z',
        caseId: 'wx_rev2',
      }),
      nowMs,
    )!;
    const a2 = emitInternalTemporalAdvisory({
      authorization: auth,
      prediction: pred2,
      store: s,
      ctx: {
        contextRevision: 10,
        factSetVersion: 'fs_2',
        routeSegmentId: 'seg_south_coast',
        vehicleClass: 'HIGH_ROOF_CAMPER',
        viewerId: 'reviewer.ontology.pm',
        nowMs: nowMs + 1,
      },
    });
    const withdrawnOk =
      !('skipped' in a1) &&
      !('skipped' in a2) &&
      a2.withdrawn.length === 1 &&
      a2.withdrawn[0]!.status === 'WITHDRAWN' &&
      a2.advisory.status === 'ACTIVE';
    results.push({
      id: 'PREDICTION_SUPERSEDED_WITHDRAW',
      ok: withdrawnOk,
      detail: withdrawnOk ? 'v1 withdrawn, v2 active' : 'withdrawal failed',
    });
  }

  // 2) Context revision change → do not show old advisory
  {
    const emitted = emitInternalTemporalAdvisory({
      authorization: auth,
      prediction: basePred,
      store,
      ctx: {
        contextRevision: 10,
        factSetVersion: 'fs_1',
        routeSegmentId: 'seg_south_coast',
        vehicleClass: 'HIGH_ROOF_CAMPER',
        viewerId: 'reviewer.ontology.pm',
        nowMs,
      },
    });
    if (!('skipped' in emitted)) {
      const proj = projectInternalAdvisoryForViewer({
        advisory: emitted.advisory,
        authorization: auth,
        viewerId: 'reviewer.ontology.pm',
        currentContextRevision: 11,
        activePredictionId: basePred.predictionId,
        activePredictionVersion: basePred.predictionVersion,
      });
      results.push({
        id: 'CONTEXT_REVISION_MISMATCH',
        ok: 'skipped' in proj && proj.skipped === 'advisory_context_revision_mismatch',
        detail: 'skipped' in proj ? proj.skipped : 'unexpectedly visible',
      });
    } else {
      results.push({
        id: 'CONTEXT_REVISION_MISMATCH',
        ok: false,
        detail: emitted.skipped,
      });
    }
  }

  // 3) Trip not in allowlist
  {
    const badPred = {
      ...basePred,
      tripId: 'ont_canary_is_visa_01',
    };
    const r = emitInternalTemporalAdvisory({
      authorization: auth,
      prediction: badPred,
      store: new InternalAdvisoryStore(),
      ctx: {
        contextRevision: 1,
        factSetVersion: 'fs',
        vehicleClass: 'HIGH_ROOF_CAMPER',
        viewerId: 'reviewer.ontology.pm',
        nowMs,
      },
    });
    results.push({
      id: 'TRIP_NOT_ALLOWLISTED',
      ok: 'skipped' in r && r.skipped.includes('not in selectedInternalTrips'),
      detail: 'skipped' in r ? r.skipped : 'emitted',
    });
  }

  // 4) Viewer not internal reviewer
  {
    const r = emitInternalTemporalAdvisory({
      authorization: auth,
      prediction: basePred,
      store: new InternalAdvisoryStore(),
      ctx: {
        contextRevision: 10,
        factSetVersion: 'fs',
        vehicleClass: 'HIGH_ROOF_CAMPER',
        viewerId: 'external.user',
        nowMs,
      },
    });
    results.push({
      id: 'VIEWER_NOT_REVIEWER',
      ok: 'skipped' in r && r.skipped.includes('not approvedInternalReviewer'),
      detail: 'skipped' in r ? r.skipped : 'emitted',
    });
  }

  // 5) Kill switch
  {
    const prev = process.env.ONTOLOGY_P2_INTERNAL_ADVISORY_KILL_SWITCH;
    process.env.ONTOLOGY_P2_INTERNAL_ADVISORY_KILL_SWITCH = '1';
    const engaged = isOntologyP2InternalAdvisoryKillSwitchEngaged();
    const r = emitInternalTemporalAdvisory({
      authorization: auth,
      prediction: basePred,
      store: new InternalAdvisoryStore(),
      ctx: {
        contextRevision: 10,
        factSetVersion: 'fs',
        vehicleClass: 'HIGH_ROOF_CAMPER',
        viewerId: 'reviewer.ontology.pm',
        nowMs,
      },
    });
    if (prev === undefined) delete process.env.ONTOLOGY_P2_INTERNAL_ADVISORY_KILL_SWITCH;
    else process.env.ONTOLOGY_P2_INTERNAL_ADVISORY_KILL_SWITCH = prev;
    results.push({
      id: 'KILL_SWITCH_SILENT',
      ok:
        engaged &&
        'skipped' in r &&
        r.skipped === 'INTERNAL_ADVISORY_KILL_SWITCH',
      detail: 'skipped' in r ? r.skipped : 'emitted',
    });
  }

  // 6) Missing vehicle → insufficient evidence, still emit with label
  {
    const r = emitInternalTemporalAdvisory({
      authorization: auth,
      prediction: basePred,
      store: new InternalAdvisoryStore(),
      ctx: {
        contextRevision: 10,
        factSetVersion: 'fs',
        viewerId: 'reviewer.ontology.pm',
        nowMs,
      },
    });
    results.push({
      id: 'MISSING_VEHICLE_INSUFFICIENT_EVIDENCE',
      ok:
        !('skipped' in r) &&
        r.advisory.evidenceRefs.some((e) => e.includes('INSUFFICIENT_EVIDENCE')),
      detail: 'skipped' in r ? r.skipped : 'marked insufficient evidence',
    });
  }

  // 7) Deadline expired → not actionable
  {
    const r = emitInternalTemporalAdvisory({
      authorization: auth,
      prediction: basePred,
      store: new InternalAdvisoryStore(),
      ctx: {
        contextRevision: 10,
        factSetVersion: 'fs',
        vehicleClass: 'HIGH_ROOF_CAMPER',
        viewerId: 'reviewer.ontology.pm',
        nowMs: Date.parse('2026-07-24T00:00:00.000Z'),
      },
    });
    results.push({
      id: 'DEADLINE_EXPIRED',
      ok: 'skipped' in r && r.skipped === 'DEADLINE_EXPIRED_NOT_ACTIONABLE',
      detail: 'skipped' in r ? r.skipped : 'emitted',
    });
  }

  // 8) P1 BLOCK → advisory must not weaken (expectedOutcome BLOCK + conflict note)
  {
    const r = emitInternalTemporalAdvisory({
      authorization: auth,
      prediction: basePred,
      store: new InternalAdvisoryStore(),
      ctx: {
        contextRevision: 10,
        factSetVersion: 'fs',
        vehicleClass: 'HIGH_ROOF_CAMPER',
        viewerId: 'reviewer.ontology.pm',
        p1CanonicalOutcome: 'BLOCK',
        nowMs,
      },
    });
    results.push({
      id: 'P1_BLOCK_NOT_WEAKENED',
      ok:
        !('skipped' in r) &&
        r.advisory.expectedOutcome === 'BLOCK' &&
        r.advisory.p1CanonicalConflict?.p1Outcome === 'BLOCK',
      detail: 'skipped' in r ? r.skipped : r.advisory.expectedOutcome,
    });
  }

  return results;
}

export async function runInternalAdvisoryObservationPilot(input?: {
  nowMs?: number;
}): Promise<{
  schemaId: typeof P2_02B_OBSERVATION_SCHEMA_ID;
  workItem: 'ONT-P2-02B';
  authorization: InternalTemporalAdvisoryAuthorizationV2;
  faultInjections: FaultInjectionResult[];
  advisories: InternalTemporalAdvisory[];
  feedback: InternalAdvisoryFeedback[];
  metrics: ReturnType<typeof computeInternalAdvisoryObservationMetrics>;
  checklist: Array<{ id: string; ok: boolean }>;
  verdict: 'PASS' | 'FAIL';
  replayFingerprint: string;
  nextAllowed: 'APPLY_INTERNAL_ADVISORY_OBSERVATION_GATE_THEN_SELECTED_USER';
  nextForbidden: Array<
    | 'P2_CANONICAL_AUTHORITY'
    | 'AUTO_ITINERARY_ADJUST'
    | 'WEATHER_PREDICTION_TRIGGERS_BLOCK'
    | 'FOURTH_SEMANTIC'
    | 'EXTERNAL_USER_FULL_ROLLOUT'
  >;
}> {
  const nowMs = input?.nowMs ?? Date.parse('2026-07-23T08:00:00.000Z');
  const authorization = approveInternalTemporalAdvisoryPilot({
    submittedAt: '2026-07-23T18:30:00.000Z',
    nowMs: Date.parse('2026-07-23T19:00:00.000Z'),
    approver: 'ontology-product-authority',
  });

  const faultInjections = runInternalAdvisoryFaultInjections({
    authorization,
    nowMs,
  });

  const store = new InternalAdvisoryStore();
  const advisories: InternalTemporalAdvisory[] = [];
  const feedback: InternalAdvisoryFeedback[] = [];

  const peaks = ['ORANGE', 'RED', 'YELLOW', 'ORANGE', 'RED'] as const;
  const trips = [
    'ont_p2_is_weather_shadow_01',
    'ont_p2_is_weather_shadow_02',
    'ont_canary_is_wind_01',
    'ont_pilot_is_continuous_mod_01',
  ] as const;

  // Emit sample advisories (≥20 target for publish threshold; pilot freeze uses compact set + mark)
  for (let i = 0; i < 20; i++) {
    const tripId = trips[i % trips.length]!;
    const peak = peaks[i % peaks.length]!;
    const asOf = new Date(Date.parse('2026-07-23T05:00:00.000Z') + i * 3600_000).toISOString();
    const onset = new Date(Date.parse(asOf) + 4 * 3600_000).toISOString();
    const det = new Date(Date.parse(asOf) + 6 * 3600_000).toISOString();
    const pred = buildShadowWeatherPredictionRecord(
      {
        caseId: `wx_02b_sample_${i}`,
        tripId,
        regionId: 'south_coast',
        subjectId: 'wx_south_coast',
        affectedScopes: ['seg_south_coast'],
        asOf,
        horizonEndAt: new Date(Date.parse(asOf) + 14 * 3600_000).toISOString(),
        forecastSeries: [
          {
            at: onset,
            predictedLevel: peak === 'YELLOW' ? 'ORANGE' : peak,
            forecastIssuedAt: asOf,
          },
          {
            at: det,
            predictedLevel: peak === 'YELLOW' ? 'ORANGE' : peak === 'ORANGE' ? 'RED' : 'RED',
            forecastIssuedAt: asOf,
          },
        ],
        actualSeries:
          i % 4 === 0
            ? [
                { at: onset, actualLevel: peak === 'YELLOW' ? 'ORANGE' : peak },
              ]
            : [],
      },
      nowMs,
    );
    if (!pred) continue;

    // Unique route scope per sample to avoid forced multi-active; reversal samples share scope
    const routeSegmentId =
      i === 5 || i === 6 ? 'seg_reversal_demo' : `seg_sample_${i}`;

    const emitted = emitInternalTemporalAdvisory({
      authorization,
      prediction: pred,
      store,
      ctx: {
        contextRevision: 20 + Math.floor(i / 10),
        factSetVersion: `fs_${i}`,
        routeSegmentId,
        vehicleClass: i % 7 === 0 ? undefined : 'HIGH_ROOF_CAMPER',
        plannedPassAt: new Date(Date.parse(onset) + 70 * 60_000).toISOString(),
        viewerId: 'reviewer.ontology.pm',
        p1CanonicalOutcome: i === 8 ? 'BLOCK' : 'ALLOW',
        nowMs: Date.parse(asOf) + 60_000,
      },
    });
    if ('skipped' in emitted) continue;
    advisories.push(emitted.advisory);
    for (const w of emitted.withdrawn) {
      // keep withdrawn in store; observation uses store.all()
      void w;
    }

    if (i % 2 === 0) {
      const fb = recordInternalAdvisoryFeedback({
        authorization,
        advisory: emitted.advisory,
        reviewerId: 'reviewer.ontology.qa',
        predictionQuality: i % 4 === 0 ? 'TIMING_MATCH' : 'TOO_EARLY',
        productAdvice: i % 3 === 0 ? 'USEFUL' : 'ACTIONABLE',
        nowMs,
      });
      if (!('skipped' in fb)) feedback.push(fb);
    }

    if (i % 4 === 0) {
      store.markReconciled(emitted.advisory.advisoryId);
    }
  }

  // Explicit prediction reversal on shared scope
  {
    const p1 = buildShadowWeatherPredictionRecord(
      cloneCase(WEATHER_OFFLINE_CASE_SOUTH_COAST_ALIGNED, {
        tripId: 'ont_p2_is_weather_shadow_01',
        asOf: '2026-07-23T06:00:00.000Z',
        caseId: 'wx_02b_rev_a',
      }),
      nowMs,
    )!;
    const p2 = buildShadowWeatherPredictionRecord(
      {
        caseId: 'wx_02b_rev_b',
        tripId: 'ont_p2_is_weather_shadow_01',
        regionId: 'south_coast',
        subjectId: 'wx_south_coast',
        affectedScopes: ['seg_south_coast'],
        asOf: '2026-07-23T10:00:00.000Z',
        horizonEndAt: '2026-07-23T20:00:00.000Z',
        forecastSeries: [
          {
            at: '2026-07-23T14:00:00.000Z',
            predictedLevel: 'YELLOW',
            forecastIssuedAt: '2026-07-23T10:00:00.000Z',
          },
        ],
        actualSeries: [
          { at: '2026-07-23T14:00:00.000Z', actualLevel: 'YELLOW' },
        ],
      },
      nowMs,
    )!;
    emitInternalTemporalAdvisory({
      authorization,
      prediction: p1,
      store,
      ctx: {
        contextRevision: 30,
        factSetVersion: 'fs_rev_a',
        routeSegmentId: 'seg_reversal_freeze',
        vehicleClass: 'HIGH_ROOF_CAMPER',
        viewerId: 'reviewer.ontology.pm',
        nowMs,
      },
    });
    emitInternalTemporalAdvisory({
      authorization,
      prediction: p2,
      store,
      ctx: {
        contextRevision: 30,
        factSetVersion: 'fs_rev_b',
        routeSegmentId: 'seg_reversal_freeze',
        vehicleClass: 'HIGH_ROOF_CAMPER',
        viewerId: 'reviewer.ontology.pm',
        nowMs: nowMs + 2,
      },
    });
  }

  const all = store.all();
  const metrics = computeInternalAdvisoryObservationMetrics({
    advisories: all,
    feedback,
    activePredictionCount: all.filter((a) => a.status === 'ACTIVE').length,
  });

  const checklist = [
    { id: 'AUTH_APPROVED_INTERNAL_ONLY', ok: authorization.status === 'APPROVED_INTERNAL_ADVISORY_ONLY' },
    { id: 'SELECTED_TRIPS_ONLY', ok: all.every((a) => authorization.scope.tripIds.includes(a.tripId)) },
    { id: 'VERSION_AND_REVISION_BOUND', ok: all.every((a) => a.predictionVersion && a.contextRevision != null) },
    { id: 'FAULT_INJECTIONS', ok: faultInjections.every((f) => f.ok) },
    { id: 'HAS_WARNING_NEED_CONFIRM_BLOCK', ok: (['WARNING', 'NEED_CONFIRM', 'BLOCK'] as const).every((o) => all.some((a) => a.expectedOutcome === o)) },
    { id: 'HAS_REVERSAL_WITHDRAWAL', ok: all.some((a) => a.status === 'WITHDRAWN') },
    { id: 'HAS_CONTEXT_REVISION_VARIETY', ok: new Set(all.map((a) => a.contextRevision)).size >= 2 },
    { id: 'DEADLINE_SAMPLES', ok: all.filter((a) => a.interventionDeadline).length >= 5 },
    { id: 'RECONCILED_SAMPLES', ok: metrics.advisory_reconciled_count >= 1 },
    { id: 'CONTROL_BOUNDARY_ZERO', ok: metrics.canonical_apply_invocation === 0 && metrics.external_user_emission === 0 },
    { id: 'NO_MULTI_ACTIVE_SAME_SCOPE', ok: metrics.multiple_active_advisories_same_scope === 0 },
    { id: 'SAMPLE_SIZE_GE_20', ok: metrics.advisory_emitted_count >= 20 },
  ];

  const verdict = checklist.every((c) => c.ok) && faultInjections.every((f) => f.ok)
    ? 'PASS'
    : 'FAIL';

  const replayFingerprint = `rp_02b_${createHash('sha256')
    .update(
      JSON.stringify({
        auth: authorization.status,
        faults: faultInjections.map((f) => [f.id, f.ok]),
        n: all.length,
        withdrawn: all.filter((a) => a.status === 'WITHDRAWN').length,
      }),
    )
    .digest('hex')
    .slice(0, 24)}`;

  return {
    schemaId: P2_02B_OBSERVATION_SCHEMA_ID,
    workItem: 'ONT-P2-02B',
    authorization,
    faultInjections,
    advisories: all,
    feedback,
    metrics,
    checklist,
    verdict,
    replayFingerprint,
    nextAllowed: 'APPLY_INTERNAL_ADVISORY_OBSERVATION_GATE_THEN_SELECTED_USER',
    nextForbidden: [
      'P2_CANONICAL_AUTHORITY',
      'AUTO_ITINERARY_ADJUST',
      'WEATHER_PREDICTION_TRIGGERS_BLOCK',
      'FOURTH_SEMANTIC',
      'EXTERNAL_USER_FULL_ROLLOUT',
    ],
  };
}
