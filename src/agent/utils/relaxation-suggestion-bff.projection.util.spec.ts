import {
  attachRelaxationSuggestionsToPayload,
  projectRelaxationSuggestions,
  RELAXATION_ACTION_DISPLAY_ZH,
} from './relaxation-suggestion-bff.projection.util';
import type { ClarificationQuestion } from '../interfaces/clarification.interface';

describe('relaxation-suggestion-bff.projection.util', () => {
  const earlyWarningQuestion: ClarificationQuestion = {
    id: 'early_warning_relaxations',
    question: '检测到可达性风险，请选择一项修复后再继续规划。',
    type: 'single_choice',
    required: true,
    options: [
      {
        value: 'upgrade_vehicle_to_4wd',
        label:
          'upgrade_vehicle_to_4wd｜升级为 4WD（满足车辆要求：4WD/4x4）｜影子推演显示可消除全部冲突（high_probability_fixed）',
        metadata: { score: 8.2, path: 'PATH_A', dominant_cid: 'terrain.f_road_compatibility' },
      },
      {
        value: 'proceed_at_own_risk',
        label: '[实验性] 保持现状继续规划（可能导致失败）',
        metadata: { score: 1.1, path: 'OTHER' },
      },
    ],
  };

  it('projects early_warning options with human labels and context', () => {
    const out = projectRelaxationSuggestions({
      clarificationQuestions: [earlyWarningQuestion],
      orchestratorState: {
        request_id: 'req-1',
        metadata: {
          early_warning: {
            early_warning_id: 'ew-1',
            risk_level: 'HIGH',
            conflict_type: 'REACHABILITY',
            evidence_summary: 'F-road 需要 4WD，当前为 2WD',
            suggested_actions: [
              {
                relaxation_type: 'upgrade_vehicle_to_4wd',
                shadow_confidence: 'high_probability_fixed',
                impact_description: '升级为 4WD（满足车辆要求：4WD/4x4）｜影子推演显示可消除全部冲突',
                fixed_conflict_types: ['车辆准入'],
                violations_before: 2,
                violations_after: 0,
              },
            ],
          },
        },
        decision_log: [
          {
            request_id: 'req-1',
            step: 'RESEARCH',
            actor: 'Orchestrator',
            inputs_summary: '',
            outputs_summary: '',
            evidence_refs: [],
            timestamp: new Date().toISOString(),
            metadata: {
              system_action: 'EARLY_WARNING_INTERCEPT',
              failure_risk_score: 0.82,
              failure_prob_hint: '【高危逻辑拦截】若保持现状继续，预计撞墙风险很高。',
            },
          },
        ],
      } as any,
    });

    expect(out).toBeDefined();
    expect(out!.context.questionId).toBe('early_warning_relaxations');
    expect(out!.context.selectionMode).toBe('single');
    expect(out!.context.earlyWarningId).toBe('ew-1');
    expect(out!.context.failureRiskScore).toBe(0.82);

    const upgrade = out!.suggestions.find((s) => s.actionId === 'upgrade_vehicle_to_4wd');
    expect(upgrade?.labelZh).toBe(RELAXATION_ACTION_DISPLAY_ZH.upgrade_vehicle_to_4wd.labelZh);
    expect(upgrade?.confidence).toBe('high_probability_fixed');
    expect(upgrade?.recommended).toBe(true);
    expect(upgrade?.metadata?.violations_after).toBe(0);

    const proceed = out!.suggestions.find((s) => s.actionId === 'proceed_at_own_risk');
    expect(proceed?.kind).toBe('proceed_at_own_risk');
    expect(proceed?.recommended).toBeUndefined();
  });

  it('returns undefined when no relaxation clarification question', () => {
    expect(
      projectRelaxationSuggestions({
        clarificationQuestions: [{ id: 'pick_day', question: '选哪天？', type: 'single_choice', required: true }],
      }),
    ).toBeUndefined();
  });

  it('attachRelaxationSuggestionsToPayload mirrors into ui_display', () => {
    const payload: Record<string, unknown> = { ui_display: { evidence_cards_ui: [] } };
    attachRelaxationSuggestionsToPayload(payload, {
      clarificationQuestions: [earlyWarningQuestion],
      orchestratorState: { request_id: 'r', metadata: {} } as any,
    });
    expect(Array.isArray(payload.relaxation_suggestions)).toBe(true);
    expect(payload.relaxation_suggestions_context).toMatchObject({ questionId: 'early_warning_relaxations' });
    expect((payload.ui_display as any).relaxation_suggestions).toHaveLength(2);
  });

  it('clears relaxation_suggestions after conflict resolved (applied + gate ALLOW)', () => {
    const payload: Record<string, unknown> = {
      relaxation_suggestions: [{ actionId: 'x' }],
      ui_display: { relaxation_suggestions: [{ actionId: 'x' }] },
    };
    attachRelaxationSuggestionsToPayload(payload, {
      orchestratorState: {
        request_id: 'r',
        metadata: { applied_relaxations: [{ id: 'upgrade_vehicle_to_4wd' }] },
        gate_result: { gate_result: 'ALLOW', violations: [], required_adjustments: [], confidence: 1 },
      } as any,
    });
    expect(payload.relaxation_suggestions).toBeUndefined();
    expect((payload.ui_display as any).relaxation_suggestions).toBeUndefined();
  });
});
