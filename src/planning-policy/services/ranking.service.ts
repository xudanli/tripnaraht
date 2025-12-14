// src/planning-policy/services/ranking.service.ts

import { Injectable } from '@nestjs/common';
import {
  RankingRequest,
  PoiRankingFeatures,
} from '../interfaces/ranking.interface';
import { FeasibilityService } from './feasibility.service';
import { calculateDistance } from '../utils/time-utils';

/**
 * 推荐排序服务（增强版）
 * 
 * 将可行性/时间窗/可达性特征引入排序，做到"推荐即具备可执行感"
 */
@Injectable()
export class RankingService {
  constructor(private feasibilityService: FeasibilityService) {}

  /**
   * 对 POI 进行排序（增强版）
   * 
   * 特征：
   * - feasibleNow（在当前时间/当天是否可行）
   * - openWindowNextMin（下一段开放时间距离）
   * - lastEntrySlack（距离最晚入场还有多少分钟）
   * - accessibilityOK（轮椅/楼梯）
   * - expectedWalkPain（基于画像与地理粗估）
   * - restSupportDensity（周边 1km 休息点密度）
   */
  rankPois(req: RankingRequest): PoiRankingFeatures[] {
    const features = req.pois.map((poi) => {
      // 1. 可行性检查
      const feasibility = this.feasibilityService.isPoiFeasible(
        poi,
        req.currentTimeMin,
        req.policy,
        req.dayOfWeek,
        req.dateISO
      );

      // 2. 等待时间估算
      const waitEstimate = this.feasibilityService.estimateWait(
        poi,
        req.currentTimeMin,
        req.dayOfWeek,
        req.dateISO
      );

      // 3. 可达性检查
      const accessibilityOK =
        !req.policy.constraints.requireWheelchairAccess ||
        poi.wheelchairAccess !== false;
      const stairsOK =
        !req.policy.constraints.forbidStairs || poi.stairsRequired !== true;

      // 4. 预计步行痛苦（简化：如果没有当前位置，返回 0）
      let expectedWalkPain = 0;
      if (req.currentLocation) {
        const distanceM = calculateDistance(
          req.currentLocation.lat,
          req.currentLocation.lng,
          poi.lat,
          poi.lng
        );
        const walkMin = distanceM / 1000 / 5 * 60; // 假设步行速度 5km/h
        expectedWalkPain = walkMin * req.policy.weights.walkPainPerMin;
      }

      // 5. 休息点密度（简化：计算 1km 内的休息点数）
      let restSupportDensity = 0;
      if (req.restStops && req.restStops.length > 0) {
        const nearby = req.restStops.filter((rest) => {
          const distanceM = calculateDistance(
            poi.lat,
            poi.lng,
            rest.lat,
            rest.lng
          );
          return distanceM <= 1000; // 1km 内
        });
        restSupportDensity = nearby.length;
      }

      // 6. 基础兴趣分数
      const baseInterestScore =
        req.baseInterestScores?.get(poi.id) ?? 1.0;

      // 7. 计算综合得分
      let finalScore = baseInterestScore;

      // 可行性加权（不可行的大幅降权，但不过滤，让用户知道为什么）
      if (!feasibility.feasible) {
        finalScore *= 0.1; // 大幅降权但不为0
      } else {
        // 可行的加分
        if (feasibility.inOpenWindow) {
          finalScore *= 1.2; // 当前已开放，优先
        } else if (waitEstimate.waitMin > 0 && waitEstimate.waitMin < 60) {
          finalScore *= 1.1; // 等待时间短，稍优先
        } else if (waitEstimate.waitMin >= 180) {
          finalScore *= 0.7; // 等待时间过长，降权
        }
      }

      // 可达性加权
      if (!accessibilityOK || !stairsOK) {
        finalScore *= 0.05; // 不可达的几乎不推荐
      }

      // 步行痛苦惩罚（对于 CITY_POTATO/LIMITED 更重要）
      const mobilityWorst = req.policy.derived.groupMobilityWorst;
      if (mobilityWorst === 'CITY_POTATO' || mobilityWorst === 'LIMITED') {
        finalScore -= expectedWalkPain * 0.1; // 步行痛苦越大，分数越低
      }

      // 休息点密度加成（对脆皮很重要）
      if (mobilityWorst === 'CITY_POTATO' || mobilityWorst === 'LIMITED') {
        finalScore += restSupportDensity * 0.05; // 有休息点支持更好
      }

      return {
        poiId: poi.id,
        baseInterestScore,
        feasibleNow: feasibility.feasible,
        openWindowNextMin: waitEstimate.waitMin ?? 0,
        lastEntrySlack: feasibility.pastLastEntry
          ? -999
          : poi.openingHours?.lastEntry
            ? this.calculateLastEntrySlack(
                poi.openingHours.lastEntry,
                req.currentTimeMin
              )
            : 999,
        accessibilityOK: accessibilityOK && stairsOK,
        expectedWalkPain,
        restSupportDensity,
        finalScore,
        infeasibleReason: feasibility.feasible ? undefined : feasibility.reason,
      };
    });

    // 按综合得分排序
    return features.sort((a, b) => b.finalScore - a.finalScore);
  }

  /**
   * 计算距离最晚入场的剩余时间
   */
  private calculateLastEntrySlack(
    lastEntryStr: string,
    currentTimeMin: number
  ): number {
    const [h, m] = lastEntryStr.split(':').map(Number);
    const lastEntryMin = h * 60 + m;
    return lastEntryMin - currentTimeMin;
  }
}
