/**
 * TripNara 路径优化引擎
 *
 * 使用 TSP 变体 / 贪心最近邻优化路线顺序
 * Utility = 0.35*experience + 0.25*diversity + 0.2*popularity + 0.2*distanceEfficiency
 *
 * 算法：for day in tripDays -> selectCluster -> selectPlaces -> optimizeRoute -> assignSlots
 *
 * @see docs/Decision_OS_实施例_旅行规划.md
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import type { CandidatePlace } from './candidate-retrieval.engine';
import { CreateTripDraftDto } from '../dto/trip-draft.dto';
import { TimeSlot } from '../dto/trip-draft.dto';
import { PacingEngine } from './pacing.engine';
import { BestVisitTimeResolver } from './best-visit-time.resolver';
import { PlaceGraphService } from '../../places/services/place-graph.service';
import { TravelSimulationService } from './travel-simulation.service';

/** 与 LLM 输出格式兼容 */
export interface OptimizedDayResult {
  day: number;
  slots: Record<
    string,
    { placeId: number; reason: string; alternatives?: number[] }
  >;
}

@Injectable()
export class RouteOptimizationEngine {
  private readonly logger = new Logger(RouteOptimizationEngine.name);

  constructor(
    private readonly pacingEngine: PacingEngine,
    private readonly bestVisitTimeResolver: BestVisitTimeResolver,
    @Optional() private readonly placeGraph?: PlaceGraphService,
    @Optional() private readonly travelSimulation?: TravelSimulationService,
  ) {}

  /**
   * 算法编排：替代 LLM 选点
   * 当 PlaceGraphService 可用时，优先用 walkTime 评分；否则回退 haversine
   * @returns 与 llmOrchestrate 相同格式，供 validateAndRepair 使用
   */
  async optimize(
    candidates: CandidatePlace[],
    days: Array<{ day: number; date: string }>,
    dto: CreateTripDraftDto,
  ): Promise<{ days: OptimizedDayResult[] }> {
    const results: OptimizedDayResult[] = [];
    const usedPlaceIds = new Map<number, number>(); // placeId -> count
    const usedRestaurantIdsPerDay = new Map<number, Set<number>>(); // day -> Set<placeId>
    const totalDays = days.length; // 🆕 用于动态去重上限

    for (const dayData of days) {
      const daySlots = await this.optimizeDay(
        dayData,
        candidates,
        usedPlaceIds,
        usedRestaurantIdsPerDay.get(dayData.day) ?? new Set(),
        dto,
        totalDays,
      );
      results.push({ day: dayData.day, slots: daySlots });

      // 更新已用
      for (const s of Object.values(daySlots)) {
        if (s?.placeId) {
          usedPlaceIds.set(s.placeId, (usedPlaceIds.get(s.placeId) ?? 0) + 1);
          const c = candidates.find((x) => x.id === s.placeId);
          if (c?.category === 'RESTAURANT') {
            const set = usedRestaurantIdsPerDay.get(dayData.day) ?? new Set();
            set.add(s.placeId);
            usedRestaurantIdsPerDay.set(dayData.day, set);
          }
        }
      }
    }

    this.logger.log(`路径优化完成: ${results.length} 天`);
    return { days: results };
  }

  private async optimizeDay(
    dayData: { day: number; date: string },
    candidates: CandidatePlace[],
    usedPlaceIds: Map<number, number>,
    dayRestaurantIds: Set<number>,
    dto?: CreateTripDraftDto,
    totalDays?: number,
  ): Promise<Record<string, { placeId: number; reason: string; alternatives?: number[] }>> {
    const slots: Record<
      string,
      { placeId: number; reason: string; alternatives?: number[] }
    > = {};
    const usedToday = new Set<number>();

    // 0. dayAllocation：按天过滤候选到对应城市
    let dayCandidates = candidates;
    if (dto?.dayAllocation && dto.dayAllocation.length > 0 && candidates.some((c) => c.cityName != null)) {
      const cityForDay = this.getCityForDay(dayData.day, dto.dayAllocation);
      if (cityForDay) {
        dayCandidates = candidates.filter(
          (c) => c.cityName === cityForDay || (c.cityName && cityForDay.includes(c.cityName)),
        );
        if (dayCandidates.length > 0) {
          this.logger.debug(`optimizeDay: 第 ${dayData.day} 天限定城市 ${cityForDay}，候选 ${dayCandidates.length} 个`);
        }
      }
    }
    if (dayCandidates.length < 5) {
      dayCandidates = candidates; // 城市过滤后过少则回退全量
    }

    // 1. 选择 1-2 个 cluster（按点数排序，取前 2）
    const clusterCounts = new Map<number, CandidatePlace[]>();
    for (const c of dayCandidates) {
      if (c.clusterId === undefined) continue;
      if (!clusterCounts.has(c.clusterId)) {
        clusterCounts.set(c.clusterId, []);
      }
      clusterCounts.get(c.clusterId)!.push(c);
    }
    const topClusters = [...clusterCounts.entries()]
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, 2)
      .map(([id]) => id);

