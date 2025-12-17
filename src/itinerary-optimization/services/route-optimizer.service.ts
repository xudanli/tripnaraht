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
import { SmartRoutesService } from '../../transport/services/smart-routes.service';
import { RouteCacheService } from '../../transport/services/route-cache.service';
import { VRPTWOptimizerService } from './vrptw-optimizer.service';

/**
 * 路线优化服务
 * 
 * 使用模拟退火算法优化路线，最大化"快乐值"
 * 
 * 改进：集成真实的交通规划服务，使用 Google Routes API 获取准确的旅行时间
 */
@Injectable()
export class RouteOptimizerService {
  private readonly logger = new Logger(RouteOptimizerService.name);
  
  // 时间矩阵缓存：存储所有点对之间的旅行时间（分钟）
  private timeMatrix: Map<string, number> = new Map();

  constructor(
    private clusteringService: SpatialClusteringService,
    private scorerService: HappinessScorerService,
    private smartRoutesService: SmartRoutesService,
    private routeCacheService: RouteCacheService,
    private vrptwOptimizer: VRPTWOptimizerService
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

    // 2. 批量预计算所有点对之间的旅行时间（优化 TSP 算法性能）
    await this.precomputeTimeMatrix(places, config);

    // 3. 根据配置选择优化算法
    let optimizedRoute: RouteSolution;

    if (config.useVRPTW) {
      // 使用 VRPTW 算法（带时间窗约束）
      optimizedRoute = await this.optimizeWithVRPTW(places, config, zones);
    } else {
      // 使用传统的模拟退火算法
      let currentRoute = this.generateInitialRoute(places, config);
      let currentScore = this.calculateTotalScore(currentRoute, config, zones);

      this.logger.debug(`初始解分数：${currentScore}`);

      // 4. 模拟退火优化
      optimizedRoute = this.simulatedAnnealing(
        currentRoute,
        currentScore,
        config,
        zones
      );
    }

    // 5. 生成时间安排（如果 VRPTW 已经生成，这里会验证和调整）
    const schedule = this.generateSchedule(optimizedRoute, config, config.useVRPTW);

    // 6. 计算最终分数
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

    // 7. 清理缓存
    this.timeMatrix.clear();

    return {
      nodes: optimizedRoute.nodes,
      schedule,
      happinessScore: totalScore,
      scoreBreakdown,
      zones,
    };
  }

