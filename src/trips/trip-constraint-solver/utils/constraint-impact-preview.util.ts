/**
 * 约束变更 → 结构化影响预览（决策沙盘 §9）
 */

import { TRIP_CONSTRAINT_LEGACY_IDS as LEGACY_IDS } from '../types/trip-constraint.types';
import type {
  TripConstraint,
  TripConstraintAssessSummary,
  TripConstraintChangePatch,
  TripConstraintFeasibilitySnapshot,
  TripConstraintImpactPreviewResponse,
} from '../types/trip-constraint.types';
import type { PlanningConflictItem } from '../types/planning-conflicts.types';

export interface ConstraintImpactStructuredPreview {
  summaryBullets: string[];
  executeability?: {
    scoreBefore?: number;
    scoreAfter?: number;
    scoreDelta?: number;
    gradeBefore?: string;
    gradeAfter?: string;
  };
  schedule?: {
    daysNeedingSplit?: number[];
    extraLodgingNights?: number;
    poisToRelocate?: Array<{ dayNumber: number; itemId?: string; label?: string }>;
  };
  budget?: {
    deltaAmount?: number;
    deltaPct?: number;
    currency?: string;
  };
  constraintChanges: Array<{
    constraintId: string;
    name?: string;
    before?: unknown;
    after?: unknown;
    unit?: string;
  }>;
}

