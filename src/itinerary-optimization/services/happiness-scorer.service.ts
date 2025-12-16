// src/itinerary-optimization/services/happiness-scorer.service.ts
import { Injectable } from '@nestjs/common';
import { PlaceNode, RouteSolution, OptimizationConfig } from '../interfaces/route-optimization.interface';
import { DateTime } from 'luxon';

/**
 * 快乐值评分服务
 * 
 * 计算路线的"快乐值"，考虑：
 * - 兴趣分（Interest Score）
 * - 距离惩罚（Distance Penalty）
 * - 疲劳惩罚（Tired Penalty）
 * - 厌倦惩罚（Bored Penalty）
 * - 饥饿惩罚（Starve Penalty）
 * - 聚类奖励（Clustering Bonus）
 * - 留白奖励（Buffer Bonus）
 */
@Injectable()
export class HappinessScorerService {
  /**
   * 计算路线的快乐值总分
   * 
   * 公式：TotalScore = Interest - Penalties + Bonuses
   */
  calculateHappinessScore(
    nodes: PlaceNode[],
    schedule: RouteSolution['schedule'],
    config: OptimizationConfig,
    zones?: { id: number; places: PlaceNode[] }[]
  ): RouteSolution['scoreBreakdown'] {
    // 创建节点索引映射，方便查找
    const nodeMap = new Map<number, PlaceNode>();
    nodes.forEach((node, index) => {
      nodeMap.set(index, node);
    });
    const breakdown = {
      interestScore: 0,
      distancePenalty: 0,
      tiredPenalty: 0,
      boredPenalty: 0,
      starvePenalty: 0,
      clusteringBonus: 0,
      bufferBonus: 0,
    };

    // 1. 兴趣分（基础分，每个地点都有）
    breakdown.interestScore = nodes.length * 100;

    // 2. 距离惩罚（折返跑惩罚）
    breakdown.distancePenalty = this.calculateDistancePenalty(nodes);

    // 3. 疲劳惩罚（连续高强度活动）
    breakdown.tiredPenalty = this.calculateTiredPenalty(nodes);

    // 4. 厌倦惩罚（连续相同类别）
    breakdown.boredPenalty = this.calculateBoredPenalty(nodes);

    // 5. 饥饿惩罚（饭点没有餐厅）
    breakdown.starvePenalty = this.calculateStarvePenalty(
      schedule,
      config,
      nodeMap
    );

    // 6. 聚类奖励（同一时间段在同一 Zone）
    if (zones) {
      breakdown.clusteringBonus = this.calculateClusteringBonus(schedule, zones, config);
    }

    // 7. 留白奖励（有足够的缓冲时间）
    breakdown.bufferBonus = this.calculateBufferBonus(schedule, config);

    return breakdown;
  }

  /**
   * 计算距离惩罚（折返跑惩罚）
   * 
   * 如果路线来回折返，增加惩罚
   */
  private calculateDistancePenalty(nodes: PlaceNode[]): number {
    if (nodes.length < 2) return 0;

    let totalDistance = 0;
    let maxDistance = 0;

    for (let i = 0; i < nodes.length - 1; i++) {
      const distance = this.calculateDistance(
        nodes[i].location,
        nodes[i + 1].location
      );
      totalDistance += distance;
      maxDistance = Math.max(maxDistance, distance);
    }

    // 如果最大单段距离超过平均距离的 2 倍，说明有折返
    const avgDistance = totalDistance / (nodes.length - 1);
    if (maxDistance > avgDistance * 2) {
      return Math.round((maxDistance - avgDistance * 2) / 100); // 每 100 米折返扣 1 分
    }

    return 0;
  }