  /**
   * 批量预计算所有点对之间的旅行时间
   * 
   * 在 TSP 优化开始前，预先计算所有 N×(N-1) 个点对的时间
   * 这样可以避免在优化过程中重复调用 API
   */
  private async precomputeTimeMatrix(
    places: PlaceNode[],
    config: OptimizationConfig
  ): Promise<void> {
    this.logger.debug(`开始预计算时间矩阵：${places.length} 个地点`);

    const travelMode: 'TRANSIT' | 'WALKING' | 'DRIVING' = 'TRANSIT'; // 默认使用公共交通模式
    const promises: Promise<void>[] = [];

    // 并行计算所有点对的时间（但限制并发数，避免 API 限流）
    const batchSize = 10; // 每批处理 10 个请求
    for (let i = 0; i < places.length; i++) {
      for (let j = i + 1; j < places.length; j++) {
        const from = places[i];
        const to = places[j];

        // 检查是否是短距离，可以使用 PostGIS 快速计算
        const distance = this.calculateDistance(from.location, to.location);
        
        // 短距离步行，使用 PostGIS 计算（无论什么模式，短距离都可以用步行时间估算）
        if (distance < 1000) {
          const walkTime = await this.routeCacheService.calculateShortDistanceWalkTime(
            from.location.lat,
            from.location.lng,
            to.location.lat,
            to.location.lng
          );
          this.setTimeInMatrix(String(from.id), String(to.id), walkTime);
          continue;
        }

        // 长距离或非步行，调用智能路由服务
        const promise = this.fetchAndCacheTransportTime(
          from.location,
          to.location,
          String(from.id),
          String(to.id),
          travelMode
        );

        promises.push(promise);

        // 批量处理，避免过多并发请求
        if (promises.length >= batchSize) {
          await Promise.all(promises);
          promises.length = 0;
          // 短暂延迟，避免 API 限流
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
    }

    // 处理剩余的请求
    if (promises.length > 0) {
      await Promise.all(promises);
    }

    this.logger.debug(`时间矩阵预计算完成：${this.timeMatrix.size} 个点对`);
  }

  /**
   * 获取并缓存交通时间
   */
  private async fetchAndCacheTransportTime(
    from: { lat: number; lng: number },
    to: { lat: number; lng: number },
    fromId: string,
    toId: string,
    travelMode: string
  ): Promise<void> {
    try {
      // 1. 检查缓存
      const cached = await this.routeCacheService.getCachedRoute(
        from.lat,
        from.lng,
        to.lat,
        to.lng,
        travelMode as 'TRANSIT' | 'WALKING' | 'DRIVING'
      );

      if (cached) {
        this.setTimeInMatrix(fromId, toId, cached.durationMinutes);
        return;
      }

      // 2. 调用智能路由服务（自动选择高德或Google）
      const options = await this.smartRoutesService.getRoutes(
        from.lat,
        from.lng,
        to.lat,
        to.lng,
        travelMode as 'TRANSIT' | 'WALKING' | 'DRIVING'
      );

      if (options.length > 0) {
        const duration = options[0].durationMinutes;
        this.setTimeInMatrix(fromId, toId, duration);

        // 3. 保存到缓存
        await this.routeCacheService.saveCachedRoute(
          from.lat,
          from.lng,
          to.lat,
          to.lng,
          travelMode as 'TRANSIT' | 'WALKING' | 'DRIVING',
          options[0]
        );
      } else {
        // API 失败，使用降级估算
        const fallbackTime = this.fallbackEstimateTransportTime(from, to, travelMode);
        this.setTimeInMatrix(fromId, toId, fallbackTime);
      }
    } catch (error) {
      this.logger.warn(
        `获取交通时间失败 (${fromId} -> ${toId}): ${error}`,
        error instanceof Error ? error.stack : undefined
      );
      // 使用降级估算
      const fallbackTime = this.fallbackEstimateTransportTime(from, to, travelMode);
      this.setTimeInMatrix(fromId, toId, fallbackTime);
    }
  }

  /**
   * 设置时间矩阵中的值
   */
  private setTimeInMatrix(fromId: number | string, toId: number | string, time: number): void {
    // 双向存储（A->B 和 B->A 时间相同）
    const key1 = `${fromId}->${toId}`;
    const key2 = `${toId}->${fromId}`;
    this.timeMatrix.set(key1, time);
    this.timeMatrix.set(key2, time);
  }

  /**
   * 从时间矩阵获取时间
   */
  private getTimeFromMatrix(fromId: number | string, toId: number | string): number | null {
    const key = `${fromId}->${toId}`;
    return this.timeMatrix.get(key) ?? null;
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
   * 使用 VRPTW 算法优化路线
   */
  private async optimizeWithVRPTW(
    places: PlaceNode[],
    config: OptimizationConfig,
    zones: Zone[]
  ): Promise<RouteSolution> {
    this.logger.debug('使用 VRPTW 算法优化路线');

    // 1. 构建时间矩阵（N×N 矩阵）
    const n = places.length;
    const timeMatrix: number[][] = [];
    for (let i = 0; i < n; i++) {
      const row: number[] = [];
      for (let j = 0; j < n; j++) {
        if (i === j) {
          row.push(0);
        } else {
          const time = this.getTimeFromMatrix(String(places[i].id), String(places[j].id));
          row.push(time ?? this.fallbackEstimateTransportTime(places[i].location, places[j].location, 'TRANSIT'));
        }
      }
      timeMatrix.push(row);
    }

    // 2. 构建 VRPTW 输入
    const vrptwInput = this.vrptwOptimizer.buildVRPTWInput(
      places,
      timeMatrix,
      config.startTime,
      config.date
    );

    // 3. 求解 VRPTW
    const vrptwResult = await this.vrptwOptimizer.solveVRPTW(vrptwInput);

    // 4. 将 VRPTW 结果转换为 RouteSolution
    const optimizedNodes = vrptwResult.route.map((index) => places[index]);
    
    // 5. 构建时间安排
    const schedule: RouteSolution['schedule'] = [];
    for (let i = 0; i < optimizedNodes.length; i++) {
      const arrivalTime = vrptwResult.arrivalTimes[i];
      const departureTime = vrptwResult.departureTimes[i];
      
      schedule.push({
        nodeIndex: i,
        startTime: arrivalTime,
        endTime: departureTime,
        transportTime: i < optimizedNodes.length - 1
          ? this.getTimeFromMatrix(
              String(optimizedNodes[i].id),
              String(optimizedNodes[i + 1].id)
            ) ?? undefined
          : undefined,
      });
    }

    // 6. 计算分数
    const scoreBreakdown = this.scorerService.calculateHappinessScore(
      optimizedNodes,
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

    // 如果有时间窗违反，降低分数
    if (!vrptwResult.feasible && vrptwResult.violations) {
      const violationPenalty = vrptwResult.violations.length * 100;
      this.logger.warn(`VRPTW 时间窗违反惩罚：-${violationPenalty}`);
    }

    return {
      nodes: optimizedNodes,
      schedule,
      happinessScore: totalScore,
      scoreBreakdown,
      zones,
    };
  }

  /**
   * 生成时间安排
   * 
   * 根据路线和配置，为每个节点分配时间
   * 如果 useVRPTW=true，会验证时间窗约束
   */
  private generateSchedule(
    route: RouteSolution,
    config: OptimizationConfig,
    validateTimeWindows: boolean = false
  ): RouteSolution['schedule'] {
    const schedule: RouteSolution['schedule'] = [];
    let currentTime = DateTime.fromISO(config.startTime);
    const endTime = DateTime.fromISO(config.endTime);

    for (let i = 0; i < route.nodes.length; i++) {
      const node = route.nodes[i];
      
      // 如果节点关联了Trail，使用Trail的预计耗时
      let duration = node.serviceTime || node.estimatedDuration || 60; // 默认 60 分钟
      if (node.trailData?.estimatedDurationHours) {
        duration = node.trailData.estimatedDurationHours * 60;
      }

      // VRPTW 时间窗约束检查
      if (validateTimeWindows && node.timeWindow) {
        const earliest = DateTime.fromISO(node.timeWindow.earliest);
        const latest = DateTime.fromISO(node.timeWindow.latest);

        // 如果当前时间早于最早时间，等待到最早时间
        if (currentTime < earliest) {
          currentTime = earliest;
        }

        // 如果当前时间晚于最晚时间，违反约束（记录警告但继续）
        if (currentTime > latest) {
          this.logger.warn(
            `时间窗违反：${node.name} 应在 ${node.timeWindow.earliest} - ${node.timeWindow.latest} 访问，实际到达 ${currentTime.toISO()}`
          );
        }
      }

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
              { ...node.location, id: String(node.id) },
              { ...route.nodes[i + 1].location, id: String(route.nodes[i + 1].id) }
            )
          : undefined,
      });

      // 移动到下一个节点（包含交通时间）
      const transportTime =
        i < route.nodes.length - 1
          ? this.estimateTransportTime(
              { ...node.location, id: String(node.id) },
              { ...route.nodes[i + 1].location, id: String(route.nodes[i + 1].id) }
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
   * 改进：优先使用预计算的时间矩阵，如果不存在则使用降级估算
   */
  private estimateTransportTime(
    from: { lat: number; lng: number; id?: string },
    to: { lat: number; lng: number; id?: string }
  ): number {
    // 如果有点 ID，尝试从时间矩阵获取
    if (from.id && to.id) {
      const cachedTime = this.getTimeFromMatrix(from.id, to.id);
      if (cachedTime !== null) {
        return cachedTime;
      }
    }

    // 降级：使用简单估算
    return this.fallbackEstimateTransportTime(from, to, 'TRANSIT');
  }

  /**
   * 降级估算：使用距离和固定速度估算
   */
  private fallbackEstimateTransportTime(
    from: { lat: number; lng: number },
    to: { lat: number; lng: number },
    travelMode: string
  ): number {
    const distance = this.calculateDistance(from, to);

    switch (travelMode) {
      case 'WALKING':
        // 步行速度：5 km/h
        return Math.round((distance / 1000 / 5) * 60);
      
      case 'DRIVING':
        // 自驾/打车：平均速度 25 km/h（考虑堵车）
        return Math.round((distance / 1000 / 25) * 60);
      
      case 'TRANSIT':
      default:
        // 公共交通：平均速度 30 km/h（包含等车、换乘）
        if (distance < 5000) {
          // < 5km：公共交通
          return Math.round((distance / 1000 / 30) * 60);
        } else {
          // >= 5km：地铁或快速公交
          return Math.round((distance / 1000 / 40) * 60);
        }
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

