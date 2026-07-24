import type { CausalStoryView } from '../../../causal-protocol/causal-story-view.types';
import {
  mapEnforcementToExecutionCausal,
  projectExecutionCausalInsight,
} from './execution-causal-insight.util';

const neutralStory: CausalStoryView = {
  traceId: 'ct_test',
  worldStateVersion: 'ws_1',
  headline: '蓝湖温泉 → 哈尔格林姆斯教堂：通行缓冲偏紧',
  assessment: '侧风可能使 P90 超出计划缓冲，预约错过风险升高。',
  chain: [
    {
      nodeId: 'world_wind',
      type: 'WORLD_CHANGE',
      title: '天气影响',
      description: '路段阵风约 18 m/s',
    },
    {
      nodeId: 'eff_p90',
      type: 'IMPACT',
      title: '通行耗时',
      description: 'P90 预计增加 17 分钟',
    },
  ],
  technicalTraceRef: 'ct_test',
};

const guardianStory: CausalStoryView = {
  ...neutralStory,
  headline: '安全提示：蓝湖温泉 → 哈尔格林姆斯教堂 强风下不建议按原计划出发',
  assessment: '以安全为先：建议提前出发或改约。',
};

describe('execution-causal-insight.util', () => {
  it('maps BLOCK to NOT_EXECUTABLE', () => {
    expect(mapEnforcementToExecutionCausal('BLOCK')).toBe('NOT_EXECUTABLE');
  });

  it('maps REQUIRE_ADJUSTMENT to ADJUST_REQUIRED', () => {
    expect(mapEnforcementToExecutionCausal('REQUIRE_ADJUSTMENT')).toBe('ADJUST_REQUIRED');
  });

  it('projects guardian headline with neutral causal chain', () => {
    const insight = projectExecutionCausalInsight({
      guardianStory,
      neutralStory,
      primaryEnforcement: 'REQUIRE_ADJUSTMENT',
      linkedProblemId: 'dp_travel_1',
    });

    expect(insight.guardianHeadline).toContain('安全提示');
    expect(insight.primaryEnforcement).toBe('ADJUST_REQUIRED');
    expect(insight.causalStory.chain).toHaveLength(2);
    expect(insight.causalStory.chain[0].title).toBe('天气影响');
    expect(insight.causalStory.assessment).toContain('侧风');
    expect(insight.linkedProblemId).toBe('dp_travel_1');
  });
});
