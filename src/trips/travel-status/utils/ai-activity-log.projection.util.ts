/**
 * Project resolutions + change log + open decisions → AI 活动记录 timeline.
 */

import { DateTime } from 'luxon';
import {
  AUTOMATION_ACTION_GROUP_LABELS,
  getAutomationActionByKey,
} from '../../../decision-runtime/authorization/automation-action.catalog';
import { DECISION_AUTOMATION_ACTOR_USER_ID } from '../../../decision-runtime/monitoring/decision-automation-chain.service';
import {
  readAutomationChangeLog,
  type AutomationChangeLogEntry,
} from '../../../decision-runtime/monitoring/automation-change-log.store.util';
import type { StoredDecisionProblemResolution } from '../../../decision-runtime/gateway/persistence/decision-problem-resolution.store';
import type { ConsumerDecisionItem } from '../types/travel-status.types';
import type {
  AiActivityCategory,
  AiActivityFilter,
  AiActivityLogSummary,
  AiActivityLogView,
  AiActivityStatusTag,
  AiActivityTimelineItem,
} from '../types/ai-activity-log.types';
import { AI_ACTIVITY_LOG_SCHEMA_ID } from '../types/ai-activity-log.types';

const CATEGORY_LABELS: Record<AiActivityCategory, string> = {
  MONITORING: '环境监控',
  TIME_ROUTE: '时间与路线',
  ACTIVITY: '活动与体验',
  BUDGET_BOOKING: '预算与预订',
  SAFETY: '安全与风险',
  TEAM_PRIVACY: '团队与隐私',
  VALIDATION: '可行性验证',
  OTHER: '其他',
};

const STATUS_LABELS: Record<AiActivityStatusTag, string> = {
  AUTO_EXECUTED: '已自动执行',
  USER_CONFIRMED: '用户确认',
  WAITING_CONFIRM: '等待确认',
  WRITTEN_BACK: '已写回',
  CANCELLED: '已撤销',
};

export function projectAiActivityLogView(input: {
  tripId: string;
  generatedAt: string;
  resolutions: Record<string, StoredDecisionProblemResolution>;
  tripMetadata?: unknown;
  openDecisions?: ConsumerDecisionItem[];
}): AiActivityLogView {
  const logEntries = readAutomationChangeLog(input.tripMetadata);
  const resolutionList = Object.values(input.resolutions);

  const logItems = logEntries.map((entry) =>
    toTimelineFromChangeLog(input.tripId, entry, resolutionList),
  );
  const resolutionItems = resolutionList
    .filter((resolution) => !logItems.some((item) => item.problemId === resolution.problemId))
    .map((resolution) => toTimelineFromResolution(input.tripId, resolution));
  const waitingItems = (input.openDecisions ?? []).map((item) =>
    toTimelineFromOpenDecision(input.tripId, item, input.generatedAt),
  );

  const items = [...logItems, ...resolutionItems, ...waitingItems]
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
    .slice(0, 50);

  return {
    schemaId: AI_ACTIVITY_LOG_SCHEMA_ID,
    tripId: input.tripId,
    generatedAt: input.generatedAt,
    summary: buildSummary(items, input.generatedAt),
    filters: ['ALL', 'AUTO', 'WAITING_CONFIRM', 'WRITTEN_BACK', 'CANCELLED'],
    items,
  };
}

export function buildSummary(
  items: AiActivityTimelineItem[],
  generatedAt: string,
): AiActivityLogSummary {
  const today = DateTime.fromISO(generatedAt).toISODate();
  const yesterday = DateTime.fromISO(generatedAt).minus({ days: 1 }).toISODate();

  const todayItems = items.filter((item) => item.occurredAt.slice(0, 10) === today);
  const yesterdayItems = items.filter((item) => item.occurredAt.slice(0, 10) === yesterday);

  const autoCompletedCount = todayItems.filter((item) => item.filterTags.includes('AUTO')).length;
  const waitingConfirmCount = items.filter((item) =>
    item.filterTags.includes('WAITING_CONFIRM'),
  ).length;
  const todayDenominator = Math.max(todayItems.length, 1);

  const latestRevalidation = items.find(
    (item) => item.category === 'VALIDATION' && item.filterTags.includes('WRITTEN_BACK'),
  );

  return {
    todayActionCount: todayItems.length,
    todayActionDelta: todayItems.length - yesterdayItems.length,
    autoCompletedCount,
    autoCompletedPct: Math.round((autoCompletedCount / todayDenominator) * 100),
    waitingConfirmCount,
    waitingConfirmPct: Math.round((waitingConfirmCount / Math.max(items.length, 1)) * 100),
    latestRevalidation: latestRevalidation
      ? {
          activityId: latestRevalidation.activityId,
          occurredAt: latestRevalidation.occurredAt,
          title: latestRevalidation.title,
        }
      : undefined,
  };
}

