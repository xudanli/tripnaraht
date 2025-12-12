// src/places/utils/physical-metadata-generator.util.ts

import { PlaceCategory } from '@prisma/client';
import { PhysicalMetadata } from '../interfaces/physical-metadata.interface';
import {
  TERRAIN_TYPES,
  TERRAIN_INTENSITY,
  TerrainType,
  TRAIL_DIFFICULTY,
  TrailDifficulty,
  ACCESS_TYPES,
  AccessType,
  TYPICAL_STAY,
  TypicalStay,
  METADATA_LIMITS,
  HIGH_ELEVATION_THRESHOLD,
} from './physical-metadata-constants';

/**
 * 增量更新补丁（用于规则合并）
 */
interface PhysicalMetadataPatch {
  base_fatigue_score?: number;
  terrain_type?: TerrainType;
  seated_ratio?: number;
  intensity_factor?: number;
  has_elevator?: boolean;
  wheelchair_accessible?: boolean;
  estimated_duration_min?: number;
  source?: string; // 规则来源，用于调试
}

/**
 * 根据地点类别和元数据生成体力消耗元数据
 * 
 * 数据来源：
 * 1. 根据 category 推断默认值
 * 2. 从 metadata 中提取相关信息（如 trailDifficulty, accessType 等）
 * 3. 从自然 POI 的 metadata 中提取（如 elevationMeters, terrain 等）
 * 
 * 规则优先级：
 * 1. trailDifficulty（最高优先级，直接决定地形和强度）
 * 2. accessType（影响地形和 seated_ratio）
 * 3. typicalStay（影响时长和强度）
 * 4. elevationMeters（高海拔增加强度）
 * 5. visitDuration（覆盖时长）
 * 6. facilities（影响无障碍设施）
 * 7. subCategory（根据子类别推断）
 */
export class PhysicalMetadataGenerator {
  /**
   * 根据地点类别生成默认的 physicalMetadata
   */
  static generateByCategory(
    category: PlaceCategory,
    metadata?: any
  ): PhysicalMetadata {
    const base = this.getDefaultByCategory(category);
    
    // 如果有 metadata，尝试从中提取信息
    if (metadata) {
      return this.enhanceFromMetadata(base, metadata, category);
    }
    
    return this.normalize(base);
  }

  /**
   * 根据类别获取默认值
   */
  private static getDefaultByCategory(
    category: PlaceCategory
  ): PhysicalMetadata {
    switch (category) {
      case PlaceCategory.ATTRACTION:
        // 景点：中等强度，平地为主
        return {
          base_fatigue_score: 5,
          terrain_type: TERRAIN_TYPES.FLAT,
          seated_ratio: 0.2, // 20% 时间坐着（如博物馆、展览）
          intensity_factor: 1.0,
          has_elevator: false,
          wheelchair_accessible: false,
          estimated_duration_min: 60,
        };

      case PlaceCategory.RESTAURANT:
        // 餐厅：低强度，主要是坐着
        return {
          base_fatigue_score: 2,
          terrain_type: TERRAIN_TYPES.FLAT,
          seated_ratio: 0.9, // 90% 时间坐着
          intensity_factor: 0.3,
          has_elevator: false,
          wheelchair_accessible: false,
          estimated_duration_min: 60,
        };

      case PlaceCategory.SHOPPING:
        // 购物：低到中等强度，平地，部分坐着
        return {
          base_fatigue_score: 4,
          terrain_type: TERRAIN_TYPES.FLAT,
          seated_ratio: 0.1, // 10% 时间坐着（试衣间、休息区）
          intensity_factor: 0.8,
          has_elevator: false,
          wheelchair_accessible: false,
          estimated_duration_min: 90,
        };

      case PlaceCategory.HOTEL:
        // 酒店：极低强度，主要是休息
        return {
          base_fatigue_score: 1,
          terrain_type: TERRAIN_TYPES.ELEVATOR_AVAILABLE,
          seated_ratio: 0.95, // 95% 时间坐着或躺着
          intensity_factor: 0.2,
          has_elevator: true, // 酒店通常有电梯
          wheelchair_accessible: false, // 需要从 metadata 中获取
          estimated_duration_min: 480, // 8小时（过夜）
        };

      case PlaceCategory.TRANSIT_HUB:
        // 交通枢纽：中等强度，需要步行
        return {
          base_fatigue_score: 4,
          terrain_type: TERRAIN_TYPES.FLAT,
          seated_ratio: 0.3, // 30% 时间坐着（等车）
          intensity_factor: 0.9,
          has_elevator: false,
          wheelchair_accessible: false,
          estimated_duration_min: 30,
        };

      default:
        // 默认值
        return {
          base_fatigue_score: 5,
          terrain_type: TERRAIN_TYPES.FLAT,
          seated_ratio: 0.2,
          intensity_factor: 1.0,
          has_elevator: false,
          wheelchair_accessible: false,
          estimated_duration_min: 60,
        };
    }
  }

