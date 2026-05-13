import type { LedgerNode } from './decision-ledger.types';
import { isTopicChangeImpactingNode } from './ledger-topic-sensitivity.config';

describe('LedgerTopicSensitivity matrix', () => {
  const mockTransportNode = { actionType: 'TRANSPORT' } as LedgerNode;
  const mockVisaNode = { actionType: 'LOGISTICS' } as LedgerNode;

  it('应该识别出价格变动对交通节点的冲击', () => {
    const changedTopics = ['telemetry:total_cost_hint'];
    expect(isTopicChangeImpactingNode(mockTransportNode, changedTopics)).toBe(true);
  });

  it('应该拦截无关漂移：成本 hint 不应影响签证(LOGISTICS)节点', () => {
    const changedTopics = ['telemetry:total_cost_hint'];
    expect(isTopicChangeImpactingNode(mockVisaNode, changedTopics)).toBe(false);
  });

  it('应该识别出全局性约束（如签证政策）对敏感节点的冲击', () => {
    const changedTopics = ['world:visa_policy'];
    expect(isTopicChangeImpactingNode(mockVisaNode, changedTopics)).toBe(true);
  });

  it('当多个 Topic 同时变化时，只要有一个命中敏感列表即返回 true', () => {
    const changedTopics = ['unknown:random_topic', 'telemetry:total_cost_hint'];
    expect(isTopicChangeImpactingNode(mockTransportNode, changedTopics)).toBe(true);
  });
});
