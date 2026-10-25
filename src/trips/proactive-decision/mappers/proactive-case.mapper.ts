/**
 * PD-2 — Case Mapper: WorldSignal + affected items → one of three V1 cases.
 */

import type { ProactiveDecisionCaseId } from '../contracts/proactive-decision-case.types';
import {
  domainOfProactiveSignal,
  type ProactiveImpactLevel,
  type ProactiveWorldSignalKind,
} from '../contracts/proactive-impact.types';

export type ProactiveCaseMapInput = {
  signalKind: ProactiveWorldSignalKind;
  affectedItems: string[];
  /**
   * When true, weather window for a scheduled activity is closed
   * (e.g. tomorrow glacier hike). Prefer CASE_POSTPONE_ACTIVITY.
   */
  activityWindowClosed?: boolean;
  /**
   * Explicit postpone intent from upstream analyzer / policy.
   */
  preferPostpone?: boolean;
  /**
   * Soft noise: impact too weak to change user decision.
   */
  impactLevel?: ProactiveImpactLevel;
};

export type ProactiveCaseMapResult =
  | {
      decisionRequired: true;
      caseId: ProactiveDecisionCaseId;
      rationaleZh: string;
    }
  | {
      decisionRequired: false;
      caseId: null;
      rationaleZh: string;
    };

const NOISE_LEVELS: ReadonlySet<ProactiveImpactLevel> = new Set(['LOW']);

/**
 * Map signal + impact shape to a V1 Decision Case, or short-circuit.
 */
export function mapProactiveDecisionCase(
  input: ProactiveCaseMapInput,
): ProactiveCaseMapResult {
  if (!input.affectedItems.length) {
    return {
      decisionRequired: false,
      caseId: null,
      rationaleZh: '无受影响行程项，不进入决策',
    };
  }

  if (input.impactLevel && NOISE_LEVELS.has(input.impactLevel)) {
    return {
      decisionRequired: false,
      caseId: null,
      rationaleZh: '影响级别过低，视为噪声（Silent Learning）',
    };
  }

  const domain = domainOfProactiveSignal(input.signalKind);

  if (domain === 'ROAD') {
    return {
      decisionRequired: true,
      caseId: 'CASE_REROUTE',
      rationaleZh: '道路状态变化，需要判断是否改线',
    };
  }

  // WEATHER
  if (input.preferPostpone || input.activityWindowClosed) {
    return {
      decisionRequired: true,
      caseId: 'CASE_POSTPONE_ACTIVITY',
      rationaleZh: '活动天气窗口关闭或需延期评估',
    };
  }

  return {
    decisionRequired: true,
    caseId: 'CASE_CONTINUE_ACTIVITY',
    rationaleZh: '天气变化影响户外活动，需要判断是否继续',
  };
}