  /**
   * 从 metadata 中提取信息增强 physicalMetadata
   * 使用规则优先级系统，避免冲突
   * 
   * ⚠️ 重要：trailDifficulty 不再直接决定 fatigue
   * - Difficulty 和 Fatigue 是分离的两个轨道
   * - Difficulty 只作为最后的微调调制器（5-15%）
   */
  private static enhanceFromMetadata(
    base: PhysicalMetadata,
    metadata: any,
    category: PlaceCategory
  ): PhysicalMetadata {
    const patches: PhysicalMetadataPatch[] = [];

    // 规则1：accessType（影响地形和 seated_ratio）
    if (this.isValidString(metadata.accessType)) {
      patches.push(this.patchFromAccessType(metadata.accessType));
    }

    // 规则2：typicalStay（影响时长和强度）
    if (this.isValidString(metadata.typicalStay)) {
      patches.push(this.patchFromTypicalStay(metadata.typicalStay));
    }

    // 规则3：elevationMeters（高海拔增加强度，但不改变地形）
    if (this.isValidNumber(metadata.elevationMeters)) {
      patches.push(this.patchFromElevation(metadata.elevationMeters));
    }

    // 规则4：visitDuration（覆盖时长，优先级高于 typicalStay）
    if (this.isValidString(metadata.visitDuration)) {
      const duration = this.parseDuration(metadata.visitDuration);
      if (duration) {
        patches.push({
          estimated_duration_min: duration,
          source: 'visitDuration',
        });
      }
    }

    // 规则5：facilities（影响无障碍设施）
    if (metadata.facilities) {
      patches.push(this.patchFromFacilities(metadata.facilities));
    }

    // 规则6：subCategory（根据子类别推断，优先级最低）
    if (this.isValidString(metadata.subCategory)) {
      patches.push(this.patchFromSubCategory(metadata.subCategory));
    }

    // 合并所有补丁（不包含 trailDifficulty）
    const enhanced = this.mergePatches(base, patches);
    
    // 规则7：trailDifficulty 作为弱耦合调制器（最后应用，只微调 5-15%）
    const final = this.applyDifficultyModifier(enhanced, metadata.trailDifficulty);
    
    // 最终规范化
    return this.normalize(final);
  }

  /**
   * 应用 difficulty 调制器（弱耦合）
   * 
   * ⚠️ 重要：Difficulty 只做微调（5-15%），不能决定 fatigue 的主量级
   * 
   * 原理：
   * - Difficulty 关注技术性、风险、门槛（是否"难"）
   * - Fatigue 关注时长、强度、消耗（有多"累"）
   * - 二者分离，只在最后用 difficulty 微调 fatigue
   * 
   * 示例：
   * - EASY: fatigue × 0.95（-5%，心理压力小）
   * - MODERATE: fatigue × 1.0（基准）
   * - HARD: fatigue × 1.1（+10%，心理压力/技术消耗）
   * - EXTREME: fatigue × 1.15（+15%，心理压力/技术消耗）
   */
  private static applyDifficultyModifier(
    metadata: PhysicalMetadata,
    trailDifficulty?: string
  ): PhysicalMetadata {
    if (!trailDifficulty || !this.isValidString(trailDifficulty)) {
      return metadata;
    }
    
    const upper = trailDifficulty.toUpperCase();
    
    // 确定调制系数（只微调 5-15%）
    let modifier = 1.0;
    if (upper.includes(TRAIL_DIFFICULTY.EASY) || upper === 'EASY') {
      modifier = 0.95;  // -5%
    } else if (upper.includes(TRAIL_DIFFICULTY.MODERATE) || upper === 'MODERATE') {
      modifier = 1.0;  // 基准
    } else if (upper.includes(TRAIL_DIFFICULTY.HARD) || upper === 'HARD') {
      modifier = 1.1;   // +10%
    } else if (upper.includes(TRAIL_DIFFICULTY.EXTREME) || upper === 'EXTREME') {
      modifier = 1.15;  // +15%
    }
    
    // 只微调 intensity_factor（不影响其他字段）
    return {
      ...metadata,
      intensity_factor: (metadata.intensity_factor || 1.0) * modifier,
    };
  }

