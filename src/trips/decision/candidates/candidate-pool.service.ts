// src/trips/decision/candidates/candidate-pool.service.ts

/**
 * Candidate Pool Service - 候选集工程化
 * 
 * 把候选活动从"散点"变成"可控供给"
 */

import { Injectable } from '@nestjs/common';
import {
  ActivityCandidate,
  TripWorldState,
  ISODate,
  GeoPoint,
} from '../world-model';

export interface CandidatePoolConfig {
  maxCandidatesPerDay: number;      // 每日最大候选数
  maxDistanceKm?: number;           // 距离圈（公里）
  preferIndoor?: boolean;           // 是否偏好室内
  preferNearby?: boolean;           // 是否偏好附近
}

export interface SubstitutionSet {
  groupId: string;
  candidates: ActivityCandidate[];
  reason: string; // 为什么这些是替代关系
}

@Injectable()
export class CandidatePoolService {
  /**
   * 生成每日候选集
   * 
   * 按距离圈/主题/节奏生成 TopN
   */
  generateDailyCandidates(
    state: TripWorldState,
    date: ISODate,
    centerPoint?: GeoPoint,
    config: CandidatePoolConfig = { maxCandidatesPerDay: 20 }
  ): ActivityCandidate[] {
    let candidates = state.candidatesByDate[date] || [];

    // 1. 距离过滤（如果有中心点）
    if (centerPoint && config.maxDistanceKm) {
      candidates = candidates.filter(c => {
        if (!c.location?.point) return false;
        const distance = this.calculateDistance(
          centerPoint,
          c.location.point
        );
        return distance <= config.maxDistanceKm!;
      });
    }

    // 2. 偏好过滤
    if (config.preferIndoor) {
      candidates = candidates.filter(
        c => c.indoorOutdoor === 'indoor' || c.indoorOutdoor === 'mixed'
      );
    }

    // 3. 评分排序
    candidates = this.scoreAndSort(candidates, state);

    // 4. TopN
    return candidates.slice(0, config.maxCandidatesPerDay);
  }

  /**
   * 生成备选集（Substitution sets）
   * 
   * 室外↔室内、远↔近、贵↔便宜
   */
  generateSubstitutionSets(
    candidates: ActivityCandidate[],
    baseCandidate: ActivityCandidate
  ): SubstitutionSet[] {
    const sets: SubstitutionSet[] = [];

    // 1. 室内/室外替代
    if (baseCandidate.indoorOutdoor === 'outdoor') {
      const indoorAlternatives = candidates.filter(
        c =>
          c.id !== baseCandidate.id &&
          (c.indoorOutdoor === 'indoor' || c.indoorOutdoor === 'mixed') &&
          c.type === baseCandidate.type
      );
      if (indoorAlternatives.length > 0) {
        sets.push({
          groupId: `indoor_${baseCandidate.id}`,
          candidates: indoorAlternatives,
          reason: 'Indoor alternatives for outdoor activity',
        });
      }
    }

    // 2. 距离替代（近↔远）
    if (baseCandidate.location?.point) {
      const basePoint = baseCandidate.location.point;
      const nearby = candidates
        .filter(
          c =>
            c.id !== baseCandidate.id &&
            c.location?.point &&
            this.calculateDistance(
              basePoint,
              c.location.point
            ) < 10 // 10km 内
        )
        .slice(0, 5);
      if (nearby.length > 0) {
        sets.push({
          groupId: `nearby_${baseCandidate.id}`,
          candidates: nearby,
          reason: 'Nearby alternatives',
        });
      }
    }

    // 3. 价格替代（便宜↔贵）
    if (baseCandidate.cost) {
      const baseCost = baseCandidate.cost.amount;
      const cheaper = candidates.filter(
        c =>
          c.id !== baseCandidate.id &&
          c.cost &&
          c.cost.amount < baseCost * 0.7
      );
      if (cheaper.length > 0) {
        sets.push({
          groupId: `cheaper_${baseCandidate.id}`,
          candidates: cheaper.slice(0, 5),
          reason: 'Cheaper alternatives',
        });
      }
    }

    // 4. 同类型替代
    const sameType = candidates.filter(
      c => c.id !== baseCandidate.id && c.type === baseCandidate.type
    );
    if (sameType.length > 0) {
      sets.push({
        groupId: `same_type_${baseCandidate.id}`,
        candidates: sameType.slice(0, 5),
        reason: 'Same type alternatives',
      });
    }

    return sets;
  }

