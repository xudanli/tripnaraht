import { buildDecisionMemory, type DecisionMemory } from '../memory/decision-memory/decision-memory.types';
import {
  applyDecisionRingToExecutionOperationalOverlay,
  compressOperationalNegativesFromDecisions,
} from './negative-constraint-compressor.util';

describe('negative-constraint-compressor.util', () => {
  it('compressOperationalNegativesFromDecisions filters to rejected/failed only', () => {
    const decisions: DecisionMemory[] = [
      buildDecisionMemory({
        decisionType: 'vehicle',
        inputs: {},
        outputs: {},
        outcome: 'accepted',
        rationale: ['ok'],
        causedBy: [],
      }),
      buildDecisionMemory({
        decisionType: 'vehicle',
        inputs: { x: 1 },
        outputs: {},
        outcome: 'rejected',
        rationale: ['F-road vs 2WD'],
        causedBy: ['world_state.rental'],
      }),
    ];
    const v1 = compressOperationalNegativesFromDecisions(decisions);
    expect(v1.lines).toHaveLength(1);
    expect(v1.lines[0].outcome).toBe('rejected');
    expect(v1.markdownBlock).toContain('Operational Constraints');
    expect(v1.markdownBlock).toContain('F-road vs 2WD');
  });

  it('applyDecisionRingToExecutionOperationalOverlay mutates exec when requestId matches', () => {
    const ring = {
      listForRequest: () => [
        buildDecisionMemory({
          decisionType: 'risk_block',
          inputs: {},
          outputs: {},
          outcome: 'failed',
          rationale: ['wind'],
          causedBy: ['world_state.safetravel'],
        }),
      ],
    };
    const exec = { requestId: 'r1' };
    applyDecisionRingToExecutionOperationalOverlay(exec, 'r1', ring);
    expect(exec.operationalNegativeConstraintsMarkdown).toContain('wind');
    expect(exec.operationalNegativeConstraints?.lines.length).toBe(1);
  });
});
