/**
 * Departure Gate 纯函数 — 组合 plan + preparation + freshness
 */

import type {
  DepartureGateStatus,
  PlanVerdictDto,
  PreparationVerdictDto,
  EvidenceFreshnessDto,
} from '../types/departure-gate.types';
import type { FeasibilityVerdictStatus } from '../types/trip-constraint-solver.types';

export function computeDepartureGateStatus(input: {
  revalidationRequired: boolean;
  planBlocked: boolean;
  preparationBlocked: boolean;
}): DepartureGateStatus {
  if (input.revalidationRequired) return 'REVALIDATION_REQUIRED';
  if (input.planBlocked && input.preparationBlocked) return 'BLOCKED_BY_BOTH';
  if (input.planBlocked) return 'BLOCKED_BY_PLAN';
  if (input.preparationBlocked) return 'BLOCKED_BY_PREPARATION';
  return 'READY';
}

export function mapPlanVerdictStatus(input: {
  hasValidation: boolean;
  isStale: boolean;
  verdictStatus: FeasibilityVerdictStatus;
}): PlanVerdictDto['status'] {
  if (input.isStale) return 'STALE';
  if (!input.hasValidation) return 'NOT_VALIDATED';
  if (
    input.verdictStatus === 'EXECUTABLE' ||
    input.verdictStatus === 'ADJUST_REQUIRED' ||
    input.verdictStatus === 'NOT_EXECUTABLE'
  ) {
    return input.verdictStatus;
  }
  return 'UNKNOWN';
}

export function isPlanBlocked(input: {
  hasValidation: boolean;
  isStale: boolean;
  verdictStatus: FeasibilityVerdictStatus;
  mustHandleCount: number;
  gateExecuteBlocked: boolean;
}): boolean {
  if (!input.hasValidation || input.isStale) return true;
  if (input.gateExecuteBlocked) return true;
  if (input.verdictStatus === 'NOT_EXECUTABLE') return true;
  if (input.mustHandleCount > 0) return true;
  if (input.verdictStatus !== 'EXECUTABLE') return true;
  return false;
}

export function buildPlanHeadlines(input: {
  status: PlanVerdictDto['status'];
  mustHandleCount: number;
  suggestAdjustCount: number;
  isStale: boolean;
}): { headline: string; subheadline?: string } {
  if (input.isStale || input.status === 'STALE') {
    return {
      headline: '行程已变更，需重新验证',
      subheadline: '计划版本与上次验证不一致',
    };
  }
  if (input.status === 'NOT_VALIDATED') {
    return {
      headline: '尚未验证行程可执行性',
      subheadline: '点击「重新验证」生成可执行性报告',
    };
  }
  if (input.status === 'EXECUTABLE' && input.mustHandleCount === 0) {
    return {
      headline: '行程方案已验证可执行',
      subheadline:
        input.suggestAdjustCount > 0
          ? `${input.suggestAdjustCount} 项建议优化`
          : undefined,
    };
  }
  if (input.status === 'NOT_EXECUTABLE' || input.mustHandleCount > 0) {
    return {
      headline: '行程方案暂不可执行',
      subheadline: `${input.mustHandleCount} 项必须处理`,
    };
  }
  if (input.status === 'ADJUST_REQUIRED') {
    return {
      headline: '行程方案需调整',
      subheadline: `${input.suggestAdjustCount} 项建议调整`,
    };
  }
  return { headline: '行程可执行性待确认' };
}

export function buildPreparationHeadlines(input: {
  status: PreparationVerdictDto['status'];
  openBlockerCount: number;
  openMustCount: number;
  completionPercent: number;
}): { headline: string; subheadline?: string } {
  if (input.status === 'BLOCKED') {
    return {
      headline: '出发准备有阻塞项',
      subheadline: `${input.openBlockerCount} 项必须完成`,
    };
  }
  if (input.status === 'COMPLETE') {
    return { headline: '出发准备已完成' };
  }
  if (input.status === 'IN_PROGRESS') {
    return {
      headline: '出发准备进行中',
      subheadline: `${input.completionPercent}% · 建议完成 ${input.openMustCount} 项`,
    };
  }
  return {
    headline: '尚未开始出发准备',
    subheadline: '查看清单并开始勾选',
  };
}

export function resolvePreparationStatus(input: {
  openBlockerCount: number;
  totalTrackedItemCount: number;
  completedItemCount: number;
}): PreparationVerdictDto['status'] {
  if (input.openBlockerCount > 0) return 'BLOCKED';
  if (input.totalTrackedItemCount === 0) return 'NOT_STARTED';
  if (input.completedItemCount >= input.totalTrackedItemCount) return 'COMPLETE';
  if (input.completedItemCount > 0) return 'IN_PROGRESS';
  return 'NOT_STARTED';
}

export function buildTravelStatusSummary(input: {
  gateStatus: DepartureGateStatus;
  planHeadline: string;
  prepHeadline: string;
  validatedAt?: string;
}): {
  planLabel: string;
  preparationLabel: string;
  validationLabel: string;
} {
  const validationLabel = input.validatedAt
    ? `验证：${formatShortTime(input.validatedAt)}`
    : '验证：尚未执行';

  return {
    planLabel: input.planHeadline,
    preparationLabel: input.prepHeadline,
    validationLabel,
  };
}

function formatShortTime(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const sameDay =
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate();
    if (sameDay) {
      return `今天 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    }
    return d.toISOString().slice(0, 16).replace('T', ' ');
  } catch {
    return iso;
  }
}

export function buildEvidenceFreshness(input: {
  isStale: boolean;
  verifiedAt?: string;
  verifiedForTripVersion?: string;
  currentTripVersion: string;
  phaseHint?: string;
}): EvidenceFreshnessDto {
  const revalidationRequired = input.isStale || !input.verifiedAt;
  return {
    isStale: input.isStale,
    validatedAt: input.verifiedAt,
    verifiedForTripVersion: input.verifiedForTripVersion,
    currentTripVersion: input.currentTripVersion,
    revalidationRequired,
    phaseHint: input.phaseHint,
  };
}

export function computeCanStartExecution(
  gateStatus: DepartureGateStatus,
): boolean {
  return gateStatus === 'READY';
}
