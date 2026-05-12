import type { PolicyAgent } from '../contracts/policy-agent.types';
import type { ExecutionPolicyIR } from '../contracts/execution-policy-ir.types';
import { scorePolicyAgent, selectPolicyAgent } from './policy-agent-selection.util';
import type { PolicyAgentSelectionContext } from './policy-agent-selection.util';

function irStub(): ExecutionPolicyIR {
  return {
    version: 'v',
    compiledAt: 1,
    rules: [],
    thresholds: {
      replayConfidenceHigh: 0.82,
      replayConfidenceLow: 0.35,
      anomalyTolerance: 1,
    },
    toolDepthMapping: {},
    mediumReuseShortcutEnabled: false,
  };
}

describe('policy-agent-selection', () => {
  it('boosts REPLAY_SAFE agent under HIGH band', () => {
    const ctx: PolicyAgentSelectionContext = {
      replayConfidenceScore: 0.95,
      replayBand: 'HIGH',
      anomalyCount: 0,
      latencyBudgetMs: 60_000,
    };

    const plain: PolicyAgent = {
      policyId: 'p1',
      ecps: irStub(),
      fitness: {
        successRate: 1,
        latency: 100,
        replayStability: 0.7,
        anomalyResistance: 0.9,
        domainCoverage: 0.5,
      },
      specialization: { primary: 'GENERAL', tags: ['GENERAL'] },
      active: true,
    };

    const safe: PolicyAgent = {
      ...plain,
      policyId: 'p2',
      specialization: { primary: 'REPLAY_SAFE', tags: ['REPLAY_SAFE', 'HIGH_RELIABILITY'] },
    };

    expect(scorePolicyAgent(safe, ctx)).toBeGreaterThan(scorePolicyAgent(plain, ctx));
    expect(selectPolicyAgent([plain, safe], ctx)?.policyId).toBe('p2');
  });
});