    let inScope = dayCandidates.filter(
      (c) => c.clusterId !== undefined && topClusters.includes(c.clusterId),
    );
    // 回退：cluster 不足或 inScope 过少时，使用当天候选（避免行程为空或过于单一）
    if (inScope.length < 15) {
      inScope = dayCandidates;
      this.logger.debug(
        `optimizeDay: cluster 候选不足 (${inScope.length} 个)，回退到全量 ${candidates.length} 个候选`,
      );
    }
    const attractions = inScope.filter(
      (c) =>
        c.category === 'ATTRACTION' ||
        c.category === 'SHOPPING' ||
        c.category === 'TRANSIT_HUB',
    );
    const restaurants = inScope.filter((c) => c.category === 'RESTAURANT');

    const pick = async (
      pool: CandidatePlace[],
      avoidIds: Set<number>,
      near?: { lat: number; lng: number },
      category?: string,
      pacingFilter?: { slot: TimeSlot; previousTypes: Array<{ isMuseum: boolean; isAttraction: boolean }> },
      slot?: TimeSlot,
      fromPlaceId?: number,
    ): Promise<CandidatePlace | null> => {
      let filtered = pool.filter((c) => !avoidIds.has(c.id));
      // 🆕 多样性约束（Decision OS）：F&B（餐饮/咖啡）全程最多 1 次；其它根据行程天数动态调整
      const isFoodAndBeverage = (c: CandidatePlace): boolean => {
        if (c.category === 'RESTAURANT') return true;
        const ct = String((c as any).canonicalType ?? '').toUpperCase();
        if (ct.includes('CAFE') || ct.includes('COFFEE') || ct.includes('BAR')) return true;
        const tags = Array.isArray((c as any).tags) ? ((c as any).tags as string[]) : [];
        const t = tags.join(' ').toLowerCase();
        return t.includes('cafe') || t.includes('coffee') || t.includes('咖啡') || t.includes('bar');
      };
      const repetitionLimitFor = (c: CandidatePlace): number => {
        if (isFoodAndBeverage(c)) return 1;
        // 对于多天行程（>3天），非餐饮类最多1次；短行程（≤3天）最多2次
        return (totalDays ?? 3) > 3 ? 1 : 2;
      };
      filtered = filtered.filter((c) => (usedPlaceIds.get(c.id) ?? 0) < repetitionLimitFor(c));
      if (category) {
        filtered = filtered.filter((c) => c.category === category);
      }
      if (pacingFilter) {
        filtered = filtered.filter(
          (c) => !this.pacingEngine.shouldAvoidForPacing(pacingFilter.slot, c, pacingFilter.previousTypes),
        );
      }
      if (filtered.length === 0) return null;

      // PlaceGraph: 有 fromPlaceId 时批量查 walkTime，优先用于 distEff
      const walkTimeMap = new Map<number, number>();
      if (fromPlaceId && this.placeGraph && filtered.length > 0) {
        const edges = await this.placeGraph.getOutEdges(fromPlaceId, filtered.map((c) => c.id));
        for (const [toId, info] of edges) {
          if (info.walkTimeMin != null) walkTimeMap.set(toId, info.walkTimeMin);
        }
      }

      const fromCandidate = fromPlaceId ? candidates.find((x) => x.id === fromPlaceId) : undefined;
      const fromDistrictId = fromCandidate?.districtId;

      const score = (c: CandidatePlace) => {
        const experience = (c.rating ?? 0) / 5;
        const popularity = (c.popularity ?? 5) / 10;
        let distEff = 1;
        const walkTimeMin = walkTimeMap.get(c.id);
        if (walkTimeMin != null) {
          // 🆕 更严格的距离衰减：15分钟内线性衰减，超过则指数衰减
          distEff = walkTimeMin < 15 ? 1 - (walkTimeMin / 30) : Math.exp(-(walkTimeMin - 15) / 10);
        } else if (near) {
          const km = this.haversineKm(c.lat, c.lng, near.lat, near.lng);
          // 🆕 步行模式下更严格：1km内线性衰减，超过则指数衰减
          const threshold = dto?.transport === 'car' ? 3 : dto?.transport === 'transit' ? 2 : 1;
          distEff = km < threshold ? 1 - (km / (threshold * 2)) : Math.exp(-(km - threshold) / 2);
        }
        let timingScore = 1;
        if (slot) {
          timingScore = this.bestVisitTimeResolver.matchScore(
            { physicalMetadata: { bestVisitTime: c.bestVisitTime }, category: c.category },
            slot,
          );
        }
        let districtBonus = 1;
        if (fromDistrictId != null && c.districtId === fromDistrictId) {
          districtBonus = 1.1;
        }
        // 多样性：跨天去重，景点优先选未用过的（已用 2 次已过滤，已用 1 次降权）
        const usedCount = usedPlaceIds.get(c.id) ?? 0;
        const diversityFactor =
          usedCount >= 2 ? 0 : usedCount === 1 ? (c.category === 'RESTAURANT' ? 0.6 : 0.35) : 1;
        // 🆕 调整权重：距离 35%，体验 30%，热度 20%，时间匹配 15%
        return ((0.3 * experience + 0.2 * popularity + 0.35 * distEff) * timingScore) * districtBonus * diversityFactor;
      };

      filtered.sort((a, b) => score(b) - score(a));

      // Travel World Model Phase 5: 有 TravelSimulation 时对 top 候选重排
      if (
        this.travelSimulation &&
        dayData.date &&
        slot &&
        filtered.length > 0
      ) {
        const slotHour = slotToHour(slot);
        const visitTime = `${dayData.date}T${String(slotHour).padStart(2, '0')}:00:00`;
        const topK = filtered.slice(0, Math.min(10, filtered.length));
        const inputs = topK.map((c) => ({
          placeId: c.id,
          visitTime,
          placeSnapshot: {
            bestVisitTime: c.bestVisitTime,
            category: c.category,
            rating: c.rating,
          },
        }));
        const predMap = await this.travelSimulation.simulatePlaces(inputs);
        const scoreWithPred = (c: CandidatePlace) => {
          const base = score(c);
          const pred = predMap.get(c.id)?.predictedExperienceScore ?? 0.5;
          return base * (0.5 + 0.5 * pred);
        };
        filtered.sort((a, b) => scoreWithPred(b) - scoreWithPred(a));
      }

      return filtered[0] ?? null;
    };

