import type { DecisionCausalityRecordV1 } from '../decision-causality-v1.types';
import { finalizeDecisionCausalityRecordV1 } from '../decision-causality-v1';
import type { TripWorldState } from '../../decision/world-model';
import type { TripPlan } from '../../decision/plan-model';
import {
  runCausalCounterfactualClosure,
  updateIcelandCalibration,
} from './run-causal-counterfactual-closure';
import { applyCounterfactualClosureToWorldState } from './apply-counterfactual-to-world-state';
import { buildCounterfactualTravelEventEnvelope } from '../travel-event-counterfactual.builder';

function minimalStateWithRecord(): {
  state: TripWorldState;
  record: DecisionCausalityRecordV1;
} {
  const draft = {
    causality_id: 'dc_test_p5',
    started_at: new Date().toISOString(),
    tick_kind: 'generate_plan' as const,
    trace_request_id: 'req-1',
    reality: { snapshot_id: 'snap-1', region: 'IS', validity: { status: 'FRESH' as const } },
    policy_engine: { verdict: 'ALLOW' as const, codes: [], reasons: [] },
    execution_gate: { type: 'ALLOW' as const },
  };
  const state = {
    context: { tripId: 'trip-1', destination: 'IS', startDate: '2026-07-01' },
    candidatesByDate: {},
    signals: { lastUpdatedAt: new Date().toISOString() },
  } as TripWorldState;

  const record = finalizeDecisionCausalityRecordV1(
    draft,
    {
      phase: 'completed',
      log: { runId: 'run-1', plannerVersion: 'test', explanation: '' } as never,
      plan: { days: [], version: 1 } as TripPlan,
    },
    {
      ...state,
      signals: {
        ...state.signals,
        icelandSelfDriveCausalAssessment: {
          schema: 'tripnara/iceland-self-drive-causal/v1',
          input: {
            routeLabel: 'Vík → glacier',
            distanceKm: 180,
            baseDurationMinutes: 120,
            windMps: 16,
            appointmentSlackMinutes: 20,
          },
          travelTime: { p50Minutes: 130, p90Minutes: 155, meanMinutes: 135, pointMinutes: 130, p10Minutes: 115, effectiveSpeedKmh: 70, windSpeedFactor: 0.82 },
          missProbability: 0.38,
          causalChain: ['environment:wind_mps', 'outcome:miss_probability'],
          bindings: [],
          userFacingAssessment: 'test',
        },
      },
    },
  );

  state.signals.decisionCausalityChain = [record];
  return { state, record };
}

describe('runCausalCounterfactualClosure', () => {
  it('detects under-predicted miss and produces calibration delta', () => {
    const { record } = minimalStateWithRecord();
    const report = runCausalCounterfactualClosure({
      record,
      observation: {
        metrics: { iceland_miss_prob: 1, iceland_p90_minutes: 170 },
        missedAppointment: true,
        narrative: '确实错过了冰川团',
      },
    });

    expect(report?.schema).toBe('tripnara/causal-counterfactual/v1');
    expect(report?.metricDeltas.find((d) => d.key === 'iceland_miss_prob')?.direction).toBe(
      'UNDER_PREDICTED',
    );
    expect(report?.icelandCalibration?.sampleCount).toBe(1);
    expect(report?.icelandCalibration?.missLogisticAdjust).toBeGreaterThan(0);
    expect(report?.userFacingAssessment).toContain('偏乐观');
  });

  it('updates iceland calibration conservatively when over-predicted', () => {
    const cal = updateIcelandCalibration(undefined, { iceland_miss_prob: 0.6 }, {
      metrics: { iceland_miss_prob: 0.1 },
      missedAppointment: false,
    });
    expect(cal?.missLogisticAdjust).toBeLessThan(0);
  });
});

describe('applyCounterfactualClosureToWorldState', () => {
  it('writes snapshot and calibration onto signals', () => {
    const { state, record } = minimalStateWithRecord();
    const report = runCausalCounterfactualClosure({
      record,
      observation: { metrics: { iceland_miss_prob: 1 }, missedAppointment: true },
    });
    expect(report).toBeTruthy();
    applyCounterfactualClosureToWorldState(state, report!);
    expect(state.signals.causalCounterfactualSnapshot?.lastCausalityId).toBe('dc_test_p5');
    expect(state.signals.icelandCausalCalibration?.sampleCount).toBe(1);
    expect(record.causal_decision?.actualOutcome?.metrics.iceland_miss_prob).toBe(1);
  });
});

describe('buildCounterfactualTravelEventEnvelope', () => {
  it('uses RESULT segment and outcome event type', () => {
    const { record } = minimalStateWithRecord();
    const report = runCausalCounterfactualClosure({
      record,
      observation: { metrics: { iceland_miss_prob: 0.9 } },
    })!;
    const env = buildCounterfactualTravelEventEnvelope({ tripId: 'trip-1', report });
    expect(env.eventType).toBe('trip.decision.causality_outcome_recorded');
    expect(env.segment).toBe('RESULT');
  });
});
