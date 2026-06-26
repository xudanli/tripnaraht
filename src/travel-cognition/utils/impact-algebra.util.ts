/**
 * Impact Algebra — 传播影响值而非复制事件。
 *
 * 例：航班延误 +60m，接驳 buffer 90m → netImpact = 0
 */

import type { ImpactRiskLevel } from '../types/dependency-graph.types';

export interface TimeImpactInput {
  /** 上游扰动（分钟，≥0） */
  disturbanceMinutes: number;
  /** 可吸收 buffer（分钟，≥0） */
  bufferMinutes?: number;
}

export interface TimeImpactResult {
  disturbanceMinutes: number;
  absorbedMinutes: number;
  /** 净时间滑移（分钟）；0 表示被完全吸收 */
  netImpactMinutes: number;
  fullyAbsorbed: boolean;
  riskLevel: ImpactRiskLevel;
}

export interface ReachabilityImpactInput {
  /** 额外路程/等待（分钟） */
  detourMinutes: number;
  /** 硬截止时间（ms）；无则仅按 detour 评估 */
  deadlineMs?: number;
  /** 预计到达（ms） */
  projectedArrivalMs: number;
}

export interface ReachabilityImpactResult {
  detourMinutes: number;
  netImpactMinutes: number;
  /** 是否在截止前可达 */
  reachable: boolean;
  riskLevel: ImpactRiskLevel;
}

export function clampMinutes(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value));
}

/** 时间扰动经 buffer 吸收后的净影响 */
export function computeTimeImpact(input: TimeImpactInput): TimeImpactResult {
  const disturbanceMinutes = clampMinutes(input.disturbanceMinutes);
  const bufferMinutes = clampMinutes(input.bufferMinutes ?? 0);
  const absorbedMinutes = Math.min(disturbanceMinutes, bufferMinutes);
  const netImpactMinutes = Math.max(0, disturbanceMinutes - bufferMinutes);

  return {
    disturbanceMinutes,
    absorbedMinutes,
    netImpactMinutes,
    fullyAbsorbed: netImpactMinutes === 0,
    riskLevel: timeImpactToRiskLevel(netImpactMinutes),
  };
}

export function timeImpactToRiskLevel(netImpactMinutes: number): ImpactRiskLevel {
  const n = clampMinutes(netImpactMinutes);
  if (n === 0) return 'LOW';
  if (n >= 90) return 'HIGH';
  if (n >= 30) return 'MEDIUM';
  return 'LOW';
}

/** 路段绕行 + 截止时间下的可达性影响 */
export function computeReachabilityImpact(input: ReachabilityImpactInput): ReachabilityImpactResult {
  const detourMinutes = clampMinutes(input.detourMinutes);
  const projected = input.projectedArrivalMs;
  const deadline = input.deadlineMs;

  let reachable = true;
  let netImpactMinutes = detourMinutes;

  if (deadline != null && Number.isFinite(deadline) && Number.isFinite(projected)) {
    const lateMinutes = Math.round((projected - deadline) / 60_000);
    if (lateMinutes > 0) {
      reachable = false;
      netImpactMinutes = Math.max(detourMinutes, lateMinutes);
    } else {
      netImpactMinutes = 0;
    }
  }

  return {
    detourMinutes,
    netImpactMinutes,
    reachable,
    riskLevel: reachable
      ? detourMinutes >= 30
        ? 'MEDIUM'
        : 'LOW'
      : netImpactMinutes >= 60
        ? 'HIGH'
        : 'MEDIUM',
  };
}

/** 组合多个净影响，取最高风险等级 */
export function maxImpactRisk(...levels: ImpactRiskLevel[]): ImpactRiskLevel {
  const order: ImpactRiskLevel[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
  return levels.reduce<ImpactRiskLevel>(
    (best, cur) => (order.indexOf(cur) >= order.indexOf(best) ? cur : best),
    'LOW',
  );
}

/**
 * 航班落地 → 接驳：将「错过分钟数」与接驳 slack 做代数吸收。
 * @returns null 表示无净影响（不需生成影响节点）
 */
export function computeTransferSlipImpact(params: {
  missByMinutes: number;
  transferSlackMinutes?: number;
}): TimeImpactResult | null {
  const result = computeTimeImpact({
    disturbanceMinutes: params.missByMinutes,
    bufferMinutes: params.transferSlackMinutes ?? 0,
  });
  return result.fullyAbsorbed ? null : result;
}
