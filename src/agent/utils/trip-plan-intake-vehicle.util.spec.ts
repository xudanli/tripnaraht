import {
  buildUserAuthoredIntakeTextBundle,
  extractVehicleTypeFromCurrentUserMessage,
  extractVehicleTypeFromIntakeInputs,
  filterUserAuthoredIntakeLines,
  parseVehicleTypeFromUserIntakeText,
  reconcileTripPlanVehicleConstraints,
  stripSystemMessageBlocksForIntakeNl,
} from './trip-plan-intake-vehicle.util';

describe('trip-plan-intake-vehicle.util', () => {
  it('filterUserAuthoredIntakeLines drops assistant and system lines', () => {
    expect(
      filterUserAuthoredIntakeLines([
        '用户: 6月5日想极昼自驾环岛',
        '助手: 三方一致否决「2WD+24小时连续环岛」原案',
        '[SYSTEM_MESSAGE][PHYSICAL_CAPABILITY]\nlow band',
        '继续规划',
      ]),
    ).toEqual(['6月5日想极昼自驾环岛', '继续规划']);
  });

  it('does not infer 2WD from user marathon message alone', () => {
    const msg = '6月5日想利用极昼，24小时不间断自驾环岛';
    expect(parseVehicleTypeFromUserIntakeText(msg)).toBeUndefined();
    expect(extractVehicleTypeFromIntakeInputs(msg, [])).toBeUndefined();
  });

  it('does not infer 2WD when only assistant history mentions 2WD', () => {
    expect(
      extractVehicleTypeFromIntakeInputs('继续', [
        '助手: 三方一致否决「2WD+24小时连续环岛」原案，请确认',
      ]),
    ).toBeUndefined();
  });

  it('infers 4WD/2WD only from user-authored text', () => {
    expect(extractVehicleTypeFromIntakeInputs('租四驱环岛', [])).toBe('4WD');
    expect(extractVehicleTypeFromIntakeInputs('', ['用户: 经济型两驱小车'])).toBe('2WD');
  });

  it('extractVehicleTypeFromCurrentUserMessage ignores SYSTEM_MESSAGE and marathon NL', () => {
    const msg =
      '[SYSTEM_MESSAGE][PHYSICAL_CAPABILITY]\nlow band\n\n6月5日想利用极昼，24小时不间断自驾环岛';
    expect(extractVehicleTypeFromCurrentUserMessage(msg)).toBeUndefined();
    expect(stripSystemMessageBlocksForIntakeNl(msg)).toContain('极昼');
  });

  it('reconcileTripPlanVehicleConstraints drops stale 2WD when user did not specify', () => {
    const out = reconcileTripPlanVehicleConstraints(
      {
        request_id: 'r1',
        origin: 'x',
        destination: '冰岛',
        constraints: { vehicle_type: '2WD' },
        message: '6月5日想利用极昼，24小时不间断自驾环岛',
      } as any,
      '6月5日想利用极昼，24小时不间断自驾环岛',
    );
    expect(out.constraints?.vehicle_type).toBeUndefined();
    expect(out.constraints).toBeUndefined();
  });

  it('buildUserAuthoredIntakeTextBundle excludes assistant 2WD narrative', () => {
    const bundle = buildUserAuthoredIntakeTextBundle('规划', [
      '助手: 2WD+24小时不可行',
      '用户: 改成4wd',
    ]);
    expect(bundle).not.toMatch(/助手/);
    expect(bundle).toContain('改成4wd');
    expect(bundle).not.toContain('2WD+24');
  });
});
