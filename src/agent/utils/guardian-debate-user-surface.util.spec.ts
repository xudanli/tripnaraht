import type { GateResult, TripPlanRequest } from '../interfaces/trip-plan.interface';
import {
  abuRejectOnlyFromFalseUser2wdClaim,
  buildGuardianDebateClarificationQuestion,
  buildUserIntentFeasibilityForDebate,
  debateInventsFalse2wdWhenVehicleUnspecified,
  formatGuardianDebateConclusionForUserZh,
  sanitizeGuardianResultsForUnspecifiedVehicle,
  scrubUnspecifiedVehicleNarrative,
} from './guardian-debate-user-surface.util';

describe('guardian-debate-user-surface.util', () => {
  const baseGate = (summary: string): GateResult => ({
    gate_result: 'ADJUST_REQUIRED',
    violations: [],
    required_adjustments: [],
    confidence: 0.7,
    guardian_results: {
      source: 'llm_debate',
      is_simulated: false,
      abu: { verdict: 'REJECT', evidence: ['2WD车辆合规性不足'] },
      drdre: { verdict: 'REJECT', evidence: ['24小时连续驾驶疲劳'] },
      neptune: {
        verdict: 'REPLACE',
        evidence: ['拆成3天分段，升级4WD，保留环岛'],
      },
      debate_summary_zh: summary,
    },
  });

  it('scrubUnspecifiedVehicleNarrative removes false 2WD framing', () => {
    const s = scrubUnspecifiedVehicleNarrative(
      '三方一致否决「2WD+24小时连续环岛」原案；2WD车辆合规性不足',
      false,
    );
    expect(s).not.toMatch(/2WD\+/i);
    expect(s).toMatch(/24\s*小时/);
  });

  it('scrubUnspecifiedVehicleNarrative fixes 用户指定车辆为2WD', () => {
    const s = scrubUnspecifiedVehicleNarrative('用户指定车辆为2WD，东部峡湾需谨慎', false);
    expect(s).not.toMatch(/指定车辆为\s*2\s*wd/i);
    expect(s).toContain('未指定');
  });

  it('detects invented 2WD when trip has no vehicle_type', () => {
    const gate = baseGate('否决2WD+24小时原案');
    expect(
      debateInventsFalse2wdWhenVehicleUnspecified({ days: 7, destination: '冰岛' } as TripPlanRequest, gate.guardian_results!),
    ).toBe(true);
  });

  it('formatGuardianDebateConclusionForUserZh is compact without internal persona labels', () => {
    const text = formatGuardianDebateConclusionForUserZh(
      baseGate('Dr.Dre 否决 24h；Neptune 分段替代'),
      {
        days: 7,
        destination: '冰岛',
        metadata: { intake_user_message: '6月2日24小时不间断自驾环岛' },
        guardian_debate_trip_context: {
          user_intent_anchors: {
            midnight_sun_continuous_drive: true,
            ring_road_full_scope: true,
            interpretation_zh: '极昼下连续自驾环岛',
          },
        },
      } as TripPlanRequest,
    );
    expect(text).toContain('尚未说明两驱/四驱');
    expect(text).toMatch(/绑定行程档案为\s*7\s*天/);
    expect(text).not.toMatch(/约\s*1\s*个出行日内无法安全完成/i);
    expect(text).not.toMatch(/三人格立场|Neptune 建议方案|合议摘要|REPLACE/i);
    expect(text).not.toMatch(/2WD\+/);
  });

  it('sanitizeGuardianResults downgrades Abu when only false user 2WD claim', () => {
    const gate = baseGate('摘要');
    const gr = gate.guardian_results!;
    gr.abu = {
      verdict: 'REJECT',
      evidence: ['用户指定车辆为2WD，东部峡湾需谨慎'],
    };
    const out = sanitizeGuardianResultsForUnspecifiedVehicle(gr, { days: 7 } as TripPlanRequest);
    expect(abuRejectOnlyFromFalseUser2wdClaim(gr, false)).toBe(true);
    expect(out.abu?.verdict).toBe('ALLOW');
    expect(out.abu?.evidence?.join(' ')).not.toMatch(/指定车辆为\s*2\s*wd/i);
  });

  it('buildUserIntentFeasibilityForDebate marks 24h ring road INFEASIBLE', () => {
    const block = buildUserIntentFeasibilityForDebate(
      { days: 7, destination: '冰岛' } as TripPlanRequest,
      '6月2日24小时不间断自驾环岛',
    );
    expect(block?.feasibility_verdict).toBe('INFEASIBLE');
    expect(block?.preamble_zh).toMatch(/按您本轮诉求/);
    expect(block?.feasibility_summary_zh).toMatch(/24\s*小时|不可行/);
  });

  it('buildGuardianDebateClarificationQuestion embeds user intent feasibility metadata', () => {
    const q = buildGuardianDebateClarificationQuestion(
      baseGate('摘要'),
      {
        days: 7,
        destination: '冰岛',
        metadata: { intake_user_message: '6月2日24小时不间断自驾环岛' },
      } as TripPlanRequest,
    );
    expect(q.metadata?.user_intent_feasibility?.verdict).toBe('INFEASIBLE');
    expect(q.metadata?.show_user_intent_feasibility).toBe(true);
    expect(q.metadata?.user_intent_feasibility?.echo_zh).toBeTruthy();
    expect(q.question).toMatch(/安全节奏|可行替代|租车/);
    expect(q.question).not.toMatch(/按您本轮诉求/);
    expect(q.metadata?.guardian_personas?.drdre?.verdict).toBeTruthy();
  });

  it('buildGuardianDebateClarificationQuestion uses structured body', () => {
    const q = buildGuardianDebateClarificationQuestion(
      baseGate('合议摘要'),
      {
        constraints: { vehicle_type: '2WD' },
        message: '租四驱环岛',
      } as TripPlanRequest,
    );
    expect(q.question).not.toMatch(/三人格|REPLACE|合议摘要/i);
    expect(q.metadata?.vehicle_type_specified).toBe(true);
  });

  it('does not treat stale constraints.2WD as user-specified', () => {
    const q = buildGuardianDebateClarificationQuestion(
      baseGate('合议摘要'),
      {
        constraints: { vehicle_type: '2WD' },
        message: '6月5日想利用极昼，24小时不间断自驾环岛',
      } as TripPlanRequest,
    );
    expect(q.question).toContain('尚未说明两驱/四驱');
    expect(q.metadata?.vehicle_type_specified).toBe(false);
  });
});
