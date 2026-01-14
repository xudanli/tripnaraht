// src/itinerary-optimization/interfaces/scenario-optimization.interface.ts

/**
 * 场景类型
 */
export type OptimizationScenario = 'walking' | 'driving' | 'transit';

/**
 * 场景特定优化配置
 */
export interface ScenarioOptimizationConfig {
  scenario: OptimizationScenario;

  // 徒步场景配置
  walking?: {
    dem_required: boolean;
    fitness_constraints: {
      max_walk_min?: number; // 单段最大步行时间（分钟）
      max_total_walk_min?: number; // 每日最大总步行时间（分钟）
      max_ascent_m?: number; // 最大累计爬升（米）
      max_slope_pct?: number; // 最大坡度（百分比）
      require_rescue_access?: boolean; // 是否需要救援可达性
    };
    terrain_analysis: boolean;
    pacing_adjustment?: {
      ascent_factor: number; // 爬升调整因子（影响速度）
      slope_factor: number; // 坡度调整因子
    };
  };

  // 自驾场景配置
  driving?: {
    route_optimization: 'TIME' | 'DISTANCE' | 'TOLL_FREE' | 'SCENIC';
    traffic_aware: boolean;
    parking_consideration: boolean;
    fuel_stops?: {
      required: boolean;
      max_distance_between_stops_km?: number;
    };
  };

  // 公共交通场景配置
  transit?: {
    schedule_aware: boolean;
    transfer_penalty: number; // 换乘惩罚（分钟）
    walking_to_station_max_min: number; // 到车站最大步行时间（分钟）
    max_transfers?: number; // 最大换乘次数
    prefer_direct_routes: boolean; // 偏好直达路线
    time_window_aware: boolean; // 考虑班次时间窗
  };
}

/**
 * 场景特定约束
 */
export interface ScenarioConstraints {
  scenario: OptimizationScenario;
  
  // 硬约束
  hard_constraints: {
    max_travel_time_min?: number;
    max_cost?: number;
    required_features?: string[]; // 必需的特征（如 'restroom', 'parking'）
    forbidden_features?: string[]; // 禁止的特征
  };

  // 软约束（偏好）
  soft_preferences: {
    preferred_features?: string[];
    avoid_features?: string[];
    time_preferences?: {
      morning?: boolean;
      afternoon?: boolean;
      evening?: boolean;
    };
  };
}
