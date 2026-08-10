/**
 * 进程内决策问题暂存 + metadata 水合。
 */

import type { TravelDecisionProblem } from './travel-decision.types';
import { readOpenTravelDecisionProblems } from './persist-travel-decision-commit.util';

const store = new Map<string, TravelDecisionProblem>();

export function putTravelDecisionProblem(problem: TravelDecisionProblem): void {
  store.set(problem.decisionId, problem);
}

export function getTravelDecisionProblem(decisionId: string): TravelDecisionProblem | undefined {
  return store.get(decisionId);
}

export function findOpenDecisionForTrip(
  tripId: string,
  decisionKey?: string,
): TravelDecisionProblem | undefined {
  const tid = tripId.trim();
  for (const p of store.values()) {
    if (p.tripId !== tid) continue;
    if (decisionKey && p.decisionKey !== decisionKey) continue;
    if (p.state === 'COMMITTED' || p.state === 'CANCELLED' || p.state === 'SUPERSEDED') continue;
    return p;
  }
  return undefined;
}

/**
 * 从 trip.metadata.travelDecisionOpenProblems 水合到内存（幂等）。
 */
export function hydrateTravelDecisionStoreFromMetadata(
  tripId: string,
  metadata: unknown,
): number {
  const open = readOpenTravelDecisionProblems(metadata);
  let n = 0;
  for (const p of open) {
    if (p.tripId && p.tripId !== tripId) continue;
    if (!p.decisionId) continue;
    if (!store.has(p.decisionId)) {
      store.set(p.decisionId, { ...p, tripId: p.tripId || tripId });
      n += 1;
    }
  }
  return n;
}

export function commitTravelDecisionSelection(params: {
  decisionId: string;
  optionId: string;
  selectedBy?: string;
}):
  | { ok: true; problem: TravelDecisionProblem }
  | { ok: false; reason: string } {
  const problem = store.get(params.decisionId);
  if (!problem) return { ok: false, reason: 'decision_not_found' };
  if (problem.state === 'COMMITTED') {
    if (problem.selection?.optionId === params.optionId) {
      return { ok: true, problem };
    }
    return { ok: false, reason: 'already_committed_other_option' };
  }
  const opt = problem.options.find((o) => o.optionId === params.optionId);
  if (!opt) return { ok: false, reason: 'option_not_found' };
  if (opt.feasibility === 'BLOCKED') return { ok: false, reason: 'option_blocked' };

  const next: TravelDecisionProblem = {
    ...problem,
    state: 'COMMITTED',
    selection: {
      optionId: params.optionId,
      selectedBy: params.selectedBy,
      selectedAt: new Date().toISOString(),
    },
  };
  store.set(params.decisionId, next);
  return { ok: true, problem: next };
}

/** 测试用 */
export function clearTravelDecisionStoreForTests(): void {
  store.clear();
}
