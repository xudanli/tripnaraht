import {
  computeEcoDriftScore,
  computeSemanticConvergence,
  DEFAULT_ECO_CLOSURE_THRESHOLDS,
  shouldRerunNeptune,
} from './closure-controller';
import type { EcoOrchestrationDigest } from './execution-cognitive-orchestrator.types';
import type { ExecutionProof } from '../execution-trace-compressor/execution-proof.types';
import type { NeptuneRepairResult } from '../decision/strategies/neptune';

function minimalNeptune(ok: boolean): NeptuneRepairResult {
  return {
    plan: { version: '1', createdAt: '', days: [] },
    triggers: [],
    changedSlotIds: [],
    explanation: '',
    irVm: { pathCost: ok ? 1 : 99, ok },
    bytecode: { version: '1', dagId: 't', instructions: [] },
    executionTrace: [],
  } as NeptuneRepairResult;
}

describe('closure-controller', () => {
  it('shouldRerunNeptune matches §threshold semantics', () => {
    expect(
      shouldRerunNeptune(
        { ecoDriftScore: 0.36, stabilityScore: 0.9, semanticConvergence: 0.9 },
        DEFAULT_ECO_CLOSURE_THRESHOLDS,
      ),
    ).toBe(true);

    expect(
      shouldRerunNeptune(
        { ecoDriftScore: 0.2, stabilityScore: 0.69, semanticConvergence: 0.9 },
        DEFAULT_ECO_CLOSURE_THRESHOLDS,
      ),
    ).toBe(true);

    expect(
      shouldRerunNeptune(
        { ecoDriftScore: 0.2, stabilityScore: 0.85, semanticConvergence: 0.59 },
        DEFAULT_ECO_CLOSURE_THRESHOLDS,
      ),
    ).toBe(true);

    expect(
      shouldRerunNeptune(
        { ecoDriftScore: 0.2, stabilityScore: 0.85, semanticConvergence: 0.75 },
        DEFAULT_ECO_CLOSURE_THRESHOLDS,
      ),
    ).toBe(false);
  });

  it('computeEcoDriftScore blends P10 drift + regret spread', () => {
    const digest: EcoOrchestrationDigest = {
      ran: true,
      mode: 'full',
      p10DriftScore: 0.4,
    };
    const proof = {
      driftScore: 0.4,
      regretDistribution: [0, 0.5, 0.2],
      semanticVariance: 0.02,
    } as ExecutionProof;
    const d = computeEcoDriftScore(proof, digest);
    expect(d).toBeGreaterThan(0);
    expect(d).toBeLessThanOrEqual(1);
  });

  it('computeSemanticConvergence penalizes IR failure', () => {
    const proof = {
      replicaAgreementScore: 1,
    } as ExecutionProof;
    const ok = computeSemanticConvergence(proof, minimalNeptune(true));
    const bad = computeSemanticConvergence(proof, minimalNeptune(false));
    expect(ok).toBeGreaterThan(bad);
  });
});