    const slotToHour = (s: TimeSlot): number => {
      const h: Record<TimeSlot, number> = {
        [TimeSlot.MORNING]: 9,
        [TimeSlot.LUNCH]: 12,
        [TimeSlot.AFTERNOON]: 14,
        [TimeSlot.DINNER]: 18,
        [TimeSlot.EVENING]: 20,
      };
      return h[s] ?? 12;
    };

    let lastLat: number | undefined;
    let lastLng: number | undefined;
    let lastPlaceId: number | undefined;
    const previousActivityTypes: Array<{ isMuseum: boolean; isAttraction: boolean }> = [];

    // morning: 景点（无节奏约束，bestVisitTime 匹配）
    const morning = await pick(attractions, usedToday, undefined, undefined, undefined, TimeSlot.MORNING);
    if (morning) {
      usedToday.add(morning.id);
      previousActivityTypes.push({
        isMuseum: this.pacingEngine.isMuseum(morning),
        isAttraction: this.pacingEngine.isAttraction(morning),
      });
      lastLat = morning.lat;
      lastLng = morning.lng;
      lastPlaceId = morning.id;
      slots['morning'] = {
        placeId: morning.id,
        reason: `高评分景点，${morning.nameCN}`,
        alternatives: attractions
          .filter((c) => c.id !== morning.id)
          .slice(0, 3)
          .map((c) => c.id),
      };
    }

