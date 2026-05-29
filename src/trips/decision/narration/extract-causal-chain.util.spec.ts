import { extractCausalChain } from './extract-causal-chain.util';
import type { DecisionLogEntry } from '../shared/decision-result.types';

describe('extractCausalChain', () => {
  it('builds chain from neptune repair and monte carlo verdict', () => {
    const logs: DecisionLogEntry[] = [
      {
        persona: 'NEPTUNE',
        action: 'REPLACE',
        explanation: '规避 F208 非铺装颠簸路段',
        reasonCodes: ['F_ROAD_CLOSED'],
        timestamp: '2026-05-29T10:00:00Z',
        decisionSource: 'PHYSICAL',
        decisionStage: 'SPATIAL_REPAIR',
      },
    ];
    const chain = extractCausalChain({
      decisionLogs: logs,
      optimizationHints: {
        decisionVerdict: {
          chosen_plan_id: 'plan_a',
          rejected_plans: [],
          monte_carlo_summary: { used: true, total_samples: 500 },
        },
      },
      partyNoteZh: '带父母同行。',
    });
    expect(chain?.monteCarloSampleCount).toBe(500);
    expect(chain?.nodes.some((n) => n.kind === 'PERSONA_REPAIR')).toBe(true);
  });
});