  /**
   * 计算疲劳惩罚（集成Trail体力消耗）
   * 
   * 如果连续两个高强度活动，扣 50 分
   * 如果包含Trail，根据Trail的体力消耗增加惩罚
   */
  private calculateTiredPenalty(nodes: PlaceNode[]): number {
    let penalty = 0;

    for (let i = 0; i < nodes.length - 1; i++) {
      const current = nodes[i];
      const next = nodes[i + 1];

      const currentIntensity = this.getIntensity(current);
      const nextIntensity = this.getIntensity(next);

      // 连续两个高强度活动
      if (currentIntensity === 'HIGH' && nextIntensity === 'HIGH') {
        penalty += 50;
      }

      // 连续三个中等强度活动也惩罚
      if (
        i < nodes.length - 2 &&
        currentIntensity === 'MEDIUM' &&
        nextIntensity === 'MEDIUM' &&
        this.getIntensity(nodes[i + 2]) === 'MEDIUM'
      ) {
        penalty += 30;
      }

      // Trail体力消耗惩罚
      if (current.trailData) {
        const trailPenalty = this.calculateTrailFatiguePenalty(current.trailData);
        penalty += trailPenalty;
      }
    }

    // 检查最后一个节点是否包含Trail
    const lastNode = nodes[nodes.length - 1];
    if (lastNode?.trailData) {
      const trailPenalty = this.calculateTrailFatiguePenalty(lastNode.trailData);
      penalty += trailPenalty;
    }

    return penalty;
  }

  /**
   * 计算Trail的疲劳惩罚
   * 
   * 将Trail的体力消耗转换为疲劳惩罚分数
   */
  private calculateTrailFatiguePenalty(trailData: PlaceNode['trailData']): number {
    if (!trailData) return 0;

    // 基础惩罚：距离 + 爬升
    // 每公里扣5分，每100米爬升扣3分
    let penalty = trailData.distanceKm * 5 + trailData.elevationGainM / 100 * 3;

    // 难度惩罚
    switch (trailData.difficultyLevel) {
      case 'EASY':
        penalty *= 0.8; // 简单路线减少20%惩罚
        break;
      case 'MODERATE':
        // 无调整
        break;
      case 'HARD':
        penalty *= 1.3; // 困难路线增加30%惩罚
        break;
      case 'EXTREME':
        penalty *= 1.8; // 极限路线增加80%惩罚
        break;
    }

    // 海拔惩罚（高海拔额外惩罚）
    if (trailData.maxElevationM) {
      if (trailData.maxElevationM > 4000) {
        penalty *= 1.5; // 4000米以上增加50%惩罚
      } else if (trailData.maxElevationM > 3000) {
        penalty *= 1.3; // 3000-4000米增加30%惩罚
      }
    }

    return Math.round(penalty);
  }

  /**
   * 计算厌倦惩罚
   * 
   * 如果连续两个相同类别（如都是"寺庙"），扣 30 分
   */
  private calculateBoredPenalty(nodes: PlaceNode[]): number {
    let penalty = 0;

    for (let i = 0; i < nodes.length - 1; i++) {
      const current = nodes[i];
      const next = nodes[i + 1];

      // 跳过休息和用餐
      if (current.isRest || next.isRest) continue;
      if (current.isRestaurant || next.isRestaurant) continue;

      // 连续两个相同类别
      if (current.category === next.category) {
        penalty += 30;
      }
    }

    return penalty;
  }

  /**
   * 计算饥饿惩罚
   * 
   * 如果 12:00-13:30 之间没有安排餐厅，扣 100 分（硬伤）
   */
  private calculateStarvePenalty(
    schedule: RouteSolution['schedule'],
    config: OptimizationConfig,
    nodeMap: Map<number, PlaceNode>
  ): number {
    if (!config.lunchWindow) return 0;

    const lunchStart = DateTime.fromISO(config.lunchWindow.start);
    const lunchEnd = DateTime.fromISO(config.lunchWindow.end);

    // 检查午餐时间窗内是否有餐厅
    let hasRestaurant = false;

    for (const item of schedule) {
      const startTime = DateTime.fromISO(item.startTime);
      const endTime = DateTime.fromISO(item.endTime);

      // 检查时间是否重叠
      const overlaps =
        (startTime >= lunchStart && startTime <= lunchEnd) ||
        (endTime >= lunchStart && endTime <= lunchEnd) ||
        (startTime <= lunchStart && endTime >= lunchEnd);

      if (overlaps) {
        const node = nodeMap.get(item.nodeIndex);
        if (node && node.isRestaurant) {
          hasRestaurant = true;
          break;
        }
      }
    }

    // 如果午餐时间窗内没有餐厅，扣 100 分
    return hasRestaurant ? 0 : 100;
  }

