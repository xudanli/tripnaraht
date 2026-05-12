import { Test } from '@nestjs/testing';
import { IcelandRoadSurfaceAlertsSkill } from './iceland-road-surface-alerts.skill';

describe('IcelandRoadSurfaceAlertsSkill', () => {
  it('returns triggered output for gravel surface', async () => {
    const m = await Test.createTestingModule({ providers: [IcelandRoadSurfaceAlertsSkill] }).compile();
    const skill = m.get(IcelandRoadSurfaceAlertsSkill);
    const out = await skill.execute({
      request_id: 'r1',
      segments: [{ from_region: 'vik', to_region: 'hofn', surface: 'gravel' }],
    });
    expect(out.triggered).toBe(true);
    expect(out.recommendedAdjustments).toContain('REVIEW_GRAVEL_PROTECTION_INSURANCE');
    expect(out.affectedSegments).toEqual(['vik-hofn']);
  });
});