function asNumber(v: unknown): number | undefined {
  if (typeof v === 'number' && !Number.isNaN(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return Number(v);
  return undefined;
}

function driveConflicts(conflicts: PlanningConflictItem[]): PlanningConflictItem[] {
  return conflicts.filter(
    (c) =>
      c.issue?.issueKind === 'daily_drive' ||
      /daily.?drive|每日驾驶|驾驶超限|驾驶时长/.test(`${c.title} ${c.message}`),
  );
}

function extractPoisFromDriveConflicts(
  conflicts: PlanningConflictItem[],
): Array<{ dayNumber: number; itemId?: string; label?: string }> {
  const pois: Array<{ dayNumber: number; itemId?: string; label?: string }> = [];
  for (const c of driveConflicts(conflicts)) {
    const day = c.affectedDays?.[0] ?? c.issue?.affectedDays?.[0] ?? 1;
    const anchors = c.issue?.anchors as
      | { removableItemId?: string; itemLabel?: string }
      | undefined;
    const deepLink = c.issue?.uiHints?.deepLink;
    const highlightItemIds =
      deepLink && typeof deepLink === 'object' && !Array.isArray(deepLink)
        ? (deepLink as { highlightItemIds?: string[] }).highlightItemIds
        : undefined;
    const itemId = anchors?.removableItemId ?? c.issue?.fromItemId ?? highlightItemIds?.slice(-1)[0];
    pois.push({
      dayNumber: day,
      itemId,
      label: anchors?.itemLabel ?? c.title,
    });
  }
  return pois.slice(0, 6);
}

function estimateScoreAfterTightening(input: {
  assessBefore?: TripConstraintAssessSummary;
  feasibilityBefore?: TripConstraintFeasibilitySnapshot;
  feasibilityAfter?: TripConstraintFeasibilitySnapshot;
  assessAfter?: TripConstraintAssessSummary;
  extraMustHandle: number;
  driveHoursDelta?: number;
}): { scoreAfter?: number; scoreDelta?: number } {
  if (input.assessAfter) {
    return {
      scoreAfter: input.assessAfter.overallAverageScore,
      scoreDelta:
        input.assessBefore != null
          ? input.assessAfter.overallAverageScore - input.assessBefore.overallAverageScore
          : undefined,
    };
  }
  if (!input.assessBefore) return {};

  let drop = input.extraMustHandle * 8;
  if (input.driveHoursDelta != null && input.driveHoursDelta < 0) {
    drop += Math.min(25, Math.abs(input.driveHoursDelta) * 5);
  }
  if (input.feasibilityAfter && input.feasibilityBefore) {
    drop += (input.feasibilityAfter.mustHandle - input.feasibilityBefore.mustHandle) * 10;
  }
  const scoreAfter = Math.max(0, Math.round(input.assessBefore.overallAverageScore - drop));
  return {
    scoreAfter,
    scoreDelta: scoreAfter - input.assessBefore.overallAverageScore,
  };
}

export function buildStructuredConstraintImpactPreview(input: {
  changes: TripConstraintChangePatch[];
  items: TripConstraint[];
  conflictsBefore: PlanningConflictItem[];
  conflictsAfter?: TripConstraintImpactPreviewResponse['conflictsAfter'];
  assessBefore?: TripConstraintAssessSummary;
  assessAfter?: TripConstraintAssessSummary;
  feasibilityBefore?: TripConstraintFeasibilitySnapshot;
  feasibilityAfter?: TripConstraintFeasibilitySnapshot;
  budgetDelta?: TripConstraintImpactPreviewResponse['budgetDelta'];
  budgetTotalBefore?: number | null;
}): ConstraintImpactStructuredPreview {
  const itemsById = Object.fromEntries(input.items.map((i) => [i.id, i]));
  const constraintChanges: ConstraintImpactStructuredPreview['constraintChanges'] = [];
  const summaryBullets: string[] = [];
  let daysNeedingSplit: number[] = [];
  let extraLodgingNights = 0;
  const poisToRelocate = extractPoisFromDriveConflicts(input.conflictsBefore);
  let driveHoursDelta: number | undefined;

  for (const ch of input.changes) {
    const item = itemsById[ch.constraintId];
    const before = item?.value;
    const after = ch.patch.value ?? before;
    constraintChanges.push({
      constraintId: ch.constraintId,
      name: item?.name,
      before,
      after,
      unit: ch.patch.unit ?? item?.unit,
    });

    if (ch.constraintId === LEGACY_IDS.MAX_DAILY_DRIVE) {
      const beforeH = asNumber(before);
      const afterH = asNumber(after);
      if (beforeH != null && afterH != null && afterH < beforeH) {
        driveHoursDelta = afterH - beforeH;
        const driveIssues = driveConflicts(input.conflictsBefore);
        daysNeedingSplit = [
          ...new Set(driveIssues.flatMap((c) => c.affectedDays ?? c.issue?.affectedDays ?? [])),
        ].sort((a, b) => a - b);

        if (daysNeedingSplit.length === 0 && input.conflictsBefore.length > 0) {
          daysNeedingSplit = [
            ...new Set(input.conflictsBefore.flatMap((c) => c.affectedDays ?? [])),
          ].sort((a, b) => a - b);
        }

        if (daysNeedingSplit.length > 0) {
          summaryBullets.push(
            `第 ${daysNeedingSplit.join('、')} 天可能需拆分或调整住宿以符合 ${afterH} 小时驾驶上限`,
          );
          extraLodgingNights = Math.min(daysNeedingSplit.length, 2);
          if (extraLodgingNights > 0) {
            summaryBullets.push(`预计增加 ${extraLodgingNights} 晚住宿`);
          }
        } else {
          summaryBullets.push(
            `每日驾驶上限从 ${beforeH} 小时降至 ${afterH} 小时，行程节奏将更保守`,
          );
        }

        if (poisToRelocate.length > 0) {
          summaryBullets.push(`${poisToRelocate.length} 个景点可能需要移动或移除`);
        } else if (afterH <= beforeH - 1) {
          summaryBullets.push('部分景点可能需要移动到其他天');
        }
      } else if (beforeH != null && afterH != null && afterH > beforeH) {
        summaryBullets.push(`放宽每日驾驶至 ${afterH} 小时，可执行性可能提升`);
      }
    }

    if (ch.constraintId === LEGACY_IDS.MAX_SEGMENT_DISTANCE) {
      const beforeKm = asNumber(before);
      const afterKm = asNumber(after);
      if (beforeKm != null && afterKm != null && afterKm < beforeKm) {
        summaryBullets.push(
          `单段距离从 ${beforeKm}km 收紧至 ${afterKm}km，跨区串联可能需拆天`,
        );
      }
    }

    if (ch.constraintId === LEGACY_IDS.BUDGET_TOTAL) {
      const beforeB = asNumber(before);
      const afterB = asNumber(after);
      if (beforeB != null && afterB != null) {
        const delta = afterB - beforeB;
        const pct = beforeB > 0 ? Math.round((delta / beforeB) * 100) : undefined;
        summaryBullets.push(
          pct != null
            ? `总预算 ${delta >= 0 ? '增加' : '减少'}约 ${Math.abs(pct)}%`
            : `总预算变更 ${delta >= 0 ? '+' : ''}${delta}`,
        );
      }
    }

    if (ch.constraintId === LEGACY_IDS.TIME_RANGE && ch.patch.value) {
      summaryBullets.push('行程日期变更可能影响已订资源与官方规则窗口');
    }

    if (ch.constraintId === LEGACY_IDS.MUST_PLACES && Array.isArray(after)) {
      const beforeList = Array.isArray(before) ? before : [];
      const added = (after as unknown[]).length - beforeList.length;
      if (added > 0) {
        summaryBullets.push(`新增 ${added} 个必去点，可能增加 ${added} 天或拆分现有安排`);
      }
    }
  }

  if (input.budgetDelta && input.budgetTotalBefore && input.budgetTotalBefore > 0) {
    const pct = Math.round((input.budgetDelta.amount / input.budgetTotalBefore) * 100);
    if (!summaryBullets.some((b) => b.includes('预算'))) {
      summaryBullets.push(`预算变化约 ${pct >= 0 ? '+' : ''}${pct}%`);
    }
  }

  const extraMustHandle =
    input.conflictsAfter && input.feasibilityBefore
      ? Math.max(0, input.conflictsAfter.mustHandle - input.feasibilityBefore.mustHandle)
      : driveHoursDelta != null && driveHoursDelta < 0
        ? 1
        : 0;

  const execEst = estimateScoreAfterTightening({
    assessBefore: input.assessBefore,
    assessAfter: input.assessAfter,
    feasibilityBefore: input.feasibilityBefore,
    feasibilityAfter: input.feasibilityAfter,
    extraMustHandle,
    driveHoursDelta,
  });

  if (
    input.assessBefore &&
    execEst.scoreAfter != null &&
    execEst.scoreDelta != null &&
    execEst.scoreDelta !== 0
  ) {
    summaryBullets.push(
      `当前可执行性从 ${Math.round(input.assessBefore.overallAverageScore)} 预计变为 ${execEst.scoreAfter}（${execEst.scoreDelta >= 0 ? '+' : ''}${execEst.scoreDelta}）`,
    );
  } else if (input.assessBefore && input.assessAfter) {
    summaryBullets.push(
      `可执行性评分 ${Math.round(input.assessBefore.overallAverageScore)} → ${Math.round(input.assessAfter.overallAverageScore)}`,
    );
  }

  if (input.conflictsAfter && input.feasibilityBefore) {
    const mhDelta = input.conflictsAfter.mustHandle - input.feasibilityBefore.mustHandle;
    if (mhDelta > 0) {
      summaryBullets.push(`必处理冲突预计增加 ${mhDelta} 项`);
    } else if (mhDelta < 0) {
      summaryBullets.push(`必处理冲突预计减少 ${Math.abs(mhDelta)} 项`);
    }
  }

  if (summaryBullets.length === 0) {
    summaryBullets.push('变更影响较小，建议确认后刷新可行性验证');
  }

  const budgetPct =
    input.budgetDelta && input.budgetTotalBefore && input.budgetTotalBefore > 0
      ? Math.round((input.budgetDelta.amount / input.budgetTotalBefore) * 100)
      : undefined;

  return {
    summaryBullets,
    executeability: {
      scoreBefore: input.assessBefore?.overallAverageScore,
      scoreAfter: input.assessAfter?.overallAverageScore ?? execEst.scoreAfter,
      scoreDelta: execEst.scoreDelta,
      gradeBefore: input.assessBefore?.overallGrade,
      gradeAfter: input.assessAfter?.overallGrade,
    },
    schedule:
      daysNeedingSplit.length || extraLodgingNights || poisToRelocate.length
        ? {
            daysNeedingSplit: daysNeedingSplit.length ? daysNeedingSplit : undefined,
            extraLodgingNights: extraLodgingNights || undefined,
            poisToRelocate: poisToRelocate.length ? poisToRelocate : undefined,
          }
        : undefined,
    budget: input.budgetDelta
      ? {
          deltaAmount: input.budgetDelta.amount,
          deltaPct: budgetPct,
          currency: input.budgetDelta.currency,
        }
      : undefined,
    constraintChanges,
  };
}
