// src/places/interfaces/physical-metadata.interface.ts

/**
 * 体力消耗元数据接口
 * 
 * 存储在 Place.physicalMetadata (JSONB) 中
 */
export interface PhysicalMetadata {
  /** 基础消耗分数 (每10分钟游玩消耗多少HP，默认 5) */
  base_fatigue_score: number;
  
  /** 地形类型 */
  terrain_type: 'FLAT' | 'HILLY' | 'STAIRS_ONLY' | 'ELEVATOR_AVAILABLE';
  
  /** 坐着的时间比例 (0.0 - 1.0) */
  seated_ratio: number;
  // e.g. 剧院 = 1.0, 博物馆 = 0.2, 爬山 = 0.0
  
  /** 强度系数 (1.0 = 标准, 1.5 = 高强度, 0.5 = 低强度) */
  intensity_factor?: number;
  
  /** 是否有电梯/缆车 */
  has_elevator?: boolean;
  
  /** 是否有无障碍设施 */
  wheelchair_accessible?: boolean;
  
  /** 预估游玩时长（分钟） */
  estimated_duration_min?: number;
}

