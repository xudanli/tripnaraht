/**
 * Slice 3 E8 — post-apply revalidation for execution slip problems.
 */

import type { Rfc001DecisionProblem } from '../contracts/decision-problem.types';
import type { ExecutionSlipImpactResult } from '../detection/execution-slip-impact-analyzer';
import {
  computeProjectedEta,
  isScheduleFeasibleAfterRepair,
} from '../assessment/execution-slip-assessor.util';
import type { RevalidationVerdict } from '../../../decision-runtime/gateway/utils/decision-problem-revalidation.util';

export type ExecutionSlipRevalidationStatus =
  | 'RESOLVED'
  | 'OPEN'
  | 'NEEDS_REPAIR';

export interface ExecutionSlipRevalidationInput {
  problem: Rfc001DecisionProblem;
  impact: ExecutionSlipImpactResult;
  appliedCandidateId: string;
  observedAt: string;
  remainingStayMinutesAfterApply: number;
}

export function evaluateExecutionSlipRevalidation(
  input: ExecutionSlipRevalidationInput,
): RevalidationVerdict & { executionStatus: ExecutionSlipRevalidationStatus } {
  const nextWindow = input.impact.nextWindow;
  if (!nextWindow?.lastEntryAt) {
    return {
      status: 'PENDING',
      message: '缺少 lastEntryAt，无法验证',
      problemStillOpen: true,
      executionStatus: 'OPEN',
    };
  }

  let travelMinutes = input.impact.travelDurationMinutes;
  let remainingStay = input.remainingStayMinutesAfterApply;

  if (input.appliedCandidateId === 'cand_remove_next') {
    return {
      status: 'PASSED',
      message: '已移除不可达活动，日程可执行',
      problemStillOpen: false,
      executionStatus: 'RESOLVED',
    };
  }

  if (input.appliedCandidateId === 'cand_substitute_next') {
    const substituteWindow = { ...nextWindow, lastEntryAt: '18:00' };
    const projectedEta = computeProjectedEta({
      observedAt: input.observedAt,
      remainingStayMinutes: remainingStay,
      travelDurationMinutes: travelMinutes,
    });
    const ok = isScheduleFeasibleAfterRepair({
      projectedEta,
      lastEntryAt: substituteWindow.lastEntryAt,
      timezone: substituteWindow.timezone,
      referenceDateIso: input.observedAt,
    });
    if (ok) {
      return {
        status: 'PASSED',
        message: '替换活动后可在时间窗内到达',
        problemStillOpen: false,
        executionStatus: 'RESOLVED',
      };
    }
    return {
      status: 'FAILED',
      message: '替换后仍不可执行',
      problemStillOpen: true,
      executionStatus: 'NEEDS_REPAIR',
    };
  }

  if (input.appliedCandidateId === 'cand_shorten_stay') {
    remainingStay = Math.max(0, remainingStay - input.impact.shortenDeltaMinutes);
  }

  const projectedEta = computeProjectedEta({
    observedAt: input.observedAt,
    remainingStayMinutes: remainingStay,
    travelDurationMinutes: travelMinutes,
  });

  const feasible = isScheduleFeasibleAfterRepair({
    projectedEta,
    lastEntryAt: nextWindow.lastEntryAt,
    timezone: nextWindow.timezone,
    referenceDateIso: input.observedAt,
  });

  if (feasible) {
    return {
      status: 'PASSED',
      message: '修复后 projectedEta 不晚于 lastEntryAt',
      problemStillOpen: false,
      executionStatus: 'RESOLVED',
    };
  }

  return {
    status: 'FAILED',
    message: '修复后仍错过入场时间窗',
    problemStillOpen: true,
    executionStatus: 'NEEDS_REPAIR',
  };
}
