import type { RepairTrace, SimulatedRepairTrace } from '../services/route-feasibility.types';
import { CONSTRAINT_IDS } from '../services/constraint-registry';
import { buildAxiomMatchContext } from '../axioms/build-axiom-match-context.util';
import { buildL3ProofPrefixFromMatch } from '../axioms/axiom-l3-proof.util';
import { matchAxioms } from '../axioms/axiom-matchers';
import { AXIOM_REGISTRY } from '../axioms/axiom-registry';

function round(n: number, digits: number): number {
  const p = Math.pow(10, digits);
  return Math.round(n * p) / p;
}

/** Piecewise w(f) aligned with RepairExecutorService (deadzone + redline). */
export function deriveFatigueWeightPiecewise(fatigue01: number): number {
  const f = Math.max(0, Math.min(1, fatigue01));
  if (f < 0.3) return 1;
  if (f >= 0.8) return 0;
  return Math.max(0, Math.min(1, (0.8 - f) / 0.5));
}

/**
 * 与 RepairExecutor 中 `time_space.max_driving_hours` 债口径（-0.85×小时超额）及 bool/fallback（-12）对齐。
 * 用于 INTAKE 仿真静默 `estimated_utility_delta` / `metrics.utility_delta`。
 */
export function estimateUtilityDeltaForSimulatedTrace(trace: Pick<RepairTrace, 'metrics' | 'reason'>): number {
  const m = trace.metrics;
  const unit = String(m?.unit ?? '');
  if (unit === 'h') {
    const actual = Number(m?.actual_cost);
    const limit = Number(m?.effective_limit ?? m?.base_limit);
    if (Number.isFinite(actual) && Number.isFinite(limit)) {
      const debtH = Math.max(0, actual - limit);
      return round(-0.85 * debtH, 3);
    }
  }
  // Utility convergence anchor (LogicOps): keep terrain F-road mismatch on a stable constant.
  // This enables delta_utility→0 when paired with audit-side real injection.
  if (trace.reason === 'TERRAIN_F_ROAD_UNFIT' && unit === 'bool') {
    return AXIOM_REGISTRY.TERRAIN_F_ROAD_UNFIT.utility_anchor.expected_penalty;
  }
  if (trace.reason === 'HISTORICAL_BOUNDARY_HIT' && unit === 'bool') {
    return -12;
  }
  return -12;
}

