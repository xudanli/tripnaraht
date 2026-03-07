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
import { OrToolsTspService } from './or-tools-tsp.service';

/** Mulberry32  seeded PRNG，用于可复现的随机数 */
function createSeededRandom(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 解析有效交通方式：考虑 defaultTravelMode、hasElderly、hasChildren */
function resolveTravelMode(config: OptimizationConfig): 'TRANSIT' | 'WALKING' | 'DRIVING' {
  if (config.defaultTravelMode && ['TRANSIT', 'WALKING', 'DRIVING'].includes(config.defaultTravelMode)) {
    return config.defaultTravelMode;
  }
  if (config.hasElderly) return 'TRANSIT'; // 老人：公共交通 + transportPreferences.lessWalking
  if (config.hasChildren) return 'DRIVING'; // 带小孩：自驾更方便
  return 'TRANSIT';
}

@Injectable()
export class RouteOptimizerService {
  private readonly logger = new Logger(RouteOptimizerService.name);

  private timeMatrix: Map<string, number> = new Map();
  private resolvedTravelMode: 'TRANSIT' | 'WALKING' | 'DRIVING' = 'TRANSIT';

  constructor(
    private clusteringService: SpatialClusteringService,
    private scorerService: HappinessScorerService,
    private smartRoutesService: SmartRoutesService,
    private routeCacheService: RouteCacheService,
    private vrptwOptimizer: VRPTWOptimizerService,
    private orToolsTspService: OrToolsTspService
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

    const startMs = Date.now();
    let optimizedRoute: RouteSolution;
    let optimizationTrace: RouteSolution['optimizationTrace'];

    if (config.useVRPTW) {
      optimizedRoute = await this.optimizeWithVRPTW(places, config, zones);
      optimizationTrace = {
        algorithm: 'VRPTW',
        durationMs: Date.now() - startMs,
        finalScore: optimizedRoute.happinessScore,
      };
    } else {
      const trials = Math.min(
        Math.max(1, config.multiStartTrials ?? 1),
        5
      );
      let bestRoute: RouteSolution | null = null;
      let bestScore = -Infinity;
      let totalIterations = 0;
      let firstInitialScore = 0;

      const otherCount = places.filter((p) => !p.isRestaurant).length;
      const otherPlaces = places.filter((p) => !p.isRestaurant);
      const restaurants = places.filter((p) => p.isRestaurant);

      let orToolsInitialRoute: RouteSolution | null = null;
      if (config.useORTools && this.orToolsTspService.isAvailable() && otherPlaces.length >= 2) {
        const getTime = (fromId: string, toId: string) =>
          this.getTimeFromMatrix(fromId, toId) ?? 30;
        const tspOrder = await this.orToolsTspService.solveTsp(otherPlaces, getTime, {
          timeLimitMs: 3000,
          depotIndex: 0,
        });
        if (tspOrder && tspOrder.length === otherPlaces.length) {
          orToolsInitialRoute = this.buildRouteFromOrder(otherPlaces, restaurants, config, tspOrder);
          this.logger.debug('使用 OR-Tools TSP 初始解');
        }
      }

      for (let t = 0; t < trials; t++) {
        const trialConfig = {
          ...config,
          seed: config.seed != null ? config.seed + t : undefined,
          _startPlaceIndex: trials > 1 && otherCount > 1 ? t % otherCount : 0,
        } as OptimizationConfig & { _startPlaceIndex?: number };

        let currentRoute: RouteSolution;
        if (t === 0 && orToolsInitialRoute) {
          currentRoute = orToolsInitialRoute;
        } else {
          currentRoute = this.generateInitialRoute(places, trialConfig);
        }
        const initialScore = this.calculateTotalScore(currentRoute, trialConfig, zones);
        if (t === 0) firstInitialScore = initialScore;
        if (trials > 1) {
          this.logger.debug(`多起点试验 ${t + 1}/${trials}，初始分数：${initialScore}`);
        } else {
          this.logger.debug(`初始解分数：${initialScore}`);
        }

        const { route, iterations } = this.simulatedAnnealing(
          currentRoute,
          initialScore,
          trialConfig,
          zones
        );
        const routeScore = this.applyHappinessWeights(
          this.scorerService.calculateHappinessScore(
            route.nodes,
            this.generateSchedule(route, trialConfig),
            trialConfig,
            zones
          ),
          trialConfig.happinessWeights
        );

        totalIterations += iterations;
        if (routeScore > bestScore) {
          bestScore = routeScore;
          bestRoute = route;
        }
      }

      optimizedRoute = bestRoute!;
      optimizationTrace = {
        algorithm: 'simulatedAnnealing',
        iterations: totalIterations,
        initialScore: firstInitialScore,
        durationMs: Date.now() - startMs,
        seed: config.seed,
        multiStartTrials: trials > 1 ? trials : undefined,
        orToolsWarmStart: orToolsInitialRoute != null,
      };
    }

    const schedule = this.generateSchedule(optimizedRoute, config, config.useVRPTW);
    const scoreBreakdown = this.scorerService.calculateHappinessScore(
      optimizedRoute.nodes,
      schedule,
      config,
      zones
    );
    const totalScore = this.applyHappinessWeights(scoreBreakdown, config.happinessWeights);

    this.timeMatrix.clear();

    const result: RouteSolution = {
      nodes: optimizedRoute.nodes,
      schedule,
      happinessScore: totalScore,
      scoreBreakdown,
      zones,
    };
    if (optimizationTrace) {
      optimizationTrace.finalScore = totalScore;
      result.optimizationTrace = optimizationTrace;
    }
    return result;
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

    this.resolvedTravelMode = resolveTravelMode(config);
    const preferences = config.transportPreferences ?? {};
    if (config.hasElderly && preferences.lessWalking === undefined) {
      (preferences as Record<string, boolean>).lessWalking = true;
    }
    this.logger.debug(`交通方式：${this.resolvedTravelMode}，偏好：${JSON.stringify(preferences)}`);

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
          this.resolvedTravelMode,
          preferences
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
    travelMode: 'TRANSIT' | 'WALKING' | 'DRIVING',
    preferences?: { lessWalking?: boolean; avoidHighways?: boolean; avoidTolls?: boolean }
  ): Promise<void> {
    try {
      // 1. 检查缓存
      const cached = await this.routeCacheService.getCachedRoute(
        from.lat,
        from.lng,
        to.lat,
        to.lng,
        travelMode
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
        travelMode,
        preferences
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
          travelMode,
          options[0]
        );
      } else {
        // API 失败，使用降级估算
        const fallbackTime = this.fallbackEstimateTransportTime(from, to);
        this.setTimeInMatrix(fromId, toId, fallbackTime);
      }
    } catch (error) {
      this.logger.warn(
        `获取交通时间失败 (${fromId} -> ${toId}): ${error}`,
        error instanceof Error ? error.stack : undefined
      );
      // 使用降级估算
      const fallbackTime = this.fallbackEstimateTransportTime(from, to);
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
   * 从 OR-Tools TSP 顺序构建路线（餐厅插入饭点）
   */
  private buildRouteFromOrder(
    otherPlaces: PlaceNode[],
    restaurants: PlaceNode[],
    config: OptimizationConfig,
    tspOrder: number[]
  ): RouteSolution {
    const ordered = tspOrder.map((i) => otherPlaces[i]);
    const nodes: PlaceNode[] = [];
    let restaurantIndex = 0;

    for (let i = 0; i < ordered.length; i++) {
      nodes.push(ordered[i]);
      if (
        config.lunchWindow &&
        restaurantIndex < restaurants.length &&
        i === Math.floor(ordered.length / 2)
      ) {
        nodes.push(restaurants[restaurantIndex++]);
      }
    }
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
   * 生成初始路线
   * 优先使用最近邻贪心（减少折返），餐厅插入饭点；无时间矩阵时降级为随机
   */
  private generateInitialRoute(
    places: PlaceNode[],
    config: OptimizationConfig
  ): RouteSolution {
    const restaurants = places.filter((p) => p.isRestaurant);
    const otherPlaces = places.filter((p) => !p.isRestaurant);

    const startIdx = (config as any)._startPlaceIndex ?? 0;
    let ordered: PlaceNode[];
    if (otherPlaces.length <= 1) {
      ordered = [...otherPlaces];
    } else {
      ordered = this.nearestNeighborTour(otherPlaces, startIdx);
    }

    const nodes: PlaceNode[] = [];
    let restaurantIndex = 0;

    for (let i = 0; i < ordered.length; i++) {
      nodes.push(ordered[i]);
      if (
        config.lunchWindow &&
        restaurantIndex < restaurants.length &&
        i === Math.floor(ordered.length / 2)
      ) {
        nodes.push(restaurants[restaurantIndex++]);
      }
    }

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
   * 最近邻贪心构建 TSP 路线（最小化总行程时间）
   * @param startIndex 起始点索引（多起点时用不同起点）
   */
  private nearestNeighborTour(places: PlaceNode[], startIndex = 0): PlaceNode[] {
    if (places.length === 0) return [];
    if (places.length === 1) return [...places];

    const remaining = new Set(places.map((p) => p.id));
    const route: PlaceNode[] = [];
    const start = places[startIndex % places.length];
    let current = start;

    route.push(current);
    remaining.delete(current.id);

    while (remaining.size > 0) {
      let bestNext: PlaceNode | null = null;
      let bestTime = Infinity;

      for (const pid of remaining) {
        const t = this.getTimeFromMatrix(String(current.id), String(pid));
        const time = t ?? this.fallbackEstimateTransportTime(current.location, places.find((p) => p.id === pid)!.location);
        if (time < bestTime) {
          bestTime = time;
          bestNext = places.find((p) => p.id === pid)!;
        }
      }

      if (!bestNext) break;
      route.push(bestNext);
      remaining.delete(bestNext.id);
      current = bestNext;
    }

    return route;
  }

  /**
   * 模拟退火算法
   */
  private simulatedAnnealing(
    initialRoute: RouteSolution,
    initialScore: number,
    config: OptimizationConfig,
    zones: Zone[]
  ): { route: RouteSolution; iterations: number } {
    const random = config.seed != null ? createSeededRandom(config.seed) : Math.random;

    let currentRoute = { ...initialRoute, nodes: [...initialRoute.nodes] };
    let currentScore = initialScore;
    let bestRoute = { ...currentRoute, nodes: [...currentRoute.nodes] };
    let bestScore = currentScore;

    let temperature = 1000;
    const coolingRate = 0.99;
    const minTemperature = 1;
    let iterations = 0;
    const maxIterations = 10000;

    while (temperature > minTemperature && iterations < maxIterations) {
      iterations++;
      const newRoute =
        random() < 0.5
          ? this.swapTwoNodes(currentRoute, random)
          : this.twoOptMove(currentRoute, random);
      const newScore = this.calculateTotalScore(newRoute, config, zones);

      if (newScore > currentScore) {
        currentRoute = newRoute;
        currentScore = newScore;
        if (newScore > bestScore) {
          bestRoute = { ...newRoute, nodes: [...newRoute.nodes] };
          bestScore = newScore;
        }
      } else {
        const acceptanceProbability = Math.exp(
          (newScore - currentScore) / temperature
        );
        if (random() < acceptanceProbability) {
          currentRoute = newRoute;
          currentScore = newScore;
        }
      }
      temperature *= coolingRate;
    }

    this.logger.debug(
      `模拟退火完成：迭代 ${iterations} 次，最优分数：${bestScore}`
    );

    return { route: bestRoute, iterations };
  }

  /**
   * 交换两个节点（生成新解）
   */
  private swapTwoNodes(
    route: RouteSolution,
    random: () => number = Math.random
  ): RouteSolution {
    const newNodes = [...route.nodes];
    const i = Math.floor(random() * newNodes.length);
    let j = Math.floor(random() * newNodes.length);
    while (j === i) j = Math.floor(random() * newNodes.length);
    [newNodes[i], newNodes[j]] = [newNodes[j], newNodes[i]];
    return { ...route, nodes: newNodes };
  }

  /**
   * 2-opt 邻域：反转 [i+1, j] 区段，消除交叉边
   */
  private twoOptMove(
    route: RouteSolution,
    random: () => number = Math.random
  ): RouteSolution {
    const n = route.nodes.length;
    if (n < 4) return this.swapTwoNodes(route, random);

    const i = Math.floor(random() * (n - 2));
    const j = i + 2 + Math.floor(random() * (n - i - 2));

    const newNodes = [
      ...route.nodes.slice(0, i + 1),
      ...route.nodes.slice(i + 1, j + 1).reverse(),
      ...route.nodes.slice(j + 1),
    ];

    return { ...route, nodes: newNodes };
  }

  /**
   * 计算总分数（支持可配置权重）
   */
  private calculateTotalScore(
    route: RouteSolution,
    config: OptimizationConfig,
    zones: Zone[]
  ): number {
    const schedule = this.generateSchedule(route, config);
    const breakdown = this.scorerService.calculateHappinessScore(
      route.nodes,
      schedule,
      config,
      zones
    );
    return this.applyHappinessWeights(breakdown, config.happinessWeights);
  }

  /** 应用快乐值权重（默认 1.0，可配置） */
  private applyHappinessWeights(
    breakdown: RouteSolution['scoreBreakdown'],
    weights?: OptimizationConfig['happinessWeights']
  ): number {
    const w = (k: keyof NonNullable<typeof weights>) => weights?.[k] ?? 1;
    return (
      w('interest')! * breakdown.interestScore -
      w('distancePenalty')! * breakdown.distancePenalty -
      w('tiredPenalty')! * breakdown.tiredPenalty -
      w('boredPenalty')! * breakdown.boredPenalty -
      w('starvePenalty')! * breakdown.starvePenalty +
      w('clusteringBonus')! * breakdown.clusteringBonus +
      w('bufferBonus')! * breakdown.bufferBonus
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

    // 1. 构建时间矩阵（N×N 矩阵），应用冲突衍生的最小交通时间约束
    const n = places.length;
    const timeMatrix: number[][] = [];
    for (let i = 0; i < n; i++) {
      const row: number[] = [];
      for (let j = 0; j < n; j++) {
        if (i === j) {
          row.push(0);
        } else {
          let time = this.getTimeFromMatrix(String(places[i].id), String(places[j].id))
            ?? this.fallbackEstimateTransportTime(places[i].location, places[j].location);
          const overrideKey = `${places[i].id}-${places[j].id}`;
          if (config.minTravelTimeOverrides?.[overrideKey] != null) {
            time = Math.max(time, config.minTravelTimeOverrides[overrideKey]);
          }
          row.push(time);
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
    
    // 5. 构建时间安排（应用冲突衍生的最小交通时间约束）
    const schedule: RouteSolution['schedule'] = [];
    for (let i = 0; i < optimizedNodes.length; i++) {
      const arrivalTime = vrptwResult.arrivalTimes[i];
      const departureTime = vrptwResult.departureTimes[i];
      let transportTime: number | undefined;
      if (i < optimizedNodes.length - 1) {
        transportTime = this.getTimeFromMatrix(
          String(optimizedNodes[i].id),
          String(optimizedNodes[i + 1].id)
        ) ?? this.fallbackEstimateTransportTime(
          optimizedNodes[i].location,
          optimizedNodes[i + 1].location
        );
        const overrideKey = `${optimizedNodes[i].id}-${optimizedNodes[i + 1].id}`;
        if (config.minTravelTimeOverrides?.[overrideKey] != null) {
          transportTime = Math.max(transportTime, config.minTravelTimeOverrides[overrideKey]);
        }
      }
      schedule.push({
        nodeIndex: i,
        startTime: arrivalTime,
        endTime: departureTime,
        transportTime,
      });
    }

    // 6. 计算分数
    const scoreBreakdown = this.scorerService.calculateHappinessScore(
      optimizedNodes,
      schedule,
      config,
      zones
    );
    const totalScore = this.applyHappinessWeights(scoreBreakdown, config.happinessWeights);

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

      // 🆕 避免半夜安排：将开始时间限制在 08:00-22:00 合理时段内
      const dayStart = currentTime.startOf('day');
      const hour = currentTime.hour;
      if (hour < 8) {
        currentTime = dayStart.set({ hour: 8, minute: 0, second: 0, millisecond: 0 });
      } else if (hour >= 22) {
        currentTime = dayStart.set({ hour: 21, minute: 0, second: 0, millisecond: 0 });
      }

      const startTime = currentTime.toISO();
      const endTimeForNode = currentTime.plus({ minutes: duration }).toISO();

      let transportTime =
        i < route.nodes.length - 1
          ? this.estimateTransportTime(
              { ...node.location, id: String(node.id) },
              { ...route.nodes[i + 1].location, id: String(route.nodes[i + 1].id) }
            )
          : 0;

      // 应用冲突衍生的最小交通时间约束（TRANSPORT_INSUFFICIENT）
      const overrideKey = i < route.nodes.length - 1
        ? `${node.id}-${route.nodes[i + 1].id}`
        : null;
      if (overrideKey && config.minTravelTimeOverrides?.[overrideKey] != null) {
        transportTime = Math.max(transportTime, config.minTravelTimeOverrides[overrideKey]);
      }

      schedule.push({
        nodeIndex: i,
        startTime: startTime!,
        endTime: endTimeForNode!,
        transportTime: i < route.nodes.length - 1 ? transportTime : undefined,
      });

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

    // 降级：使用简单估算（与预计算时间矩阵一致）
    return this.fallbackEstimateTransportTime(from, to);
  }

  /**
   * 降级估算：使用距离和固定速度估算
   * 使用 resolvedTravelMode 与预计算时间矩阵保持一致
   */
  private fallbackEstimateTransportTime(
    from: { lat: number; lng: number },
    to: { lat: number; lng: number }
  ): number {
    const distance = this.calculateDistance(from, to);
    const travelMode = this.resolvedTravelMode;

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

