import type {
  PlanProposal,
  PlanProposalChange,
} from '../types/plan-proposal.types';

export interface SchemePreviewAnalysisStep {
  id: string;
  title: string;
  completed: boolean;
}

export interface SchemePreviewComparison {
  currentDriving: string;
  optimizedDriving: string;
  currentReadiness?: number;
  optimizedReadiness?: number;
}

export interface SchemePreviewExecutableItem {
  id: string;
  title: string;
  defaultEnabled: boolean;
}

export interface SchemePreviewTimelineItem {
  id: string;
  dayIndex: number;
  time: string;
  title: string;
  status: 'confirmed' | 'planned' | 'insertSlot' | 'conflict';
}

/** iOS AISchedulingSchemeView structured preview (P1). */
export interface SchemePreview {
  analysisSteps: SchemePreviewAnalysisStep[];
  suggestions: string[];
  comparison: SchemePreviewComparison;
  executableItems: SchemePreviewExecutableItem[];
  timelinePreview: SchemePreviewTimelineItem[];
}

export function executableChangeId(change: PlanProposalChange, index: number): string {
  if (change.candidateId) return `cand-${change.candidateId}`;
  if (change.itemId) return `item-${change.itemId}`;
  return `change-${index}`;
}

export function filterChangesByEnabledItemIds(
  changes: PlanProposalChange[],
  enabledItemIds?: string[],
): PlanProposalChange[] {
  if (!enabledItemIds || enabledItemIds.length === 0) {
    return changes;
  }
  const enabled = new Set(enabledItemIds);
  const keptCandidateIds = new Set<string>();
  const keptItemIds = new Set<string>();

  const primary = changes.filter((change, index) => {
    if (change.operation === 'REMOVE_CANDIDATE') return false;
    const id = executableChangeId(change, index);
    if (!enabled.has(id)) return false;
    if (change.candidateId) keptCandidateIds.add(change.candidateId);
    if (change.itemId) keptItemIds.add(change.itemId);
    return true;
  });

  const removes = changes.filter(
    (change) =>
      change.operation === 'REMOVE_CANDIDATE' &&
      change.candidateId != null &&
      keptCandidateIds.has(change.candidateId),
  );

  // Also keep MOVE/UPDATE for explicitly enabled items
  const movers = changes.filter((change, index) => {
    if (change.operation === 'ADD' || change.operation === 'REMOVE_CANDIDATE') {
      return false;
    }
    const id = executableChangeId(change, index);
    if (enabled.has(id)) return true;
    if (change.itemId && keptItemIds.has(change.itemId)) return true;
    return false;
  });

  return [...primary, ...movers, ...removes];
}

export function projectSchemePreview(proposal: PlanProposal): SchemePreview {
  const addChanges = proposal.changes.filter((c) => c.operation === 'ADD');
  const hasConflicts = (proposal.validation.conflicts?.length ?? 0) > 0;
  const blocked = proposal.validation.status === 'BLOCK';

  const analysisSteps: SchemePreviewAnalysisStep[] = [
    {
      id: 'scan_candidates',
      title: '扫描候选与已排行程',
      completed: true,
    },
    {
      id: 'allocate_slots',
      title: '分配日期与时段',
      completed: proposal.changes.length > 0,
    },
    {
      id: 'validate',
      title: '校验冲突与驾驶负荷',
      completed: !blocked,
    },
  ];

  const suggestions = [
    ...(proposal.answer ? [proposal.answer] : []),
    ...proposal.tradeoffs,
    ...proposal.validation.warnings,
    ...(proposal.diff?.summary ? [proposal.diff.summary] : []),
  ]
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s, i, arr) => arr.indexOf(s) === i)
    .slice(0, 5);

  const reduced = proposal.benefits?.drivingTimeReducedMinutes;
  const comparison: SchemePreviewComparison = {
    currentDriving: '—',
    optimizedDriving:
      typeof reduced === 'number' && reduced > 0
        ? `约减 ${Math.round(reduced / 6) / 10}h`
        : typeof reduced === 'number' && reduced < 0
          ? `约增 ${Math.round(Math.abs(reduced) / 6) / 10}h`
          : '待确认后统计',
  };

  const executableItems: SchemePreviewExecutableItem[] = proposal.changes
    .map((change, index) => {
      if (change.operation === 'REMOVE_CANDIDATE') return null;
      const id = executableChangeId(change, index);
      const opLabel =
        change.operation === 'ADD'
          ? '新增'
          : change.operation === 'MOVE'
            ? '调整'
            : change.operation;
      const title =
        change.label != null
          ? `Day ${change.dayIndex} · ${change.label}`
          : `Day ${change.dayIndex} · ${opLabel}`;
      return { id, title, defaultEnabled: true };
    })
    .filter((x): x is SchemePreviewExecutableItem => x != null);

  const timelinePreview: SchemePreviewTimelineItem[] = addChanges.map((change, index) => ({
    id: executableChangeId(change, index),
    dayIndex: change.dayIndex,
    time: change.startTime ?? '—',
    title: change.label ?? '活动',
    status: hasConflicts ? 'conflict' : 'insertSlot',
  }));

  // Fallback timeline from diff when no ADD ops (e.g. optimize_route MOVE-only)
  if (timelinePreview.length === 0 && proposal.diff?.timelineChanges?.length) {
    for (const [index, row] of proposal.diff.timelineChanges.entries()) {
      timelinePreview.push({
        id: `diff-${index}`,
        dayIndex: row.dayIndex,
        time: row.to ?? row.from ?? '—',
        title: row.label,
        status: hasConflicts ? 'conflict' : 'planned',
      });
    }
  }

  return {
    analysisSteps,
    suggestions:
      suggestions.length > 0
        ? suggestions
        : ['预览草案后确认写入，未确认不会改动正式行程'],
    comparison,
    executableItems,
    timelinePreview,
  };
}
