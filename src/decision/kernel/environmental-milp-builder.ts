export type DayIso = string;

export type VisibilityWindow = {
  /**
   * Earliest allowed start time (minutes from day start, in UTC reference of the itinerary day).
   * Use this for aurora / night-sky constraints: e.g. earliestStartMin = sunsetMin + 90.
   */
  earliestStartMin?: number;
  /**
   * Latest allowed end time (minutes from day start).
   * Use this for daylight / outdoor visibility constraints: e.g. latestEndMin = sunsetMin + twilightBufferMin.
   */
  latestEndMin?: number;
};

export type EnvIndexedJson = {
  day: DayIso; // "YYYY-MM-DD"
  sunset: string; // "HH:mm" or ISO string
  nodes: Array<{
    id: string;
    dur: number; // minutes
    /** Optional tags from Structure-Aware Indexing (e.g. aurora, stargazing, golden_hour). */
    tags?: string[];
    /**
     * Back-compat flag: when true and no explicit visibilityWindow provided,
     * we apply a default "latestEndMin = sunset + twilightBufferMin".
     */
    visibility_req?: boolean;
    /** Optional per-node sunset delta (minutes) for photography/golden hour end caps. */
    delta_min?: number;
    /** Optional per-node aurora offset (minutes after sunset) for night-sky starts. */
    aurora_offset?: number;
    /**
     * Optional explicit window. If present, it wins over visibility_req.
     * - For aurora: set earliestStartMin.
     * - For sunset visibility: set latestEndMin.
     */
    visibilityWindow?: VisibilityWindow;
  }>;
  edges: Array<{
    id?: string;
    from: string;
    to: string;
    travel_time: number; // minutes
    road_open: 0 | 1;
    weatherRisk?: number; // 0..1 (optional, else envWeatherRisk01)
    exposure?: number; // 0..1
    /** Optional: F-road classification (e.g. F26, F208, 910). */
    f_road_level?: string | number;
    /** Optional: river crossing depth in cm (0..100+). */
    river_crossing_depth_cm?: number;
    /** Optional: alternate field name from indexing: water crossing depth in cm. */
    water_crossing_depth_cm?: number;
    /** Optional: steepness grade in percent (0..30+). */
    steepness_grade_pct?: number;
    /** Optional: road surface type. */
    surface_type?: 'asphalt' | 'gravel' | 'loose_rock' | string;
  }>;
};

export type MilpVar = { name: string };

export interface MilpModel {
  addBinaryVar(name: string): MilpVar;
  addContVar(name: string, lb?: number, ub?: number): MilpVar;
  /** Linear constraint: lhs <= rhs */
  addLeq(name: string, lhs: Array<{ coef: number; v: MilpVar }>, rhs: number): void;
  /** Linear constraint: lhs >= rhs */
  addGeq(name: string, lhs: Array<{ coef: number; v: MilpVar }>, rhs: number): void;
}

import { F_ROAD_RISK_RULES, type ThresholdPenaltyRule } from './risk-config';
import { deriveVisibilityWindow, parseTimeToMinutes } from './environmental-physics.service';

function pickPenaltyFromThresholds(value: number, rules: ThresholdPenaltyRule): number {
  if (!Number.isFinite(value)) return 0;
  // pick the highest threshold <= value
  for (let i = rules.length - 1; i >= 0; i--) {
    const r = rules[i]!;
    if (value >= r.threshold) return r.penalty;
  }
  return 0;
}

export function edgeRisk01(
  edge: EnvIndexedJson['edges'][number],
  envWeatherRisk01: number,
): number {
  return edgeRiskBreakdown(edge, envWeatherRisk01).total;
}

export type RiskBreakdown = {
  /** Total risk cost, capped to [0,10]. */
  total: number;
  components: {
    weather: number; // weather * (1 + exposure)
    water: number; // stepwise penalty from water depth
    terrain: number; // steepness + surface penalties
    froad_base: number; // f-road label base penalty
  };
  metadata: {
    critical_factors: string[];
    is_hard_closed: boolean;
  };
};

