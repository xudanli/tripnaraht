/**
 * EXCESSIVE_DAILY_LOAD problem helpers — day index + dedup for Decision Center queue.
 */

import type { Rfc001DecisionProblem } from '../contracts/decision-problem.types';
import type { Rfc001DecisionCenterProblemView } from '../adapters/decision-center-bridge.adapter';

const TERMINAL_STATUSES = new Set(['RESOLVED', 'FAILED']);

/** Plan / route segment day index (0-based). Used for dedupe + pipeline matching. */
export function resolveExcessiveDailyLoadPlanDayIndex(
  problem: Pick<Rfc001DecisionProblem, 'semanticCapability' | 'type' | 'affectedEntityRefs' | 'triggerEventId'>,
): number | undefined {
  return resolveExcessiveDailyLoadDayIndex(problem);
}

/** 1-based trip day for titles, impactScopeView, and FE copy (aligned with ItineraryItem TripDay order). */
export function toTripDisplayDayIndex(planDayIndex: number): number {
  return planDayIndex + 1;
}

export function resolveExcessiveDailyLoadDisplayDayIndex(
  problem: Pick<Rfc001DecisionProblem, 'semanticCapability' | 'type' | 'affectedEntityRefs' | 'triggerEventId'>,
): number | undefined {
  const planDay = resolveExcessiveDailyLoadDayIndex(problem);
  return planDay != null ? toTripDisplayDayIndex(planDay) : undefined;
}

export function resolveExcessiveDailyLoadDayIndex(
  problem: Pick<Rfc001DecisionProblem, 'semanticCapability' | 'type' | 'affectedEntityRefs' | 'triggerEventId'>,
): number | undefined {
  if (
    problem.semanticCapability !== 'EXCESSIVE_DAILY_LOAD' &&
    problem.type !== 'EXCESSIVE_LOAD'
  ) {
    return undefined;
  }

  const dayRef = problem.affectedEntityRefs.find((r) => r.kind === 'DAY');
  if (dayRef?.id) {
    const fromId = dayRef.id.match(/day[_-]?(\d+)/i);
    if (fromId) return parseInt(fromId[1], 10);
  }

  for (const ref of problem.affectedEntityRefs) {
    const m = String(ref.label ?? ref.id ?? '').match(/day(\d+)/i);
    if (m) return parseInt(m[1], 10);
  }

  const fromEvent = problem.triggerEventId.match(/(?:load_day_|_d(\d+)_|day[_-](\d+))/i);
  if (fromEvent) {
    const n = fromEvent[1] ?? fromEvent[2];
    if (n) return parseInt(n, 10);
  }

  return undefined;
}

function loadProblemRank(view: Rfc001DecisionCenterProblemView): number {
  const status = view.rfc001Problem.status;
  if (TERMINAL_STATUSES.has(status)) return 0;
  const recordStatus = view.record?.recordStatus;
  if (recordStatus === 'PROPOSED' || recordStatus === 'AUTHORIZED') return 4;
  if (status === 'DECIDED' || status === 'WAITING_HUMAN' || status === 'EXECUTING') return 3;
  if (view.workspace) return 2;
  if (status === 'OPEN' || status === 'EVALUATING') return 1;
  return 0;
}

/** Keep one load problem per trip day for Decision Center list. */
export function dedupeExcessiveDailyLoadProblemViews(
  views: Rfc001DecisionCenterProblemView[],
): Rfc001DecisionCenterProblemView[] {
  const byDay = new Map<number, Rfc001DecisionCenterProblemView>();
  const others: Rfc001DecisionCenterProblemView[] = [];

  for (const view of views) {
    const day = resolveExcessiveDailyLoadDayIndex(view.rfc001Problem);
    if (day == null) {
      others.push(view);
      continue;
    }
    const existing = byDay.get(day);
    if (!existing || preferLoadProblemView(view, existing)) {
      byDay.set(day, view);
    }
  }

  return [...others, ...byDay.values()];
}

function preferLoadProblemView(
  candidate: Rfc001DecisionCenterProblemView,
  incumbent: Rfc001DecisionCenterProblemView,
): boolean {
  const rc = loadProblemRank(candidate);
  const ri = loadProblemRank(incumbent);
  if (rc !== ri) return rc > ri;
  return candidate.rfc001Problem.detectedAt.localeCompare(incumbent.rfc001Problem.detectedAt) > 0;
}

export function isExcessiveDailyLoadProblemInProgress(problem: Rfc001DecisionProblem): boolean {
  return ['DECIDED', 'EXECUTING', 'WAITING_HUMAN'].includes(problem.status);
}
