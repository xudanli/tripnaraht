/**
 * Route feasibility: geographic distance + surface-aware driving duration (for daylight gate).
 */

import type { IcelandRouteFeasibilitySegment } from '../iceland-world-driving-contracts';
import { heuristicDistanceKm, normalizeFeasibilityRegion } from './iceland-feasibility-regions.util';

const DEFAULT_SEGMENT_KM = 120;

/** 相对铺装均速的有效系数（碎石显著拉长晨昏窗内可完成里程） */
export function surfaceVelocityFactor(surface?: IcelandRouteFeasibilitySegment['surface']): number {
  if (surface === 'gravel') return 0.7;
  if (surface === 'mixed') return 0.85;
  return 1;
}

/**
 * 与 iceland.routeFeasibility 原里程累加一致；驾驶时长按段 `surface` 对均速打折。
 */
export function computeFeasibilityDistanceAndDuration(
  segments: IcelandRouteFeasibilitySegment[],
  assumedKmh: number,
): { totalKm: number; estimatedDrivingHours: number; usedDistanceHeuristic: boolean } {
  let totalKm = 0;
  let estimatedDrivingHours = 0;
  let usedDistanceHeuristic = false;

  for (const seg of segments) {
    let km = 0;
    if (typeof seg.distanceKm === 'number' && Number.isFinite(seg.distanceKm) && seg.distanceKm >= 0) {
      km = seg.distanceKm;
    } else {
      const from = normalizeFeasibilityRegion(seg.from_region);
      const to = normalizeFeasibilityRegion(seg.to_region);
      const h = heuristicDistanceKm(from, to);
      if (h != null) {
        km = h;
        if (h === 0 && from && to && from === to) {
          // same preset: 0 km leg
        }
      } else {
        km = DEFAULT_SEGMENT_KM;
        usedDistanceHeuristic = true;
      }
    }
    totalKm += km;
    const factor = surfaceVelocityFactor(seg.surface);
    const effectiveSpeed = Math.max(15, assumedKmh * factor);
    estimatedDrivingHours += km / effectiveSpeed;
  }

  return {
    totalKm,
    estimatedDrivingHours,
    usedDistanceHeuristic,
  };
}
