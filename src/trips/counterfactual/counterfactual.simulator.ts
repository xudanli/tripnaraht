/**
 * Counterfactual Simulator — 在假设约束下重放局部执行（MVP：partial replan 分支）
 */

import type { TripPlan } from '../decision/plan-model';
import type { PlanDiff } from '../replan/partial-replan.executor';
import { applySlotUpdates } from '../repair/plan-mutation.engine';
import { ConstraintStateStore } from '../stream/constraint-state.store';
import { extractImpactSubgraph } from '../replan/impact-subgraph.extractor';
import { executePartialReplan } from '../replan/partial-replan.executor';
import { buildPartialReplanGraphFromPlan } from '../replan/build-partial-replan-graph';
import type {
  CounterfactualConstraintState,
  CounterfactualScenario,
} from './counterfactual.model';

export interface CounterfactualCostDelta {
  /** 启发式：匹配槽位时间差的合计（分钟） */
  readonly time: number;
  /** 启发式：0~1，基于 reasons / 阻塞标记 */
  readonly risk: number;
  /** 预留：路网距离差（km）；当前 MVP 为 0 */
  readonly distance: number;
}

export interface CounterfactualResult {
  readonly simulatedPlan: TripPlan;
  readonly diff: PlanDiff;
  readonly costDelta: CounterfactualCostDelta;
  /** 启发式可行槽位数（非 BLOCKED 语义） */
  readonly feasibleSlots: number;
  /** 假设约束 applied 后的 store 快照（审计 / 后续 ETA 钩子） */
  readonly patchedConstraintPreview: ConstraintStateStore;
}

function cloneTripPlan(plan: TripPlan): TripPlan {
  return JSON.parse(JSON.stringify(plan)) as TripPlan;
}

export function cloneConstraintStateStore(source: ConstraintStateStore): ConstraintStateStore {
  const next = new ConstraintStateStore();
  for (const [k, v] of source.latestByRoad) {
    next.latestByRoad.set(k, { ...v });
  }
  for (const [k, v] of source.latestByPOI) {
    next.latestByPOI.set(k, { ...v });
  }
  for (const [k, v] of source.latestBySlot) {
    next.latestBySlot.set(k, {
      ...v,
      ...(v.roadMask ? { roadMask: { ...v.roadMask } } : {}),
    });
  }
  return next;
}

/**
 * 将分支约束应用到 store 拷贝（反事实「世界前提」）。
 */
export function applyCounterfactualAssumption(
  base: ConstraintStateStore | undefined,
  patched: CounterfactualConstraintState,
  nowMs: number,
): ConstraintStateStore {
  const store = base ? cloneConstraintStateStore(base) : new ConstraintStateStore();
  if (patched.roads) {
    for (const [roadId, status] of Object.entries(patched.roads)) {
      store.latestByRoad.set(roadId, {
        roadId,
        status,
        updatedAt: nowMs,
      });
    }
  }
  return store;
}

function collectAllSlotIds(plan: TripPlan): string[] {
  const ids: string[] = [];
  for (const day of plan.days) {
    for (const s of day.timeSlots) {
      ids.push(s.id);
    }
  }
  return ids;
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map((x) => parseInt(x, 10));
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

function totalScheduleMinutes(plan: TripPlan): number {
  let sum = 0;
  for (const day of plan.days) {
    for (const s of day.timeSlots) {
      sum += timeToMinutes(s.time);
    }
  }
  return sum;
}

function riskHeuristic(plan: TripPlan): number {
  let blockedish = 0;
  let n = 0;
  for (const day of plan.days) {
    for (const s of day.timeSlots) {
      n++;
      const r = (s.reasons ?? []).join(' ').toLowerCase();
      if (r.includes('block') || r.includes('impass')) {
        blockedish++;
      }
    }
  }
  return n === 0 ? 0 : Math.min(1, blockedish / n + (n > 10 ? 0.05 : 0));
}

function countFeasibleSlots(plan: TripPlan): number {
  let ok = 0;
  for (const day of plan.days) {
    for (const s of day.timeSlots) {
      const r = (s.reasons ?? []).join(' ').toLowerCase();
      if (!r.includes('block') && !r.includes('impass')) {
        ok++;
      }
    }
  }
  return ok;
}

export function computeCostDelta(
  baseline: TripPlan,
  candidate: TripPlan,
): CounterfactualCostDelta {
  const timeDelta = Math.abs(
    totalScheduleMinutes(candidate) - totalScheduleMinutes(baseline),
  );
  return {
    time: timeDelta,
    risk: riskHeuristic(candidate),
    distance: 0,
  };
}

/**
 * 在给定假设下重放 partial replan：构造分支计划 → 子图 → executePartialReplan → 合并槽位。
 */
export function runCounterfactual(
  scenario: CounterfactualScenario,
  plan: TripPlan,
  options?: {
    readonly baselineConstraintStore?: ConstraintStateStore;
    readonly nowMs?: number;
  },
): CounterfactualResult {
  const patchedConstraintPreview = applyCounterfactualAssumption(
    options?.baselineConstraintStore,
    scenario.patchedConstraints,
    options?.nowMs ?? Date.now(),
  );

  const clonedPlan = cloneTripPlan(plan);
  const graph = buildPartialReplanGraphFromPlan(clonedPlan);

  const seeds =
    scenario.simulationMode === 'PARTIAL_REPLAY' &&
    scenario.hypothesizedSlotIds &&
    scenario.hypothesizedSlotIds.length > 0
      ? [...scenario.hypothesizedSlotIds]
      : collectAllSlotIds(clonedPlan);

  const subgraph = extractImpactSubgraph(graph, seeds);
  const partial = executePartialReplan(subgraph, clonedPlan);
  const simulatedPlan = applySlotUpdates(clonedPlan, partial.updatedSlots);

  const costDelta = computeCostDelta(plan, simulatedPlan);
  const feasibleSlots = countFeasibleSlots(simulatedPlan);

  return {
    simulatedPlan,
    diff: partial.diff,
    costDelta,
    feasibleSlots,
    patchedConstraintPreview,
  };
}
