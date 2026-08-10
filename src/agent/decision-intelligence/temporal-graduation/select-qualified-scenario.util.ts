/**
 * Temporal Scenario Graduation — 选第一个 QUALIFIED 场景；若无则继续 Pilot。
 * 原则：Scenario Qualified ≠ Temporal Authorized。
 * 禁止通用 Temporal Runtime / Proactive Agent / Causal Model。
 */

import type {
  ScenarioReadinessJudgementV1,
  TemporalScenarioId,
} from '../pilot/scenario-temporal-readiness.util';
import { explainWhichTemporalScenariosQualify } from '../pilot/scenario-temporal-readiness.util';

export type SelectQualifiedScenarioResult =
  | {
      ok: true;
      scenarioId: TemporalScenarioId;
      judgement: ScenarioReadinessJudgementV1;
      scenarioQualifiedIsNotTemporalAuthorized: true;
    }
  | {
      ok: false;
      reason: 'NO_QUALIFIED_SCENARIO';
      action: 'CONTINUE_PILOT';
      summaryZh: string[];
      scenarioQualifiedIsNotTemporalAuthorized: true;
      /** 无资格时禁止开发 Temporal */
      temporalDevForbidden: true;
    };

/**
 * 以 explainWhichTemporalScenariosQualify 的真实结果选择第一个 QUALIFIED 场景。
 */
export function selectFirstQualifiedTemporalScenario(
  judgements: ScenarioReadinessJudgementV1[],
): SelectQualifiedScenarioResult {
  const which = explainWhichTemporalScenariosQualify({ judgements });
  const firstId = which.qualifiedScenarioIds[0];
  if (!firstId) {
    return {
      ok: false,
      reason: 'NO_QUALIFIED_SCENARIO',
      action: 'CONTINUE_PILOT',
      summaryZh: [
        ...which.summaryZh,
        '当前无 QUALIFIED 场景 → 继续 Pilot，不开发 Temporal。',
      ],
      scenarioQualifiedIsNotTemporalAuthorized: true,
      temporalDevForbidden: true,
    };
  }
  const judgement = judgements.find((j) => j.scenarioId === firstId)!;
  return {
    ok: true,
    scenarioId: firstId,
    judgement,
    scenarioQualifiedIsNotTemporalAuthorized: true,
  };
}

export type TemporalAuthorizationV1 = {
  scenarioId: TemporalScenarioId;
  qualified: boolean;
  authorized: boolean;
  mode: 'NONE' | 'SHADOW' | 'USER_VISIBLE_TEMPORAL';
  proactiveEnabled: false;
  reasonZh: string;
  scenarioQualifiedIsNotTemporalAuthorized: true;
};

/**
 * Qualified 后仍须显式授权；默认仅 Shadow。
 */
export function authorizeTemporalScenario(input: {
  selection: SelectQualifiedScenarioResult;
  /** 人工/流程显式授权 Shadow */
  grantShadowAuthorization?: boolean;
  /** Quality Gate 通过后才可 user-visible */
  temporalQualityGatePassed?: boolean;
}): TemporalAuthorizationV1 {
  if (!input.selection.ok) {
    return {
      scenarioId: 'pace_day_sequence',
      qualified: false,
      authorized: false,
      mode: 'NONE',
      proactiveEnabled: false,
      reasonZh: '无 QUALIFIED 场景，Temporal 未授权',
      scenarioQualifiedIsNotTemporalAuthorized: true,
    };
  }
  const scenarioId = input.selection.scenarioId;
  if (!input.grantShadowAuthorization) {
    return {
      scenarioId,
      qualified: true,
      authorized: false,
      mode: 'NONE',
      proactiveEnabled: false,
      reasonZh:
        'Scenario Qualified ≠ Temporal Authorized：尚未授予 Shadow 授权',
      scenarioQualifiedIsNotTemporalAuthorized: true,
    };
  }
  if (input.temporalQualityGatePassed) {
    return {
      scenarioId,
      qualified: true,
      authorized: true,
      mode: 'USER_VISIBLE_TEMPORAL',
      proactiveEnabled: false,
      reasonZh: 'Quality Gate 通过 → User-visible Temporal；Proactive 仍关闭',
      scenarioQualifiedIsNotTemporalAuthorized: true,
    };
  }
  return {
    scenarioId,
    qualified: true,
    authorized: true,
    mode: 'SHADOW',
    proactiveEnabled: false,
    reasonZh: '已授权 Shadow Temporal；不对用户展示、不触发调整',
    scenarioQualifiedIsNotTemporalAuthorized: true,
  };
}
