import { DECISION_AUTOMATION_ACTOR_USER_ID } from '../../../decision-runtime/monitoring/decision-automation-chain.service';
import {
  readAutomationChangeLog,
  type AutomationChangeLogEntry,
} from '../../../decision-runtime/monitoring/automation-change-log.store.util';
import type { StoredDecisionProblemResolution } from '../../../decision-runtime/gateway/persistence/decision-problem-resolution.store';
import type { AiActivityRecordItem } from '../types/travel-status.types';

export function projectAiCompletedWorkItems(input: {
  resolutions: Record<string, StoredDecisionProblemResolution>;
  tripMetadata?: unknown;
}): { recentCount: number; items: AiActivityRecordItem[] } {
  const logItems = projectAutomationChangeLogItems(input.tripMetadata);
  const resolutionItems = Object.values(input.resolutions)
    .filter((resolution) => !logItems.some((item) => item.problemId === resolution.problemId))
    .map((resolution) => toAiActivityRecordItem(resolution));

  const items = [...logItems, ...resolutionItems]
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
    .slice(0, 10);

  return { recentCount: items.length, items };
}

function projectAutomationChangeLogItems(metadata: unknown | undefined): AiActivityRecordItem[] {
  return readAutomationChangeLog(metadata).map((entry) => toAiActivityRecordFromLog(entry));
}

function toAiActivityRecordFromLog(entry: AutomationChangeLogEntry): AiActivityRecordItem {
  return {
    activityId: entry.logId,
    occurredAt: entry.appliedAt,
    summary: entry.changeSummary,
    changeSummary: entry.changeSummary,
    kind: entry.automatic ? 'AUTO_REPAIR' : 'DECISION_APPLIED',
    problemId: entry.problemId,
    automatic: entry.automatic,
    reversible: entry.reversible && entry.status === 'APPLIED',
    undo: {
      enabled: entry.reversible && entry.status === 'APPLIED' && Boolean(entry.undoActionId),
      logId: entry.logId,
      undoActionId: entry.undoActionId,
    },
    status: entry.status,
  };
}

function toAiActivityRecordItem(
  resolution: StoredDecisionProblemResolution,
): AiActivityRecordItem {
  const automatic = resolution.decidedByUserId === DECISION_AUTOMATION_ACTOR_USER_ID;
  const applied = resolution.status === 'APPLIED' || resolution.status === 'VERIFIED';
  const changeSummary = resolution.automationMeta?.changeSummary;

  return {
    activityId: resolution.resolutionId,
    occurredAt: resolution.decidedAt,
    summary:
      changeSummary ??
      (automatic
        ? `已自动处理（${resolution.selectedActionId}）`
        : `已选择修复方案（${resolution.selectedActionId}）`),
    changeSummary,
    kind: automatic && applied ? 'AUTO_REPAIR' : mapResolutionStatusToActivityKind(resolution.status),
    problemId: resolution.problemId,
    automatic,
    reversible: applied && Boolean(resolution.automationMeta?.undoActionId),
    undo: {
      enabled:
        automatic &&
        applied &&
        Boolean(resolution.automationMeta?.undoActionId ?? resolution.automationMeta?.changeLogId),
      logId: resolution.automationMeta?.changeLogId,
      undoActionId: resolution.automationMeta?.undoActionId,
    },
    status: resolution.status === 'ROLLED_BACK' ? 'ROLLED_BACK' : applied ? 'APPLIED' : undefined,
  };
}

function mapResolutionStatusToActivityKind(
  status: StoredDecisionProblemResolution['status'],
): AiActivityRecordItem['kind'] {
  if (status === 'APPLIED' || status === 'VERIFIED') return 'DECISION_APPLIED';
  if (status === 'AUTHORIZED' || status === 'APPLYING') return 'DECISION_SUBMITTED';
  return 'DECISION_SUBMITTED';
}