export function edgeRiskBreakdown(
  edge: EnvIndexedJson['edges'][number],
  envWeatherRisk01: number,
): RiskBreakdown {
  const critical: string[] = [];
  const wr = edge.weatherRisk ?? envWeatherRisk01;
  const exp = edge.exposure ?? 0;

  const weather = (wr * (1 + exp));
  if (edge.weatherRisk !== undefined) critical.push('weatherRisk');
  else critical.push('envWeatherRisk01');
  if (edge.exposure !== undefined) critical.push('exposure');

  const water = (() => {
    const d = edge.water_crossing_depth_cm ?? edge.river_crossing_depth_cm;
    if (typeof d !== 'number' || !Number.isFinite(d) || d <= 0) return 0;
    critical.push(edge.water_crossing_depth_cm !== undefined ? 'water_crossing_depth_cm' : 'river_crossing_depth_cm');
    return pickPenaltyFromThresholds(d, [...F_ROAD_RISK_RULES.water_crossing_cm]);
  })();

  const steep = (() => {
    const g = edge.steepness_grade_pct;
    if (typeof g !== 'number' || !Number.isFinite(g) || g <= F_ROAD_RISK_RULES.steepness.free_pct) return 0;
    critical.push('steepness_grade_pct');
    const extra = g - F_ROAD_RISK_RULES.steepness.free_pct;
    const steps = Math.ceil(extra / F_ROAD_RISK_RULES.steepness.step_pct);
    return steps * F_ROAD_RISK_RULES.steepness.penalty_per_step;
  })();

  const surface = (() => {
    const raw = String(edge.surface_type ?? '').toLowerCase();
    if (!raw) return 0;
    critical.push('surface_type');
    const key = raw as keyof typeof F_ROAD_RISK_RULES.surface;
    return (F_ROAD_RISK_RULES.surface as any)[key] ?? 0;
  })();

  const froad_base = (() => {
    const raw = edge.f_road_level;
    if (raw == null) return 0;
    const s = String(raw).toUpperCase().trim();
    const m = s.match(/^F?(\d{2,4})$/);
    if (!m) return 0;
    const n = Number(m[1]);
    if (!Number.isFinite(n)) return 0;
    critical.push('f_road_level');
    if (n >= 900) return 0.35;
    if (n >= 200) return 0.22;
    if (n >= 50) return 0.12;
    return 0.08;
  })();

  const terrain = steep + surface;
  const rawTotal = weather + water + terrain + froad_base;
  const total = Math.max(0, Math.min(10, rawTotal));

  const seen = new Set<string>();
  const critical_factors = critical.filter((x) => {
    if (seen.has(x)) return false;
    seen.add(x);
    return true;
  });

  return {
    total,
    components: { weather, water, terrain, froad_base },
    metadata: { critical_factors, is_hard_closed: edge.road_open === 0 },
  };
}

// NOTE: parseTimeToMinutes / deriveVisibilityWindow moved to EnvironmentalPhysicsService.

