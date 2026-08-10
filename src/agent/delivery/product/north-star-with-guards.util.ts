/**
 * North Star + 约束指标。
 * 提高 Successful Assisted Decisions / Active Trip；
 * 同时 Serious Decision Regret ↓；Unauthorized / Unsafe Action = 0。
 * 理想：参与越来越多「值得参与」的决策，而非越来越多决策。
 */

import type { DecisionDelegationItemV1 } from './trust-signals-north-star.util';
import {
  computeNorthStarForTrip,
  isSuccessfulAssistedDecision,
} from './trust-signals-north-star.util';

export const NORTH_STAR_WITH_GUARDS_SCHEMA =
  'nara.north_star_with_guards@v1' as const;

export type NorthStarWithGuardsV1 = {
  schemaId: typeof NORTH_STAR_WITH_GUARDS_SCHEMA;
  version: 1;
  tripId: string;
  successfulAssistedDecisions: number;
  seriousDecisionRegretCount: number;
  unauthorizedOrUnsafeActionCount: number;
  /** 主指标希望提高 */
  northStarDirection: 'INCREASE';
  /** Regret 希望下降 */
  regretDirection: 'DECREASE';
  /** 越权必须为 0 */
  unauthorizedMustBeZero: true;
  passed: boolean;
  worthParticipatingNotMoreParticipating: true;
  reasonsZh: string[];
};

export function evaluateNorthStarWithGuards(input: {
  tripId: string;
  decisions: DecisionDelegationItemV1[];
  unauthorizedOrUnsafeActionCount?: number;
}): NorthStarWithGuardsV1 {
  const ns = computeNorthStarForTrip({
    tripId: input.tripId,
    decisions: input.decisions,
  });
  const seriousDecisionRegretCount = input.decisions.filter(
    (d) => d.naraParticipated && d.severeRegret,
  ).length;
  const unauthorizedOrUnsafeActionCount =
    input.unauthorizedOrUnsafeActionCount ?? 0;

  const reasonsZh: string[] = [
    ...ns.reasonsZh,
    `Serious Decision Regret = ${seriousDecisionRegretCount}（应↓）`,
    `Unauthorized/Unsafe Action = ${unauthorizedOrUnsafeActionCount}（必须=0）`,
  ];

  const passed =
    unauthorizedOrUnsafeActionCount === 0 &&
    /** 有辅助成功且无严重 regret 爆炸 */
    seriousDecisionRegretCount === 0;

  if (!passed) {
    if (unauthorizedOrUnsafeActionCount > 0) {
      reasonsZh.push('约束失败：存在未授权/不安全动作');
    }
    if (seriousDecisionRegretCount > 0) {
      reasonsZh.push('约束失败：存在严重决策后悔（勿为冲 North Star 过度介入）');
    }
  } else {
    reasonsZh.push(
      '理想状态：提高「值得参与」的辅助决策，而非盲目提高参与量',
    );
  }

  void isSuccessfulAssistedDecision;

  return {
    schemaId: NORTH_STAR_WITH_GUARDS_SCHEMA,
    version: 1,
    tripId: input.tripId,
    successfulAssistedDecisions: ns.successfulAssistedDecisions,
    seriousDecisionRegretCount,
    unauthorizedOrUnsafeActionCount,
    northStarDirection: 'INCREASE',
    regretDirection: 'DECREASE',
    unauthorizedMustBeZero: true,
    passed,
    worthParticipatingNotMoreParticipating: true,
    reasonsZh,
  };
}