  /**
   * 生成 alternativeGroupId
   * 
   * 生产规则：同类瀑布/同一商圈/同一博物馆等
   */
  assignAlternativeGroups(
    candidates: ActivityCandidate[]
  ): ActivityCandidate[] {
    // 按类型分组
    const typeGroups = new Map<string, ActivityCandidate[]>();
    for (const c of candidates) {
      if (!typeGroups.has(c.type)) {
        typeGroups.set(c.type, []);
      }
      typeGroups.get(c.type)!.push(c);
    }

    // 为每组分配 groupId
    for (const [type, group] of typeGroups) {
      if (group.length > 1) {
        const groupId = `type_${type}_${group[0].id}`;
        for (const c of group) {
          c.alternativeGroupId = groupId;
        }
      }
    }

    // 按区域分组（如果有 location.region）
    const regionGroups = new Map<string, ActivityCandidate[]>();
    for (const c of candidates) {
      const region = c.location?.region;
      if (region) {
        if (!regionGroups.has(region)) {
          regionGroups.set(region, []);
        }
        regionGroups.get(region)!.push(c);
      }
    }

    // 为区域组分配 groupId（如果组内有多项）
    for (const [region, group] of regionGroups) {
      if (group.length > 1) {
        const groupId = `region_${region}`;
        for (const c of group) {
          // 如果已经有 type group，保留；否则用 region group
          if (!c.alternativeGroupId) {
            c.alternativeGroupId = groupId;
          }
        }
      }
    }

    return candidates;
  }

  /**
   * 评分和排序
   */
  private scoreAndSort(
    candidates: ActivityCandidate[],
    state: TripWorldState
  ): ActivityCandidate[] {
    const scored = candidates.map(c => ({
      candidate: c,
      score: this.calculateScore(c, state),
    }));

    return scored
      .sort((a, b) => b.score - a.score)
      .map(item => item.candidate);
  }

  /**
   * 计算候选评分
   */
  private calculateScore(
    candidate: ActivityCandidate,
    state: TripWorldState
  ): number {
    let score = 0;

    // 意图匹配
    const intentScore = (candidate.intentTags || []).reduce(
      (sum, tag) => sum + (state.context.preferences.intents[tag] || 0),
      0
    );
    score += intentScore * 1.2;

    // 质量
    score += (candidate.qualityScore || 0.5) * 0.8;

    // 独特性
    score += (candidate.uniquenessScore || 0.3) * 0.5;

    // mustSee 加成
    if (candidate.mustSee) {
      score += 10;
    }

    // 惩罚：天气敏感
    if (candidate.weatherSensitivity) {
      score -= candidate.weatherSensitivity * 0.15;
    }

    // 惩罚：风险（如果用户不接受）
    if (
      candidate.riskLevel === 'high' &&
      state.context.preferences.riskTolerance === 'low'
    ) {
      score -= 0.6;
    }

    return score;
  }

  /**
   * 计算两点距离（公里）
   */
  private calculateDistance(from: GeoPoint, to: GeoPoint): number {
    const R = 6371; // 地球半径（公里）
    const dLat = this.toRad(to.lat - from.lat);
    const dLon = this.toRad(to.lng - from.lng);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(from.lat)) *
        Math.cos(this.toRad(to.lat)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRad(degrees: number): number {
    return (degrees * Math.PI) / 180;
  }
}

