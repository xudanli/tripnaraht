// src/itinerary-optimization/services/robust-time-matrix.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { PlanNode, RobustTimeMatrix } from '../interfaces/plan-request.interface';
import { SmartRoutesService } from '../../transport/services/smart-routes.service';
import { RouteCacheService } from '../../transport/services/route-cache.service';

/**
 * 鲁棒时间矩阵服务
 * 
 * 计算包含缓冲、切换、跨区惩罚的鲁棒时间矩阵
 * 
 * 公式：T_robust = T_api × α + β + T_switch + T_cross_region
 * 
 * 其中：
 * - α: buffer_factor (默认 1.2)
 * - β: fixed_buffer_min (默认 15)
 * - T_switch: 交通模态切换惩罚
 * - T_cross_region: 跨区惩罚
 */
@Injectable()
export class RobustTimeMatrixService {
  private readonly logger = new Logger(RobustTimeMatrixService.name);

  constructor(
    private smartRoutesService: SmartRoutesService,
    private routeCacheService: RouteCacheService
  ) {}

  /**
   * 计算鲁棒时间矩阵
   */
  async computeRobustTimeMatrix(
    nodes: PlanNode[],
    transportPolicy: {
      buffer_factor?: number;
      fixed_buffer_min?: number;
      switch_cost_min?: Record<string, number>;
      cross_region_cost_min?: number;
    } = {}
  ): Promise<RobustTimeMatrix> {
    const bufferFactor = transportPolicy.buffer_factor ?? 1.2;
    const fixedBuffer = transportPolicy.fixed_buffer_min ?? 15;
    const crossRegionCost = transportPolicy.cross_region_cost_min ?? 8;

    const n = nodes.length;
    const apiMatrix: number[][] = [];
    const bufferMatrix: number[][] = [];
    const switchMatrix: number[][] = [];
    const crossRegionMatrix: number[][] = [];
    const robustMatrix: number[][] = [];

    this.logger.debug(`计算鲁棒时间矩阵：${n} 个节点`);

    // 初始化矩阵
    for (let i = 0; i < n; i++) {
      apiMatrix[i] = [];
      bufferMatrix[i] = [];
      switchMatrix[i] = [];
      crossRegionMatrix[i] = [];
      robustMatrix[i] = [];
    }

    // 计算所有点对的时间
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (i === j) {
          // 自己到自己，时间为 0
          apiMatrix[i][j] = 0;
          bufferMatrix[i][j] = 0;
          switchMatrix[i][j] = 0;
          crossRegionMatrix[i][j] = 0;
          robustMatrix[i][j] = 0;
          continue;
        }

        const from = nodes[i];
        const to = nodes[j];

        // 1. 获取 API 原始时间
        const apiTime = await this.getApiTime(
          from.geo,
          to.geo,
          'TRANSIT' // 默认使用公共交通
        );

        apiMatrix[i][j] = apiTime;

        // 2. 计算缓冲时间
        const bufferTime = Math.round(apiTime * bufferFactor) - apiTime;
        bufferMatrix[i][j] = bufferTime;

        // 3. 计算切换成本（如果跨模态）
        const switchCost = this.calculateSwitchCost(
          from,
          to,
          transportPolicy.switch_cost_min
        );
        switchMatrix[i][j] = switchCost;

        // 4. 计算跨区惩罚
        const crossRegionPenalty = this.calculateCrossRegionPenalty(
          from,
          to,
          crossRegionCost
        );
        crossRegionMatrix[i][j] = crossRegionPenalty;

        // 5. 计算鲁棒时间
        robustMatrix[i][j] = Math.round(
          apiTime * bufferFactor + fixedBuffer + switchCost + crossRegionPenalty
        );
      }
    }

    return {
      unit: 'minute',
      base: 'api_duration',
      robust_policy: {
        buffer_factor: bufferFactor,
        fixed_buffer_min: fixedBuffer,
      },
      matrix: robustMatrix,
      components: {
        api: apiMatrix,
        buffer: bufferMatrix,
        fixed: fixedBuffer,
        switch: switchMatrix,
        cross_region: crossRegionMatrix,
      },
    };
  }

  /**
   * 获取 API 原始时间（分钟）
   */
  private async getApiTime(
    from: { lat: number; lng: number },
    to: { lat: number; lng: number },
    travelMode: 'TRANSIT' | 'WALKING' | 'DRIVING'
  ): Promise<number> {
    try {
      // 检查缓存
      const cached = await this.routeCacheService.getCachedRoute(
        from.lat,
        from.lng,
        to.lat,
        to.lng,
        travelMode
      );

      if (cached) {
        return cached.durationMinutes;
      }

      // 调用智能路由服务
      const options = await this.smartRoutesService.getRoutes(
        from.lat,
        from.lng,
        to.lat,
        to.lng,
        travelMode
      );

      if (options.length > 0) {
        const duration = options[0].durationMinutes;

        // 保存到缓存
        await this.routeCacheService.saveCachedRoute(
          from.lat,
          from.lng,
          to.lat,
          to.lng,
          travelMode,
          options[0]
        );

        return duration;
      }

      // 降级：使用距离估算
      return this.fallbackEstimateTime(from, to, travelMode);
    } catch (error) {
      this.logger.warn(`获取交通时间失败: ${error}`);
      return this.fallbackEstimateTime(from, to, travelMode);
    }
  }

  /**
   * 计算切换成本
   */
  private calculateSwitchCost(
    from: PlanNode,
    to: PlanNode,
    switchCostMap?: Record<string, number>
  ): number {
    if (!switchCostMap) {
      return 0;
    }

    // 根据节点类型推断交通模态
    const fromMode = this.inferTravelMode(from);
    const toMode = this.inferTravelMode(to);

    if (fromMode === toMode) {
      return 0;
    }

    const key = `${fromMode}->${toMode}`;
    return switchCostMap[key] ?? 0;
  }

  /**
   * 推断交通模态
   */
  private inferTravelMode(node: PlanNode): string {
    // 根据节点类型和标签推断
    if (node.meta?.tags?.includes('metro') || node.meta?.tags?.includes('station')) {
      return 'metro';
    }
    if (node.type === 'restaurant' || node.type === 'poi') {
      return 'walk'; // 默认步行
    }
    return 'walk';
  }

  /**
   * 计算跨区惩罚
   */
  private calculateCrossRegionPenalty(
    from: PlanNode,
    to: PlanNode,
    penalty: number
  ): number {
    if (!from.meta?.region_id || !to.meta?.region_id) {
      return 0;
    }

    if (from.meta.region_id === to.meta.region_id) {
      return 0;
    }

    return penalty;
  }

  /**
   * 降级估算时间
   */
  private fallbackEstimateTime(
    from: { lat: number; lng: number },
    to: { lat: number; lng: number },
    travelMode: 'TRANSIT' | 'WALKING' | 'DRIVING'
  ): number {
    const distance = this.calculateDistance(from, to);

    switch (travelMode) {
      case 'WALKING':
        return Math.round((distance / 1000 / 5) * 60); // 5 km/h
      case 'DRIVING':
        return Math.round((distance / 1000 / 25) * 60); // 25 km/h
      case 'TRANSIT':
      default:
        if (distance < 5000) {
          return Math.round((distance / 1000 / 30) * 60); // 30 km/h
        } else {
          return Math.round((distance / 1000 / 40) * 60); // 40 km/h
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

