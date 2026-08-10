/**
 * Runtime 硬约束：CANDIDATE / QUALIFIED / OBSERVED 不得进入生产 Decision Context。
 * Profile View 排除不够；必须在 Runtime 装配出口再挡一层。
 */

import type { MemoryContextPackage } from '../types/memory-context-package.types';
import type { UserProfileMemoryView } from '../types/memory-context-package.types';
import type { MemoryFieldView } from '../types/memory-event.types';
import { memoryLifecycleAffectsDecision } from '../types/memory-lifecycle.types';
import { lifecycleFromEventStatus } from '../types/memory-lifecycle.types';

function fieldAllowedInDecision(field?: MemoryFieldView): boolean {
  if (!field) return false;
  const life = lifecycleFromEventStatus(field.status);
  if (!memoryLifecycleAffectsDecision(life)) return false;
  // Decision Outcome 推断即使误标 ACTIVE 也挡（需 profileEligible）
  if (field.sourceType === 'DECISION_OUTCOME') {
    const v = field.value as { profileEligible?: boolean } | unknown;
    if (
      v &&
      typeof v === 'object' &&
      (v as { profileEligible?: boolean }).profileEligible !== true
    ) {
      return false;
    }
  }
  return field.status === 'ACTIVE' || field.sourceType === 'USER_EXPLICIT';
}

function filterProfile(view: UserProfileMemoryView): UserProfileMemoryView {
  return {
    pace: fieldAllowedInDecision(view.pace) ? view.pace : undefined,
    riskTolerance: fieldAllowedInDecision(view.riskTolerance)
      ? view.riskTolerance
      : undefined,
    accommodationMovement: fieldAllowedInDecision(view.accommodationMovement)
      ? view.accommodationMovement
      : undefined,
    preferredExperience: fieldAllowedInDecision(view.preferredExperience)
      ? view.preferredExperience
      : undefined,
    planningStyle: fieldAllowedInDecision(view.planningStyle)
      ? view.planningStyle
      : undefined,
  };
}

/**
 * 将 Context Package 收成「可进 Decision Kernel」的形态。
 * Episode 仅作 CONTEXT 证据（isTruth=false），不携带 CANDIDATE 偏好。
 */
export function toDecisionSafeMemoryContext(
  pkg: MemoryContextPackage,
): MemoryContextPackage {
  return {
    ...pkg,
    structured: filterProfile(pkg.structured),
    // trip overrides：仅 ACTIVE / EXPLICIT；临时约束视为硬约束可保留
    tripMemory: pkg.tripMemory
      ? {
          ...pkg.tripMemory,
          paceOverride: fieldAllowedInDecision(pkg.tripMemory.paceOverride)
            ? pkg.tripMemory.paceOverride
            : pkg.tripMemory.paceOverride?.sourceType === 'USER_EXPLICIT'
              ? pkg.tripMemory.paceOverride
              : undefined,
        }
      : null,
    decisionSafe: true,
  };
}

export function assertNoCandidateInDecisionContext(
  pkg: MemoryContextPackage,
): { ok: true } | { ok: false; violations: string[] } {
  const violations: string[] = [];
  const check = (label: string, field?: MemoryFieldView) => {
    if (!field) return;
    if (field.status === 'CANDIDATE' || field.status === 'INFERRED') {
      violations.push(`${label}:status=${field.status}`);
    }
  };
  check('structured.pace', pkg.structured.pace);
  check('structured.riskTolerance', pkg.structured.riskTolerance);
  check('trip.paceOverride', pkg.tripMemory?.paceOverride);
  return violations.length ? { ok: false, violations } : { ok: true };
}
