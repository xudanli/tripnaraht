/**
 * Intent–Reality Mapper — 意图编译结果 vs 世界快照 → 冲突、权衡、意图加权后的计划副本
 */

import type { TripPlan, PlanSlot } from '../decision/plan-model';
import type { CompiledIntent } from '../intent/intent.compiler';
import type {
  IntentConflict,
  IntentReconciliationOverlay,
  RealitySnapshot,
  ReconciliationResult,
  Tradeoff,
} from './reconciliation.model';

function clonePlan(plan: TripPlan): TripPlan {
  return JSON.parse(JSON.stringify(plan)) as TripPlan;
}

function detectConflicts(
  compiled: CompiledIntent,
  reality: RealitySnapshot,
): IntentConflict[] {
  const conflicts: IntentConflict[] = [];
  const maxH = compiled.constraints.maxDailyDriveHours;

  if (
    maxH !== undefined &&
    reality.dailyDriveHoursMax > maxH + 1e-6
  ) {
    conflicts.push({
      type: 'DRIVE_EXCEEDED',
      severity: 'HIGH',
      detail: `Estimated max daily drive ${reality.dailyDriveHoursMax.toFixed(
        1,
      )}h exceeds intent limit ${maxH}h`,
    });
  }

  if (
    (reality.blockedSegmentCount ?? 0) > 0 &&
    compiled.constraints.preferScenicRoutes
  ) {
    conflicts.push({
      type: 'SCENIC_ROUTE_COMPROMISED',
      severity: 'MEDIUM',
      detail: 'Road closures may force non-scenic detours',
    });
  }

  if (reality.worstWeatherTier === 'HARD') {
    conflicts.push({
      type: 'WEATHER_VS_INTENT',
      severity: 'MEDIUM',
      detail: 'Severe weather conflicts with comfortable pacing',
    });
  }

  return conflicts;
}

function generateTradeoffs(conflicts: readonly IntentConflict[]): Tradeoff[] {
  return conflicts.map((c, i) => ({
    id: `tradeoff_${c.type}_${i}`,
    description:
      c.detail ??
      `Resolve conflict ${c.type} (${c.severity}) via reschedule or route change`,
    impact: c.severity === 'HIGH' ? 'HIGH' : 'MEDIUM',
  }));
}

/**
 * 将编译权重写入槽位 reasons（审计轨迹）；不改变拓扑。
 */
export function applyIntentWeights(
  plan: TripPlan,
  weights: CompiledIntent['weights'],
): TripPlan {
  const next = clonePlan(plan);
  const tag = `intent_w:${weights.driveTime.toFixed(2)},${weights.scenicValue.toFixed(2)},${weights.fatigue.toFixed(2)}`;
  for (const day of next.days) {
    for (const slot of day.timeSlots) {
      const s = slot as PlanSlot;
      s.reasons = [...(s.reasons ?? []), tag];
    }
  }
  return next;
}

/**
 * 意图 vs 现实 vs 当前计划 → 对齐计划 + 冲突列表 + 权衡说明。
 * Partial replan / subgraph 提取前应优先使用 `alignedPlan`。
 */
export function reconcileIntentWithReality(
  compiled: CompiledIntent,
  reality: RealitySnapshot,
  plan: TripPlan,
): ReconciliationResult {
  const conflicts = detectConflicts(compiled, reality);
  const weighted = applyIntentWeights(plan, compiled.weights);
  const tradeoffs = generateTradeoffs(conflicts);

  return {
    conflicts,
    alignedPlan: weighted,
    tradeoffs,
  };
}

/** 写入 ExecutionSemanticView 的轻量摘要 */
export function toIntentReconciliationOverlay(
  result: ReconciliationResult,
  priorities: readonly string[],
): IntentReconciliationOverlay {
  return {
    conflicts: result.conflicts,
    tradeoffs: result.tradeoffs,
    priorities,
  };
}
