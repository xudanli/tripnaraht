// src/itinerary-optimization/services/scenario-optimization.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { PlanRequest } from '../interfaces/plan-request.interface';
import {
  ScenarioOptimizationConfig,
  ScenarioConstraints,
  OptimizationScenario,
} from '../interfaces/scenario-optimization.interface';

/**
 * 场景优化服务
 * 
 * 功能：
 * 1. 根据场景类型应用特定配置
 * 2. 生成场景特定的约束
 * 3. 调整优化参数
 */
@Injectable()
export class ScenarioOptimizationService {
  private readonly logger = new Logger(ScenarioOptimizationService.name);

  /**
   * 应用场景配置到请求
   */
  applyScenarioConfig(
    request: PlanRequest,
    config: ScenarioOptimizationConfig
  ): PlanRequest {
    const modified = { ...request };

    switch (config.scenario) {
      case 'walking':
        return this.applyWalkingConfig(modified, config);
      case 'driving':
        return this.applyDrivingConfig(modified, config);
      case 'transit':
        return this.applyTransitConfig(modified, config);
      default:
        this.logger.warn(`未知场景类型: ${config.scenario}`);
        return modified;
    }
  }

  /**
   * 应用徒步场景配置
   */
  private applyWalkingConfig(
    request: PlanRequest,
    config: ScenarioOptimizationConfig
  ): PlanRequest {
    if (!config.walking) {
      return request;
    }

    const modified = { ...request };

    // 调整交通策略（如果尚未设置）
    modified.transport_policy = {
      ...modified.transport_policy,
      // 徒步场景：增加缓冲以应对地形因素
      buffer_factor: modified.transport_policy?.buffer_factor || 1.3,
      fixed_buffer_min: modified.transport_policy?.fixed_buffer_min || 20,
    };

    // 调整目标权重（更重视时间效率，因为体力有限）
    modified.objective_weights = {
      ...modified.objective_weights,
      travel: (modified.objective_weights?.travel || 1.0) * 1.2, // 增加旅行时间权重
      wait: (modified.objective_weights?.wait || 1.5) * 0.8, // 降低等待权重（徒步中等待较少）
    };

    // 应用 pacing 调整
    if (config.walking.pacing_adjustment) {
      // 可以根据爬升和坡度调整 pacing
      // 这里简化处理，实际应该根据 DEM 数据动态调整
    }

    this.logger.debug(`应用徒步场景配置: DEM=${config.walking.dem_required}, 地形分析=${config.walking.terrain_analysis}`);

    return modified;
  }

  /**
   * 应用自驾场景配置
   */
  private applyDrivingConfig(
    request: PlanRequest,
    config: ScenarioOptimizationConfig
  ): PlanRequest {
    if (!config.driving) {
      return request;
    }

    const modified = { ...request };

    // 调整交通策略
    modified.transport_policy = {
      ...modified.transport_policy,
      buffer_factor: config.driving.traffic_aware ? 1.25 : 1.1, // 考虑交通时增加缓冲
      fixed_buffer_min: config.driving.traffic_aware ? 20 : 10,
    };

    // 调整目标权重
    modified.objective_weights = {
      ...modified.objective_weights,
      travel: config.driving.route_optimization === 'TIME' ? 1.5 : 1.0,
    };

    // 如果考虑停车，可能需要调整节点访问时间
    if (config.driving.parking_consideration) {
      // 可以在节点服务时长中增加停车时间
      // 这里简化处理
    }

    this.logger.debug(
      `应用自驾场景配置: 优化目标=${config.driving.route_optimization}, ` +
      `交通感知=${config.driving.traffic_aware}`
    );

    return modified;
  }

