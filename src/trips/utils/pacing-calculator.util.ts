// src/trips/utils/pacing-calculator.util.ts

import { MobilityTag } from '../dto/create-trip.dto';
import { PacingConfig, MobilityProfile } from '../interfaces/pacing-config.interface';

/**
 * 木桶效应计算器
 * 
 * 核心思想：找出团队中最弱的指标作为全队的限制条件
 * 
 * 算法逻辑：
 * 1. 遍历所有成员的体能画像
 * 2. 找出最弱的指标（最短的那块板）
 * 3. 生成最终的 pacingConfig
 */
export class PacingCalculator {
  /**
   * 根据旅行者列表计算团队短板配置
   * 
   * @param travelers 旅行者列表（包含 type 和 mobilityTag）
   * @returns 计算后的 PacingConfig
   */
  static calculateShortestStave(travelers: Array<{ type: string; mobilityTag: MobilityTag }>): PacingConfig {
    if (!travelers || travelers.length === 0) {
      // 默认配置：假设是标准成年人
      return this.getDefaultConfig();
    }

    // 初始化最弱指标
    let minStamina = 100; // HP上限
    let minRecoveryRate = 0.4; // 回血倍率
    let maxWalkSpeedFactor = 1.0; // 步行速度（越大越慢）
    let maxStairsPenalty = 1.0; // 爬楼梯惩罚（越大越不能爬）
    let minForcedRestInterval = Infinity; // 强制休息间隔（越小越需要频繁休息）
    let terrainLimit: 'ALL' | 'NO_STAIRS' | 'WHEELCHAIR_ONLY' | 'ELEVATOR_REQUIRED' = 'ALL';
    let minHpThreshold = 20; // 最小HP阈值

    // 遍历所有成员，找出最弱的指标
    for (const traveler of travelers) {
      const profile = this.getProfileConfig(traveler.mobilityTag);
      
      // 找出最小的HP上限（最弱的续航）
      minStamina = Math.min(minStamina, profile.max_daily_hp);
      
      // 找出最小的回血倍率（恢复最慢）
      minRecoveryRate = Math.min(minRecoveryRate, profile.hp_recovery_rate);
      
      // 找出最大的步行速度系数（最慢的）
      maxWalkSpeedFactor = Math.max(maxWalkSpeedFactor, profile.walk_speed_factor);
      
      // 找出最大的爬楼梯惩罚（最不能爬的）
      maxStairsPenalty = Math.max(maxStairsPenalty, profile.stairs_penalty_factor);
      
      // 找出最小的强制休息间隔（最需要频繁休息的）
      minForcedRestInterval = Math.min(minForcedRestInterval, profile.forced_rest_interval_min);
      
      // 地形限制：取最严格的
      terrainLimit = this.getStricterTerrain(terrainLimit, profile.terrain_filter);
      
      // 找出最高的最小HP阈值（最怕低血量的）
      minHpThreshold = Math.max(minHpThreshold, profile.min_hp_threshold || 20);
    }

    // 生成描述信息
    const desc = this.generateDescription(travelers, {
      minStamina,
      minForcedRestInterval,
      terrainLimit,
      maxStairsPenalty,
    });

    return {
      max_daily_hp: minStamina,
      hp_recovery_rate: minRecoveryRate,
      walk_speed_factor: maxWalkSpeedFactor,
      stairs_penalty_factor: maxStairsPenalty,
      forced_rest_interval_min: minForcedRestInterval === Infinity ? 120 : minForcedRestInterval,
      terrain_filter: terrainLimit,
      min_hp_threshold: minHpThreshold,
      desc,
    };
  }

