// src/itinerary-optimization/services/route-optimizer.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { DateTime } from 'luxon';
import {
  PlaceNode,
  RouteSolution,
  OptimizationConfig,
  Zone,
} from '../interfaces/route-optimization.interface';
import { SpatialClusteringService } from './spatial-clustering.service';
import { HappinessScorerService } from './happiness-scorer.service';

/**
 * 路线优化服务
 * 
 * 使用模拟退火算法优化路线，最大化"快乐值"
 */
@Injectable()
export class RouteOptimizerService {
  private readonly logger = new Logger(RouteOptimizerService.name);

  constructor(
    private clusteringService: SpatialClusteringService,
    private scorerService: HappinessScorerService
  ) {}

  /**
   * 优化路线
   * 
   * 使用模拟退火算法找到最优路线
   */
  async optimizeRoute(
    places: PlaceNode[],
    config: OptimizationConfig
  ): Promise<RouteSolution> {
    if (places.length === 0) {
      throw new Error('地点列表不能为空');
    }

    // 1. 空间聚类：将地点分组为 Zone
    const zones = await this.clusteringService.clusterPlaces(
      places,
      config.clustering?.epsilon || 2000,
      config.clustering?.minPoints || 2
    );

    this.logger.debug(`聚类完成：${zones.length} 个 Zone`);

    // 2. 生成初始解（随机排列）
    let currentRoute = this.generateInitialRoute(places, config);
    let currentScore = this.calculateTotalScore(currentRoute, config, zones);

    this.logger.debug(`初始解分数：${currentScore}`);

    // 3. 模拟退火优化
    const optimizedRoute = this.simulatedAnnealing(
      currentRoute,
      currentScore,
      config,
      zones
    );

    // 4. 生成时间安排
    const schedule = this.generateSchedule(optimizedRoute, config);

    // 5. 计算最终分数
    const scoreBreakdown = this.scorerService.calculateHappinessScore(
      optimizedRoute.nodes,
      schedule,
      config,
      zones
    );

    const totalScore =
      scoreBreakdown.interestScore -
      scoreBreakdown.distancePenalty -
      scoreBreakdown.tiredPenalty -
      scoreBreakdown.boredPenalty -
      scoreBreakdown.starvePenalty +
      scoreBreakdown.clusteringBonus +
      scoreBreakdown.bufferBonus;

    return {
      nodes: optimizedRoute.nodes,
      schedule,
      happinessScore: totalScore,
      scoreBreakdown,
      zones,
    };
  }

  /**
   * 生成初始路线（随机排列，但保证餐厅在饭点）
   */
  private generateInitialRoute(
    places: PlaceNode[],
    config: OptimizationConfig
  ): RouteSolution {
    // 分离餐厅和其他地点
    const restaurants = places.filter((p) => p.isRestaurant);
    const otherPlaces = places.filter((p) => !p.isRestaurant);

    // 随机打乱其他地点
    const shuffled = [...otherPlaces].sort(() => Math.random() - 0.5);

    // 插入餐厅到合适位置
    const nodes: PlaceNode[] = [];
    let restaurantIndex = 0;

    for (let i = 0; i < shuffled.length; i++) {
      nodes.push(shuffled[i]);

      // 在午餐时间前插入午餐餐厅
      if (
        config.lunchWindow &&
        restaurantIndex < restaurants.length &&
        i === Math.floor(shuffled.length / 2)
      ) {
        nodes.push(restaurants[restaurantIndex++]);
      }
    }

    // 如果还有餐厅，添加到末尾
    while (restaurantIndex < restaurants.length) {
      nodes.push(restaurants[restaurantIndex++]);
    }

    return {
      nodes,
      schedule: [],
      happinessScore: 0,
      scoreBreakdown: {
        interestScore: 0,
        distancePenalty: 0,
        tiredPenalty: 0,
        boredPenalty: 0,
        starvePenalty: 0,
        clusteringBonus: 0,
        bufferBonus: 0,
      },
    };
  }

