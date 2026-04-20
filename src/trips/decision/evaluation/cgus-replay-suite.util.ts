import { itineraryToRoutePlanDraft } from '../../../decision/kernel/dso-to-trips-converter';
import { NeighborhoodOperators } from '../optimization/neighborhood/neighborhood-operators';
import { RepairOperators } from '../optimization/neighborhood/repair-operators';
import { PlanFeaturesService } from '../optimization/plan-features/plan-features.service';
import type { DecisionState } from '../../../decision/kernel/decision-state.types';
import type { CGUSCandidate } from '../optimization/cgus-search.service';

export type CgusLiteCandidate = CGUSCandidate & {
  diversitySignature: string;
  violationDetails?: Array<{ type: string; severity: 'HARD' | 'SOFT'; degree: number; detail: string; details?: any }>;
  summary?: string;
};

/**
 * Build lite-mode CGUS candidates from a DSO fixture.
 *
 * Semantics:
 * - If the case injects HARD violations, base/variant candidates are considered infeasible (production-like).
 * - Repair candidates are considered feasible and should not carry the injected HARD violations.
 * - Repairs are ordered first when HARD violations exist, so the top-N pool isn't filled with infeasible variants.
 */
export function buildLiteCandidates(input: {
  dso: DecisionState;
  maxCandidates: number;
  planFeatures: PlanFeaturesService;
}): CgusLiteCandidate[] {
  const ops = new NeighborhoodOperators();
  const repairOps = new RepairOperators();

  const planDraft = (input.dso.tripState?.planDraft ?? {}) as any;
  const routeDirectionId = (input.dso.environmentState as any)?.routeDirectionId ?? 'unknown';
  const tripId = input.dso.systemState?.requestId ?? input.dso.requestId ?? 'unknown';
  const basePlan = itineraryToRoutePlanDraft(planDraft, tripId, routeDirectionId);

  const injected = ((input.dso.constraints as any)?.violations ?? []) as Array<any>;
  const hardCodes = injected.filter((v) => v.severity === 'HARD').map((v) => v.type);
  const violationDetails = injected.map((v) => ({
    type: v.type,
    severity: v.severity,
    degree: v.degree ?? 1,
    detail: v.detail ?? '',
    details: v.details,
  }));

  const variants = ops.generateAll(basePlan);
  const repairs = hardCodes.length ? repairOps.repairForViolationCodes(basePlan, hardCodes, violationDetails as any) : [];

  const pool =
    hardCodes.length > 0
      ? [
          ...repairs.map((r) => ({ id: `repair-${r.id}`, plan: r.plan, summary: r.summary })),
          { id: 'base', plan: basePlan, summary: 'base' },
          ...variants.map((v) => ({ id: `op-${v.id}`, plan: v.plan, summary: v.summary })),
        ]
      : [
          { id: 'base', plan: basePlan, summary: 'base' },
          ...variants.map((v) => ({ id: `op-${v.id}`, plan: v.plan, summary: v.summary })),
          ...repairs.map((r) => ({ id: `repair-${r.id}`, plan: r.plan, summary: r.summary })),
        ];

  const seen = new Set<string>();
  const out: CgusLiteCandidate[] = [];
  for (const p of pool) {
    const sig = input.planFeatures.extract(p.plan).diversitySignature;
    if (seen.has(sig)) continue;
    seen.add(sig);

    const isRepair = p.id.startsWith('repair-');
    const feasible = hardCodes.length === 0 ? true : isRepair;

    out.push({
      id: `plan-${p.id}`,
      plan: p.plan,
      feasible,
      constraintViolations: feasible ? [] : hardCodes.map((type) => ({ type, severity: 'HARD' as const, degree: 1 })),
      diversitySignature: sig,
      violationDetails,
      summary: p.summary,
    });
    if (out.length >= Math.max(1, input.maxCandidates)) break;
  }

  return out;
}