  /**
   * 获取不同体能画像的配置
   */
  private static getProfileConfig(mobilityTag: MobilityTag): PacingConfig {
    switch (mobilityTag) {
      case MobilityTag.IRON_LEGS:
        // 特种兵：能走、能爬、续航长
        return {
          max_daily_hp: 100,
          hp_recovery_rate: 0.5,
          walk_speed_factor: 0.8, // 走得快
          stairs_penalty_factor: 1.0, // 正常爬楼
          forced_rest_interval_min: 180, // 3小时才需要休息
          terrain_filter: 'ALL',
          min_hp_threshold: 10,
        };

      case MobilityTag.ACTIVE_SENIOR:
        // 银发徒步：能走但膝盖不好，不能爬楼梯
        return {
          max_daily_hp: 80,
          hp_recovery_rate: 0.4,
          walk_speed_factor: 1.2, // 走得慢
          stairs_penalty_factor: 999, // 不能爬楼
          forced_rest_interval_min: 120, // 2小时休息一次
          terrain_filter: 'NO_STAIRS',
          min_hp_threshold: 30,
        };

      case MobilityTag.CITY_POTATO:
        // 城市脆皮：续航短，需要频繁休息
        return {
          max_daily_hp: 60,
          hp_recovery_rate: 0.3,
          walk_speed_factor: 1.0, // 正常速度
          stairs_penalty_factor: 1.5, // 爬楼消耗大
          forced_rest_interval_min: 60, // 1小时必须休息
          terrain_filter: 'ALL',
          min_hp_threshold: 25,
        };

      case MobilityTag.LIMITED:
        // 行动不便：轮椅/助行器
        return {
          max_daily_hp: 40,
          hp_recovery_rate: 0.2,
          walk_speed_factor: 1.5, // 很慢
          stairs_penalty_factor: 999, // 完全不能爬
          forced_rest_interval_min: 45, // 45分钟休息
          terrain_filter: 'WHEELCHAIR_ONLY',
          min_hp_threshold: 40,
        };

      default:
        return this.getDefaultConfig();
    }
  }

  /**
   * 获取默认配置（标准成年人）
   */
  private static getDefaultConfig(): PacingConfig {
    return {
      max_daily_hp: 100,
      hp_recovery_rate: 0.4,
      walk_speed_factor: 1.0,
      stairs_penalty_factor: 1.0,
      forced_rest_interval_min: 120,
      terrain_filter: 'ALL',
      min_hp_threshold: 20,
      desc: '标准成年人配置',
    };
  }

  /**
   * 获取更严格的地形限制
   */
  private static getStricterTerrain(
    current: 'ALL' | 'NO_STAIRS' | 'WHEELCHAIR_ONLY' | 'ELEVATOR_REQUIRED',
    newTerrain: 'ALL' | 'NO_STAIRS' | 'WHEELCHAIR_ONLY' | 'ELEVATOR_REQUIRED'
  ): 'ALL' | 'NO_STAIRS' | 'WHEELCHAIR_ONLY' | 'ELEVATOR_REQUIRED' {
    const strictness: Record<string, number> = {
      'ALL': 0,
      'NO_STAIRS': 1,
      'ELEVATOR_REQUIRED': 2,
      'WHEELCHAIR_ONLY': 3,
    };

    return strictness[newTerrain] > strictness[current] ? newTerrain : current;
  }

  /**
   * 生成描述信息
   */
  private static generateDescription(
    travelers: Array<{ type: string; mobilityTag: MobilityTag }>,
    config: {
      minStamina: number;
      minForcedRestInterval: number;
      terrainLimit: string;
      maxStairsPenalty: number;
    }
  ): string {
    const parts: string[] = [];

    // 分析团队构成
    const profiles = travelers.map(t => t.mobilityTag);
    const hasCityPotato = profiles.includes(MobilityTag.CITY_POTATO);
    const hasActiveSenior = profiles.includes(MobilityTag.ACTIVE_SENIOR);
    const hasLimited = profiles.includes(MobilityTag.LIMITED);

    // 体力短板分析
    if (hasCityPotato) {
      parts.push(`检测到体力短板（城市脆皮），建议每 ${config.minForcedRestInterval} 分钟休息一次`);
    } else if (hasLimited) {
      parts.push(`检测到行动不便成员，需要频繁休息（每 ${config.minForcedRestInterval} 分钟）`);
    }

    // 地形限制分析
    if (config.terrainLimit === 'NO_STAIRS' || config.maxStairsPenalty >= 999) {
      parts.push('避免楼梯和陡坡（膝盖保护）');
    } else if (config.terrainLimit === 'WHEELCHAIR_ONLY') {
      parts.push('仅限无障碍设施和轮椅通道');
    }

    // 续航分析
    if (config.minStamina < 60) {
      parts.push(`团队续航能力较弱（HP上限：${config.minStamina}），建议安排轻松行程`);
    }

    return parts.length > 0 ? parts.join('；') : '全员体力充沛，可安排高强度行程';
  }
}

