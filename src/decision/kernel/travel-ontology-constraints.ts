/**
 * 旅行本体 → 约束违规（GATE_EVAL 补充）
 *
 * 在 GateEvalExecutor 产出之后由 DecisionKernel 合并，避免重复门控哲学。
 */

import type { ConstraintViolationItem, DecisionState } from './decision-state.types';

function parseTs(s: string | undefined): number | null {
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : null;
}

function estimateNights(checkIn?: string, checkOut?: string): number {
  const a = parseTs(checkIn);
  const b = parseTs(checkOut);
  if (a == null || b == null || b <= a) return 1;
  return Math.max(1, Math.round((b - a) / (86400 * 1000)));
}

function sumOntologySpend(nouns: NonNullable<NonNullable<DecisionState['travelOntologyState']>['nouns']>): number {
  let sum = 0;
  for (const f of nouns.flights ?? []) {
    sum += f.price ?? 0;
  }
  for (const h of nouns.hotels ?? []) {
    const nights = estimateNights(h.checkIn, h.checkOut);
    sum += (h.nightlyPrice ?? 0) * nights;
  }
  for (const a of nouns.activities ?? []) {
    sum += a.price ?? 0;
  }
  for (const t of nouns.transportation ?? []) {
    sum += t.costEstimate ?? 0;
  }
  return sum;
}

function budgetCapFromDso(dso: DecisionState): number | undefined {
  if (typeof dso.userIntent?.budget === 'number' && dso.userIntent.budget > 0) {
    return dso.userIntent.budget;
  }
  const c = dso.userIntent?.constraints as Record<string, unknown> | undefined;
  const b = c?.budget as { total?: number } | undefined;
  if (typeof b?.total === 'number' && b.total > 0) return b.total;
  return undefined;
}

/**
 * 基于 DSO.travelOntologyState 与 userIntent 的轻量约束（预算、时间一致性）。
 * 无本体数据时返回空数组。
 */
export function evaluateTravelOntologyConstraints(dso: DecisionState): ConstraintViolationItem[] {
  const out: ConstraintViolationItem[] = [];
  const nouns = dso.travelOntologyState?.nouns;
  if (!nouns || Object.keys(nouns).length === 0) {
    return out;
  }

  const cap = budgetCapFromDso(dso);
  if (cap != null) {
    const spend = sumOntologySpend(nouns);
    if (spend > cap) {
      const overrun = (spend - cap) / cap;
      out.push({
        type: 'BUDGET',
        severity: 'SOFT',
        detail: `Ontology-estimated spend ${Math.round(spend)} exceeds budget cap ${Math.round(cap)}.`,
        constraint: 'travel_ontology_budget',
        degree: Math.min(1, Math.max(0, overrun)),
      });
    }
  }

  const flights = [...(nouns.flights ?? [])].filter((f) => f.departureTime && f.arrivalTime);
  for (const f of flights) {
    const dep = parseTs(f.departureTime);
    const arr = parseTs(f.arrivalTime);
    if (dep != null && arr != null && arr <= dep) {
      out.push({
        type: 'TIME_CONFLICT',
        severity: 'SOFT',
        detail: `Flight ${f.flightNo ?? f.id} has arrival not after departure.`,
        constraint: 'travel_ontology_flight_window',
        degree: 0.6,
      });
    }
  }

  flights.sort((a, b) => (parseTs(a.departureTime) ?? 0) - (parseTs(b.departureTime) ?? 0));
  for (let i = 1; i < flights.length; i++) {
    const prev = flights[i - 1];
    const cur = flights[i];
    const prevEnd = parseTs(prev.arrivalTime);
    const curStart = parseTs(cur.departureTime);
    if (prevEnd != null && curStart != null && curStart < prevEnd) {
      out.push({
        type: 'TIME_CONFLICT',
        severity: 'SOFT',
        detail: 'Overlapping or out-of-order flight intervals in travel ontology.',
        constraint: 'travel_ontology_flight_overlap',
        degree: 0.5,
      });
      break;
    }
  }

  for (const h of nouns.hotels ?? []) {
    const inT = parseTs(h.checkIn);
    const outT = parseTs(h.checkOut);
    if (inT != null && outT != null && outT <= inT) {
      out.push({
        type: 'TIME_CONFLICT',
        severity: 'SOFT',
        detail: `Hotel ${h.name ?? h.id} check-out must be after check-in.`,
        constraint: 'travel_ontology_hotel_dates',
        degree: 0.4,
      });
    }
  }

  return out;
}

export function mergeOntologyViolationsIntoGateResult(
  constraints: import('./decision-state.types').ConstraintReport,
  gateResult: import('./interfaces/phase-executor.interface').GateResultLike,
  ontologyViolations: ConstraintViolationItem[],
): {
  constraints: import('./decision-state.types').ConstraintReport;
  gateResult: import('./interfaces/phase-executor.interface').GateResultLike;
} {
  if (!ontologyViolations.length) {
    return { constraints, gateResult };
  }

  const mergedViolations = [...(constraints.violations ?? []), ...ontologyViolations];
  const ontologyHard = ontologyViolations.some((v) => v.severity === 'HARD');
  const feasible = constraints.feasible !== false && !ontologyHard;

  let gate_result = gateResult.gate_result;
  if (ontologyHard) {
    gate_result = 'BLOCK';
  } else if (
    ontologyViolations.some((v) => v.severity === 'SOFT') &&
    gate_result === 'ALLOW'
  ) {
    gate_result = 'ADJUST_REQUIRED';
  }

  const gViolations = [
    ...gateResult.violations,
    ...ontologyViolations.map((v) => ({
      type: v.type,
      severity: v.severity,
      detail: v.detail,
    })),
  ];

  return {
    constraints: {
      ...constraints,
      feasible,
      violations: mergedViolations,
    },
    gateResult: {
      ...gateResult,
      gate_result,
      violations: gViolations,
    },
  };
}
