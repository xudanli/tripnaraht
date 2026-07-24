import { randomUUID } from 'crypto';
import type { PlanDiff, PlanActivity } from '../../../generated/execution-risk-contracts';
import type { ActiveRisk } from '../types/execution-risk.types';

export function buildPlanDiffPreview(input: {
  tripId: string;
  risk: ActiveRisk;
  recommendationLabel: string;
  recommendationDescription?: string;
  impactSummary?: string;
  basePlanVersionId?: string;
}): { planDiff: PlanDiff; preview: string; afterPlanVersionId: string } {
  const beforePlanVersionId = input.basePlanVersionId ?? `pv_${input.tripId}_current`;
  const afterPlanVersionId = `pv_preview_${randomUUID().slice(0, 12)}`;

  const primaryActivity = input.risk.affectedActivities[0];
  const timeDeltaMinutes = parseTimeDeltaMinutes(input.impactSummary);
  const modified = buildModifiedActivity(primaryActivity, input, timeDeltaMinutes);

  const planDiff: PlanDiff = {
    beforePlanVersionId,
    afterPlanVersionId,
    addedActivities: [],
    removedActivities: [],
    modifiedActivities: modified ? [{ before: modified.before, after: modified.after }] : [],
    unchangedActivityIds: primaryActivity ? [] : [],
    timeDeltaMinutes,
  };

  const preview = buildPreviewText(input, timeDeltaMinutes, modified?.after.name);

  return { planDiff, preview, afterPlanVersionId };
}

export function projectRisksAfterApply(
  risks: ActiveRisk[],
  targetRiskId: string,
): ActiveRisk[] {
  return risks.map((risk) => {
    if (risk.id !== targetRiskId) return risk;
    return {
      ...risk,
      treatmentStatus: 'APPLYING',
      acknowledgementStatus: risk.acknowledgementStatus,
    };
  });
}

function parseTimeDeltaMinutes(impactSummary?: string): number {
  if (!impactSummary) return 0;
  const trimmed = impactSummary.trim();
  const plus = trimmed.match(/^\+(\d+)min$/i);
  if (plus) return Number(plus[1]);
  const minus = trimmed.match(/^-(\d+)min$/i);
  if (minus) return -Number(minus[1]);
  return 0;
}

function buildModifiedActivity(
  activity: ActiveRisk['affectedActivities'][number] | undefined,
  input: {
    recommendationLabel: string;
    recommendationDescription?: string;
    risk: ActiveRisk;
  },
  timeDeltaMinutes: number,
): { before: PlanActivity; after: PlanActivity } | null {
  if (!activity) return null;

  const before: PlanActivity = {
    activityId: activity.id,
    type: 'ACTIVITY',
    name: activity.label,
    durationMinutes: undefined,
  };

  const after: PlanActivity = {
    ...before,
    name: input.recommendationDescription
      ? `${activity.label}（${input.recommendationLabel}）`
      : `${activity.label}（已调整）`,
    durationMinutes:
      timeDeltaMinutes !== 0
        ? Math.max(0, (before.durationMinutes ?? 60) + timeDeltaMinutes)
        : before.durationMinutes,
  };

  return { before, after };
}

function buildPreviewText(
  input: {
    recommendationLabel: string;
    recommendationDescription?: string;
    risk: ActiveRisk;
  },
  timeDeltaMinutes: number,
  activityName?: string,
): string {
  const target = activityName ?? input.risk.affectedActivities[0]?.label ?? '当前行程';
  const timePart =
    timeDeltaMinutes > 0
      ? `预计增加约 ${timeDeltaMinutes} 分钟`
      : timeDeltaMinutes < 0
        ? `预计压缩约 ${Math.abs(timeDeltaMinutes)} 分钟`
        : '行程时间基本不变';
  const desc = input.recommendationDescription ?? input.recommendationLabel;
  return `采用「${input.recommendationLabel}」后，${target} 将按建议调整：${desc}。${timePart}。此为预览，尚未写入有效计划。`;
}
