import {
  buildGuardianDebateFusionClarificationQuestions,
  fuseGuardianDebateVerdictIntoGate,
  shouldFuseDebateForUserConfirm,
} from './guardian-debate-gate-fusion.util';
import type { GateResult } from '../interfaces/trip-plan.interface';

describe('guardian-debate-gate-fusion.util', () => {
  const allowGate: GateResult = {
    gate_result: 'ALLOW',
    violations: [],
    required_adjustments: [],
    confidence: 0.85,
    guardian_results: {
      source: 'llm_debate',
      abu: { verdict: 'ALLOW', evidence: ['ok'] },
      drdre: { verdict: 'ALLOW', evidence: [] },
      neptune: { verdict: 'ALLOW', evidence: [] },
    },
  };

  it('does not fuse when Abu allows', () => {
    const out = fuseGuardianDebateVerdictIntoGate(allowGate);
    expect(out.fused).toBe(false);
    expect(out.gate.gate_result).toBe('ALLOW');
  });

  it('shouldFuseDebateForUserConfirm is false after accept_neptune_alternative', () => {
    const gate: GateResult = {
      ...allowGate,
      guardian_results: {
        source: 'llm_debate',
        abu: { verdict: 'ALLOW' },
        drdre: { verdict: 'ADJUST' },
        neptune: { verdict: 'REPLACE' },
      },
    };
    const trip = {
      guardian_debate_trip_context: {
        debate_user_confirm: {
          question_id: 'guardian_debate_abu_reject_v1',
          choice: 'accept_neptune_alternative',
        },
      },
    } as import('../interfaces/trip-plan.interface').TripPlanRequest;
    expect(shouldFuseDebateForUserConfirm(gate, trip)).toBe(false);
  });

  it('fuses Dr.Dre REJECT + Neptune REPLACE for marathon without Abu REJECT', () => {
    const gate: GateResult = {
      ...allowGate,
      guardian_results: {
        source: 'llm_debate',
        debate_summary_zh: '24小时不可行，建议3天分段。',
        abu: { verdict: 'ALLOW', evidence: ['未指定车型'] },
        drdre: { verdict: 'REJECT', evidence: ['连续驾驶22小时无睡眠窗'] },
        neptune: { verdict: 'REPLACE', evidence: ['3天分段环岛'] },
      },
    };
    const trip = {
      guardian_debate_trip_context: {
        user_intent_anchors: { midnight_sun_continuous_drive: true, ring_road_full_scope: true },
      },
    } as import('../interfaces/trip-plan.interface').TripPlanRequest;
    const out = fuseGuardianDebateVerdictIntoGate(gate, trip);
    expect(out.fused).toBe(true);
    expect(out.reason).toBe('marathon_replace_confirm');
    expect(out.gate.gate_result).toBe('NEED_USER_CONFIRM');
  });

  it('fuses Abu REJECT to NEED_USER_CONFIRM with SOFT violation', () => {
    const gate: GateResult = {
      ...allowGate,
      guardian_results: {
        source: 'llm_debate',
        debate_summary_zh: '24小时马拉松不可行，建议5天分段。',
        abu: { verdict: 'REJECT', evidence: ['2WD 不可上 F 路'] },
        drdre: { verdict: 'REJECT', evidence: [] },
        neptune: {
          verdict: 'REPLACE',
          evidence: ['改为5天分段环岛，每日约260km'],
        },
      },
    };
    const out = fuseGuardianDebateVerdictIntoGate(gate);
    expect(out.fused).toBe(true);
    expect(out.reason).toBe('abu_reject');
    expect(out.gate.gate_result).toBe('NEED_USER_CONFIRM');
    expect(out.gate.violations?.some((v) => v.detail?.includes('guardian_debate:abu_reject'))).toBe(true);
    expect(out.gate.required_adjustments?.some((a) => a.why?.includes('5天分段'))).toBe(true);
  });

  it('builds clarification question for frontend', () => {
    const gate: GateResult = {
      ...allowGate,
      gate_result: 'NEED_USER_CONFIRM',
      guardian_results: {
        source: 'llm_debate',
        debate_summary_zh: '需确认是否接受降强度方案',
        abu: { verdict: 'REJECT', evidence: ['合规风险'] },
        drdre: { verdict: 'REJECT', evidence: [] },
        neptune: { verdict: 'REPLACE', evidence: [] },
      },
    };
    const qs = buildGuardianDebateFusionClarificationQuestions(gate);
    expect(qs).toHaveLength(1);
    expect(qs[0].id).toBe('guardian_debate_abu_reject_v1');
    expect(qs[0].type).toBe('single_choice');
    expect(qs[0].question).toMatch(/安全节奏|可行性|按您本轮诉求/);
  });
});
