import type { PlanState } from '../../skills/plan/shared/plan-state.types';

export interface PlanGatePreTripTask {
  id: string;
  title: string;
  category: 'booking' | 'evidence' | 'packing' | 'compliance' | 'suggestion' | 'risk_ack' | 'checklist';
  priority: 'high' | 'medium' | 'low';
  source: string;
  day?: number;
}

export interface PlanGatePreTripTasksSummary {
  total: number;
  highPriority: number;
  tasks: PlanGatePreTripTask[];
}

export interface TripPreTripTaskCounts {
  uncheckedPackingItems: number;
  uncheckedCapabilityPackItems: number;
  openSuggestions: number;
}

export function buildPreTripTasksFromPlanState(planState: PlanState): PlanGatePreTripTask[] {
  const tasks: PlanGatePreTripTask[] = [];

  for (const missing of planState.gate?.missingEvidence ?? []) {
    tasks.push({
      id: `evidence_${tasks.length}`,
      title: `补充证据：${missing}`,
      category: 'evidence',
      priority: 'high',
      source: 'gate.missingEvidence',
    });
  }

  for (const reason of planState.gate?.reasons ?? []) {
    const text = String(reason);
    if (text.includes('预订') || text.includes('booking')) {
      tasks.push({
        id: `booking_${tasks.length}`,
        title: text,
        category: 'booking',
        priority: 'high',
        source: 'gate.reasons',
      });
    }
  }

  for (const conf of planState.gate?.requiredUserConfirmations ?? []) {
    tasks.push({
      id: `risk_ack_${tasks.length}`,
      title: `确认风险：${conf}`,
      category: 'risk_ack',
      priority: 'medium',
      source: 'gate.requiredUserConfirmations',
    });
  }

  for (const segment of planState.itinerary?.segments ?? []) {
    const day = segment.metadata?.day as number | undefined;
    const acc = segment.metadata?.accommodation as { nameCN?: string; bookingRequired?: boolean } | undefined;
    if (acc && acc.bookingRequired !== false && !acc.nameCN?.includes('已订')) {
      tasks.push({
        id: `acc_booking_day_${day ?? segment.dayIndex}`,
        title: `确认第 ${day ?? segment.dayIndex + 1} 天住宿预订`,
        category: 'booking',
        priority: 'high',
        source: 'segment.accommodation',
        day,
      });
    }
  }

  if (planState.budget.overrun?.overrunAmount) {
    tasks.push({
      id: 'budget_review',
      title: '复核预算超支并确认支付方式',
      category: 'compliance',
      priority: 'medium',
      source: 'budget.overrun',
    });
  }

  return dedupeTasks(tasks);
}

function dedupeTasks(tasks: PlanGatePreTripTask[]): PlanGatePreTripTask[] {
  const seen = new Set<string>();
  const out: PlanGatePreTripTask[] = [];
  for (const t of tasks) {
    const key = `${t.category}:${t.title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

export function mergePreTripTasksSummary(
  planTasks: PlanGatePreTripTask[],
  tripCounts?: TripPreTripTaskCounts,
): PlanGatePreTripTasksSummary {
  const extra: PlanGatePreTripTask[] = [];

  if (tripCounts?.uncheckedPackingItems) {
    extra.push({
      id: 'packing_open',
      title: `完成 ${tripCounts.uncheckedPackingItems} 项打包清单`,
      category: 'packing',
      priority: 'medium',
      source: 'trip.packingList',
    });
  }

  if (tripCounts?.uncheckedCapabilityPackItems) {
    extra.push({
      id: 'capability_pack_open',
      title: `完成 ${tripCounts.uncheckedCapabilityPackItems} 项能力包检查`,
      category: 'checklist',
      priority: 'medium',
      source: 'trip.capabilityPack',
    });
  }

  if (tripCounts?.openSuggestions) {
    extra.push({
      id: 'suggestions_open',
      title: `处理 ${tripCounts.openSuggestions} 条待办建议`,
      category: 'suggestion',
      priority: 'low',
      source: 'trip.suggestions',
    });
  }

  const tasks = dedupeTasks([...planTasks, ...extra]);
  const highPriority = tasks.filter((t) => t.priority === 'high').length;

  return {
    total: tasks.length,
    highPriority,
    tasks: tasks.slice(0, 20),
  };
}

export function countPreTripTasks(summary: PlanGatePreTripTasksSummary): number {
  return summary.total;
}
