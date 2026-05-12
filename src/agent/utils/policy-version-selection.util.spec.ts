import type { ExecutionPolicyVersion } from '../contracts/execution-policy-version.types';
import {
  buildPolicySelectionContext,
  scorePolicyVersion,
  selectPolicyVersion,
} from './policy-version-selection.util';
import type { ExecutionControlContext } from '../contracts/execution-control-policy.types';
import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';

function ctx(): ExecutionControlContext {
  return {
    artifactId: 'a',
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
  };
}

describe('policy-version-selection', () => {
  it('selectPolicyVersion prefers higher replayStability under HIGH band', () => {
    const sel = buildPolicySelectionContext(ctx(), {
      options: { max_seconds: 60 },
    } as RouteAndRunRequestDto);

    const lowStability: ExecutionPolicyVersion = {
      versionId: 'v1',
      policyIR: {
        version: 'ir/v1',
        compiledAt: 1,
        rules: [],
        thresholds: {
          replayConfidenceHigh: 0.82,
          replayConfidenceLow: 0.35,
          anomalyTolerance: 1,
        },
        toolDepthMapping: {},
        mediumReuseShortcutEnabled: false,
      },
      compiledAt: 1,
      metrics: {
        successRate: 1,
        avgLatency: 100,
        replayStability: 0.5,
        anomalyRate: 0,
      },
      active: true,
    };

    const highStability: ExecutionPolicyVersion = {
      ...lowStability,
      versionId: 'v2',
      metrics: {
        successRate: 1,
        avgLatency: 100,
        replayStability: 0.95,
        anomalyRate: 0,
      },
    };

    const best = selectPolicyVersion([lowStability, highStability], sel);
    expect(best?.versionId).toBe('v2');
    expect(scorePolicyVersion(highStability, sel)).toBeGreaterThan(scorePolicyVersion(lowStability, sel));
  });
});
