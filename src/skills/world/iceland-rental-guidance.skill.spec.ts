import { IcelandRentalGuidanceSkill } from './iceland-rental-guidance.skill';

describe('IcelandRentalGuidanceSkill', () => {
  let skill: IcelandRentalGuidanceSkill;

  beforeEach(() => {
    skill = new IcelandRentalGuidanceSkill();
  });

  it('returns risk sources, portals, local brands and pipeline', async () => {
    const out = await skill.execute({});
    expect(out.risk_control.road_is.url).toContain('road.is');
    expect(out.risk_control.vedur.url).toContain('vedur');
    expect(out.aggregation_portals.some((p) => p.id === 'northbound')).toBe(true);
    expect(out.trusted_local_providers.length).toBeGreaterThanOrEqual(4);
    expect(out.suggested_pipeline.some((s) => s.includes('safetravel'))).toBe(true);
    expect(out.booking_mcp_complement_zh).toContain('car_rental');
  });

  it('ranks peace_of_mind toward Zero', async () => {
    const out = await skill.execute({ intent_profile: 'peace_of_mind' });
    expect(out.intent_profile).toBe('peace_of_mind');
    expect(out.trusted_local_providers[0].id).toBe('zero');
  });

  it('ranks trusted_default toward Blue', async () => {
    const out = await skill.execute({ intent_profile: 'trusted_default' });
    expect(out.trusted_local_providers[0].id).toBe('blue');
  });

  it('invalid intent_profile falls back to refine from user_query or default', async () => {
    const out = await skill.execute({ intent_profile: 'nope' as any });
    expect(out.intent_profile).toBe('default');
    const out2 = await skill.execute({ intent_profile: 'nope' as any, user_query: '冰岛租车越便宜越好' });
    expect(out2.intent_profile).toBe('budget_sensitive');
  });

  it('infers f_road_focus from user_query when intent_profile omitted', async () => {
    const out = await skill.execute({ user_query: '打算开 F208 高地' });
    expect(out.intent_profile).toBe('f_road_focus');
  });
});