  /**
   * 从 accessType 生成补丁
   */
  private static patchFromAccessType(
    accessType: string
  ): PhysicalMetadataPatch {
    const upper = accessType.toUpperCase();
    
    if (upper.includes(ACCESS_TYPES.HIKING) || upper.includes(ACCESS_TYPES.TREKKING)) {
      return {
        terrain_type: TERRAIN_TYPES.HILLY,
        intensity_factor: 1.5,
        seated_ratio: 0,
        source: 'accessType:HIKING',
      };
    }
    
    if (upper.includes(ACCESS_TYPES.VEHICLE) || upper.includes(ACCESS_TYPES.BOAT)) {
      return {
        seated_ratio: 0.8, // 大部分时间在交通工具上
        intensity_factor: 0.6,
        source: 'accessType:VEHICLE',
      };
    }
    
    if (upper.includes(ACCESS_TYPES.CABLE_CAR)) {
      return {
        terrain_type: TERRAIN_TYPES.ELEVATOR_AVAILABLE,
        has_elevator: true,
        seated_ratio: 0.7,
        intensity_factor: 0.5,
        source: 'accessType:CABLE_CAR',
      };
    }
    
    return {};
  }

  /**
   * 从 typicalStay 生成补丁
   */
  private static patchFromTypicalStay(
    stay: string
  ): PhysicalMetadataPatch {
    const upper = stay.toUpperCase();
    
    if (upper.includes(TYPICAL_STAY.PHOTO_STOP) || upper === 'PHOTO_STOP') {
      return {
        estimated_duration_min: 15,
        seated_ratio: 0.1,
        intensity_factor: 0.6,
        source: 'typicalStay:PHOTO_STOP',
      };
    }
    
    if (upper.includes(TYPICAL_STAY.SHORT_WALK) || upper === 'SHORT_WALK') {
      return {
        estimated_duration_min: 30,
        seated_ratio: 0,
        intensity_factor: 0.8,
        source: 'typicalStay:SHORT_WALK',
      };
    }
    
    if (upper.includes(TYPICAL_STAY.HALF_DAY_HIKE) || upper === 'HALF_DAY_HIKE') {
      return {
        estimated_duration_min: 240, // 4小时
        terrain_type: TERRAIN_TYPES.HILLY, // 但可能被 trailDifficulty 覆盖
        intensity_factor: 1.5,
        seated_ratio: 0,
        source: 'typicalStay:HALF_DAY_HIKE',
      };
    }
    
    if (upper.includes(TYPICAL_STAY.FULL_DAY_HIKE) || upper === 'FULL_DAY_HIKE') {
      return {
        estimated_duration_min: 480, // 8小时
        terrain_type: TERRAIN_TYPES.HILLY, // 但可能被 trailDifficulty 覆盖
        intensity_factor: 2.0,
        seated_ratio: 0,
        source: 'typicalStay:FULL_DAY_HIKE',
      };
    }
    
    return {};
  }

