/**
 * Temporal Shadow Validation — 仅对第一个 QUALIFIED + APPROVED_FOR_SHADOW 场景跑真实 Shadow。
 * 无合格场景 → CONTINUE_PILOT。冻结 Graduation：不新增 Scenario / Proactive / Causal。
 */

import type {
  ScenarioReadinessJudgementV1,
  TemporalScenarioId,
} from '../pilot/scenario-temporal-readiness.util';
import {
  authorizeTemporalScenario,
  selectFirstQualifiedTemporalScenario,
  type TemporalAuthorizationV1,
} from '../temporal-graduation/select-qualified-scenario.util';

export type SelectShadowValidationResult =
  | {
      ok: true;
      scenarioId: TemporalScenarioId;
      auth: TemporalAuthorizationV1;
      mode: 'SHADOW';
      graduationArchitectureFrozen: true;
      noNewTemporalScenario: true;
      proactiveClosed: true;
      causalClosed: true;
    }
  | {
      ok: false;
      reason:
        | 'NO_QUALIFIED_SCENARIO'
        | 'QUALIFIED_BUT_NOT_APPROVED_FOR_SHADOW';
      action: 'CONTINUE_PILOT';
      summaryZh: string[];
      graduationArchitectureFrozen: true;
      temporalShadowDevForbidden: true;
    };

/**
 * 真实 Shadow 入口门禁：QUALIFIED ∧ APPROVED_FOR_SHADOW（显式 grant）。
 */
export function selectFirstApprovedShadowScenario(input: {
  judgements: ScenarioReadinessJudgementV1[];
  /** 人工/流程显式批准进入 Shadow */
  approvedForShadow: boolean;
}): SelectShadowValidationResult {
  const selection = selectFirstQualifiedTemporalScenario(input.judgements);
  if (selection.ok === false) {
    return {
      ok: false,
      reason: 'NO_QUALIFIED_SCENARIO',
      action: 'CONTINUE_PILOT',
      summaryZh: [
        ...selection.summaryZh,
        '无 QUALIFIED 场景 → 继续 Pilot，不跑 Temporal Shadow Validation。',
      ],
      graduationArchitectureFrozen: true,
      temporalShadowDevForbidden: true,
    };
  }

  if (!input.approvedForShadow) {
    return {
      ok: false,
      reason: 'QUALIFIED_BUT_NOT_APPROVED_FOR_SHADOW',
      action: 'CONTINUE_PILOT',
      summaryZh: [
        `场景 ${selection.scenarioId} 已 QUALIFIED，但未 APPROVED_FOR_SHADOW。`,
        'Scenario Qualified ≠ Temporal Authorized → 继续 Pilot，不跑真实 Shadow。',
      ],
      graduationArchitectureFrozen: true,
      temporalShadowDevForbidden: true,
    };
  }

  const auth = authorizeTemporalScenario({
    selection,
    grantShadowAuthorization: true,
    temporalQualityGatePassed: false,
  });

  if (auth.mode !== 'SHADOW' || !auth.authorized) {
    return {
      ok: false,
      reason: 'QUALIFIED_BUT_NOT_APPROVED_FOR_SHADOW',
      action: 'CONTINUE_PILOT',
      summaryZh: ['授权未进入 SHADOW 模式'],
      graduationArchitectureFrozen: true,
      temporalShadowDevForbidden: true,
    };
  }

  return {
    ok: true,
    scenarioId: selection.scenarioId,
    auth,
    mode: 'SHADOW',
    graduationArchitectureFrozen: true,
    noNewTemporalScenario: true,
    proactiveClosed: true,
    causalClosed: true,
  };
}
