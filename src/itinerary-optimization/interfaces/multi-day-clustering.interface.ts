// src/itinerary-optimization/interfaces/multi-day-clustering.interface.ts

/**
 * 多日聚类输入
 */
export interface MultiDayClusteringInput {
  /** POI 列表 */
  pois: Array<{
    id: number;
    geo: { lat: number; lng: number };
    service_duration_min: number;
    time_windows?: Array<[string, string]>;
    must_day?: number; // 可选：锁定在某天
    priority?: number; // 1-5，用于跨天修复时选择
    is_hard_node?: boolean; // 是否为必去点
  }>;
  
  /** 天数 */
  N: number;
  
  /** 每天起止时间 */
  day_boundaries: Array<{
    date: string; // ISO 8601 date
    start: string; // "09:00"
    end: string;   // "22:00"
  }>;
  
  /** 约束条件 */
  constraints?: {
    /** 每天最大 POI 数 */
    max_pois_per_day?: number;
    /** 目标服务时长（分钟） */
    target_service_per_day?: number;
    /** 硬分配（锁定某 POI 必须在某天） */
    hard_assignments?: Array<{
      poi_id: number;
      day: number;
    }>;
  };
  
  /** 聚类配置 */
  config?: ClusteringConfig;
}

/**
 * 聚类配置
 */
export interface ClusteringConfig {
  /** K-Means 迭代次数 */
  kmeans_iterations?: number; // 默认 100
  /** K-Means 收敛容差 */
  kmeans_tolerance?: number;   // 默认 1e-4
  /** 均衡修复迭代次数 */
  repair_iterations?: number;  // 默认 30
  /** 均衡阈值（CV） */
  balance_threshold?: number;  // 默认 0.25
  /** 最大半径（公里） */
  max_radius_km?: number;      // 默认 5km
  /** 区域化权重 */
  compactness_weight?: number;  // 默认 0.6
  /** 均衡权重 */
  balance_weight?: number;     // 默认 0.4
  /** 平均交通缓冲时间（分钟） */
  avg_travel_buffer_min?: number; // 默认 15
}

/**
 * 多日聚类结果
 */
export interface MultiDayClusteringResult {
  /** 每天的 POI 分组 */
  day_clusters: Array<{
    day: number;
    date: string;
    poi_ids: number[];
  }>;
  
  /** 诊断信息 */
  diagnostics: {
    /** 每天的区域化指标 */
    compactness_by_day: Array<{
      day: number;
      radius_90th_percentile: number; // 米
      intra_day_distance_sum: number; // 米
      centroid: { lat: number; lng: number };
    }>;
    
    /** 每天的负载 */
    load_by_day: Array<{
      day: number;
      poi_count: number;
      total_service_min: number;
      estimated_total_min: number; // 包含交通缓冲
    }>;
    
    /** 均衡指标 */
    variance_metrics: {
      count_std: number;
      count_cv: number; // coefficient of variation
      service_std: number;
      service_cv: number;
      balance_score: number; // 0-1，越高越均衡
    };
    
    /** 调整记录 */
    moves?: Array<{
      poi_id: number;
      from_day: number;
      to_day: number;
      reason: string;
    }>;
  };
}