  /**
   * 从海拔高度生成补丁
   */
  private static patchFromElevation(
    elevationMeters: number
  ): PhysicalMetadataPatch {
    // 修复：正确处理 0 值
    if (typeof elevationMeters !== 'number' || isNaN(elevationMeters)) {
      return {};
    }
    
    if (elevationMeters > HIGH_ELEVATION_THRESHOLD) {
      // 高海拔地区，体力消耗增加（但不改变地形）
      return {
        intensity_factor: 1.3, // 作为乘数，会在 mergePatches 中处理
        source: 'elevationMeters',
      };
    }
    
    return {};
  }

  /**
   * 从 facilities 生成补丁
   */
  private static patchFromFacilities(
    facilities: any
  ): PhysicalMetadataPatch {
    const patch: PhysicalMetadataPatch = {
      source: 'facilities',
    };
    
    if (facilities.wheelchair?.hasElevator) {
      patch.has_elevator = true;
      // 如果有电梯，地形类型应该是 ELEVATOR_AVAILABLE（但优先级低于 trailDifficulty）
      patch.terrain_type = TERRAIN_TYPES.ELEVATOR_AVAILABLE;
    }
    
    if (facilities.wheelchair?.accessible) {
      patch.wheelchair_accessible = true;
    }
    
    return Object.keys(patch).length > 1 ? patch : {}; // 如果只有 source，返回空
  }

  /**
   * 从 subCategory 生成补丁（优先级最低）
   */
  private static patchFromSubCategory(
    subCategory: string
  ): PhysicalMetadataPatch {
    const lower = subCategory.toLowerCase();
    
    // 火山、冰川等高强度活动
    if (lower.includes('volcano') || lower.includes('glacier')) {
      return {
        intensity_factor: 1.8,
        terrain_type: TERRAIN_TYPES.HILLY, // 可能被 trailDifficulty 覆盖
        base_fatigue_score: 8,
        source: 'subCategory:volcano/glacier',
      };
    }
    
    // 温泉、观景台等低强度
    if (lower.includes('hot_spring') || lower.includes('viewpoint') || lower.includes('hotspring')) {
      return {
        intensity_factor: 0.6,
        seated_ratio: 0.3,
        source: 'subCategory:hot_spring/viewpoint',
      };
    }
    
    return {};
  }

  /**
   * 合并多个补丁到基础值
   * 处理优先级和冲突
   */
  private static mergePatches(
    base: PhysicalMetadata,
    patches: PhysicalMetadataPatch[]
  ): PhysicalMetadata {
    let result = { ...base };
    
    // 地形类型：使用最高强度的（优先级：STAIRS_ONLY > HILLY > FLAT > ELEVATOR_AVAILABLE）
    let maxTerrainIntensity = TERRAIN_INTENSITY[result.terrain_type as TerrainType] || 1;
    let selectedTerrain: TerrainType | undefined = result.terrain_type as TerrainType;
    
    for (const patch of patches) {
      if (patch.terrain_type) {
        const intensity = TERRAIN_INTENSITY[patch.terrain_type];
        if (intensity > maxTerrainIntensity) {
          maxTerrainIntensity = intensity;
          selectedTerrain = patch.terrain_type;
        }
      }
    }
    
    if (selectedTerrain) {
      result.terrain_type = selectedTerrain;
    }
    
    // intensity_factor：乘法叠加，但有上限
    let intensityMultiplier = 1.0;
    for (const patch of patches) {
      if (patch.intensity_factor !== undefined) {
        intensityMultiplier *= patch.intensity_factor;
      }
    }
    result.intensity_factor = (result.intensity_factor || 1.0) * intensityMultiplier;
    
    // 其他字段：直接覆盖（后面的规则覆盖前面的）
    for (const patch of patches) {
      if (patch.base_fatigue_score !== undefined) {
        result.base_fatigue_score = patch.base_fatigue_score;
      }
      if (patch.seated_ratio !== undefined) {
        result.seated_ratio = patch.seated_ratio;
      }
      if (patch.estimated_duration_min !== undefined) {
        result.estimated_duration_min = patch.estimated_duration_min;
      }
      if (patch.has_elevator !== undefined) {
        result.has_elevator = patch.has_elevator;
      }
      if (patch.wheelchair_accessible !== undefined) {
        result.wheelchair_accessible = patch.wheelchair_accessible;
      }
    }
    
    return result;
  }

