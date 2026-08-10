/**
 * Proactive Readiness Gate —
 * Temporal Quality + Decision Utility + Intervention Quality 均达标前，禁止真正通知用户。
 * Notification / Push / Auto Apply 继续全部关闭。
 */

import type { TemporalScenarioId } from '../pilot/scenario-temporal-readiness.util';
import type { TemporalQualityReportV1 } from '../temporal-shadow-validation/temporal-quality-report.util';
import type { TemporalDecisionUtilityV1 } from '../temporal-decision-utility/temporal-decision-utility.util';
import type { InterventionQualityMetricsV1 } from './intervention-evaluation.util';

export const PROACTIVE_READINESS_GATE_SCHEMA =
  'nara.proactive_readiness_gate@v1' as const;

export type ProactiveReadinessGateV1 = {
  schemaId: typeof PROACTIVE_READINESS_GATE_SCHEMA;
  version: 1;
  scenarioId: TemporalScenarioId;
  temporalQualityPassed: boolean;
  decisionUtilityPassed: boolean;
  interventionQualityPassed: boolean;
  /** 真正通知用户 */
  allowNotifyUser: false | true;
  notificationClosed: boolean;
  pushClosed: true;
  autoApplyClosed: true;
  autoActionClosed: true;
  usefulInformationIsNotWorthInterrupting: true;
  reasonsZh: string[];
  dodFocusZh: string;
};

/**
 * 三闸全过仍默认关闭真实通知（本阶段只证明 Shadow；allowNotifyUser 恒 false）。
 * 门禁语义：readyForFutureProactiveReview vs 真正通知。
 */
export function checkProactiveReadinessGate(input: {
  scenarioId: TemporalScenarioId;
  temporalQuality: Pick<
    TemporalQualityReportV1,
    'qualityGatePassed' | 'scenarioId'
  >;
  decisionUtility: Pick<TemporalDecisionUtilityV1, 'passed' | 'scenarioId'>;
  interventionQuality: InterventionQualityMetricsV1;
}): ProactiveReadinessGateV1 {
  const reasonsZh: string[] = [];
  const tq =
    input.temporalQuality.scenarioId === input.scenarioId &&
    input.temporalQuality.qualityGatePassed;
  const du =
    input.decisionUtility.scenarioId === input.scenarioId &&
    input.decisionUtility.passed;
  const iq = input.interventionQuality.passed;

  if (!tq) reasonsZh.push('Temporal Quality 未达标');
  if (!du) reasonsZh.push('Decision Utility 未达标');
  if (!iq) reasonsZh.push('Intervention Quality 未达标');

  const allPassed = tq && du && iq;
  if (allPassed) {
    reasonsZh.push(
      '三闸达标：可进入未来 Proactive 评审；本阶段仍禁止真正 Notification / Push / Auto Apply',
    );
  } else {
    reasonsZh.push(
      'Proactive Readiness Gate 未开：禁止真正通知用户',
    );
  }

  return {
    schemaId: PROACTIVE_READINESS_GATE_SCHEMA,
    version: 1,
    scenarioId: input.scenarioId,
    temporalQualityPassed: tq,
    decisionUtilityPassed: du,
    interventionQualityPassed: iq,
    /** 本阶段硬关闭真实通知，即使三闸通过 */
    allowNotifyUser: false,
    notificationClosed: true,
    pushClosed: true,
    autoApplyClosed: true,
    autoActionClosed: true,
    usefulInformationIsNotWorthInterrupting: true,
    reasonsZh,
    dodFocusZh:
      'DoD：在 Shadow 中证明哪些信息值得打断、何时打断最有价值，且不过度提醒破坏旅行体验——而非系统已会提醒',
  };
}

/** 断言：任何通知通道尝试均拒绝 */
export function assertNotificationChannelsClosed(gate: ProactiveReadinessGateV1): {
  ok: false;
  code: 'NOTIFICATION_CHANNELS_CLOSED';
  reasonZh: string;
} {
  void gate;
  return {
    ok: false,
    code: 'NOTIFICATION_CHANNELS_CLOSED',
    reasonZh:
      'Notification / Push / Auto Apply 全部关闭；Useful Information ≠ Worth Interrupting',
  };
}
