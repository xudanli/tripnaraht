// src/places/utils/physical-metadata-constants.ts

/**
 * PhysicalMetadata 相关常量定义
 * 用于减少字符串魔法值，提高类型安全和可维护性
 */

/**
 * 地形类型（按强度从低到高排序）
 */
export const TERRAIN_TYPES = {
  FLAT: 'FLAT',
  ELEVATOR_AVAILABLE: 'ELEVATOR_AVAILABLE',
  HILLY: 'HILLY',
  STAIRS_ONLY: 'STAIRS_ONLY',
} as const;

export type TerrainType = typeof TERRAIN_TYPES[keyof typeof TERRAIN_TYPES];

/**
 * 地形强度等级（用于优先级判断）
 */
export const TERRAIN_INTENSITY: Record<TerrainType, number> = {
  [TERRAIN_TYPES.FLAT]: 1,
  [TERRAIN_TYPES.ELEVATOR_AVAILABLE]: 1,
  [TERRAIN_TYPES.HILLY]: 2,
  [TERRAIN_TYPES.STAIRS_ONLY]: 3,
};

/**
 * 徒步难度等级
 */
export const TRAIL_DIFFICULTY = {
  EASY: 'EASY',
  MODERATE: 'MODERATE',
  HARD: 'HARD',
  EXTREME: 'EXTREME',
} as const;

export type TrailDifficulty = typeof TRAIL_DIFFICULTY[keyof typeof TRAIL_DIFFICULTY];

/**
 * 访问类型
 */
export const ACCESS_TYPES = {
  WALKING: 'WALKING',
  HIKING: 'HIKING',
  TREKKING: 'TREKKING',
  VEHICLE: 'VEHICLE',
  BOAT: 'BOAT',
  CABLE_CAR: 'CABLE_CAR',
} as const;

export type AccessType = typeof ACCESS_TYPES[keyof typeof ACCESS_TYPES];

/**
 * 典型停留时间
 */
export const TYPICAL_STAY = {
  PHOTO_STOP: 'PHOTO_STOP',
  SHORT_WALK: 'SHORT_WALK',
  HALF_DAY_HIKE: 'HALF_DAY_HIKE',
  FULL_DAY_HIKE: 'FULL_DAY_HIKE',
} as const;

export type TypicalStay = typeof TYPICAL_STAY[keyof typeof TYPICAL_STAY];

/**
 * 数值范围限制
 */
export const METADATA_LIMITS = {
  BASE_FATIGUE_SCORE: { min: 1, max: 10 },
  INTENSITY_FACTOR: { min: 0.2, max: 2.5 },
  SEATED_RATIO: { min: 0, max: 1 },
  ESTIMATED_DURATION_MIN: { min: 5, max: 12 * 60 }, // 5分钟到12小时
} as const;

/**
 * 高海拔阈值（米）
 */
export const HIGH_ELEVATION_THRESHOLD = 2000;
