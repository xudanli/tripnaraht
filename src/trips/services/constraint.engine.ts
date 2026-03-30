/**
 * TripNara 约束引擎
 *
 * 行程生成必须满足：
 * 1 地理约束：同一天 cluster 不超过 2 个
 * 2 距离约束：相邻 slot 距离 < 5km
 * 3 营业时间：arrivalTime ∈ openingHours（由 validateAndRepair 处理）
 * 4 重复约束：place <= 1, restaurant <= 1/day（由 validateAndRepair 处理）
 *
 * @see docs/Decision_OS_实施例_旅行规划.md
 */

import { Injectable, Logger } from '@nestjs/common';
import type { CandidatePlace } from './candidate-retrieval.engine';
import { TimeSlot, TransportMode } from '../dto/trip-draft.dto';

const SLOT_ORDER: TimeSlot[] = [
  TimeSlot.MORNING,
  TimeSlot.LUNCH,
  TimeSlot.AFTERNOON,
  TimeSlot.DINNER,
  TimeSlot.EVENING,
];
const MAX_CLUSTERS_PER_DAY = 2;
const MAX_DISTRICTS_PER_DAY = 2;
/** 相邻 slot 最大距离（km）：步行 5，公交 30，自驾 150 */
function getMaxSlotDistanceKm(transport?: TransportMode): number {
  if (transport === TransportMode.CAR) return 150;
  if (transport === TransportMode.TRANSIT) return 30;
  return 5; // WALK or default
}

@Injectable()
export class ConstraintEngine {
  private readonly logger = new Logger(ConstraintEngine.name);

  /**
   * 检查地理约束：同一天 cluster 不超过 2 个
   * @returns 违规的 clusterIds（超过 2 个时返回需合并的 cluster 列表）
   */
  checkClusterConstraint(
    daySlots: Record<string, { placeId: number }>,
    candidates: CandidatePlace[],
  ): { ok: boolean; clusterIds: number[]; excessClusterIds: number[] } {
    const placeIds = Object.values(daySlots)
      .filter((s) => s?.placeId)
      .map((s) => s!.placeId);

    const clusterIds = new Set<number>();
    for (const pid of placeIds) {
      const c = candidates.find((x) => x.id === pid);
      if (c?.clusterId !== undefined) clusterIds.add(c.clusterId);
    }

    const arr = Array.from(clusterIds);
    if (arr.length <= MAX_CLUSTERS_PER_DAY) {
      return { ok: true, clusterIds: arr, excessClusterIds: [] };
    }

    // 按每个 cluster 的点数排序，保留前 2 个，其余为 excess
    const clusterCounts = new Map<number, number>();
    for (const pid of placeIds) {
      const c = candidates.find((x) => x.id === pid);
      if (c?.clusterId !== undefined) {
        clusterCounts.set(c.clusterId, (clusterCounts.get(c.clusterId) ?? 0) + 1);
      }
    }
    const sorted = [...clusterCounts.entries()].sort((a, b) => b[1] - a[1]);
    const keep = sorted.slice(0, MAX_CLUSTERS_PER_DAY).map(([id]) => id);
    const excess = sorted.slice(MAX_CLUSTERS_PER_DAY).map(([id]) => id);
    void keep;

    return { ok: false, clusterIds: arr, excessClusterIds: excess };
  }

  /**
   * 检查 District 约束：同一天 District 不超过 2 个（Travel World Model Phase 3）
   * 降级：无 districtId 时返回 ok，由 cluster 约束兜底
   */
  checkDistrictConstraint(
    daySlots: Record<string, { placeId: number }>,
    candidates: CandidatePlace[],
  ): { ok: boolean; districtIds: number[]; excessDistrictIds: number[] } {
    const placeIds = Object.values(daySlots)
      .filter((s) => s?.placeId)
      .map((s) => s!.placeId);

    const districtIds = new Set<number>();
    for (const pid of placeIds) {
      const c = candidates.find((x) => x.id === pid);
      if (c?.districtId != null) districtIds.add(c.districtId);
    }

    const arr = Array.from(districtIds);
    if (arr.length <= MAX_DISTRICTS_PER_DAY) {
      return { ok: true, districtIds: arr, excessDistrictIds: [] };
    }

    const districtCounts = new Map<number, number>();
    for (const pid of placeIds) {
      const c = candidates.find((x) => x.id === pid);
      if (c?.districtId != null) {
        districtCounts.set(c.districtId, (districtCounts.get(c.districtId) ?? 0) + 1);
      }
    }
    const sorted = [...districtCounts.entries()].sort((a, b) => b[1] - a[1]);
    const _keep = sorted.slice(0, MAX_DISTRICTS_PER_DAY).map(([id]) => id);
    const excess = sorted.slice(MAX_DISTRICTS_PER_DAY).map(([id]) => id);

    return { ok: false, districtIds: arr, excessDistrictIds: excess };
  }

