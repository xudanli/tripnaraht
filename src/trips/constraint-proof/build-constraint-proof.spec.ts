import type {
  ExecutionNode,
  ExecutionTruthDAG,
} from '../execution-truth-dag/execution-truth-dag.types';
import {
  buildConstraintProof,
  evaluateNodeConstraint,
} from './build-constraint-proof';
import {
  assertFeasibleBeforeSimulation,
  ConstraintProofInfeasibleError,
} from './constraint-gate';

function baseNode(id: string, overrides: Partial<ExecutionNode> = {}): ExecutionNode {
  return {
    id,
    date: '2026-06-01',
    slotId: 's',
    type: 'LEG',
    execution: {
      finalState: 'OK',
      delayMinutes: 0,
      reliabilityScore: 0.9,
    },
    temporal: {
      daylightViolation: false,
      crossDayRisk: 0,
      arrivalRisk: 0,
    },
    weather: { exposureScore: 0.2 },
    road: { accessibility: 1 },
    ...overrides,
  };
}

describe('buildConstraintProof (P12)', () => {
  it('marks FEASIBLE for OK execution DAG', () => {
    const dag: ExecutionTruthDAG = {
      nodes: [baseNode('exec:a')],
      edges: [],
    };
    const proof = buildConstraintProof(dag);
    expect(proof.globalStatus).toBe('FEASIBLE');
    assertFeasibleBeforeSimulation(proof);
  });

  it('is INFEASIBLE when a node is BLOCKED', () => {
    const dag: ExecutionTruthDAG = {
      nodes: [
        baseNode('exec:a', {
          execution: {
            finalState: 'BLOCKED',
            delayMinutes: 0,
            reliabilityScore: 0,
          },
        }),
      ],
      edges: [],
    };
    const proof = buildConstraintProof(dag);
    expect(proof.globalStatus).toBe('INFEASIBLE');
    expect(() => assertFeasibleBeforeSimulation(proof)).toThrow(ConstraintProofInfeasibleError);
    expect(() => assertFeasibleBeforeSimulation(proof)).toThrow(
      '[CONSTRAINT-PROOF] Execution plan infeasible',
    );
  });

  it('is INFEASIBLE when daylight unsafe', () => {
    const dag: ExecutionTruthDAG = {
      nodes: [
        baseNode('exec:a', {
          temporal: {
            daylightViolation: true,
            crossDayRisk: 0,
            arrivalRisk: 0.5,
          },
        }),
      ],
      edges: [],
    };
    expect(buildConstraintProof(dag).globalStatus).toBe('INFEASIBLE');
  });

  it('is INFEASIBLE when road is closed', () => {
    const dag: ExecutionTruthDAG = {
      nodes: [baseNode('exec:a', { road: { accessibility: 0 } })],
      edges: [],
    };
    expect(buildConstraintProof(dag).globalStatus).toBe('INFEASIBLE');
  });

  it('detects structural cycle as INFEASIBLE', () => {
    const dag: ExecutionTruthDAG = {
      nodes: [baseNode('a'), baseNode('b'), baseNode('c')],
      edges: [
        {
          id: 'e1',
          from: 'a',
          to: 'b',
          type: 'TEMPORAL_SEQUENCE',
          weight: 1,
        },
        {
          id: 'e2',
          from: 'b',
          to: 'c',
          type: 'TEMPORAL_SEQUENCE',
          weight: 1,
        },
        {
          id: 'e3',
          from: 'c',
          to: 'a',
          type: 'TEMPORAL_SEQUENCE',
          weight: 1,
        },
      ],
    };
    const proof = buildConstraintProof(dag);
    expect(proof.globalStatus).toBe('INFEASIBLE');
    const acyc = proof.nodes.find(n => n.id === '__p12:structural:acyclicity');
    expect(acyc?.status).toBe('UNSAT');
  });

  it('evaluateNodeConstraint classifies high-risk as SOFT SAT', () => {
    const n = baseNode('x', {
      execution: {
        finalState: 'HARD',
        delayMinutes: 0,
        reliabilityScore: 0.5,
      },
    });
    const ev = evaluateNodeConstraint(n);
    expect(ev.type).toBe('SOFT');
    expect(ev.status).toBe('SAT');
  });
});
