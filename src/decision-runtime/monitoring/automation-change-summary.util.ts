/**
 * Consumer-facing change summary for automatic plan mutations.
 */

export interface AutomationChangeSummaryInput {
  actionTitle?: string;
  actionSummary?: string;
  affectedDayNumbers?: number[];
  itemsChanged?: number;
  matchedActionLabels?: string[];
}

export function buildAutomationChangeSummary(input: AutomationChangeSummaryInput): string {
  const itemsChanged = input.itemsChanged ?? 1;
  const dayPart = formatAffectedDays(input.affectedDayNumbers);
  const subject = input.actionTitle ?? input.matchedActionLabels?.[0] ?? '行程';

  if (dayPart) {
    return `已根据${subject}调整${dayPart}，共修改 ${itemsChanged} 项，可撤销`;
  }

  if (input.actionSummary?.trim()) {
    return `${input.actionSummary.trim()}（共 ${itemsChanged} 项，可撤销）`;
  }

  return `已自动处理：${subject}（共 ${itemsChanged} 项，可撤销）`;
}

function formatAffectedDays(days?: number[]): string {
  if (!days?.length) return '';
  const sorted = [...days].sort((a, b) => a - b);
  if (sorted.length === 1) return `第 ${sorted[0]} 天`;
  return `第 ${sorted.join('、')} 天`;
}

export function estimateItemsChangedFromAction(input: {
  title?: string;
  summary?: string;
}): number {
  const blob = `${input.title ?? ''} ${input.summary ?? ''}`.toLowerCase();
  const match = blob.match(/(\d+)\s*(项|个|处)/);
  if (match) return Number(match[1]);
  return 1;
}

export function resolveUndoActionId(input: {
  undoActionId?: string;
  availableActionIds?: string[];
}): string | undefined {
  if (input.undoActionId) return input.undoActionId;
  const ids = input.availableActionIds ?? [];
  if (ids.includes('original')) return 'original';
  const keep = ids.find((id) => /original|keep|unchanged/i.test(id));
  return keep;
}
