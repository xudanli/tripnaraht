/**
 * 认知主链端到端冒烟（无 HTTP / 无 Nest）：
 * 看清现实 → 发现关系 → 聚焦问题 → 预演未来 → 授权 → 写回准入 → UI 投影
 *
 * 覆盖：
 * 1) 完整规划路径：markers / echo / cards / cockpit / write admission OK
 * 2) 写回拒绝：缺授权时跳过 auto-apply（与 Orchestrator 门禁语义一致）
 * 3) 用户 consent：explicitConsent → DECISION_AUTHORIZED
 * 4) 浅深度：REALITY_ONLY 不预演、不强制 future
 */

import { enrichClientUiDisplay } from '../../agent/utils/client-ui-enrichment.util';
import { mergeCognitionIntoNarration } from '../../agent/narrator/utils/merge-cognition-narration.util';
import { projectDecisionCockpitFromEnvelope } from '../../trips/decision/explainability/project-decision-cockpit-from-envelope.util';
import type { DecisionState } from './decision-state.types';
import {
  attachFutureSimulationCognition,
  attachRealityCognition,
  attachRelationAndFocusCognition,
  authorizeDecisionFromUserConfirmation,
  buildCognitionClientEcho,
  canAuthorizeDecisionPresentation,
  gatePlanWriteAdmission,
  markDecisionAuthorized,
  markOutcomeReconciled,
  markPlanApplied,
  resolveDecisionDepth,
  shouldRunPlanVerifyEngineering,
} from './decision-cognition.util';

function planningDso(over: Partial<DecisionState> = {}): DecisionState {
  return {
    requestId: 'smoke-plan-1',
    userIntent: { destination: 'IS', gaps: [] },
    tripState: { planDraft: { days: [{ day: 1 }] }, planVersion: 3 },
    environmentState: { weather: { wind_ms: 22 } },
    systemState: {
      requestId: 'smoke-plan-1',
      currentPhase: 'CONTEXT_BUILD',
      version: 1,
      startedAt: '2026-01-01T00:00:00.000Z',
      lastUpdatedAt: new Date().toISOString(),
    },
    worldStateSummary: {
      physical: { roadStates: { ring1: 'wind_exposed' } },
      human: { fitnessLevel: 'medium' },
    },
    research_data: { weather: { wind: 'strong', source: 'smoke' } },
    confidence: 0.78,
    constraints: {
      feasible: false,
      gateOutcome: 'NEED_USER_CONFIRM',
      violations: [
        {
          type: 'WIND_EXPOSURE',
          severity: 'HARD',
          detail: '南岸高风暴露，下午窗口不足',
        },
        {
          type: 'LUNCH_COMPRESSED',
          severity: 'SOFT',
          detail: '午餐被压缩',
        },
      ],
    },
    verification: {
      issues: [{ class: 'CONFLICT', code: 'WIND', message: '需确认绕行或改期' }],
      hasFatal: false,
      hasConflict: true,
      hasAdvisory: false,
      counts: { fatal: 0, conflict: 1, advisory: 0 },
      verifiedAt: new Date().toISOString(),
    } as DecisionState['verification'],
    ...over,
  } as DecisionState;
}

/** 镜像 Orchestrator 写回尾段：授权 → 写回准入 →（条件）auto-apply → PLAN_APPLIED */
function simulateWriteTail(dsoIn: DecisionState): {
  dso: DecisionState;
  cognition_write_admission: { ok: boolean; missing: string[] };
  itinerary_adjust_auto_apply: {
    applied: boolean;
    skipped?: boolean;
    reason?: string;
  };
  echo: ReturnType<typeof buildCognitionClientEcho>;
  ui_display: ReturnType<typeof enrichClientUiDisplay>;
  decision_cockpit: ReturnType<typeof projectDecisionCockpitFromEnvelope>;
} {
  let dso = dsoIn;
  if (canAuthorizeDecisionPresentation(dso)) {
    dso = markDecisionAuthorized(dso);
  }
  const gated = gatePlanWriteAdmission(dso);
  dso = gated.dso;
  const cognition_write_admission = {
    ok: gated.admission.ok,
    missing: gated.admission.missing,
  };

  let itinerary_adjust_auto_apply: {
    applied: boolean;
    skipped?: boolean;
    reason?: string;
  };
  if (cognition_write_admission.ok) {
    itinerary_adjust_auto_apply = { applied: true };
    dso = markPlanApplied(dso);
  } else {
    itinerary_adjust_auto_apply = {
      applied: false,
      skipped: true,
      reason: 'cognition_write_admission_denied',
    };
  }

  const echo = buildCognitionClientEcho(dso.cognition);
  const ui_display = enrichClientUiDisplay({ cognition: dso.cognition });
  const decision_cockpit = projectDecisionCockpitFromEnvelope({
    requestId: dso.requestId,
    cognition: dso.cognition,
  });

  return {
    dso,
    cognition_write_admission,
    itinerary_adjust_auto_apply,
    echo,
    ui_display,
    decision_cockpit,
  };
}

