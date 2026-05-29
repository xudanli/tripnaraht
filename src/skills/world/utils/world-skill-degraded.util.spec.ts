import { markWorldSkillDegraded } from './world-skill-degraded.util';

describe('markWorldSkillDegraded', () => {
  it('marks payload as degraded with reason', () => {
    const out = markWorldSkillDegraded({ alerts: [] }, 'service down');
    expect(out.degraded).toBe(true);
    expect(out.degradedReason).toBe('service down');
    expect(out.alerts).toEqual([]);
  });
});
