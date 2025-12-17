// src/itinerary-optimization/services/vrptw-optimizer.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { DateTime } from 'luxon';
import { VRPTWInput, VRPTWResult, PlaceNode } from '../interfaces/route-optimization.interface';

/**
 * VRPTW (Vehicle Routing Problem with Time Windows) 优化器
 * 
 * 解决带时间窗的车辆路径问题，确保：
 * 1. 每个地点在时间窗内访问
 * 2. 考虑服务时长（在地点的停留时间）
 * 3. 考虑地点之间的旅行时间
 * 
 * 核心约束：
 * - Time Windows: 地点 i 必须在 [a_i, b_i] 时间段内访问
 * - Service Time: 在地点 i 必须停留 s_i 时间
 */
@Injectable()
export class VRPTWOptimizerService {
  private readonly logger = new Logger(VRPTWOptimizerService.name);

  /**
   * 使用启发式算法求解 VRPTW
   * 
   * 算法：基于贪心 + 局部搜索的启发式算法
   * 1. 贪心构造初始解（优先选择时间窗早的地点）
   * 2. 2-opt 局部搜索优化
   * 3. 验证时间窗约束
   */
  async solveVRPTW(input: VRPTWInput): Promise<VRPTWResult> {
    this.logger.debug(`开始求解 VRPTW：${input.locations.length} 个地点`);

    // 1. 验证输入
    this.validateInput(input);

    // 2. 贪心构造初始解
    const initialRoute = this.greedyConstruction(input);

    // 3. 局部搜索优化
    const optimizedRoute = this.localSearch(initialRoute, input);

    // 4. 计算时间安排并验证约束
    const result = this.calculateSchedule(optimizedRoute, input);

    if (!result.feasible) {
      this.logger.warn(`VRPTW 求解结果不可行，存在 ${result.violations?.length || 0} 个时间窗违反`);
    } else {
      this.logger.debug(`VRPTW 求解成功，路线长度：${optimizedRoute.length}`);
    }

    return result;
  }

  /**
   * 验证输入数据
   */
  private validateInput(input: VRPTWInput): void {
    if (input.locations.length === 0) {
      throw new Error('地点列表不能为空');
    }

    if (input.timeMatrix.length !== input.locations.length) {
      throw new Error('时间矩阵维度不匹配');
    }

    for (let i = 0; i < input.timeMatrix.length; i++) {
      if (input.timeMatrix[i].length !== input.locations.length) {
        throw new Error(`时间矩阵第 ${i} 行维度不匹配`);
      }
    }
  }

  /**
   * 贪心构造初始解
   * 
   * 策略：
   * 1. 从起点开始
   * 2. 每次选择时间窗最早且可达的下一个地点
   * 3. 如果无法满足时间窗，跳过该地点
   */
  private greedyConstruction(input: VRPTWInput): number[] {
    const n = input.locations.length;
    const startIndex = input.startIndex ?? 0;
    const route: number[] = [startIndex];
    const visited = new Set<number>([startIndex]);
    let currentTime = DateTime.now(); // 使用当前时间作为起点时间

    // 如果有起点的时间窗，使用时间窗的开始时间
    if (input.locations[startIndex].window) {
      const windowStart = DateTime.fromISO(input.locations[startIndex].window[0]);
      if (windowStart.isValid) {
        currentTime = windowStart;
      }
    }

    while (visited.size < n) {
      let bestNext: number | null = null;
      let bestArrivalTime: DateTime | null = null;
      let minEarliestWindow: DateTime | null = null;

      // 找到时间窗最早且可达的下一个地点
      for (let i = 0; i < n; i++) {
        if (visited.has(i)) continue;

        const location = input.locations[i];
        if (!location.window) {
          // 没有时间窗约束，可以直接访问
          bestNext = i;
          break;
        }

        const [earliestStr, latestStr] = location.window;
        const earliest = DateTime.fromISO(earliestStr);
        const latest = DateTime.fromISO(latestStr);

        // 计算到达时间
        const currentIndex = route[route.length - 1];
        const travelTime = input.timeMatrix[currentIndex][i];
        const arrivalTime = currentTime.plus({ minutes: travelTime });

        // 检查是否在时间窗内
        if (arrivalTime <= latest) {
          // 如果早于最早时间，需要等待
          const actualArrival = arrivalTime < earliest ? earliest : arrivalTime;

          // 选择时间窗最早的地点
          if (bestNext === null || earliest < (minEarliestWindow || DateTime.fromMillis(0))) {
            bestNext = i;
            bestArrivalTime = actualArrival;
            minEarliestWindow = earliest;
          }
        }
      }

      if (bestNext === null) {
        // 无法找到满足约束的下一个地点，停止
        this.logger.warn(`贪心构造：无法找到满足约束的下一个地点，已访问 ${visited.size}/${n} 个地点`);
        break;
      }

      route.push(bestNext);
      visited.add(bestNext);

      // 更新当前时间（到达时间 + 服务时长）
      if (bestArrivalTime) {
        const serviceTime = input.locations[bestNext].duration;
        currentTime = bestArrivalTime.plus({ minutes: serviceTime });
      }
    }

    return route;
  }

