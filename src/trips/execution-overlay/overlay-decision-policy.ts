/**
 * P5-CLOSE：可选运行时闸门 —— 有 corridor 腿时必须产出 ExecutionOverlayFrame，禁止「无 overlay 决策」。
 *
 * 启用：`TRIP_EXECUTION_OVERLAY_LOCK=1` 或 `policies.executionOverlayDecisionLock === true`
 */

import type { ExecutionOverlayFrame } from './execution-overlay-frame.types';
import type { TripPlan } from '../decision/plan-model';

export function isExecutionOverlayDecisionLockEnabled(policies?: {
  executionOverlayDecisionLock?: boolean;
}): boolean {
  if (policies?.executionOverlayDecisionLock === true) {
    return true;
  }
  if (typeof process !== 'undefined' && process.env?.TRIP_EXECUTION_OVERLAY_LOCK === '1') {
    return true;
  }
  return false;
}

export function planHasInboundTravelLeg(plan: TripPlan): boolean {
  return plan.days.some(d => d.timeSlots.some(s => s.travelLegFromPrev !== undefined));
}

/**
 * 在决策管线融合点调用：锁开启且计划含驾驶腿时，必须有非空 overlay。
 */
export function assertExecutionOverlayDecisionAllowed(
  plan: TripPlan,
  frames: ExecutionOverlayFrame[] | undefined,
  policies: { executionOverlayDecisionLock?: boolean } | undefined,
  context: string,
): void {
  if (!isExecutionOverlayDecisionLockEnabled(policies)) {
    return;
  }
  if (!planHasInboundTravelLeg(plan)) {
    return;
  }
  if (!frames?.length) {
    throw new Error(
      `NON_OVERLAY_DECISION_FORBIDDEN (${context}): empty ExecutionOverlayFrame[] — disable lock or ensure corridor overlay pipeline runs.`,
    );
  }
}

/**
 * PR-5 命名别名 —— 与 {@link assertExecutionOverlayDecisionAllowed} 相同语义。
 */
export function assertOverlayOnly(
  plan: TripPlan,
  frames: ExecutionOverlayFrame[] | undefined,
  policies: { executionOverlayDecisionLock?: boolean } | undefined,
  context: string,
): void {
  assertExecutionOverlayDecisionAllowed(plan, frames, policies, context);
}
