import {
  extractCausalObservationFromOpsOutcome,
  CAUSAL_OBSERVATION_EXTENSION_SCHEMA,
} from './extract-causal-observation-from-ops-outcome.util';
import type { OpsRealityOutcomePayloadV1 } from '../../decision/observability/ops-reality-audit-payload';

describe('extractCausalObservationFromOpsOutcome', () => {
  it('parses explicit causal_observation extension', () => {
    const outcome: OpsRealityOutcomePayloadV1 = {
      schema: 'p-ops-2-outcome/v1',
      recordedAtIso: new Date().toISOString(),
      summary: 'missed glacier slot',
      extensions: {
        causal_observation: {
          schema: CAUSAL_OBSERVATION_EXTENSION_SCHEMA,
          metrics: { iceland_miss_prob: 1, iceland_p90_minutes: 172 },
          missed_appointment: true,
        },
      },
    };
    const obs = extractCausalObservationFromOpsOutcome(outcome);
    expect(obs?.metrics.iceland_miss_prob).toBe(1);
    expect(obs?.missedAppointment).toBe(true);
  });

  it('infers from observation_export when explicit block absent', () => {
    const outcome: OpsRealityOutcomePayloadV1 = {
      schema: 'p-ops-2-outcome/v1',
      recordedAtIso: new Date().toISOString(),
      summary: 'road blocked',
      delta: { hardWeatherRealized: true },
      extensions: {
        observation_export: {
          schema: 'p-ops-2-obs-export/v1',
          legs: [
            {
              legId: 'leg-1',
              finalExecutionState: 'BLOCKED',
              unifiedDelayMinutes: 165,
              weatherSeverity: 'HIGH',
              roadBlocked: true,
              fRoadConstraint: true,
              reliabilityScore: 0.2,
            },
          ],
          planDigest: { dayDates: ['2026-07-01'], slotCount: 3 },
        },
      },
    };
    const obs = extractCausalObservationFromOpsOutcome(outcome);
    expect(obs?.metrics.iceland_p90_minutes).toBe(165);
    expect(obs?.missedAppointment).toBe(true);
  });
});
