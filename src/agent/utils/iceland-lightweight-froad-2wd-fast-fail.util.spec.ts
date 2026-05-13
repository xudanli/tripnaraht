import { evaluateIcelandLightweightFroad2wdFastFail } from './iceland-lightweight-froad-2wd-fast-fail.util';
import { evaluateIcelandLightweightRedAlertFastFail } from './iceland-lightweight-red-alert-fast-fail.util';
import { buildSafetySurfacePayload } from './safety-surface-payload.util';

describe('evaluateIcelandLightweightFroad2wdFastFail', () => {
  it('returns hit:false when not in Iceland rental lightweight lane', () => {
    const r = evaluateIcelandLightweightFroad2wdFastFail({
      message: '冰岛几月份去比较好',
      tripContextJoined: '',
    });
    expect(r.hit).toBe(false);
    expect(r.rawIssues).toHaveLength(0);
  });

  it('returns hit:true with strat refs for Iceland rental + F-road + 2WD intent', () => {
    const r = evaluateIcelandLightweightFroad2wdFastFail({
      message: '冰岛租车 丰田雅力士 开 F208 可以吗',
      tripContextJoined: '',
    });
    expect(r.hit).toBe(true);
    expect(r.refIds.some((x) => x === 'strat:STRAT_ICE_002')).toBe(true);
    expect(r.promptLines.some((l) => l.includes('极速安全闸'))).toBe(true);
  });

  it('winter wording forces December anchor → STRAT_ICE_001 in strat refs', () => {
    const r = evaluateIcelandLightweightFroad2wdFastFail({
      message: '冰岛租车 冬季 两驱 小轿车 想走 F208',
      tripContextJoined: '开始日期: 2026-07-01',
    });
    expect(r.hit).toBe(true);
    expect(r.refIds.some((x) => x === 'strat:STRAT_ICE_001')).toBe(true);
  });

  it('steps with iceland.lightweight_fast_fail populate safety_surface.verify_issues', () => {
    const r = evaluateIcelandLightweightFroad2wdFastFail({
      message: '冰岛自驾租车 economy 车能开 F225 吗',
      tripContextJoined: '',
    });
    expect(r.hit).toBe(true);
    const surface = buildSafetySurfacePayload({
      stepsExecuted: [
        {
          skillName: 'iceland.lightweight_fast_fail',
          success: true,
          result: { issues: r.rawIssues },
        },
      ],
    });
    expect(surface.verify_issues.length).toBeGreaterThan(0);
    expect(surface.verify_issues[0].message).toMatch(/极速安全闸·依法裁决/);
  });

  it('merges red-alert and f-road fast-fail verify_issues with distinct prefixes', () => {
    const red = evaluateIcelandLightweightRedAlertFastFail({
      message: '维克',
      tripContextJoined: '',
      safetravel_alerts: [
        {
          id: 'c',
          title: 'T',
          summary: 'Closed',
          affected_route_segment_refs: ['ring-road:selfoss-vik'],
          severity: 'critical',
        },
      ],
      gate_recommendation: 'BLOCK',
      anchoredIcelandTrip: false,
    });
    expect(red.hit).toBe(true);
    const froad = evaluateIcelandLightweightFroad2wdFastFail({
      message: '冰岛租车 雅力士 F208',
      tripContextJoined: '',
    });
    expect(froad.hit).toBe(true);
    const surface = buildSafetySurfacePayload({
      stepsExecuted: [
        {
          skillName: 'iceland.lightweight_red_alert_fast_fail',
          success: true,
          result: { issues: red.rawIssues },
        },
        {
          skillName: 'iceland.lightweight_fast_fail',
          success: true,
          result: { issues: froad.rawIssues },
        },
      ],
    });
    expect(surface.verify_issues).toHaveLength(2);
    expect(surface.verify_issues[0].message).toMatch(/生命红线/);
    expect(surface.verify_issues[1].message).toMatch(/依法裁决/);
  });
});