  /**
   * 模拟退火算法
   */
  private simulatedAnnealing(
    initialRoute: RouteSolution,
    initialScore: number,
    config: OptimizationConfig,
    zones: Zone[]
  ): RouteSolution {
    let currentRoute = { ...initialRoute, nodes: [...initialRoute.nodes] };
    let currentScore = initialScore;
    let bestRoute = { ...currentRoute, nodes: [...currentRoute.nodes] };
    let bestScore = currentScore;

    let temperature = 1000; // 初始温度
    const coolingRate = 0.99; // 冷却率
    const minTemperature = 1; // 最低温度

    let iterations = 0;
    const maxIterations = 10000;

    while (temperature > minTemperature && iterations < maxIterations) {
      iterations++;

      // 生成新解：随机交换两个节点
      const newRoute = this.swapTwoNodes(currentRoute);
      const newScore = this.calculateTotalScore(newRoute, config, zones);

      // 决定是否接受新解
      if (newScore > currentScore) {
        // 更好的解，直接接受
        currentRoute = newRoute;
        currentScore = newScore;

        // 更新最优解
        if (newScore > bestScore) {
          bestRoute = { ...newRoute, nodes: [...newRoute.nodes] };
          bestScore = newScore;
        }
      } else {
        // 更差的解，以一定概率接受（跳出局部最优）
        const acceptanceProbability = Math.exp(
          (newScore - currentScore) / temperature
        );

        if (Math.random() < acceptanceProbability) {
          currentRoute = newRoute;
          currentScore = newScore;
        }
      }

      // 降温
      temperature *= coolingRate;
    }

    this.logger.debug(
      `模拟退火完成：迭代 ${iterations} 次，最优分数：${bestScore}`
    );

    return bestRoute;
  }

  /**
   * 交换两个节点（生成新解）
   */
  private swapTwoNodes(route: RouteSolution): RouteSolution {
    const newNodes = [...route.nodes];

    // 随机选择两个不同的索引
    const i = Math.floor(Math.random() * newNodes.length);
    let j = Math.floor(Math.random() * newNodes.length);
    while (j === i) {
      j = Math.floor(Math.random() * newNodes.length);
    }

    // 交换
    [newNodes[i], newNodes[j]] = [newNodes[j], newNodes[i]];

    return {
      ...route,
      nodes: newNodes,
    };
  }

  /**
   * 计算总分数
   */
  private calculateTotalScore(
    route: RouteSolution,
    config: OptimizationConfig,
    zones: Zone[]
  ): number {
    // 生成临时时间安排用于评分
    const schedule = this.generateSchedule(route, config);

    const breakdown = this.scorerService.calculateHappinessScore(
      route.nodes,
      schedule,
      config,
      zones
    );

    return (
      breakdown.interestScore -
      breakdown.distancePenalty -
      breakdown.tiredPenalty -
      breakdown.boredPenalty -
      breakdown.starvePenalty +
      breakdown.clusteringBonus +
      breakdown.bufferBonus
    );
  }

  /**
   * 生成时间安排
   * 
   * 根据路线和配置，为每个节点分配时间
   */
  private generateSchedule(
    route: RouteSolution,
    config: OptimizationConfig
  ): RouteSolution['schedule'] {
    const schedule: RouteSolution['schedule'] = [];
    let currentTime = DateTime.fromISO(config.startTime);
    const endTime = DateTime.fromISO(config.endTime);

    for (let i = 0; i < route.nodes.length; i++) {
      const node = route.nodes[i];
      const duration = node.estimatedDuration || 60; // 默认 60 分钟

      // 检查是否超过结束时间
      if (currentTime.plus({ minutes: duration }) > endTime) {
        break;
      }

      const startTime = currentTime.toISO();
      const endTimeForNode = currentTime.plus({ minutes: duration }).toISO();

      schedule.push({
        nodeIndex: i,
        startTime: startTime!,
        endTime: endTimeForNode!,
        transportTime: i < route.nodes.length - 1
          ? this.estimateTransportTime(
              node.location,
              route.nodes[i + 1].location
            )
          : undefined,
      });

      // 移动到下一个节点（包含交通时间）
      const transportTime =
        i < route.nodes.length - 1
          ? this.estimateTransportTime(
              node.location,
              route.nodes[i + 1].location
            )
          : 0;

      // 应用弹性因子
      const bufferTime = transportTime * config.pacingFactor + 15;
      currentTime = currentTime.plus({ minutes: duration + bufferTime });
    }

    return schedule;
  }

  /**
   * 估算交通时间（分钟）
   * 
   * 简化：使用直线距离估算
   * 实际应该调用交通规划服务
   */
  private estimateTransportTime(
    from: { lat: number; lng: number },
    to: { lat: number; lng: number }
  ): number {
    const distance = this.calculateDistance(from, to);

    // 市内交通：平均速度 30 km/h（包含等车、换乘）
    if (distance < 5000) {
      // < 5km：公共交通
      return Math.round((distance / 1000 / 30) * 60);
    } else {
      // >= 5km：打车或地铁
      return Math.round((distance / 1000 / 40) * 60);
    }
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

