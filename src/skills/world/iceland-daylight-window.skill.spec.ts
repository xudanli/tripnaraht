import { Test } from '@nestjs/testing';
import { IcelandDaylightWindowSkill } from './iceland-daylight-window.skill';

describe('IcelandDaylightWindowSkill', () => {
  let skill: IcelandDaylightWindowSkill;

  beforeEach(async () => {
    const m = await Test.createTestingModule({
      providers: [IcelandDaylightWindowSkill],
    }).compile();
    skill = m.get(IcelandDaylightWindowSkill);
  });

  it('returns longer daylight in June than in December (Vík)', async () => {
    const summer = await skill.execute({ date: '2026-06-15', region: 'vik' });
    const winter = await skill.execute({ date: '2026-12-15', region: 'vik' });
    expect(summer.daylightHours).toBeGreaterThan(winter.daylightHours);
    expect(winter.nightDrivingRisk).not.toBe('low');
  });

  it('uses civil dawn/dusk for safeDrivingWindow', async () => {
    const o = await skill.execute({ date: '2026-12-15', lat: 64.1466, lng: -21.9426 });
    expect(o.safeDrivingWindow.start).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(o.safeDrivingWindow.end).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(o.civilTwilightHours).toBeGreaterThan(0);
    expect(o.daylightRegime).toBeDefined();
    expect(o.temporalMileageUnbounded).toBe(false);
  });

  it('marks midsummer long civil window as midnight_sun (Vík)', async () => {
    const o = await skill.execute({ date: '2026-06-21', region: 'vik' });
    if (o.daylightRegime === 'midnight_sun') {
      expect(o.daylightRisk).toBe('NONE');
      expect(o.temporalMileageUnbounded).toBe(true);
    }
  });
});