export function buildEnvironmentalMilp(
  model: MilpModel,
  input: EnvIndexedJson,
  opts: {
    envWeatherRisk01: number;
    riskBudgetMax: number;
    twilightBufferMin: number;
    defaultAuroraOffsetMin?: number;
  },
): {
  s: Record<string, MilpVar>;
  y: Record<string, MilpVar>;
  sunsetMin: number;
} {
  const day = input.day;
  const sunsetMin = parseTimeToMinutes(day, input.sunset);

  const nodeById = new Map(input.nodes.map((n) => [n.id, n] as const));

  // Variables
  const s: Record<string, MilpVar> = {};
  for (const n of input.nodes) {
    s[n.id] = model.addContVar(`s_${day}_${n.id}`, 0);
  }

  const y: Record<string, MilpVar> = {};
  for (const e of input.edges) {
    const id = e.id ?? `${e.from}__${e.to}`;
    y[id] = model.addBinaryVar(`y_${day}_${id}`);

    // Road closure: y <= road_open
    model.addLeq(`RoadClosure_${day}_${id}`, [{ coef: 1, v: y[id]! }], e.road_open);

    // Time propagation (Big-M)
    const fromNode = nodeById.get(e.from);
    if (!fromNode) throw new Error(`edge.from node missing: ${e.from}`);
    if (!s[e.from] || !s[e.to]) throw new Error(`edge references unknown node var: ${e.from} -> ${e.to}`);

    const M = 24 * 60; // minimal single-day bound; tune if cross-day routing is allowed
    model.addGeq(
      `TimeProp_${day}_${id}`,
      [
        { coef: 1, v: s[e.to]! },
        { coef: -1, v: s[e.from]! },
        { coef: -M, v: y[id]! },
      ],
      fromNode.dur + e.travel_time - M,
    );
  }

  // Visibility window constraints
  for (const n of input.nodes) {
    // Priority: explicit > derived (tags/legacy)
    const vwin: VisibilityWindow | undefined =
      n.visibilityWindow ??
      deriveVisibilityWindow(n, sunsetMin, {
        twilightBufferMin: opts.twilightBufferMin,
        defaultAuroraOffsetMin: opts.defaultAuroraOffsetMin,
      });

    if (!vwin) continue;

    if (vwin.latestEndMin !== undefined) {
      // s_i + dur_i <= latestEndMin  ->  s_i <= latestEndMin - dur_i
      model.addLeq(`VisLatestEnd_${day}_${n.id}`, [{ coef: 1, v: s[n.id]! }], vwin.latestEndMin - n.dur);
    }
    if (vwin.earliestStartMin !== undefined) {
      // s_i >= earliestStartMin
      model.addGeq(`VisEarliestStart_${day}_${n.id}`, [{ coef: 1, v: s[n.id]! }], vwin.earliestStartMin);
    }
  }

  // Risk budget: sum(r_e * y_e) <= R_max
  const riskTerms: Array<{ coef: number; v: MilpVar }> = [];
  for (const e of input.edges) {
    const id = e.id ?? `${e.from}__${e.to}`;
    const r = edgeRiskBreakdown(e, opts.envWeatherRisk01).total;
    riskTerms.push({ coef: r, v: y[id]! });
  }
  model.addLeq(`RiskBudget_${day}`, riskTerms, opts.riskBudgetMax);

  return { s, y, sunsetMin };
}

/**
 * Slack-enabled variant: keeps the same hard constraints, but allows controlled violations
 * via non-negative slack vars (minutes). The caller can penalize slacks in the objective.
 */
export function buildEnvironmentalMilpWithSlack(
  model: MilpModel,
  input: EnvIndexedJson,
  opts: {
    envWeatherRisk01: number;
    riskBudgetMax: number;
    twilightBufferMin: number;
    defaultAuroraOffsetMin?: number;
  },
): {
  s: Record<string, MilpVar>;
  y: Record<string, MilpVar>;
  sunsetMin: number;
  slack: Record<string, { early?: MilpVar; late?: MilpVar }>;
} {
  const { s, y, sunsetMin } = buildEnvironmentalMilp(model, input, opts);
  const day = input.day;

  const slack: Record<string, { early?: MilpVar; late?: MilpVar }> = {};

  for (const n of input.nodes) {
    // same window inference priority as buildEnvironmentalMilp
    const vwin: VisibilityWindow | undefined =
      n.visibilityWindow ??
      deriveVisibilityWindow(n, sunsetMin, {
        twilightBufferMin: opts.twilightBufferMin,
        defaultAuroraOffsetMin: opts.defaultAuroraOffsetMin,
      });
    if (!vwin) continue;

    const rec: { early?: MilpVar; late?: MilpVar } = {};

    if (vwin.earliestStartMin !== undefined) {
      // s_i + η_i >= E_i
      rec.early = model.addContVar(`slack_early_${day}_${n.id}`, 0);
      model.addGeq(
        `VisEarliestStartSlack_${day}_${n.id}`,
        [
          { coef: 1, v: s[n.id]! },
          { coef: 1, v: rec.early },
        ],
        vwin.earliestStartMin,
      );
    }
    if (vwin.latestEndMin !== undefined) {
      // s_i - ξ_i <= L_i - dur_i
      rec.late = model.addContVar(`slack_late_${day}_${n.id}`, 0);
      model.addLeq(
        `VisLatestEndSlack_${day}_${n.id}`,
        [
          { coef: 1, v: s[n.id]! },
          { coef: -1, v: rec.late },
        ],
        vwin.latestEndMin - n.dur,
      );
    }

    slack[n.id] = rec;
  }

  return { s, y, sunsetMin, slack };
}

