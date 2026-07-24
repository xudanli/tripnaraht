/**
 * ADR-008 Lab — legacy OPTIMIZE_ROUTE vs OR-Tools shadow quality compare.
 * Observational only; never decides authority.
 */

import type { PlanProposalChange } from '../../../trips/arrange-itinerary/types/plan-proposal.types';
import type { SolverProblem } from '../contracts/solver-problem';
import type { DayVrptwItemInput } from '../projection/build-solver-problem-from-day-items.util';

export const ORTOOLS_PLANNING_LAB_COMPARE_SCHEMA_ID =
  'tripnara.ortools_planning_lab_compare@v1' as const;

export interface OrToolsPlanningLabCompareReport {
  schemaId: typeof ORTOOLS_PLANNING_LAB_COMPARE_SCHEMA_ID;
  tripId?: string;
  dayIndex: number;
  authoritativePromotion: false;
  shadowAuthority: false;

  baseOrder: string[];
  legacyOrder: string[];
  shadowOrder: string[];

  /** 0 = identical order; 1 = fully reversed (normalized Kendall / pair disagreement) */
  legacyBaseDisorder: number;
  shadowBaseDisorder: number;
  legacyShadowOrderAgreement: number;

  /** Estimated path travel minutes using SolverProblem matrix when available */
  baseTravelMin?: number;
  legacyTravelMin?: number;
  shadowTravelMin?: number;
  /** legacyTravel - shadowTravel (positive ⇒ shadow cheaper) */
  travelDeltaLegacyMinusShadow?: number;

  legacyChangeCount: number;
  shadowChangeCount: number;
  itemsCompared: number;
  notes: string[];
  generatedAt: string;
}

function orderFromChanges(
  base: string[],
  changes: PlanProposalChange[],
): string[] {
  // Reconstruct tentative order: MOVE list sorted by startTime when present
  const timed = changes
    .filter((c) => c.operation === 'MOVE' && c.itemId && c.startTime)
    .slice()
    .sort((a, b) => String(a.startTime).localeCompare(String(b.startTime)));
  if (timed.length >= 2) {
    const ids = timed.map((c) => c.itemId!);
    const missing = base.filter((id) => !ids.includes(id));
    return [...ids, ...missing];
  }
  // Fallback: reverse heuristic (legacy optimize_route)
  if (changes.length > 0) return [...base].reverse();
  return [...base];
}

/** Fraction of pairwise order disagreements (Kendall tau distance / pairs). */
export function pairwiseDisorder(a: string[], b: string[]): number {
  const common = a.filter((id) => b.includes(id));
  if (common.length < 2) return 0;
  const rankA = new Map(a.map((id, i) => [id, i]));
  const rankB = new Map(b.map((id, i) => [id, i]));
  let disagree = 0;
  let pairs = 0;
  for (let i = 0; i < common.length; i++) {
    for (let j = i + 1; j < common.length; j++) {
      const x = common[i]!;
      const y = common[j]!;
      const sa = (rankA.get(x)! < rankA.get(y)! ? -1 : 1);
      const sb = (rankB.get(x)! < rankB.get(y)! ? -1 : 1);
      pairs += 1;
      if (sa !== sb) disagree += 1;
    }
  }
  return pairs === 0 ? 0 : disagree / pairs;
}

export function pathTravelMinutes(
  problem: SolverProblem,
  orderWithoutDepot: string[],
): number | undefined {
  const ids = problem.travelMatrix.nodeIds;
  const costs = problem.travelMatrix.costsMin;
  if (!ids.length || !costs.length) return undefined;
  const index = new Map(ids.map((id, i) => [id, i]));
  const path = ['depot', ...orderWithoutDepot].filter((id) => index.has(id));
  if (path.length < 2) return undefined;
  let total = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const a = index.get(path[i]!)!;
    const b = index.get(path[i + 1]!)!;
    total += costs[a]?.[b] ?? 0;
  }
  return total;
}

export function buildOrToolsPlanningLabCompare(input: {
  dayIndex: number;
  items: DayVrptwItemInput[];
  legacyChanges: PlanProposalChange[];
  shadowChanges: PlanProposalChange[];
  /** Preferred: solver day order when available */
  shadowNodeOrder?: string[];
  problem?: SolverProblem | null;
  tripId?: string;
}): OrToolsPlanningLabCompareReport {
  const baseOrder = input.items.map((i) => i.itemId);
  const legacyOrder = orderFromChanges(baseOrder, input.legacyChanges);
  const shadowOrder =
    input.shadowNodeOrder?.filter((id) => id !== 'depot') ??
    orderFromChanges(baseOrder, input.shadowChanges);

  const notes: string[] = [
    'observational compare only — does not promote OR-Tools authority',
  ];

  const baseTravel =
    input.problem != null ? pathTravelMinutes(input.problem, baseOrder) : undefined;
  const legacyTravel =
    input.problem != null
      ? pathTravelMinutes(input.problem, legacyOrder)
      : undefined;
  const shadowTravel =
    input.problem != null
      ? pathTravelMinutes(input.problem, shadowOrder)
      : undefined;

  let travelDelta: number | undefined;
  if (legacyTravel != null && shadowTravel != null) {
    travelDelta = legacyTravel - shadowTravel;
    if (travelDelta > 0) {
      notes.push(`shadow path ${travelDelta}min shorter than legacy (matrix estimate)`);
    } else if (travelDelta < 0) {
      notes.push(`legacy path ${-travelDelta}min shorter than shadow (matrix estimate)`);
    } else {
      notes.push('legacy and shadow path travel equal (matrix estimate)');
    }
  }

  const legacyBaseDisorder = pairwiseDisorder(baseOrder, legacyOrder);
  const shadowBaseDisorder = pairwiseDisorder(baseOrder, shadowOrder);
  const agreement = 1 - pairwiseDisorder(legacyOrder, shadowOrder);

  return {
    schemaId: ORTOOLS_PLANNING_LAB_COMPARE_SCHEMA_ID,
    tripId: input.tripId,
    dayIndex: input.dayIndex,
    authoritativePromotion: false,
    shadowAuthority: false,
    baseOrder,
    legacyOrder,
    shadowOrder,
    legacyBaseDisorder: round4(legacyBaseDisorder),
    shadowBaseDisorder: round4(shadowBaseDisorder),
    legacyShadowOrderAgreement: round4(agreement),
    baseTravelMin: baseTravel,
    legacyTravelMin: legacyTravel,
    shadowTravelMin: shadowTravel,
    travelDeltaLegacyMinusShadow: travelDelta,
    legacyChangeCount: input.legacyChanges.length,
    shadowChangeCount: input.shadowChanges.length,
    itemsCompared: baseOrder.length,
    notes,
    generatedAt: new Date().toISOString(),
  };
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/** One-line tradeoff for PlanProposal (observational; does not alter changes). */
export function formatOrtToolsPlanningLabTradeoff(
  compare?: OrToolsPlanningLabCompareReport | null,
): string | undefined {
  if (!compare) return undefined;
  const delta = compare.travelDeltaLegacyMinusShadow;
  const agreePct = Math.round(compare.legacyShadowOrderAgreement * 100);
  if (typeof delta === 'number' && delta !== 0) {
    const who = delta > 0 ? 'OR-Tools shadow' : 'legacy';
    return `[ortools-lab] ${who} path ~${Math.abs(delta)}min shorter (matrix); order agreement ${agreePct}% — observational only`;
  }
  return `[ortools-lab] legacy vs shadow order agreement ${agreePct}% — observational only`;
}