describe('decision cognition main-chain smoke', () => {
  it('full planning path: slices → markers → UI → write admission', () => {
    expect(
      resolveDecisionDepth({
        orchestrateMode: 'PLANNING_STATE_MACHINE',
        routingTaskType: 'TRIP_PLANNING',
        message: '帮我重新规划整个行程',
      }),
    ).toBe('FULL_SIMULATION');
    /** P3：局部调整走 FOCUSED_DECISION，勿与全量规划混淆 */
    expect(
      resolveDecisionDepth({
        orchestrateMode: 'PLANNING_STATE_MACHINE',
        routingTaskType: 'TRIP_PLANNING',
        message: '明天强风，怎么调整南岸行程？',
      }),
    ).toBe('FOCUSED_DECISION');
    expect(shouldRunPlanVerifyEngineering('FULL_SIMULATION')).toBe(true);

    let dso = attachRealityCognition(planningDso(), {
      decisionDepth: 'FULL_SIMULATION',
    });
    dso = attachRelationAndFocusCognition(dso, {
      decisionDepth: 'FULL_SIMULATION',
      enrichment: {
        earlyWarning: {
          risk_level: 'HIGH',
          conflict_type: 'WEATHER',
          evidence_summary: 'south coast wind',
          predictive_failure_report: {
            audit_text: 'wind → late arrival → missed hotel',
            simulated_repair_traces: [{}],
          },
        },
      },
    });
    dso = attachFutureSimulationCognition(dso, {
      decisionDepth: 'FULL_SIMULATION',
    });

    expect(dso.cognition?.realitySnapshot?.schema).toBe(
      'tripnara/decision-reality-snapshot@v1',
    );
    expect(dso.cognition?.relationGraph?.impactChains.length).toBeGreaterThan(0);
    expect(dso.cognition?.focusedProblem?.problemId).toBeTruthy();
    expect(dso.cognition?.futureSimulation?.verification.status).toBe('NEED_CONFIRM');
    expect(dso.cognition?.markers).toEqual(
      expect.arrayContaining([
        'REALITY_READY',
        'RELATIONS_READY',
        'PROBLEM_FOCUSED',
        'FUTURE_SIMULATED',
      ]),
    );

    // 用户确认（consent）后放宽 NEED_CONFIRM
    dso = authorizeDecisionFromUserConfirmation(dso, {
      explicitConsent: true,
      clarificationAnswers: [
        { questionId: 'early_warning_relaxations', value: 'reroute' },
      ],
    });
    expect(dso.cognition?.markers).toContain('DECISION_AUTHORIZED');
    expect(dso.cognition?.focusedProblem?.gateDisposition).toBe('ALLOW');

    // 确认后预演状态仍可能是 NEED_CONFIRM；写回要求非 BLOCK + 已授权
    const tail = simulateWriteTail(dso);
    expect(tail.cognition_write_admission.ok).toBe(true);
    expect(tail.itinerary_adjust_auto_apply.applied).toBe(true);
    expect(tail.dso.cognition?.markers).toContain('PLAN_APPLIED');

    const reconciled = markOutcomeReconciled(tail.dso);
    expect(reconciled.cognition?.markers).toContain('OUTCOME_RECONCILED');

    expect(tail.echo?.schema).toBe('tripnara/cognition_echo@v1');
    expect(tail.echo?.focused_problem?.problemId).toBeTruthy();
    expect(tail.echo?.admission_audit?.some((a) => a.phase === 'plan_write' && a.ok)).toBe(
      true,
    );

    expect(tail.ui_display.cognition_cards?.schema).toBe(
      'tripnara.cognition_ui_cards@v1',
    );
    expect(
      tail.ui_display.cognition_cards?.cards.some((c) => c.kind === 'FOCUSED_PROBLEM'),
    ).toBe(true);

    expect(tail.decision_cockpit?.cognition?.markers).toContain('PLAN_APPLIED');
    expect(
      tail.decision_cockpit?.cognition_cards?.cards.some((c) => c.kind === 'FOCUSED_PROBLEM'),
    ).toBe(true);

    const narration = mergeCognitionIntoNarration(
      { user_friendly_summary: '行程草案已生成', tips: [], warnings: [] },
      reconciled.cognition,
    );
    expect(narration.tips?.some((t) => String(t).includes('决策焦点'))).toBe(true);
    expect((narration as { cognition_summary?: unknown }).cognition_summary).toBeTruthy();
  });

  it('denies auto-apply when write admission fails (no authorization)', () => {
    let dso = attachFutureSimulationCognition(
      attachRelationAndFocusCognition(
        attachRealityCognition(
          planningDso({
            constraints: {
              feasible: true,
              violations: [],
              gateOutcome: 'ALLOW',
            },
            verification: {
              issues: [],
              hasFatal: false,
              hasConflict: false,
              hasAdvisory: false,
              counts: { fatal: 0, conflict: 0, advisory: 0 },
              verifiedAt: new Date().toISOString(),
            } as DecisionState['verification'],
          }),
          { decisionDepth: 'FULL_SIMULATION' },
        ),
        { decisionDepth: 'FULL_SIMULATION' },
      ),
      { decisionDepth: 'FULL_SIMULATION' },
    );

    // 故意不走 markDecisionAuthorized / user consent
    const gated = gatePlanWriteAdmission(dso);
    expect(gated.admission.ok).toBe(false);
    expect(gated.admission.missing).toContain('DECISION_AUTHORIZED');

    const autoApply = gated.admission.ok
      ? { applied: true as const }
      : {
          applied: false as const,
          skipped: true as const,
          reason: 'cognition_write_admission_denied' as const,
        };
    expect(autoApply).toEqual({
      applied: false,
      skipped: true,
      reason: 'cognition_write_admission_denied',
    });
    expect(gated.dso.cognition?.markers ?? []).not.toContain('PLAN_APPLIED');
  });

  it('BLOCKS write when future verification is BLOCK even if authorized', () => {
    let dso = attachFutureSimulationCognition(
      attachRelationAndFocusCognition(
        attachRealityCognition(
          planningDso({
            constraints: {
              feasible: false,
              gateOutcome: 'BLOCK',
              violations: [
                { type: 'FATAL_ROAD', severity: 'HARD', detail: '道路关闭' },
              ],
            },
            verification: {
              issues: [{ class: 'FATAL', code: 'ROAD_CLOSED' }],
              hasFatal: true,
              hasConflict: false,
              hasAdvisory: false,
              counts: { fatal: 1, conflict: 0, advisory: 0 },
              verifiedAt: new Date().toISOString(),
            } as DecisionState['verification'],
          }),
          { decisionDepth: 'FULL_SIMULATION' },
        ),
        { decisionDepth: 'FULL_SIMULATION' },
      ),
      { decisionDepth: 'FULL_SIMULATION' },
    );

    // 强制打上授权，仍应被写回准入拦住
    dso = markDecisionAuthorized(dso);
    expect(canAuthorizeDecisionPresentation(dso)).toBe(false);
    const gated = gatePlanWriteAdmission(dso);
    expect(gated.admission.ok).toBe(false);
    expect(gated.admission.missing).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/BLOCK|gateOutcome/),
      ]),
    );
  });

  it('REALITY_ONLY skips plan-verify engineering and still projects reality cards', () => {
    expect(
      resolveDecisionDepth({
        orchestrateMode: 'LIGHTWEIGHT',
        routingTaskType: 'DATA_LOOKUP',
        message: '今天雷克雅未克几点日落？',
      }),
    ).toBe('REALITY_ONLY');
    expect(shouldRunPlanVerifyEngineering('REALITY_ONLY')).toBe(false);

    const dso = attachRelationAndFocusCognition(
      attachRealityCognition(planningDso(), { decisionDepth: 'REALITY_ONLY' }),
      { decisionDepth: 'REALITY_ONLY' },
    );
    expect(dso.cognition?.relationGraph).toBeUndefined();
    expect(dso.cognition?.focusedProblem).toBeUndefined();

    const withFuture = attachFutureSimulationCognition(dso, {
      decisionDepth: 'REALITY_ONLY',
    });
    expect(withFuture.cognition?.futureSimulation).toBeUndefined();

    const cards = enrichClientUiDisplay({ cognition: withFuture.cognition });
    expect(cards.cognition_cards?.cards.some((c) => c.kind === 'REALITY')).toBe(true);

    // 浅深度不要求 future；授权 + planVersion 即可写回准入
    const authorized = markDecisionAuthorized(withFuture);
    const gated = gatePlanWriteAdmission(authorized);
    expect(gated.admission.ok).toBe(true);
  });
});
