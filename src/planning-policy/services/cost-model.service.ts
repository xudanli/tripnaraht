// src/planning-policy/services/cost-model.service.ts

import { Injectable } from '@nestjs/common';
import {
  CostModel,
  EdgeCostInput,
  ItineraryCostInput,
  PlanningPolicy,
} from '../interfaces/planning-policy.interface';
import { TransitSegment } from '../interfaces/transit-segment.interface';

/**
 * 默认代价模型
 * 
 * 统一代价函数：让 Dijkstra、A*、GA、蒙特卡洛、PPO 同源
 */
@Injectable()
export class DefaultCostModel implements CostModel {
  /**
   * 计算边的代价（单段路径）
   * 
   * 用于 Dijkstra/A* 等图搜索算法的边权重
   */
  edgeCost({ segment, policy }: EdgeCostInput): number {
    const w = policy.weights;
    const c = policy.constraints;

    // 1) hard constraints：直接判死刑（返回 Infinity）
    if (c.requireWheelchairAccess && segment.wheelchairAccessible === false) {
      return Number.POSITIVE_INFINITY;
    }
    if (
      c.forbidStairs &&
      (segment.stairsCount ?? 0) > 0 &&
      segment.elevatorAvailable !== true
    ) {
      return Number.POSITIVE_INFINITY;
    }

    // 2) 统一代价：时间价值 + 痛苦项
    const timeCost = segment.durationMin * w.valueOfTimePerMin;

    const walkPain =
      segment.walkMin *
      w.walkPainPerMin *
      (policy.context?.isRaining ? w.rainWalkMultiplier : 1.0);

    const transferPain =
      segment.transferCount *
      w.transferPain *
      (policy.context?.hasElderly ? w.elderlyTransferMultiplier : 1.0);

    const stairPain = (segment.stairsCount ?? 0) > 0 ? w.stairPain : 0;

    const crowdPain = (segment.crowdLevel ?? 0) * 2 * w.crowdPainPerMin; // 简化：拥挤等级映射

    const luggagePain =
      (policy.context?.hasLuggage || policy.context?.isMovingDay) &&
      (segment.mode === 'BUS' || segment.mode === 'SUBWAY')
        ? w.luggageTransitPenalty
        : 0;

    const moneyCost = segment.costCny ?? 0; // 可选：直接加钱，或折算到时间价值体系

    return timeCost + walkPain + transferPain + stairPain + crowdPain + luggagePain + moneyCost;
  }

  /**
   * 计算行程的代价（整体行程）
   * 
   * 用于 GA/2-opt/蒙特卡洛/PPO 的 fitness/reward 函数
   */
  itineraryCost(input: ItineraryCostInput, policy: PlanningPolicy): number {
    const w = policy.weights;

    return (
      input.totalTravelMin * w.valueOfTimePerMin +
      input.totalWalkMin *
        w.walkPainPerMin *
        (policy.context?.isRaining ? w.rainWalkMultiplier : 1.0) +
      input.totalTransfers *
        w.transferPain *
        (policy.context?.hasElderly ? w.elderlyTransferMultiplier : 1.0) +
      input.totalQueueMin * w.crowdPainPerMin +
      (input.totalStairsCount > 0 ? w.stairPain : 0) +
      input.overtimeMin * w.overtimePenaltyPerMin +
      (input.planChangeCount ?? 0) * w.planChangePenalty
    );
  }
}

/**
 * 导出单例实例（方便直接使用）
 */
export const DefaultCostModelInstance = new DefaultCostModel();
