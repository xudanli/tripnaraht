import { NegotiationNarratorService } from './negotiation-narrator.service';
import { NEGOTIATION_REASONING_TAG } from '../constants/negotiation-reasoning.constants';

describe('NegotiationNarratorService', () => {
  it('summarizes why top1 is preferred and cites key tags on top2', () => {
    const s = new NegotiationNarratorService();
    const out = s.summarize({
      alternatives: [
        { id: 'UPGRADE_TO_DRIVE', effort_delta: 0.1 },
        {
          id: 'POSTPONE_SCHEDULE',
          time_delta_minutes: 30,
          effort_delta: 0.9,
          reasoning_tags: [
            NEGOTIATION_REASONING_TAG.REAL_TIME_RISK_WARNING,
            NEGOTIATION_REASONING_TAG.ROLLBACK_MEMORY,
            NEGOTIATION_REASONING_TAG.TAILORED_TO_YOUR_PREFERENCE,
          ],
        },
      ],
      strategy_impact_map: { heat_zones: [{ segment_id: 'hb1', bottleneck_node: true }] },
    });
    expect(String(out)).toContain('我们更推荐[打车升级]');
    expect(String(out)).toContain('[推迟 30 分钟]');
    expect(String(out)).toMatch(/准点风险|容错/);
    expect(String(out)).toMatch(/回滚/);
    expect(String(out)).toMatch(/偏好/);
    expect(String(out)).toMatch(/物理瓶颈|瓶颈/);
  });
});