  /**
   * 规范化 physicalMetadata，确保所有值在合理范围内
   */
  private static normalize(metadata: PhysicalMetadata): PhysicalMetadata {
    return {
      base_fatigue_score: this.clamp(
        Math.round(metadata.base_fatigue_score),
        METADATA_LIMITS.BASE_FATIGUE_SCORE.min,
        METADATA_LIMITS.BASE_FATIGUE_SCORE.max
      ),
      terrain_type: metadata.terrain_type,
      seated_ratio: this.clamp(
        metadata.seated_ratio,
        METADATA_LIMITS.SEATED_RATIO.min,
        METADATA_LIMITS.SEATED_RATIO.max
      ),
      intensity_factor: metadata.intensity_factor
        ? this.clamp(
            metadata.intensity_factor,
            METADATA_LIMITS.INTENSITY_FACTOR.min,
            METADATA_LIMITS.INTENSITY_FACTOR.max
          )
        : undefined,
      has_elevator: metadata.has_elevator ?? false,
      wheelchair_accessible: metadata.wheelchair_accessible ?? false,
      estimated_duration_min: metadata.estimated_duration_min
        ? this.clamp(
            Math.round(metadata.estimated_duration_min),
            METADATA_LIMITS.ESTIMATED_DURATION_MIN.min,
            METADATA_LIMITS.ESTIMATED_DURATION_MIN.max
          )
        : undefined,
    };
  }

  /**
   * 限制数值在指定范围内
   */
  private static clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  /**
   * 验证字符串是否有效（非空、非 null、非 undefined）
   */
  private static isValidString(value: any): value is string {
    return typeof value === 'string' && value.trim().length > 0;
  }

  /**
   * 验证数字是否有效（非 null、非 undefined、非 NaN）
   */
  private static isValidNumber(value: any): value is number {
    return typeof value === 'number' && !isNaN(value);
  }

  /**
   * 解析游玩时长字符串（支持多种格式）
   * 
   * 支持的格式：
   * - "1小时" / "1-2小时" / "1.5小时"
   * - "30分钟" / "30 min" / "30min"
   * - "半天" / "全天"
   * - "约2小时" / "2h" / "2 h"
   */
  private static parseDuration(durationStr: string): number | null {
    if (!durationStr || typeof durationStr !== 'string') {
      return null;
    }

    const str = durationStr.trim().toLowerCase();

    // 处理"半天"、"全天"
    if (str.includes('半天') || str.includes('half day')) {
      return 240; // 4小时
    }
    if (str.includes('全天') || str.includes('full day') || str.includes('一天')) {
      return 480; // 8小时
    }

    // 匹配小时：支持 "1小时", "1-2小时", "1.5小时", "约2小时", "2h"
    const hourPatterns = [
      /约?\s*(\d+(?:\.\d+)?)\s*-?\s*(\d+(?:\.\d+)?)?\s*小时/i,
      /约?\s*(\d+(?:\.\d+)?)\s*-?\s*(\d+(?:\.\d+)?)?\s*h/i,
    ];

    for (const pattern of hourPatterns) {
      const match = str.match(pattern);
      if (match) {
        const min = parseFloat(match[1]);
        const max = match[2] ? parseFloat(match[2]) : min;
        const avg = (min + max) / 2;
        return Math.round(avg * 60); // 转换为分钟
      }
    }

    // 匹配分钟：支持 "30分钟", "30 min", "30min"
    const minPatterns = [
      /(\d+)\s*分钟/i,
      /(\d+)\s*min/i,
    ];

    for (const pattern of minPatterns) {
      const match = str.match(pattern);
      if (match) {
        return parseInt(match[1], 10);
      }
    }

    return null;
  }

  /**
   * 从自然 POI 数据生成 physicalMetadata
   */
  static generateFromNaturePoi(poiMetadata: any): PhysicalMetadata {
    const base = this.getDefaultByCategory(PlaceCategory.ATTRACTION);
    return this.enhanceFromMetadata(base, poiMetadata, PlaceCategory.ATTRACTION);
  }
}
