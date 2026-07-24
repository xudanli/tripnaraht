import {
  buildAttentionPrimaryUserNarrative,
  isInternalAttentionCopy,
  sanitizeAttentionCopy,
} from './attention-primary-user-narrative.util';

describe('attention-primary-user-narrative.util', () => {
  it('detects internal attention copy', () => {
    expect(isInternalAttentionCopy('执行偏差：1 个行程项受影响')).toBe(true);
    expect(isInternalAttentionCopy('RFC-001 FEASIBILITY_FAILURE · urgency HIGH')).toBe(true);
    expect(isInternalAttentionCopy('强风导致今天的原计划无法按时完成')).toBe(false);
  });

  it('strips RFC-001 and urgency from explanation', () => {
    expect(sanitizeAttentionCopy('RFC-001 FEASIBILITY_FAILURE · urgency HIGH')).toBe('');
    expect(sanitizeAttentionCopy('预计到达下一活动时间已超过最晚入场时间')).toBe(
      '预计到达下一活动时间已超过最晚入场时间',
    );
  });

  it('builds infeasible scenario narrative from templates when headline is internal', () => {
    const narrative = buildAttentionPrimaryUserNarrative(
      {
        headline: '执行偏差：1 个行程项受影响',
        explanation: 'RFC-001 FEASIBILITY_FAILURE · urgency HIGH',
        primarySemanticCapability: 'EXECUTION_SCHEDULE_INFEASIBLE',
      },
      { place: '蓝湖温泉' },
    );
    expect(narrative.whatHappened).toContain('蓝湖温泉');
    expect(narrative.whatHappened).not.toMatch(/执行偏差/);
    expect(narrative.impactOnTrip).not.toMatch(/RFC-001|urgency/i);
  });
});