    // lunch: 餐厅（靠近上午，bestVisitTime 匹配）
    const lunch = await pick(
      restaurants,
      dayRestaurantIds,
      lastLat !== undefined && lastLng !== undefined
        ? { lat: lastLat, lng: lastLng }
        : undefined,
      'RESTAURANT',
      undefined,
      TimeSlot.LUNCH,
      lastPlaceId,
    );
    if (lunch) {
      usedToday.add(lunch.id);
      dayRestaurantIds.add(lunch.id);
      lastLat = lunch.lat;
      lastLng = lunch.lng;
      lastPlaceId = lunch.id;
      slots['lunch'] = {
        placeId: lunch.id,
        reason: `附近餐厅，${lunch.nameCN}`,
        alternatives: restaurants
          .filter((c) => c.id !== lunch.id && !dayRestaurantIds.has(c.id))
          .slice(0, 3)
          .map((c) => c.id),
      };
    }

    // afternoon: 景点（靠近午餐，节奏约束，bestVisitTime 匹配）
    const afternoon = await pick(
      attractions,
      usedToday,
      lastLat !== undefined && lastLng !== undefined
        ? { lat: lastLat, lng: lastLng }
        : undefined,
      undefined,
      { slot: TimeSlot.AFTERNOON, previousTypes: [...previousActivityTypes] },
      TimeSlot.AFTERNOON,
      lastPlaceId,
    );
    if (afternoon) {
      usedToday.add(afternoon.id);
      previousActivityTypes.push({
        isMuseum: this.pacingEngine.isMuseum(afternoon),
        isAttraction: this.pacingEngine.isAttraction(afternoon),
      });
      lastLat = afternoon.lat;
      lastLng = afternoon.lng;
      lastPlaceId = afternoon.id;
      slots['afternoon'] = {
        placeId: afternoon.id,
        reason: `下午活动，${afternoon.nameCN}`,
        alternatives: attractions
          .filter((c) => c.id !== afternoon.id && !usedToday.has(c.id))
          .slice(0, 3)
          .map((c) => c.id),
      };
    }

    // dinner: 餐厅（靠近下午，且不同于午餐，bestVisitTime 匹配）
    const dinner = await pick(
      restaurants,
      dayRestaurantIds,
      lastLat !== undefined && lastLng !== undefined
        ? { lat: lastLat, lng: lastLng }
        : undefined,
      'RESTAURANT',
      undefined,
      TimeSlot.DINNER,
      lastPlaceId,
    );
    if (dinner) {
      usedToday.add(dinner.id);
      lastPlaceId = dinner.id;
      slots['dinner'] = {
        placeId: dinner.id,
        reason: `晚餐推荐，${dinner.nameCN}`,
        alternatives: restaurants
          .filter((c) => c.id !== dinner.id && !dayRestaurantIds.has(c.id))
          .slice(0, 3)
          .map((c) => c.id),
      };
    }

    // evening: 可选景点（节奏约束，bestVisitTime 匹配）
    const evening = await pick(
      attractions,
      usedToday,
      lastLat !== undefined && lastLng !== undefined
        ? { lat: lastLat, lng: lastLng }
        : undefined,
      undefined,
      { slot: TimeSlot.EVENING, previousTypes: [...previousActivityTypes] },
      TimeSlot.EVENING,
      lastPlaceId,
    );
    if (evening) {
      slots['evening'] = {
        placeId: evening.id,
        reason: `晚间活动，${evening.nameCN}`,
        alternatives: [],
      };
    }

    return slots;
  }

  /**
   * 根据 dayAllocation 获取某天对应的城市
   * 例如 [{city: "杭州", days: 2}, {city: "千岛湖", days: 1}] → 第1-2天杭州，第3天千岛湖
   */
  private getCityForDay(
    day: number,
    allocation: Array<{ city: string; days: number }>,
  ): string | null {
    let acc = 0;
    for (const { city, days } of allocation) {
      if (day <= acc + days) return city;
      acc += days;
    }
    return null;
  }

  private haversineKm(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number,
  ): number {
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
