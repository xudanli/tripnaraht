import type { ExecutionControlContext } from '../contracts/execution-control-policy.types';
import { DEFAULT_ECPS_RUNTIME_BIAS } from '../contracts/policy-correction.types';
import { decideExecution } from './ecps.decide-execution';

function baseCtx(overrides: Partial<ExecutionControlContext> = {}): ExecutionControlContext {
  return {
    artifactId: 'aid',
    replayConfidence: {
      score: 0.95,
      band: 'HIGH',
      factors: {
        eligibilityPrior: 1,
        anomalyPenalty: 0,
        timeDecayFactor: 1,
      },
    },
    replayEligibility: 'FULL',
    anomalies: [],
    freshness: {},
    provenance: {},
    ...overrides,
  };
}

describe('decideExecution (ECPS)', () => {
  it('Rule 1: INVALID → RECOMPUTE + reasoning kernel + HIGH depth', () => {
    const d = decideExecution(
      baseCtx({
        replayConfidence: {
          score: 0,
          band: 'INVALID',
          factors: {
            eligibilityPrior: 0.06,
            anomalyPenalty: 0,
            timeDecayFactor: 1,
          },
        },
      }),
    );
    expect(d.mode).toBe('RECOMPUTE');
    expect(d.kernel).toBe('REASONING_KERNEL');
    expect(d.toolDepth).toBe('HIGH');
    expect(d.invalidationScope).toBe('FULL');
    expect(d.reuseArtifact).toBe(false);
  });

  it('Rule 1: NON_REPLAYABLE eligibility → RECOMPUTE', () => {
    const d = decideExecution(
      baseCtx({
        replayEligibility: 'NON_REPLAYABLE',
      }),
    );
    expect(d.mode).toBe('RECOMPUTE');
    expect(d.reuseArtifact).toBe(false);
  });

  it('Rule 1: IMPOSSIBLE_STATE anomaly → RECOMPUTE', () => {
    const d = decideExecution(
      baseCtx({
        anomalies: [
          {
            code: 'X',
            severity: 'ERROR',
            category: 'IMPOSSIBLE_STATE',
            message: 'm',
          },
        ],
      }),
    );
    expect(d.mode).toBe('RECOMPUTE');
  });

  it('Rule 2: HIGH + FULL → REUSE / reflex kernel / NONE', () => {
    const d = decideExecution(baseCtx());
    expect(d.mode).toBe('REUSE');
    expect(d.kernel).toBe('REFLEX_KERNEL');
    expect(d.toolDepth).toBe('NONE');
    expect(d.reuseArtifact).toBe(true);
    expect(d.invalidationScope).toBe('NONE');
  });

  it('Rule 3: MEDIUM → VALIDATE + LOW tool depth', () => {
    const d = decideExecution(
      baseCtx({
        replayConfidence: {
          score: 0.5,
          band: 'MEDIUM',
          factors: {
            eligibilityPrior: 0.62,
            anomalyPenalty: 0,
            timeDecayFactor: 1,
          },
        },
      }),
    );
    expect(d.mode).toBe('VALIDATE');
    expect(d.toolDepth).toBe('LOW');
    expect(d.reuseArtifact).toBe(false);
  });

  it('Rule 3 override: MEDIUM + allowMediumDedupReplay → REUSE shortcut', () => {
    const d = decideExecution(
      baseCtx({
        replayConfidence: {
          score: 0.5,
          band: 'MEDIUM',
          factors: {
            eligibilityPrior: 0.62,
            anomalyPenalty: 0,
            timeDecayFactor: 1,
          },
        },
        policyOverrides: { allowMediumDedupReplay: true },
      }),
    );
    expect(d.mode).toBe('REUSE');
    expect(d.reuseArtifact).toBe(true);
  });

  it('Rule 4: LOW → RECOMPUTE', () => {
    const d = decideExecution(
      baseCtx({
        replayConfidence: {
          score: 0.2,
          band: 'LOW',
          factors: {
            eligibilityPrior: 0.3,
            anomalyPenalty: 0.2,
            timeDecayFactor: 0.8,
          },
        },
      }),
    );
    expect(d.mode).toBe('RECOMPUTE');
    expect(d.confidenceGate).toBe('LOW');
  });

  it('PCK bias: HIGH score below reuse floor → VALIDATE instead of REUSE', () => {
    const d = decideExecution(
      baseCtx({
        replayConfidence: {
          score: 0.79,
          band: 'HIGH',
          factors: {
            eligibilityPrior: 0.95,
            anomalyPenalty: 0,
            timeDecayFactor: 1,
          },
        },
      }),
      DEFAULT_ECPS_RUNTIME_BIAS,
    );
    expect(d.mode).toBe('VALIDATE');
    expect(d.toolDepth).toBe('LOW');
  });

  it('PCK bias: positive replayThresholdShift rescues borderline HIGH score for reuse', () => {
    const d = decideExecution(
      baseCtx({
        replayConfidence: {
          score: 0.79,
          band: 'HIGH',
          factors: {
            eligibilityPrior: 0.95,
            anomalyPenalty: 0,
            timeDecayFactor: 1,
          },
        },
      }),
      { ...DEFAULT_ECPS_RUNTIME_BIAS, replayThresholdShift: 0.5 },
    );
    expect(d.mode).toBe('REUSE');
    expect(d.kernel).toBe('REFLEX_KERNEL');
  });

  it('PCK bias: strong system1BiasAdjustment enables MEDIUM dedup-style reuse', () => {
    const d = decideExecution(
      baseCtx({
        replayConfidence: {
          score: 0.5,
          band: 'MEDIUM',
          factors: {
            eligibilityPrior: 0.62,
            anomalyPenalty: 0,
            timeDecayFactor: 1,
          },
        },
      }),
      { ...DEFAULT_ECPS_RUNTIME_BIAS, system1BiasAdjustment: 0.5 },
    );
    expect(d.mode).toBe('REUSE');
    expect(d.kernel).toBe('REFLEX_KERNEL');
  });
});
