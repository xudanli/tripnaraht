import {
  buildDeterministicMarathonGuardianResults,
  buildMarathonIntakeSignalsFromGaps,
  debateIgnoresMarathonAnchors,
  enrichGateForMarathonDeferredLowerBound,
  mergeTripPlanDebateCarryover,
} from './marathon-intake-signals.util';

describe('marathon-intake-signals.util', () => {
  const deferredGap = {
    type: 'INTENT_COMPILE_ERROR' as const,
    severity: 'SOFT' as const,
    detail:
      '[L3-DEFER|midnight_sun_continuous_drive] 检测到极昼/连续自驾马拉松意图：环岛约 1332km、1 天日历下日均驾驶约 19 小时',
  };

  it('builds marathon signals from SOFT defer gap', () => {
    const signals = buildMarathonIntakeSignalsFromGaps(
      [deferredGap],
      {
        request_id: 'r1',
        origin: 'Reykjavik',
        destination: '冰岛',
        days: 1,
      } as any,
      '想利用极昼，24小时不间断自驾环岛',
    );
    expect(signals?.deferred).toBe(true);
    expect(signals?.user_intent_anchors?.midnight_sun_continuous_drive).toBe(true);
    expect(signals?.suggested_days).toBeGreaterThanOrEqual(7);
    expect(signals?.required_hours_per_day).toBeGreaterThan(10);
  });

  it('merges debate carryover after DSO projection strips fields', () => {
    const prev = {
      request_id: 'r1',
      origin: 'a',
      destination: '冰岛',
      days: 1,
      message: '想利用极昼，24小时不间断自驾环岛',
      guardian_debate_trip_context: {
        user_intent_anchors: { midnight_sun_continuous_drive: true },
      },
      persona_hint: { drdre_tolerance: 'HIGH' as const },
    } as any;
    const next = mergeTripPlanDebateCarryover(
      { request_id: 'r1', origin: 'a', destination: '冰岛', days: 1 } as any,
      prev,
    );
    expect(next.message).toContain('极昼');
    expect(next.guardian_debate_trip_context?.user_intent_anchors?.midnight_sun_continuous_drive).toBe(true);
    expect(next.persona_hint?.drdre_tolerance).toBe('HIGH');
  });

  it('enriches gate with marathon SOFT violation and ADJUST_REQUIRED', () => {
    const gate = enrichGateForMarathonDeferredLowerBound(
      { gate_result: 'ALLOW', violations: [], required_adjustments: [], confidence: 0.8 },
      { request_id: 'r1', origin: 'a', destination: '冰岛', days: 1 } as any,
      [deferredGap],
      '想利用极昼，24小时不间断自驾环岛',
    );
    expect(gate.gate_result).toBe('ADJUST_REQUIRED');
    expect(gate.violations?.some((v) => String(v.detail).includes('midnight_sun_continuous_drive'))).toBe(true);
    expect(gate.required_adjustments?.some((a) => a.action === 'ADD_BUFFER')).toBe(true);
    expect(gate.required_adjustments?.some((a) => a.action === 'CHANGE_DATES')).toBe(true);
  });

  it('flags LLM debate that treats marathon as easy 1-day trip', () => {
    const anchors = { midnight_sun_continuous_drive: true };
    expect(
      debateIgnoresMarathonAnchors(anchors, {
        drdre_verdict: 'ALLOW',
        debate_summary_zh: 'Dr.Dre 认可 1 天单程节奏对低体能用户可行',
        drdre_evidence: ['无高强度徒步/驾驶要求，体力负荷低'],
      }),
    ).toBe(true);
  });

  it('builds deterministic marathon guardian projection', () => {
    const gate = enrichGateForMarathonDeferredLowerBound(
      { gate_result: 'ADJUST_REQUIRED', violations: [], required_adjustments: [], confidence: 0.7 },
      {
        request_id: 'r1',
        origin: 'a',
        destination: '冰岛',
        days: 1,
        constraints: { vehicle_type: '2WD' },
      } as any,
      [deferredGap],
      '24小时不间断自驾环岛',
    );
    const gr = buildDeterministicMarathonGuardianResults(
      gate,
      { midnight_sun_continuous_drive: true, interpretation_zh: '连续自驾' },
      { days: 1, constraints: { vehicle_type: '2WD' } } as any,
    );
    expect(gr.drdre.verdict).toBe('ADJUST');
    expect(gr.abu.verdict).toBe('REJECT');
    expect(gr.neptune.verdict).toBe('REPLACE');
    expect(gr.debate_summary_zh).toContain('02:00');
  });

  it('buildDeterministicMarathonGuardianResults does not assume 2WD when vehicle unspecified', () => {
    const gr = buildDeterministicMarathonGuardianResults(
      { gate_result: 'ALLOW', violations: [], required_adjustments: [], confidence: 0.7 },
      {
        midnight_sun_continuous_drive: true,
        ring_road_full_scope: true,
        interpretation_zh: '连续自驾环岛',
      },
      { days: 7, destination: '冰岛' } as any,
    );
    expect(gr.abu.verdict).toBe('ALLOW');
    expect(gr.abu.evidence?.join(' ')).toContain('未指定');
    expect(gr.debate_summary_zh).not.toMatch(/Abu REJECT 2WD/);
  });

  it('buildDeterministicMarathonGuardianResults uses NL 24h intent over trip calendar days', () => {
    const gr = buildDeterministicMarathonGuardianResults(
      { gate_result: 'ALLOW', violations: [], required_adjustments: [], confidence: 0.7 },
      {
        midnight_sun_continuous_drive: true,
        ring_road_full_scope: true,
        interpretation_zh: '24小时不间断自驾环岛',
      },
      { days: 7, destination: '冰岛' } as any,
      '6月5日想利用极昼，24小时不间断自驾环岛',
    );
    expect(gr.drdre.evidence?.join(' ')).toMatch(/1\s*天|19|小时/);
    expect(gr.drdre.evidence?.join(' ')).not.toMatch(/2\.7/);
  });
});
