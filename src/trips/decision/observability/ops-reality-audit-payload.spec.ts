import { describe, it, expect } from '@jest/globals';
import {
  buildOpsRealityPredictionPayload,
  computePredictionFingerprint,
  computeReplayComparableFingerprintFromPredictionJson,
  mergeOutcomeTelemetryRefs,
  OPS_REALITY_OBSERVATION_EXPORT_SCHEMA,
  compareReplayFingerprints,
} from './ops-reality-audit-payload';
import type { ExecutionOverlayFrame } from '../../execution-overlay/execution-overlay-frame.types';
import { EXECUTION_OVERLAY_SCHEMA_VERSION } from '../../execution-overlay/execution-overlay-frame.types';
import type { TripPlan } from '../plan-model';

function minimalFrame(legId: string): ExecutionOverlayFrame {
  return {
    schemaVersion: EXECUTION_OVERLAY_SCHEMA_VERSION,
    legId,
    route: {
      legId,
      terrainDifficulty: 'LOW',
      weatherExposure: {},
      roadAccessibility: { fRoad: false },
      executionReliability: 0.8,
      estimatedDelayFactor: 1,
      executionState: 'EXECUTABLE',
    },
    temporal: {
      driftMinutes: 0,
      crossDayRisk: 0,
      daylightViolation: false,
      unifiedDelayMinutes: 0,
    },
    weather: { severity: 'LOW', delayFactor: 1 },
    road: { blocked: false, fRoadConstraint: false },
    repair: { recommended: false },
    finalExecutionState: 'EXECUTABLE',
    unifiedDelayMinutes: 0,
    reliabilityScore: 0.9,
  };
}

describe('ops-reality-audit-payload', () => {
  it('fingerprint is stable for same logical payload', () => {
    const plan = {
      version: '1',
      days: [{ date: '2026-01-01', timeSlots: [{ id: 's1' } as any] }],
    } as unknown as TripPlan;
    const a = buildOpsRealityPredictionPayload({
      capturedAtIso: '2026-01-01T00:00:00.000Z',
      frames: [minimalFrame('leg-b'), minimalFrame('leg-a')],
      weatherPipeline: {
        hasHardViolation: false,
        hasSoftViolation: true,
        canProceed: true,
        segmentEvidences: [{}, {}] as any,
      },
      plan,
    });
    const b = buildOpsRealityPredictionPayload({
      capturedAtIso: '2026-01-01T00:00:00.000Z',
      frames: [minimalFrame('leg-a'), minimalFrame('leg-b')],
      weatherPipeline: {
        hasHardViolation: false,
        hasSoftViolation: true,
        canProceed: true,
        segmentEvidences: [{}, {}] as any,
      },
      plan,
    });
    expect(computePredictionFingerprint(a)).toBe(computePredictionFingerprint(b));
  });

  it('replay comparable fingerprint ignores capturedAtIso', () => {
    const plan = {
      version: '1',
      days: [{ date: '2026-01-01', timeSlots: [{ id: 's1' } as any] }],
    } as unknown as TripPlan;
    const p1 = buildOpsRealityPredictionPayload({
      capturedAtIso: '2026-01-01T00:00:00.000Z',
      frames: [minimalFrame('leg-a')],
      weatherPipeline: undefined,
      plan,
    });
    const p2 = buildOpsRealityPredictionPayload({
      capturedAtIso: '2027-06-01T12:00:00.000Z',
      frames: [minimalFrame('leg-a')],
      weatherPipeline: undefined,
      plan,
    });
    expect(computePredictionFingerprint(p1)).not.toBe(computePredictionFingerprint(p2));
    expect(computeReplayComparableFingerprintFromPredictionJson(p1)).toBe(
      computeReplayComparableFingerprintFromPredictionJson(p2),
    );
  });

  it('mergeOutcomeTelemetryRefs fills extensions without overwriting', () => {
    const base = {
      schema: 'p-ops-2-outcome/v1',
      recordedAtIso: '2026-01-01T00:00:00.000Z',
      summary: 'ok',
      extensions: { trip_run_id: 'existing', foo: 1 },
    };
    const m = mergeOutcomeTelemetryRefs(base as unknown as Record<string, unknown>, {
      tripRunId: 'new-run',
      executionTraceId: 'trace-1',
    });
    expect((m.extensions as any).trip_run_id).toBe('existing');
    expect((m.extensions as any).execution_trace_id).toBe('trace-1');
  });

  it('mergeOutcomeTelemetryRefs fills decision_causality_id', () => {
    const base = {
      schema: 'p-ops-2-outcome/v1',
      recordedAtIso: '2026-01-01T00:00:00.000Z',
      summary: 'ok',
      extensions: {},
    };
    const m = mergeOutcomeTelemetryRefs(base as unknown as Record<string, unknown>, {
      causalityId: 'dc_test_1',
    });
    expect((m.extensions as any).decision_causality_id).toBe('dc_test_1');
  });

  it('compareReplayFingerprints matches identical observation export', () => {
    const plan = {
      version: '1',
      days: [{ date: '2026-01-01', timeSlots: [{ id: 's1' } as any] }],
    } as unknown as TripPlan;
    const prediction = buildOpsRealityPredictionPayload({
      capturedAtIso: '2026-01-01T00:00:00.000Z',
      frames: [minimalFrame('leg-a')],
      weatherPipeline: undefined,
      plan,
    });
    const obs = {
      schema: OPS_REALITY_OBSERVATION_EXPORT_SCHEMA,
      legs: prediction.legs,
      planDigest: prediction.planDigest,
    };
    const r = compareReplayFingerprints(prediction, obs);
    expect(r.match).toBe(true);
  });
});
