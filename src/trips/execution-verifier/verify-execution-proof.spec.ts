import { buildExecutionProof } from '../execution-trace-compressor/build-execution-proof';
import { verifyExecutionProof } from './verify-execution-proof';
import type { ExecutionProof } from '../execution-trace-compressor/execution-proof.types';
import { ExecutionIRSources } from '../execution-ir/execution-ir.types';

describe('P-Next 5 verifyExecutionProof', () => {
  it('accepts a fresh proof from buildExecutionProof', () => {
    const proof = buildExecutionProof({
      physicsFieldIndex: {
        byLegId: {
          a: {
            legId: 'a',
            date: '2026-01-01',
            stateVector: {
              mobility: 0.5,
              exposure: 0.2,
              energy: 0.8,
              temporalPressure: 0.1,
            },
            constraints: { blocked: false, severity: 'LOW' },
            derived: 'STABLE',
          },
        },
        byDate: { '2026-01-01': [] },
        byState: { STABLE: ['a'], DEGRADED: [], UNSTABLE: [], IMPASSABLE: [] },
      },
      executionOverlayFrames: [],
      executionTruthDAG: { nodes: [{ id: 'n1' } as never], edges: [] },
      executionIR: {
        version: '1',
        steps: [],
        meta: {
          dagId: 'd',
          source: ExecutionIRSources.DAG_COMPILER,
          compiledAt: 1,
          deterministic: true,
        },
      },
      irVmRun: { pathCost: 0, ok: true },
      executionTrace: [],
      triggers: [{ code: 'X' }],
      changedSlotIds: ['s1'],
    });
    const r = verifyExecutionProof(proof);
    expect(r.valid).toBe(true);
    expect(r.hashRootMatch).toBe(true);
    expect(r.hashDecisionMatch).toBe(true);
  });

  it('rejects tampered rootStateHash', () => {
    const proof = buildExecutionProof({
      triggers: [],
      changedSlotIds: [],
    });
    const bad: ExecutionProof = { ...proof, rootStateHash: '0'.repeat(64) };
    const r = verifyExecutionProof(bad);
    expect(r.valid).toBe(false);
    expect(r.failedInvariant).toBe('PROOF_HASH_MISMATCH');
  });

  it('P-Next 6 semantic layer round-trips when attachSemanticLayer + physics', () => {
    const proof = buildExecutionProof({
      attachSemanticLayer: true,
      physicsFieldIndex: {
        byLegId: {
          a: {
            legId: 'a',
            date: '2026-01-01',
            stateVector: {
              mobility: 0.5,
              exposure: 0.2,
              energy: 0.8,
              temporalPressure: 0.1,
            },
            constraints: { blocked: false, severity: 'LOW' },
            derived: 'STABLE',
          },
        },
        byDate: { '2026-01-01': [] },
        byState: { STABLE: ['a'], DEGRADED: [], UNSTABLE: [], IMPASSABLE: [] },
      },
      executionOverlayFrames: [],
      executionTruthDAG: { nodes: [{ id: 'n1' } as never], edges: [] },
      executionIR: {
        version: '1',
        steps: [],
        meta: {
          dagId: 'd',
          source: ExecutionIRSources.DAG_COMPILER,
          compiledAt: 1,
          deterministic: true,
        },
      },
      irVmRun: { pathCost: 0, ok: true },
      executionTrace: [],
      triggers: [],
      changedSlotIds: [],
    });
    expect(proof.semanticsVersion).toBeDefined();
    const r = verifyExecutionProof(proof);
    expect(r.valid).toBe(true);
  });
});
