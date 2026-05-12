import type { FuelReachabilitySummary } from '../../fuel/fuel-reachability.types';
import type { RepairInstruction } from './repair-action.types';
import type { RepairEvaluatorInput } from './repair-evaluator.types';
import type { PlanSlot } from '../plan-model';

function findSlot(
  plan: RepairEvaluatorInput['plan'],
  slotId: string,
): { date: string; slot: PlanSlot } | undefined {
  for (const day of plan.days) {
    const slot = day.timeSlots.find(s => s.id === slotId);
    if (slot) {
      return { date: day.date, slot };
    }
  }
  return undefined;
}

/** P-FUEL-1：燃油走廊约束 → 渐进式 repair（与 overlay frame.fuel / signals 对齐）。 */
export function collectFuelReachabilityRepairs(input: RepairEvaluatorInput): RepairInstruction[] {
  const merged = new Map<string, FuelReachabilitySummary>();
  for (const f of input.executionOverlayFrames ?? []) {
    if (f.fuel) {
      merged.set(f.legId, f.fuel);
    }
  }
  if (input.fuelReachabilityByLegId) {
    for (const [k, v] of Object.entries(input.fuelReachabilityByLegId)) {
      if (!merged.has(k) && v !== undefined) {
        merged.set(k, v);
      }
    }
  }

  const out: RepairInstruction[] = [];
  let i = 0;

  for (const [legId, summary] of merged) {
    const found = findSlot(input.plan, legId);
    if (!found) {
      continue;
    }

    if (summary.severity === 'CRITICAL' && summary.safeBeforeNextFuel === false) {
      out.push({
        id: `repair_fuel_critical_${legId}_${i++}`,
        action: 'INSERT_REST',
        targetSlotIds: [legId],
        date: found.date,
        narrative: `燃油续航不足以可靠抵达下一补给点：必须插入加油/休息节点（建议 POI ${summary.recommendedStopPoiId ?? '沿途油站'}）。`,
        priority: 2,
        confidence: 0.88,
        metadata: {
          source: 'FUEL_REACHABILITY',
          domain: 'FUEL',
          forceStopInsert: true,
          recommendedStopPoiId: summary.recommendedStopPoiId,
        },
      });
      continue;
    }

    if (summary.severity === 'HIGH') {
      out.push({
        id: `repair_fuel_high_${legId}_${i++}`,
        action: 'INSERT_REST',
        targetSlotIds: [legId],
        date: found.date,
        narrative: `续航裕度偏低：强烈建议在下一可用油站停靠补给（POI ${summary.recommendedStopPoiId ?? '待定'}）。`,
        priority: 6,
        confidence: 0.72,
        metadata: { source: 'FUEL_REACHABILITY', domain: 'FUEL', suggestStop: true },
      });
      continue;
    }

    if (summary.severity === 'MEDIUM') {
      out.push({
        id: `repair_fuel_medium_${legId}_${i++}`,
        action: 'SPLIT_DRIVE',
        targetSlotIds: [legId],
        date: found.date,
        narrative: `长途驾驶续航张力中等：可考虑拆分驾驶段或提前补给。`,
        priority: 14,
        confidence: 0.55,
        metadata: { source: 'FUEL_REACHABILITY', domain: 'FUEL', infoOnly: true },
      });
    }
  }

  return out.sort((a, b) => a.priority - b.priority);
}
