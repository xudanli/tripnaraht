/**
 * Visibility Gate — Quality Gate 未通过继续 Shadow；通过才允许 USER_VISIBLE_TEMPORAL。
 * Graduation / Shadow / TemporalEvaluation 架构冻结。
 */

import type { TemporalScenarioId } from '../pilot/scenario-temporal-readiness.util';
import {
  authorizeTemporalScenario,
  selectFirstQualifiedTemporalScenario,
  type TemporalAuthorizationV1,
} from '../temporal-graduation/select-qualified-scenario.util';
import type { TemporalQualityReportV1 } from '../temporal-shadow-validation/temporal-quality-report.util';
import type { ScenarioReadinessJudgementV1 } from '../pilot/scenario-temporal-readiness.util';

export type TemporalVisibilityDecisionV1 = {
  scenarioId: TemporalScenarioId;
  qualityGatePassed: boolean;
  mode: 'SHADOW' | 'USER_VISIBLE_TEMPORAL';
  stayInShadow: boolean;
  allowUserVisibleTemporal: boolean;
  proactiveNotificationForbidden: true;
  autoActionForbidden: true;
  accuratePredictionIsNotUsefulIntervention: true;
  reasonZh: string;
  auth: TemporalAuthorizationV1;
};

/**
 * 按场景 Quality Report 决定可见性；未过 Gate 强制留 Shadow。
 */
export function decideTemporalVisibility(input: {
  judgements: ScenarioReadinessJudgementV1[];
  report: TemporalQualityReportV1;
}): TemporalVisibilityDecisionV1 {
  const selection = selectFirstQualifiedTemporalScenario(input.judgements);
  const scenarioId = input.report.scenarioId;
  const passed = input.report.qualityGatePassed && input.report.allowUserVisibleTemporal;

  if (!selection.ok || selection.scenarioId !== scenarioId) {
    const auth = authorizeTemporalScenario({ selection });
    return {
      scenarioId,
      qualityGatePassed: false,
      mode: 'SHADOW',
      stayInShadow: true,
      allowUserVisibleTemporal: false,
      proactiveNotificationForbidden: true,
      autoActionForbidden: true,
      accuratePredictionIsNotUsefulIntervention: true,
      reasonZh: '场景未 QUALIFIED 或与报告不一致 → 继续 Shadow',
      auth,
    };
  }

  if (!passed) {
    const auth = authorizeTemporalScenario({
      selection,
      grantShadowAuthorization: true,
      temporalQualityGatePassed: false,
    });
    return {
      scenarioId,
      qualityGatePassed: false,
      mode: 'SHADOW',
      stayInShadow: true,
      allowUserVisibleTemporal: false,
      proactiveNotificationForbidden: true,
      autoActionForbidden: true,
      accuratePredictionIsNotUsefulIntervention: true,
      reasonZh:
        'Quality Gate 未通过 → 继续 Shadow；禁止 USER_VISIBLE_TEMPORAL',
      auth,
    };
  }

  const auth = authorizeTemporalScenario({
    selection,
    grantShadowAuthorization: true,
    temporalQualityGatePassed: true,
  });
  return {
    scenarioId,
    qualityGatePassed: true,
    mode: 'USER_VISIBLE_TEMPORAL',
    stayInShadow: false,
    allowUserVisibleTemporal: true,
    proactiveNotificationForbidden: true,
    autoActionForbidden: true,
    accuratePredictionIsNotUsefulIntervention: true,
    reasonZh:
      'Quality Gate 通过 → 允许 USER_VISIBLE_TEMPORAL；仍禁 Proactive Notification / Auto Action',
    auth,
  };
}
