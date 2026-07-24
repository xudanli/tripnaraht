const GENERIC_SUB_TASK_TITLES = new Set([
  '团队确认决策结果',
  '确认团队接受备选路线',
  '检查受影响预订',
  '查找替代住宿',
  '确认原预订取消政策',
]);

const GENERIC_SHORT_LABELS: Record<string, string> = {
  团队确认决策结果: '团队确认',
};

/** BFF list title — prefix decision problem context for templated follow-ups. */
export function composeCollaborativeSubTaskDisplayTitle(
  subTaskTitle: string,
  problemTitle?: string,
): string {
  const sub = subTaskTitle.trim();
  const problem = problemTitle?.trim();
  if (!problem) return sub;
  if (sub.includes(problem)) return sub;

  if (GENERIC_SUB_TASK_TITLES.has(sub)) {
    const short = GENERIC_SHORT_LABELS[sub] ?? sub;
    return `${problem} · ${short}`;
  }

  return `${problem} · ${sub}`;
}

export function composeCollaborativeSubTaskDisplayDescription(
  subTaskDescription: string | undefined,
  problemTitle?: string,
  fallbackDescription?: string,
): string {
  const base = subTaskDescription?.trim() || fallbackDescription?.trim() || '';
  if (base) return base;
  const problem = problemTitle?.trim();
  if (problem) return `跟进决策：${problem}`;
  return '';
}