function toTimelineFromChangeLog(
  tripId: string,
  entry: AutomationChangeLogEntry,
  resolutions: StoredDecisionProblemResolution[],
): AiActivityTimelineItem {
  const resolution = resolutions.find((r) => r.problemId === entry.problemId);
  const automatic = entry.automatic;
  const statusTag =
    entry.status === 'ROLLED_BACK' ? 'CANCELLED' : automatic ? 'AUTO_EXECUTED' : 'USER_CONFIRMED';
  const category = resolveCategory(
    entry.matchedActionKeys,
    entry.selectedActionId,
    resolution?.semanticKey,
  );
  const title = resolution?.automationMeta?.actionTitle ?? buildTitleFromChangeLog(entry);
  const reason = buildReasonFromChangeLog(entry, resolution);

  return buildTimelineItem({
    tripId,
    activityId: entry.logId,
    occurredAt: entry.appliedAt,
    category,
    statusTag,
    title,
    reason,
    problemId: entry.problemId,
    automatic,
    reversible: entry.reversible && entry.status === 'APPLIED',
    applied: entry.status === 'APPLIED',
    rolledBack: entry.status === 'ROLLED_BACK',
  });
}

function toTimelineFromResolution(
  tripId: string,
  resolution: StoredDecisionProblemResolution,
): AiActivityTimelineItem {
  const automatic = resolution.decidedByUserId === DECISION_AUTOMATION_ACTOR_USER_ID;
  const applied = resolution.status === 'APPLIED' || resolution.status === 'VERIFIED';
  const waiting =
    resolution.status === 'PROPOSED' ||
    resolution.status === 'AUTHORIZED' ||
    resolution.status === 'APPLYING';
  const rolledBack = resolution.status === 'ROLLED_BACK';

  let statusTag: AiActivityStatusTag = 'USER_CONFIRMED';
  if (rolledBack) statusTag = 'CANCELLED';
  else if (waiting) statusTag = 'WAITING_CONFIRM';
  else if (automatic && applied) statusTag = 'AUTO_EXECUTED';
  else if (applied) statusTag = 'WRITTEN_BACK';

  const category = resolveCategory(
    resolution.automationMeta?.matchedActionKeys,
    resolution.selectedActionId,
    resolution.semanticKey,
  );
  const title =
    resolution.automationMeta?.actionTitle ?? (automatic ? 'AI 自动处理' : '用户确认修复方案');
  const reason =
    resolution.automationMeta?.changeSummary ?? `已选择方案 ${resolution.selectedActionId}`;

  return buildTimelineItem({
    tripId,
    activityId: resolution.automationMeta?.changeLogId ?? resolution.resolutionId,
    occurredAt: resolution.automationMeta?.appliedAt ?? resolution.decidedAt,
    category,
    statusTag,
    title,
    reason,
    problemId: resolution.problemId,
    automatic,
    reversible: applied && Boolean(resolution.automationMeta?.undoActionId),
    applied,
    rolledBack,
  });
}

function toTimelineFromOpenDecision(
  tripId: string,
  item: ConsumerDecisionItem,
  generatedAt: string,
): AiActivityTimelineItem {
  return buildTimelineItem({
    tripId,
    activityId: `open_${item.problemId}`,
    occurredAt: generatedAt,
    category: 'OTHER',
    statusTag: 'WAITING_CONFIRM',
    title: item.headline,
    reason: item.explanation,
    problemId: item.problemId,
    automatic: false,
    reversible: false,
    applied: false,
    rolledBack: false,
    waiting: true,
  });
}

