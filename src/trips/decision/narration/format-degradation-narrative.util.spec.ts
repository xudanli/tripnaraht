import { buildDegradationSummaryLine } from './format-degradation-narrative.util';

describe('format-degradation-narrative', () => {
  it('builds honest degradation line for HEURISTIC method', () => {
    const line = buildDegradationSummaryLine({
      method: 'HEURISTIC',
      decisionVerdict: {
        chosen_plan_id: 'x',
        rejected_plans: [],
        fallback_chain: [{ step: 'cgus_gate', reason: 'cgus_gate_false' }],
      },
      optimizationFlags: { freezeRouteSelection: true },
    });
    expect(line).toMatch(/系统降级说明/);
    expect(line).toMatch(/Topology Lock|锁定/);
  });
});
