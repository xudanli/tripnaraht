import {
  detectDecisionNodesFromText,
  pickPrimaryDecisionNode,
} from './decision-node-detection.util';

describe('decision-node-detection.util', () => {
  it('detects accommodation from message', () => {
    expect(detectDecisionNodesFromText('我们住宿选市中心公寓还是黑沙滩木屋？')).toContain(
      'accommodation',
    );
  });

  it('picks primary node by priority', () => {
    const nodes = detectDecisionNodesFromText('预算和住宿怎么定');
    expect(pickPrimaryDecisionNode(nodes)).toBe('accommodation');
  });
});