function buildTimelineItem(input: {
  tripId: string;
  activityId: string;
  occurredAt: string;
  category: AiActivityCategory;
  statusTag: AiActivityStatusTag;
  title: string;
  reason: string;
  problemId?: string;
  automatic: boolean;
  reversible: boolean;
  applied: boolean;
  rolledBack: boolean;
  waiting?: boolean;
}): AiActivityTimelineItem {
  const filterTags = buildFilterTags(input);
  const problemId = input.problemId;

  return {
    activityId: input.activityId,
    eventId: formatEventId(input.occurredAt, input.activityId),
    occurredAt: input.occurredAt,
    category: input.category,
    categoryLabel: CATEGORY_LABELS[input.category],
    filterTags,
    statusTag: input.statusTag,
    statusLabel: STATUS_LABELS[input.statusTag],
    title: input.title,
    reason: input.reason,
    problemId,
    automatic: input.automatic,
    reversible: input.reversible,
    actions: {
      viewEvidence: {
        enabled: Boolean(problemId),
        href: problemId ? `/trips/${input.tripId}/decision-queue/${problemId}` : undefined,
      },
      viewDiff: {
        enabled: input.applied && Boolean(problemId),
        href: problemId ? `/trips/${input.tripId}/ai-activity-log/${input.activityId}` : undefined,
      },
      viewPlan: {
        enabled: input.waiting === true && Boolean(problemId),
        href: problemId ? `/trips/${input.tripId}/decision-queue/${problemId}` : undefined,
      },
    },
    detailHref: `/trips/${input.tripId}/ai-activity-log/${input.activityId}`,
  };
}

function buildFilterTags(input: {
  automatic: boolean;
  applied: boolean;
  rolledBack: boolean;
  waiting?: boolean;
  statusTag: AiActivityStatusTag;
}): AiActivityFilter[] {
  const tags: AiActivityFilter[] = ['ALL'];
  if (input.automatic && input.applied) tags.push('AUTO');
  if (input.waiting || input.statusTag === 'WAITING_CONFIRM') tags.push('WAITING_CONFIRM');
  if (input.applied && !input.rolledBack) tags.push('WRITTEN_BACK');
  if (input.rolledBack || input.statusTag === 'CANCELLED') tags.push('CANCELLED');
  return tags;
}

function resolveCategory(
  matchedActionKeys: string[] | undefined,
  selectedActionId: string | undefined,
  semanticKey: string | undefined,
): AiActivityCategory {
  const blob = `${semanticKey ?? ''} ${selectedActionId ?? ''}`.toLowerCase();
  if (blob.includes('feasib') || blob.includes('revalid') || blob.includes('verify')) {
    return 'VALIDATION';
  }

  const key = matchedActionKeys?.[0];
  const def = key ? getAutomationActionByKey(key) : undefined;
  if (def?.group && def.group in AUTOMATION_ACTION_GROUP_LABELS) {
    return def.group as AiActivityCategory;
  }

  return 'OTHER';
}

function buildTitleFromChangeLog(entry: AutomationChangeLogEntry): string {
  const label = entry.matchedActionKeys
    ?.map((key) => getAutomationActionByKey(key)?.label)
    .find(Boolean);
  return label ?? 'AI 自动调整行程';
}

function buildReasonFromChangeLog(
  entry: AutomationChangeLogEntry,
  resolution: StoredDecisionProblemResolution | undefined,
): string {
  if (entry.changeSummary) return entry.changeSummary;
  if (entry.affectedDayNumbers?.length) {
    return `影响第 ${entry.affectedDayNumbers.join('、')} 天`;
  }
  return resolution?.automationMeta?.changeSummary ?? '根据最新监控结果自动处理';
}

export function formatEventId(occurredAt: string, activityId: string): string {
  const dt = DateTime.fromISO(occurredAt);
  const suffix = activityId.replace(/[^a-zA-Z0-9]/g, '').slice(-4).toUpperCase() || '0000';
  return `EVT-${dt.toFormat('yyyyLLdd')}-${dt.toFormat('HHmm')}-${suffix}`;
}
