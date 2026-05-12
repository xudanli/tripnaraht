import { buildPhysicsFieldIndex } from '../physics/build-physics-field-index';
import type { UnifiedPhysicsField } from '../physics/unified-physics-field.types';
import { normalizeUnifiedPhysicsField } from '../physics/physics-field-normalization';
import { buildExecutionProof } from '../execution-trace-compressor/build-execution-proof';
import type { SemanticReplica } from './semantic-replica.types';
import { consensusScore, runSemanticConsensus } from './semantic-consensus-engine';

function minimalField(legId: string, mobility: number, _semDist: number): UnifiedPhysicsField {
  return normalizeUnifiedPhysicsField({
    legId,
    date: '2026-01-01',
    stateVector: {
      mobility,
      exposure: 0.2,
      energy: 0.8,
      temporalPressure: 0.1,
    },
    constraints: { blocked: false, severity: 'LOW' },
    derived: 'STABLE',
  });
}

function proofForDistance(
  attachSemantic: boolean,
  physicsRows: UnifiedPhysicsField[],
): import('../execution-trace-compressor/execution-proof.types').ExecutionProof {
  const idx = buildPhysicsFieldIndex(physicsRows);
  return buildExecutionProof({
    attachSemanticLayer: attachSemantic,
    physicsFieldIndex: idx,
    executionOverlayFrames: [],
    triggers: [],
    changedSlotIds: [],
  });
}

describe('semantic-consensus-engine (P-Next 7)', () => {
  it('single replica is trivially stable', () => {
    const p = proofForDistance(true, [minimalField('a', 0.6, 0)]);
    const r: SemanticReplica = {
      replicaId: 'r1',
      physicsField: buildPhysicsFieldIndex([minimalField('a', 0.6, 0)]),
      executionProof: p,
      timestamp: 1,
      confidence: 1,
    };
    const out = runSemanticConsensus([r]);
    expect(out.winningReplicaId).toBe('r1');
    expect(out.semanticVariance).toBe(0);
    expect(out.stableDecision).toBe(true);
    expect(out.consensusProof.stableDecision).toBe(true);
  });

  it('prefers lower semantic distance + uncertainty when scoring', () => {
    const hiUnc = normalizeUnifiedPhysicsField({
      ...minimalField('a', 0.4, 0),
      uncertainty: {
        weatherVariance: 0.9,
        routeVolatility: 0.9,
        fuelEstimateError: 0.9,
        temporalDrift: 0.9,
      },
    });
    const lowUnc = normalizeUnifiedPhysicsField({
      ...minimalField('a', 0.5, 0),
      uncertainty: {
        weatherVariance: 0,
        routeVolatility: 0,
        fuelEstimateError: 0,
        temporalDrift: 0,
      },
    });

    const pHi = proofForDistance(true, [hiUnc]);
    const pLo = proofForDistance(true, [lowUnc]);

    const worse: SemanticReplica = {
      replicaId: 'noisy',
      physicsField: buildPhysicsFieldIndex([hiUnc]),
      executionProof: pHi,
      timestamp: 1,
      confidence: 1,
    };
    const better: SemanticReplica = {
      replicaId: 'clean',
      physicsField: buildPhysicsFieldIndex([lowUnc]),
      executionProof: pLo,
      timestamp: 2,
      confidence: 1,
    };

    expect(consensusScore(better)).toBeLessThanOrEqual(consensusScore(worse));

    const out = runSemanticConsensus([worse, better]);
    expect(out.winningReplicaId).toBe('clean');
  });
});
