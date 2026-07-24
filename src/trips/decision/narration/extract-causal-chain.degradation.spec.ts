import { extractCausalChain } from './extract-causal-chain.util';

describe('extractCausalChain — SYSTEM_DEGRADATION', () => {
  it('surfaces HEURISTIC fallback as causal degradation node', () => {
    const chain = extractCausalChain({
      optimizationHints: {
        method: 'HEURISTIC',
        decisionVerdict: {
          chosen_plan_id: 'heuristic-current',
          rejected_plans: [],
          fallback_chain: [{ step: 'cgus_gate', reason: 'cgus_gate_false' }],
        },
        optimizationFlags: { freezeRouteSelection: true },
      },
    });
    expect(chain?.nodes.some((n) => n.kind === 'SYSTEM_DEGRADATION')).toBe(true);
    expect(chain?.protectionHeadlineZh).toMatch(/降级|Topology Lock|专家经验/);
  });
});