  /**
   * 计算聚类奖励
   * 
   * 同一时间段（上午/下午）在同一 Zone 内，奖励分数
   */
  private calculateClusteringBonus(
    schedule: RouteSolution['schedule'],
    zones: { id: number; places: PlaceNode[] }[],
    config: OptimizationConfig
  ): number {
    // 将时间分为上午和下午
    const startTime = DateTime.fromISO(config.startTime);
    const endTime = DateTime.fromISO(config.endTime);
    const noon = startTime.set({ hour: 12, minute: 0 });

    const morningNodes: number[] = [];
    const afternoonNodes: number[] = [];

    for (const item of schedule) {
      const itemTime = DateTime.fromISO(item.startTime);
      if (itemTime < noon) {
        morningNodes.push(item.nodeIndex);
      } else {
        afternoonNodes.push(item.nodeIndex);
      }
    }

    let bonus = 0;

    // 检查上午是否在同一 Zone
    if (morningNodes.length > 1) {
      const morningZones = this.getZonesForNodes(morningNodes, zones);
      if (morningZones.size === 1) {
        bonus += 50; // 上午在同一 Zone，奖励 50 分
      }
    }

    // 检查下午是否在同一 Zone
    if (afternoonNodes.length > 1) {
      const afternoonZones = this.getZonesForNodes(afternoonNodes, zones);
      if (afternoonZones.size === 1) {
        bonus += 50; // 下午在同一 Zone，奖励 50 分
      }
    }

    return bonus;
  }

  /**
   * 获取节点所在的 Zone
   */
  private getZonesForNodes(
    nodeIndices: number[],
    zones: { id: number; places: PlaceNode[] }[]
  ): Set<number> {
    const zoneSet = new Set<number>();

    for (const zone of zones) {
      for (const nodeIndex of nodeIndices) {
        // 这里需要根据 nodeIndex 找到对应的节点
        // 简化处理：假设 nodeIndex 对应 places 的索引
        if (zone.places.some((p, i) => i === nodeIndex)) {
          zoneSet.add(zone.id);
        }
      }
    }

    return zoneSet;
  }

  /**
   * 计算留白奖励
   * 
   * 如果路线有足够的缓冲时间，奖励分数
   */
  private calculateBufferBonus(
    schedule: RouteSolution['schedule'],
    config: OptimizationConfig
  ): number {
    let bonus = 0;

    for (let i = 0; i < schedule.length - 1; i++) {
      const current = schedule[i];
      const next = schedule[i + 1];

      const currentEnd = DateTime.fromISO(current.endTime);
      const nextStart = DateTime.fromISO(next.startTime);

      const bufferMinutes = nextStart.diff(currentEnd, 'minutes').minutes;

      // 如果有交通时间，计算实际缓冲
      const transportTime = current.transportTime || 0;
      const actualBuffer = bufferMinutes - transportTime;

      // 缓冲时间 = 交通时间 × 弹性因子 + 15 分钟
      const requiredBuffer = transportTime * config.pacingFactor + 15;

      if (actualBuffer >= requiredBuffer) {
        bonus += 10; // 有足够缓冲，奖励 10 分
      } else if (actualBuffer < requiredBuffer * 0.5) {
        bonus -= 20; // 缓冲不足，扣 20 分
      }
    }

    return bonus;
  }

  /**
   * 获取地点强度等级
   */
  private getIntensity(node: PlaceNode): 'LOW' | 'MEDIUM' | 'HIGH' {
    if (node.intensity) {
      return node.intensity;
    }

    // 根据 physicalMetadata 推断
    if (node.physicalMetadata) {
      const intensityFactor = node.physicalMetadata.intensity_factor || 1.0;
      if (intensityFactor >= 1.5) return 'HIGH';
      if (intensityFactor <= 0.5) return 'LOW';
    }

    // 根据类别推断
    if (node.category === 'ATTRACTION') {
      return 'MEDIUM';
    }
    if (node.category === 'RESTAURANT' || node.isRest) {
      return 'LOW';
    }

    return 'MEDIUM';
  }

  /**
   * 计算两点间距离（米）
   */
  private calculateDistance(
    point1: { lat: number; lng: number },
    point2: { lat: number; lng: number }
  ): number {
    const R = 6371000; // 地球半径（米）
    const dLat = this.toRadians(point2.lat - point1.lat);
    const dLng = this.toRadians(point2.lng - point1.lng);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRadians(point1.lat)) *
        Math.cos(this.toRadians(point2.lat)) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }
}

