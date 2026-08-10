/**
 * Kernel Vehicle×Road Fit — 国家无关规则；IS F-road / CN 垭口共用同一输出形状。
 */
import type { SelfDriveContext } from '../contracts/self-drive-context.types';
import type {
  ExecutabilityVerdict,
  VehicleRoadFitEngineResult,
  VehicleRoadFitStatus,
} from '../contracts/self-drive-engines.types';

function worseGate(a: ExecutabilityVerdict, b: ExecutabilityVerdict): ExecutabilityVerdict {
  const rank: Record<ExecutabilityVerdict, number> = {
    ALLOW: 0,
    NEED_CONFIRM: 1,
    SUGGEST_REPLACE: 2,
    BLOCK: 3,
  };
  return rank[a] >= rank[b] ? a : b;
}

function gateToStatus(gate: ExecutabilityVerdict): VehicleRoadFitStatus {
  if (gate === 'ALLOW') return 'COMPATIBLE';
  if (gate === 'BLOCK') return 'INCOMPATIBLE';
  if (gate === 'SUGGEST_REPLACE') return 'INCOMPATIBLE';
  return 'CONDITIONAL';
}

export function assessKernelVehicleRoadFit(
  ctx: SelfDriveContext,
): VehicleRoadFitEngineResult {
  const vehicle = ctx.vehicle.vehicleType;
  const rental = new Set(ctx.regulations.rentalRestrictionCodes ?? []);
  const reasons: string[] = [];
  let gate: ExecutabilityVerdict = 'ALLOW';
  let segmentId: string | undefined;
  let reason = 'OK';

  for (const ev of ctx.roadEvidence) {
    if (ev.status === 'CLOSED') {
      segmentId = ev.segmentId;
      if (ev.strongJudgmentAllowed) {
        gate = worseGate(gate, 'BLOCK');
        reasons.push('ROAD_CLOSED');
        reason = 'ROAD_CLOSED';
      } else {
        gate = worseGate(gate, 'SUGGEST_REPLACE');
        reasons.push('ROAD_CLOSED_DEGRADED_EVIDENCE');
        reason = 'ROAD_CLOSED_DEGRADED_EVIDENCE';
      }
    } else if (ev.status === 'DIFFICULT' || ev.status === 'RESTRICTED') {
      segmentId = segmentId ?? ev.segmentId;
      gate = worseGate(gate, ev.strongJudgmentAllowed ? 'NEED_CONFIRM' : 'NEED_CONFIRM');
      reasons.push('ROAD_RESTRICTED');
      if (reason === 'OK') reason = 'ROAD_RESTRICTED';
    }
  }

  for (const seg of ctx.route.criticalSegments) {
    const needs4wd =
      seg.criticalReasons.includes('F_ROAD') || seg.criticalReasons.includes('FORD');
    if (needs4wd) {
      segmentId = segmentId ?? seg.segmentId;
      if (vehicle === '2WD' || rental.has('NO_F_ROAD')) {
        gate = worseGate(gate, 'BLOCK');
        reasons.push('VEHICLE_ROAD_MISMATCH');
        reason = 'VEHICLE_ROAD_MISMATCH';
      } else if (vehicle === 'OTHER' || ctx.vehicle.vehicleSource === 'UNKNOWN') {
        gate = worseGate(gate, 'NEED_CONFIRM');
        reasons.push('VEHICLE_UNKNOWN_FOR_HARD_ROAD');
        if (reason === 'OK') reason = 'VEHICLE_UNKNOWN_FOR_HARD_ROAD';
      }
    }

    if (
      seg.criticalReasons.includes('ALTITUDE') &&
      ctx.driver[0]?.experienceLevel === 'NOVICE_ABROAD'
    ) {
      segmentId = segmentId ?? seg.segmentId;
      gate = worseGate(gate, 'NEED_CONFIRM');
      reasons.push('NOVICE_ALTITUDE');
      if (reason === 'OK') reason = 'NOVICE_ALTITUDE';
    }
  }

  const detailZh =
    reason === 'VEHICLE_ROAD_MISMATCH'
      ? '当前车型/租车条款与关键路段要求不匹配（如非铺装高地 / F-road）'
      : reason === 'ROAD_CLOSED' || reason === 'ROAD_CLOSED_DEGRADED_EVIDENCE'
        ? '关键路段提示封闭或不可通行，请核对后再出发'
        : reason === 'ROAD_RESTRICTED'
          ? '关键路段存在通行限制，建议确认路况与车况'
          : reason === 'NOVICE_ALTITUDE'
            ? '高海拔路段对经验要求更高，建议确认节奏与适应'
            : '车辆与路段匹配可接受';

  return {
    status: gateToStatus(gate),
    gate,
    reason,
    detailZh,
    segmentId,
    reasons: [...new Set(reasons)],
  };
}