  /**
   * 局部搜索优化（2-opt）
   * 
   * 尝试交换路线中的两个片段，如果改善则接受
   */
  private localSearch(route: number[], input: VRPTWInput): number[] {
    let bestRoute = [...route];
    let improved = true;
    const maxIterations = 100;
    let iterations = 0;

    while (improved && iterations < maxIterations) {
      improved = false;
      iterations++;

      // 2-opt: 尝试所有可能的片段交换
      for (let i = 1; i < bestRoute.length - 1; i++) {
        for (let j = i + 1; j < bestRoute.length; j++) {
          // 反转片段 [i, j]
          const newRoute = [
            ...bestRoute.slice(0, i),
            ...bestRoute.slice(i, j + 1).reverse(),
            ...bestRoute.slice(j + 1),
          ];

          // 验证新路线是否满足时间窗约束
          const schedule = this.calculateSchedule(newRoute, input);
          const currentSchedule = this.calculateSchedule(bestRoute, input);

          // 如果新路线可行且更好（违反更少或总时间更短），接受
          if (schedule.feasible && (!currentSchedule.feasible || this.isBetterRoute(newRoute, bestRoute, input))) {
            bestRoute = newRoute;
            improved = true;
            break;
          }
        }
        if (improved) break;
      }
    }

    return bestRoute;
  }

  /**
   * 判断新路线是否更好
   */
  private isBetterRoute(route1: number[], route2: number[], input: VRPTWInput): boolean {
    // 计算总旅行时间
    const totalTime1 = this.calculateTotalTravelTime(route1, input);
    const totalTime2 = this.calculateTotalTravelTime(route2, input);
    return totalTime1 < totalTime2;
  }

  /**
   * 计算总旅行时间
   */
  private calculateTotalTravelTime(route: number[], input: VRPTWInput): number {
    let total = 0;
    for (let i = 0; i < route.length - 1; i++) {
      total += input.timeMatrix[route[i]][route[i + 1]];
    }
    return total;
  }

  /**
   * 计算时间安排并验证约束
   */
  private calculateSchedule(route: number[], input: VRPTWInput): VRPTWResult {
    const arrivalTimes: string[] = [];
    const departureTimes: string[] = [];
    const violations: VRPTWResult['violations'] = [];

    // 确定起点时间
    let currentTime: DateTime;
    const startIndex = route[0];
    if (input.locations[startIndex].window) {
      currentTime = DateTime.fromISO(input.locations[startIndex].window[0]);
    } else {
      currentTime = DateTime.now();
    }

    arrivalTimes.push(currentTime.toISO()!);

    // 计算每个地点的到达和离开时间
    for (let i = 0; i < route.length; i++) {
      const locationIndex = route[i];
      const location = input.locations[locationIndex];

      if (i > 0) {
        // 计算到达时间（前一个地点的离开时间 + 旅行时间）
        const prevIndex = route[i - 1];
        const travelTime = input.timeMatrix[prevIndex][locationIndex];
        currentTime = currentTime.plus({ minutes: travelTime });

        // 检查时间窗约束
        if (location.window) {
          const [earliestStr, latestStr] = location.window;
          const earliest = DateTime.fromISO(earliestStr);
          const latest = DateTime.fromISO(latestStr);

          if (currentTime < earliest) {
            // 早到，需要等待
            currentTime = earliest;
          } else if (currentTime > latest) {
            // 晚到，违反时间窗约束
            violations.push({
              locationId: locationIndex,
              locationName: location.name,
              expectedWindow: [earliestStr, latestStr],
              actualArrival: currentTime.toISO()!,
              violationType: 'LATE',
            });
          }
        }

        arrivalTimes.push(currentTime.toISO()!);
      }

      // 计算离开时间（到达时间 + 服务时长）
      const serviceTime = location.duration;
      currentTime = currentTime.plus({ minutes: serviceTime });
      departureTimes.push(currentTime.toISO()!);
    }

    return {
      route,
      arrivalTimes,
      departureTimes,
      feasible: violations.length === 0,
      violations: violations.length > 0 ? violations : undefined,
    };
  }

  /**
   * 从 PlaceNode 列表构建 VRPTW 输入
   */
  buildVRPTWInput(
    places: PlaceNode[],
    timeMatrix: number[][],
    startTime: string,
    date: string
  ): VRPTWInput {
    const locations = places.map((place, index) => {
      // 构建时间窗
      let window: [string, string] | undefined;
      if (place.timeWindow) {
        window = [place.timeWindow.earliest, place.timeWindow.latest];
      } else if (place.openingHours) {
        // 从营业时间构建时间窗
        const dateObj = DateTime.fromISO(date);
        if (place.openingHours.start && place.openingHours.end) {
          const startDateTime = dateObj.set({
            hour: parseInt(place.openingHours.start.split(':')[0]),
            minute: parseInt(place.openingHours.start.split(':')[1]),
          });
          const endDateTime = dateObj.set({
            hour: parseInt(place.openingHours.end.split(':')[0]),
            minute: parseInt(place.openingHours.end.split(':')[1]),
          });
          window = [startDateTime.toISO()!, endDateTime.toISO()!];
        }
      }

      // 确定服务时长
      let duration = place.serviceTime || place.estimatedDuration || 60;
      if (place.trailData?.estimatedDurationHours) {
        duration = place.trailData.estimatedDurationHours * 60;
      }

      return {
        id: index,
        name: place.name,
        window,
        duration,
      };
    });

    return {
      locations,
      timeMatrix,
      startIndex: 0, // 假设第一个地点是起点（酒店）
    };
  }
}