  /**
   * 应用公共交通场景配置
   */
  private applyTransitConfig(
    request: PlanRequest,
    config: ScenarioOptimizationConfig
  ): PlanRequest {
    if (!config.transit) {
      return request;
    }

    const modified = { ...request };

    // 调整交通策略
    modified.transport_policy = {
      ...modified.transport_policy,
      buffer_factor: config.transit.schedule_aware ? 1.4 : 1.2, // 班次感知时大幅增加缓冲
      fixed_buffer_min: config.transit.schedule_aware ? 30 : 15, // 确保有足够时间赶上下一班
      switch_cost_min: {
        ...modified.transport_policy?.switch_cost_min,
        // 换乘成本已在 transfer_penalty 中体现
      },
    };

    // 调整目标权重
    modified.objective_weights = {
      ...modified.objective_weights,
      wait: (modified.objective_weights?.wait || 1.5) * (1 + config.transit.transfer_penalty / 60), // 换乘惩罚影响等待权重
    };

    this.logger.debug(
      `应用公共交通场景配置: 班次感知=${config.transit.schedule_aware}, ` +
      `换乘惩罚=${config.transit.transfer_penalty}分钟, ` +
      `最大换乘=${config.transit.max_transfers || 'unlimited'}`
    );

    return modified;
  }

  /**
   * 生成场景特定约束
   */
  generateScenarioConstraints(
    scenario: OptimizationScenario,
    config?: ScenarioOptimizationConfig
  ): ScenarioConstraints {
    const baseConstraints: ScenarioConstraints = {
      scenario,
      hard_constraints: {},
      soft_preferences: {},
    };

    switch (scenario) {
      case 'walking':
        if (config?.walking) {
          const fitness = config.walking.fitness_constraints;
          baseConstraints.hard_constraints = {
            max_travel_time_min: fitness.max_total_walk_min,
            required_features: fitness.require_rescue_access ? ['rescue_access'] : undefined,
          };
          baseConstraints.soft_preferences = {
            preferred_features: ['restroom', 'water'],
            avoid_features: ['steep_slope'],
          };
        }
        break;

      case 'driving':
        if (config?.driving) {
          baseConstraints.hard_constraints = {
            required_features: config.driving.parking_consideration ? ['parking'] : undefined,
          };
          baseConstraints.soft_preferences = {
            preferred_features: config.driving.route_optimization === 'SCENIC' ? ['scenic_view'] : [],
          };
        }
        break;

      case 'transit':
        if (config?.transit) {
          baseConstraints.hard_constraints = {
            required_features: ['transit_station_nearby'],
          };
          baseConstraints.soft_preferences = {
            preferred_features: config.transit.prefer_direct_routes ? ['direct_route'] : [],
            avoid_features: config.transit.max_transfers
              ? [`transfers > ${config.transit.max_transfers}`]
              : [],
          };
        }
        break;
    }

    return baseConstraints;
  }

  /**
   * 获取默认场景配置
   */
  getDefaultScenarioConfig(scenario: OptimizationScenario): ScenarioOptimizationConfig {
    switch (scenario) {
      case 'walking':
        return {
          scenario: 'walking',
          walking: {
            dem_required: true,
            fitness_constraints: {
              max_walk_min: 30, // 单段最大 30 分钟
              max_total_walk_min: 240, // 每日最大 4 小时
              max_ascent_m: 500, // 最大累计爬升 500 米
              max_slope_pct: 20, // 最大坡度 20%
              require_rescue_access: false,
            },
            terrain_analysis: true,
            pacing_adjustment: {
              ascent_factor: 1.2, // 爬升增加 20% 时间
              slope_factor: 1.15, // 坡度增加 15% 时间
            },
          },
        };

      case 'driving':
        return {
          scenario: 'driving',
          driving: {
            route_optimization: 'TIME',
            traffic_aware: true,
            parking_consideration: true,
            fuel_stops: {
              required: false,
              max_distance_between_stops_km: 300,
            },
          },
        };

      case 'transit':
        return {
          scenario: 'transit',
          transit: {
            schedule_aware: true,
            transfer_penalty: 15, // 换乘惩罚 15 分钟
            walking_to_station_max_min: 10, // 到车站最大步行 10 分钟
            max_transfers: 2, // 最大 2 次换乘
            prefer_direct_routes: true,
            time_window_aware: true,
          },
        };

      default:
        throw new Error(`未知场景类型: ${scenario}`);
    }
  }
}
