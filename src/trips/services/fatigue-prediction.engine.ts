/**
 * TripNara 疲劳预测引擎
 *
 * FatigueScore = 0.35×WalkingDistance + 0.25×PlaceCount + 0.2×TransportTime
 *              + 0.1×ElevationChange + 0.1×VisitDuration
 *
 * 等级：0-3 轻松，3-5 平衡，5-7 紧凑，>7 疲劳
 * 约束：intensity=relaxed 时 FatigueScore <= 4
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

export type FatigueLevel = 'easy' | 'balanced' | 'tight' | 'fatigued';

export interface FatigueResult {
  score: number;
  level: FatigueLevel;
  walkingDistanceKm: number;
  placeCount: number;
  transportTimeH: number;
  elevationChangeNorm: number;
  visitDurationNorm: number;
}

@Injectable()
export class FatiguePredictionEngine {
  private readonly logger = new Logger(FatiguePredictionEngine.name);

  /**
   * 计算单日疲劳分数
   * 按交通方式调整：步行 4km/h，公交 25km/h，自驾 60km/h；自驾时距离对疲劳影响降低
   */
  compute(
    daySlots: Record<string, { placeId: number }>,
    candidates: CandidatePlace[],
    transport?: TransportMode,
  ): FatigueResult {
    const placeIds = SLOT_ORDER.map((s) => daySlots[s]?.placeId).filter(
      (id): id is number => id != null,
    );
    const map = new Map(candidates.map((c) => [c.id, c]));

    let distanceKm = 0;
    let visitDurationMin = 0;

    for (let i = 0; i < placeIds.length - 1; i++) {
      const a = map.get(placeIds[i]);
      const b = map.get(placeIds[i + 1]);
      if (a && b) {
        distanceKm += this.haversineKm(a.lat, a.lng, b.lat, b.lng);
      }
    }

    for (const pid of placeIds) {
      const c = map.get(pid);
      if (c?.avgVisitDuration) {
        visitDurationMin += c.avgVisitDuration;
      } else {
        visitDurationMin += 60;
      }
    }

    const placeCount = placeIds.length;
    // 步行 4km/h，公交 25km/h，自驾 60km/h
    const speedKmh = transport === TransportMode.CAR ? 60 : transport === TransportMode.TRANSIT ? 25 : 4;
    const transportTimeH = Math.min(distanceKm / speedKmh, 4);
    const elevationChangeNorm = 0; // 暂无 elevation 数据，用 0
    const visitDurationNorm = visitDurationMin / 120; // 8h -> 4

    // 自驾时距离对疲劳影响降低：等效距离 = 实际距离 / 15（150km 自驾 ≈ 10km 步行疲劳）
    const effectiveDistanceKm =
      transport === TransportMode.CAR ? distanceKm / 15 : transport === TransportMode.TRANSIT ? distanceKm / 4 : distanceKm;

    const score =
      0.35 * effectiveDistanceKm +
      0.25 * placeCount +
      0.2 * transportTimeH +
      0.1 * elevationChangeNorm +
      0.1 * visitDurationNorm;

    const level = this.scoreToLevel(score);

    return {
      score: Math.round(score * 10) / 10,
      level,
      walkingDistanceKm: Math.round(distanceKm * 10) / 10,
      placeCount,
      transportTimeH: Math.round(transportTimeH * 10) / 10,
      elevationChangeNorm,
      visitDurationNorm: Math.round(visitDurationNorm * 10) / 10,
    };
  }

  scoreToLevel(score: number): FatigueLevel {
    if (score <= 3) return 'easy';
    if (score <= 5) return 'balanced';
    if (score <= 7) return 'tight';
    return 'fatigued';
  }

  /** intensity=relaxed 时允许的最大疲劳分 */
  getMaxScoreForIntensity(intensity?: string): number {
    if (intensity === 'relaxed') return 4;
    if (intensity === 'intense') return 8;
    return 6; // balanced
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