  /**
   * 为违反 District 约束的 slot 推荐同 District 内的替代 placeId
   */
  suggestReplacementFromDistricts(
    currentPlaceId: number,
    excessDistrictIds: number[],
    keepDistrictIds: number[],
    candidates: CandidatePlace[],
    sameCategory?: string,
  ): number | null {
    const current = candidates.find((c) => c.id === currentPlaceId);
    if (!current || current.districtId == null) return null;
    if (!excessDistrictIds.includes(current.districtId)) return null;

    const keepCandidates = candidates.filter(
      (c) => c.districtId != null && keepDistrictIds.includes(c.districtId) && c.id !== currentPlaceId,
    );
    if (sameCategory) {
      const filtered = keepCandidates.filter((c) => c.category === sameCategory);
      if (filtered.length > 0) {
        return filtered.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))[0].id;
      }
    }
    if (keepCandidates.length > 0) {
      return keepCandidates.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))[0].id;
    }
    return null;
  }

  /**
   * 检查距离约束：相邻 slot 距离根据交通方式不同
   * 步行 5km，公交 30km，自驾 150km
   * @returns 违规的 slot 对列表
   */
  checkDistanceConstraint(
    daySlots: Record<string, { placeId: number }>,
    candidates: CandidatePlace[],
    transport?: TransportMode,
  ): Array<{ slotA: string; slotB: string; distanceKm: number }> {
    const maxKm = getMaxSlotDistanceKm(transport);
    const violations: Array<{ slotA: string; slotB: string; distanceKm: number }> = [];
    const candidateMap = new Map(candidates.map((c) => [c.id, c]));

    for (let i = 0; i < SLOT_ORDER.length - 1; i++) {
      const slotA = SLOT_ORDER[i];
      const slotB = SLOT_ORDER[i + 1];
      const sA = daySlots[slotA];
      const sB = daySlots[slotB];
      if (!sA?.placeId || !sB?.placeId) continue;

      const pA = candidateMap.get(sA.placeId);
      const pB = candidateMap.get(sB.placeId);
      if (!pA || !pB) continue;

      const km = this.haversineKm(pA.lat, pA.lng, pB.lat, pB.lng);
      if (km > maxKm) {
        violations.push({ slotA, slotB, distanceKm: Math.round(km * 10) / 10 });
      }
    }

    return violations;
  }

  /**
   * 为违反 cluster 约束的 slot 推荐同 cluster 内的替代 placeId
   * 用于修复：将 excess cluster 中的 item 替换为 keep cluster 中的候选
   */
  suggestReplacementFromClusters(
    currentPlaceId: number,
    excessClusterIds: number[],
    keepClusterIds: number[],
    candidates: CandidatePlace[],
    sameCategory?: string,
  ): number | null {
    const current = candidates.find((c) => c.id === currentPlaceId);
    if (!current || current.clusterId === undefined) return null;
    if (!excessClusterIds.includes(current.clusterId)) return null;

    const keepCandidates = candidates.filter(
      (c) => keepClusterIds.includes(c.clusterId ?? -1) && c.id !== currentPlaceId,
    );
    if (sameCategory) {
      const filtered = keepCandidates.filter((c) => c.category === sameCategory);
      if (filtered.length > 0) {
        return filtered.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))[0].id;
      }
    }
    if (keepCandidates.length > 0) {
      return keepCandidates.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))[0].id;
    }
    return null;
  }

  private haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const x =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  }
}
