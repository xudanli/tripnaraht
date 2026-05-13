import { evaluateIcelandLightweightRedAlertFastFail } from './iceland-lightweight-red-alert-fast-fail.util';
import { buildSafetySurfacePayload } from './safety-surface-payload.util';

describe('evaluateIcelandLightweightRedAlertFastFail', () => {
  it('returns hit:false when no critical-tier route alerts', () => {
    const r = evaluateIcelandLightweightRedAlertFastFail({
      message: '南岸自驾',
      tripContextJoined: '',
      safetravel_alerts: [
        {
          id: 'w1',
          title: 'Wind',
          summary: 'Yellow weather alert for South Iceland.',
          affected_route_segment_refs: ['ring-road:selfoss-vik'],
          severity: 'medium',
        },
      ],
      gate_recommendation: 'NEED_USER_CONFIRM',
      anchoredIcelandTrip: true,
    });
    expect(r.hit).toBe(false);
  });

  it('hits when critical alert refs overlap South intent (Vík)', () => {
    const r = evaluateIcelandLightweightRedAlertFastFail({
      message: '明天从维克去冰河湖开车安全吗',
      tripContextJoined: '',
      safetravel_alerts: [
        {
          id: 'c1',
          title: 'Do not travel',
          summary: 'Road 1 difficult conditions South Iceland.',
          affected_route_segment_refs: ['ring-road:vik-jokulsarlon'],
          severity: 'critical',
        },
      ],
      gate_recommendation: 'BLOCK',
      anchoredIcelandTrip: false,
    });
    expect(r.hit).toBe(true);
    expect(r.stratIds).toContain('STRAT_ICE_000');
    expect(r.refIds.some((x) => x === 'strat:STRAT_ICE_000')).toBe(true);
  });

  it('hits anchored IS trip + BLOCK gate + critical alert with empty refs (national-scale)', () => {
    const r = evaluateIcelandLightweightRedAlertFastFail({
      message: '我们还在雷克雅未克',
      tripContextJoined: '目的地代码: IS\n开始日期: 2026-02-01',
      safetravel_alerts: [
        {
          id: 'nat',
          title: 'Civil protection',
          summary: 'Red alert: unsafe to travel across Iceland.',
          affected_route_segment_refs: [],
          severity: 'critical',
        },
      ],
      gate_recommendation: 'BLOCK',
      anchoredIcelandTrip: true,
    });
    expect(r.hit).toBe(true);
  });

  it('verify_issues use 生命红线 prefix for red-alert step', () => {
    const r = evaluateIcelandLightweightRedAlertFastFail({
      message: '维克附近',
      tripContextJoined: '',
      safetravel_alerts: [
        {
          id: 'c2',
          title: 'Storm',
          summary: 'Severe gale South coast.',
          affected_route_segment_refs: ['ring-road:selfoss-vik'],
          severity: 'critical',
        },
      ],
      gate_recommendation: 'BLOCK',
      anchoredIcelandTrip: false,
    });
    expect(r.hit).toBe(true);
    const surface = buildSafetySurfacePayload({
      stepsExecuted: [
        {
          skillName: 'iceland.lightweight_red_alert_fast_fail',
          success: true,
          result: { issues: r.rawIssues },
        },
      ],
    });
    expect(surface.verify_issues[0].message).toMatch(/极速安全闸·生命红线/);
  });
});
