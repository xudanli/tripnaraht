/**
 * daily_drive 修复候选 — feasibility issue + getRepairOptions
 */

import type { RepairOption, RepairOptionsResponse } from '../../readiness/types/coverage-map.types';
import type {
  FeasibilityIssueDto,
  FeasibilityRepairOptionDto,
} from '../types/trip-constraint-solver.types';
import { formatDriveDurationZhLong } from './daily-drive-threshold.util';

function estimateLodgingCostDelta(shortfallMinutes: number): number {
  if (shortfallMinutes >= 90) return 620;
  if (shortfallMinutes >= 45) return 420;
  return 280;
}

export function buildRemovePoiRepairOption(input: {
  issueId: string;
  dayNumber: number;
  itemId: string;
  itemLabel?: string;
  savedMinutes?: number;
}): FeasibilityRepairOptionDto {
  const label = input.itemLabel ?? '较远景点';
  const saved = input.savedMinutes;

  return {
    id: `remove_poi_${input.itemId}`,
    label: `移除 ${label}`,
    description:
      typeof saved === 'number' && saved > 0
        ? `从 Day ${input.dayNumber} 移除 ${label}，预计可缩短约 ${formatDriveDurationZhLong(saved)} 驾驶。`
        : `从 Day ${input.dayNumber} 移除较远景点以缩短当日驾驶。`,
    impactSummary: typeof saved === 'number' && saved > 0 ? `-${saved} 分钟` : 'medium',
    type: 'remove_poi',
    actionType: 'remove_poi',
    payload: {
      itemId: input.itemId,
      itemLabel: label,
      dayNumber: input.dayNumber,
      ...(typeof saved === 'number' && saved > 0 ? { savedMinutes: saved } : {}),
      validateScope: { type: 'issue', issueId: input.issueId },
    },
  };
}

export function buildDailyDriveFeasibilityRepairOptions(
  issueId: string,
  issue: FeasibilityIssueDto,
): FeasibilityRepairOptionDto[] {
  const day = issue.affectedDays?.[0] ?? issue.anchors?.fromDayNumber ?? 1;
  const shortfall = issue.anchors?.shortfallMinutes ?? 0;
  const travel = issue.anchors?.travelMinutes;
  const deepLink = issue.uiHints?.deepLink;
  const highlightItemIds =
    deepLink && typeof deepLink === 'object' && !Array.isArray(deepLink)
      ? deepLink.highlightItemIds
      : undefined;
  const removableItemId =
    issue.anchors?.removableItemId ?? highlightItemIds?.slice(-1)[0];

  return [
    {
      id: `change_day${day}_lodging`,
      label: `更换 Day ${day} 住宿`,
      description:
        shortfall > 0
          ? `将 Day ${day} 住宿替换为更靠近下一活动的地点，预计可缩短约 ${formatDriveDurationZhLong(shortfall)} 驾驶。`
          : `将 Day ${day} 住宿点前移，缩短当日累计驾驶距离。`,
      impactSummary: 'high',
      type: 'relocate_lodging',
      actionType: 'relocate_lodging',
      payload: {
        dayNumber: day,
        issueId,
        expectedDriveReductionMinutes: shortfall > 0 ? shortfall : undefined,
        validateScope: { type: 'issue', issueId },
      },
    },
    {
      id: `insert_buffer_after_day${day}`,
      label: `Day ${day} 后插入缓冲日`,
      description: '拆分长途驾驶，降低单日累计驾驶时长，满足每日驾驶上限。',
      impactSummary: '行程 +1 天',
      type: 'insert_rest_day',
      actionType: 'insert_rest_day',
      payload: {
        afterDayNumber: day,
        beforeDayNumber: day + 1,
        strategy: 'insert_rest',
        validateScope: { type: 'issue', issueId },
      },
    },
    ...(removableItemId
      ? [
          buildRemovePoiRepairOption({
            issueId,
            dayNumber: day,
            itemId: removableItemId,
            itemLabel: issue.anchors?.removableItemLabel ?? issue.anchors?.toPlaceLabel,
            savedMinutes: issue.anchors?.removableItemSavedMinutes,
          }),
        ]
      : []),
    ...(typeof travel === 'number' && shortfall > 0
      ? [
          {
            id: `split_drive_day${day}`,
            label: `拆分 Day ${day} 行程`,
            description: `将部分 POI 移至相邻日期，使驾驶降至 ${formatDriveDurationZhLong(Math.max(0, travel - shortfall))} 以内。`,
            impactSummary: 'medium',
            type: 'split_day',
            actionType: 'split_day',
            payload: {
              dayNumber: day,
              issueId,
              expectedDriveReductionMinutes: shortfall,
              targetTravelMinutes: Math.max(0, travel - shortfall),
              validateScope: { type: 'issue', issueId },
            },
          } satisfies FeasibilityRepairOptionDto,
        ]
      : []),
  ];
}

function feasibilityRepairToOption(
  opt: FeasibilityRepairOptionDto,
  tripId: string,
  issue: FeasibilityIssueDto,
  index: number,
): RepairOption {
  const shortfall = issue.anchors?.shortfallMinutes ?? 0;
  const cost =
    opt.actionType === 'relocate_lodging' || opt.id.includes('lodging')
      ? estimateLodgingCostDelta(shortfall)
      : undefined;

  return {
    id: opt.id,
    title: opt.label,
    description: opt.description,
    impact: (['high', 'medium', 'low'].includes(String(opt.impactSummary))
      ? opt.impactSummary
      : index === 0
        ? 'high'
        : 'medium') as RepairOption['impact'],
    cost,
    actionType: opt.actionType ?? opt.type,
    payload: opt.payload,
    metadata: {
      tripId,
      issueKind: issue.issueKind,
      netImpactMinutes: shortfall > 0 ? -shortfall : undefined,
      deepLink: issue.uiHints?.deepLink,
    },
  };
}

export function buildDailyDriveRepairOptionsResponse(
  tripId: string,
  issue: FeasibilityIssueDto,
): RepairOptionsResponse {
  const feasibilityOpts = issue.repairOptions?.length
    ? issue.repairOptions
    : buildDailyDriveFeasibilityRepairOptions(issue.id, issue);

  return {
    blockerId: issue.id,
    issueId: issue.id,
    blockerMessage: issue.message,
    options: feasibilityOpts.map((o, i) => feasibilityRepairToOption(o, tripId, issue, i)),
  };
}

export function repairOptionsFromIssueRepairOptions(
  issue: FeasibilityIssueDto,
  tripId: string,
): RepairOptionsResponse | undefined {
  if (!issue.repairOptions?.length) return undefined;
  return {
    blockerId: issue.id,
    issueId: issue.id,
    blockerMessage: issue.message,
    options: issue.repairOptions.map((o, i) => feasibilityRepairToOption(o, tripId, issue, i)),
  };
}

export function resolveEffectiveRepairOptions(input: {
  tripId: string;
  primaryIssue?: FeasibilityIssueDto;
  repairOptions?: RepairOptionsResponse;
}): RepairOptionsResponse | undefined {
  if (input.repairOptions?.options?.length) return input.repairOptions;
  if (!input.primaryIssue) return undefined;
  if (input.primaryIssue.issueKind === 'daily_drive') {
    return buildDailyDriveRepairOptionsResponse(input.tripId, input.primaryIssue);
  }
  return repairOptionsFromIssueRepairOptions(input.primaryIssue, input.tripId);
}
