import { compileDAGToIR } from '../execution-ir/compile-dag-to-ir';
import type { ExecutionTruthDAG } from '../execution-truth-dag/execution-truth-dag.types';
import { consensusScalarScore, defaultExecutionAgents, runMultiAgentExecution } from './index';

function sampleDag(): ExecutionTruthDAG {
  return {
    nodes: [
      {
        id: 'exec:a',
        date: '2026-06-01',
        slotId: 's',
        type: 'LEG',
        execution: {
          finalState: 'OK',
          delayMinutes: 20,
          reliabilityScore: 0.88,
        },
        temporal: {
          daylightViolation: false,
          crossDayRisk: 0.1,
          arrivalRisk: 0.15,
        },
        weather: { exposureScore: 0.2 },
        road: { accessibility: 1 },
      },
    ],
    edges: [],
  };
}

describe('execution-agents (P15-A)', () => {
  it('runMultiAgentExecution returns consensus among defaults', () => {
    const dag = sampleDag();
    const ir = compileDAGToIR(dag);
    const agents = defaultExecutionAgents();
    const { candidates, consensus } = runMultiAgentExecution(dag, ir, agents);
    expect(candidates).toHaveLength(agents.length);
    expect(consensus.agentId).toBeDefined();
    expect(consensus.proposal.instructions.length).toBeGreaterThan(0);
    const maxScalar = Math.max(...candidates.map(consensusScalarScore));
    expect(consensusScalarScore(consensus)).toBe(maxScalar);
  });
});