export function buildHistoricalBoundarySimulations(input: {
  tripPlanRequest: { message?: string; destination?: unknown; days?: number; party?: any; constraints?: any };
  detectRingRoadIntent: (t: unknown) => boolean;
  /** Session-scoped real repair traces (e.g. DSO.systemState.repairTraceHistory) for UserDynamicBoundary. */
  sessionRepairTraces?: Array<Pick<RepairTrace, 'reason'>>;
}): SimulatedRepairTrace[] {
  const traces: SimulatedRepairTrace[] = [];
  const t = input.tripPlanRequest;
  const msgRaw = String((t as any)?.message ?? '').trim();

  const session = input.sessionRepairTraces ?? [];
  const fatigueExCount = session.filter((x) => x?.reason === 'FATIGUE_EXHAUSTION').length;
  if (fatigueExCount >= 2) {
    const days = typeof (t as any)?.days === 'number' ? (t as any).days : undefined;
    const ring = input.detectRingRoadIntent(t);
    let avgDailyH = 0;
    if (ring && typeof days === 'number' && Number.isFinite(days) && days > 0) {
      avgDailyH = 1332 / days / 70;
    }
    const f = 0.85;
    const w = deriveFatigueWeightPiecewise(f);
    const metrics = {
      fatigue_score01: f,
      fatigue_weight: w,
      base_limit: 5,
      effective_limit: 5,
      actual_cost: round(avgDailyH, 2),
      unit: 'h' as const,
    };
    const est = estimateUtilityDeltaForSimulatedTrace({ metrics, reason: 'FATIGUE_EXHAUSTION' });
    traces.push({
      tacticId: 'UserDynamicBoundary',
      targetEntity: { type: 'DAY', id: 'SESSION' },
      applied: false,
      reason: 'FATIGUE_EXHAUSTION',
      metrics: { ...metrics, utility_delta: est },
      estimated_utility_delta: est,
      simulation: { kind: 'HISTORICAL_BOUNDARY', boundary_id: 'user_dynamic_fatigue_session' },
      evidence: { refIds: ['SESSION_HISTORY:FATIGUE_EXHAUSTION_COUNT_2'] },
    });
  }
  const msg = msgRaw.toLowerCase();
  const days = typeof (t as any)?.days === 'number' ? (t as any).days : undefined;
  const party = (t as any)?.party;
  const hasElderly = Boolean(party?.has_elderly);
  const hasKids = Boolean(party?.has_children ?? party?.has_kids);

  const ring = input.detectRingRoadIntent(t);
  if (ring && typeof days === 'number' && Number.isFinite(days) && days > 0 && (hasElderly || hasKids)) {
    const ringRoadKm = 1332;
    const avgSpeedKmh = 70;
    const requiredHoursPerDay = ringRoadKm / days / avgSpeedKmh;
    const limit = 5;
    const slack = limit - requiredHoursPerDay;
    if (slack < 0) {
      const f = 0.82;
      const w = deriveFatigueWeightPiecewise(f);
      const metrics = {
        fatigue_score01: f,
        fatigue_weight: w,
        base_limit: limit,
        effective_limit: limit,
        actual_cost: round(requiredHoursPerDay, 2),
        unit: 'h' as const,
      };
      const est = estimateUtilityDeltaForSimulatedTrace({ metrics, reason: 'FATIGUE_EXHAUSTION' });
      traces.push({
        tacticId: 'IntakePredictiveSimulator',
        targetEntity: { type: 'DAY', id: 'INTAKE' },
        applied: false,
        reason: 'FATIGUE_EXHAUSTION',
        metrics: { ...metrics, utility_delta: est },
        estimated_utility_delta: est,
        simulation: { kind: 'HISTORICAL_BOUNDARY', boundary_id: 'fatigue_high_risk' },
        evidence: {
          refIds: [
            `[L3-PROOF|${CONSTRAINT_IDS.TIME_SPACE_MAX_DRIVING_HOURS}|DAY:historical_boundary|cmp:LEQ|actual:${round(
              requiredHoursPerDay,
              2,
            )}|limit:${round(limit, 2)}|unit:h|slack:${round(slack, 2)}|evidence:HISTORICAL_BOUNDARY]`,
          ],
        },
      });
    }
  }

  const axiomCtx = buildAxiomMatchContext({
    message: msgRaw,
    constraints: (t as any)?.constraints,
    trip: t as any,
  });

  // Axiom hook: FATIGUE_OVERLOAD (minimal heuristic from message)
  try {
    const match = matchAxioms(axiomCtx).find((m) => m.axiom_id === 'FATIGUE_OVERLOAD');
    if (match) {
      const md = match.evidence.metric_details;
      const limitH = md?.limit ?? 8;
      const actualH = md?.actual ?? 10;
      const metrics = {
        fatigue_score01: 0.85,
        fatigue_weight: deriveFatigueWeightPiecewise(0.85),
        base_limit: limitH,
        effective_limit: limitH,
        actual_cost: actualH,
        unit: 'h' as const,
      };
      const est = AXIOM_REGISTRY.FATIGUE_OVERLOAD.utility_anchor.expected_penalty;
      traces.push({
        tacticId: 'IntakePredictiveSimulator',
        targetEntity: { type: 'DAY', id: 'INTAKE' },
        applied: false,
        reason: AXIOM_REGISTRY.FATIGUE_OVERLOAD.sim_label as any,
        metrics: { ...metrics, utility_delta: est },
        estimated_utility_delta: est,
        simulation: { kind: 'HISTORICAL_BOUNDARY', boundary_id: 'fatigue_overload_intent' },
        evidence: {
          refIds: [buildL3ProofPrefixFromMatch(match, 'DAY:INTAKE')],
        },
      });
    }
  } catch {
    // best-effort
  }

  // Axiom hook: ETA_INFEASIBLE (minimal heuristic from message)
  try {
    const match = matchAxioms(axiomCtx).find((m) => m.axiom_id === 'ETA_INFEASIBLE');
    if (match) {
      const est = AXIOM_REGISTRY.ETA_INFEASIBLE.utility_anchor.expected_penalty;
      traces.push({
        tacticId: 'IntakePredictiveSimulator',
        targetEntity: { type: 'DAY', id: 'INTAKE' },
        applied: false,
        reason: AXIOM_REGISTRY.ETA_INFEASIBLE.sim_label as any,
        metrics: { fatigue_score01: 0, fatigue_weight: 1, base_limit: 1, effective_limit: 1, actual_cost: 0, unit: 'bool', utility_delta: est } as any,
        estimated_utility_delta: est,
        simulation: { kind: 'HISTORICAL_BOUNDARY', boundary_id: 'eta_infeasible_intent' },
        evidence: {
          refIds: [buildL3ProofPrefixFromMatch(match, 'DAY:INTAKE')],
        },
      });
    }
  } catch {
    // best-effort
  }

  const terrainMatch = matchAxioms(axiomCtx).find((m) => m.axiom_id === 'TERRAIN_F_ROAD_UNFIT');
  if (terrainMatch) {
    const f = 0.35;
    const w = deriveFatigueWeightPiecewise(f);
    const metrics = {
      fatigue_score01: f,
      fatigue_weight: w,
      base_limit: 1,
      effective_limit: 1,
      actual_cost: 0,
      unit: 'bool' as const,
    };
    const est = AXIOM_REGISTRY.TERRAIN_F_ROAD_UNFIT.utility_anchor.expected_penalty;
    traces.push({
      tacticId: 'IntakePredictiveSimulator',
      targetEntity: { type: 'DAY', id: 'INTAKE' },
      applied: false,
      reason: 'TERRAIN_F_ROAD_UNFIT',
      metrics: { ...metrics, utility_delta: est },
      estimated_utility_delta: est,
      simulation: { kind: 'HISTORICAL_BOUNDARY', boundary_id: 'terrain_high_risk' },
      evidence: {
        refIds: [buildL3ProofPrefixFromMatch(terrainMatch, 'DAY:historical_boundary')],
      },
    });
  }

  return traces;
}
