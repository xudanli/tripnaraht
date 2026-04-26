// src/trips/decision/services/fatigue-calculator.service.ts
/**
 * Fatigue Calculator Service
 * 
 * 疲劳指数计算服务
 * 
 * Phase 1 改进（2026-02）：
 * - 渐进式坡度惩罚（替代阶跃式）
 * - 累积疲劳效应（多日行程）
 * - 地形系数支持
 */

import { Injectable } from '@nestjs/common';
import { DayProfile, PaceConstraints } from '../interfaces/day-profile.interface';
import { HumanCapabilityModel } from '../models/human-capability.model';

/**
 * 地形类型（Phase 2 扩展）
 * 
 * 基础地形：
 * - easy: 良好铺装路面、平坦步道
 * - moderate: 普通山地步道、碎石路
 * - technical: 技术路段、岩石路面、需要手脚并用
 * - extreme: 极端路况、悬崖、危险路段
 * 
 * 特殊地形（Phase 2 新增）：
 * - alpine: 高山草甸、雪线以上
 * - glacier: 冰川地形、需要冰爪
 * - desert: 沙漠地形、软沙路面
 * - jungle: 热带丛林、潮湿泥泞
 * - coastal: 海岸线、沙滩、礁石
 * - scree: 碎石坡、流石滩
 */
export type TerrainType = 
  | 'easy' 
  | 'moderate' 
  | 'technical' 
  | 'extreme'
  | 'alpine'
  | 'glacier'
  | 'desert'
  | 'jungle'
  | 'coastal'
  | 'scree';

/**
 * 地形特性描述
 */
export interface TerrainCharacteristics {
  /** 地形类型 */
  type: TerrainType;
  /** 疲劳系数 */
  fatigueFactor: number;
  /** 速度系数 */
  speedMultiplier: number;
  /** 风险等级 */
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  /** 描述 */
  description: string;
  /** 中文描述 */
  descriptionZh: string;
  /** 所需装备 */
  requiredGear?: string[];
  /** 最佳季节 */
  bestSeasons?: number[];
}

/**
 * 扩展的疲劳计算上下文
 */
export interface FatigueContext {
  /** 当前是行程的第几天（0-based） */
  dayOfTrip?: number;
  /** 总行程天数 */
  totalTripDays?: number;
  /** 人体能力模型（用于年龄修正等） */
  humanModel?: HumanCapabilityModel;
  /** 
   * 地形类型（影响移动速度）
   * Phase 2 扩展：增加 alpine、glacier、desert、jungle、coastal 
   */
  terrainType?: TerrainType;
  /** 海拔（米，影响高海拔效率） */
  averageElevationM?: number;

  // ========== Phase 2 疲劳恢复相关字段 ==========

  /** 前几天的疲劳指数历史（用于计算累积和恢复） */
  fatigueHistory?: DayFatigueRecord[];
  /** 是否是休息日/缓冲日 */
  isRestDay?: boolean;
  /** 睡眠质量（0-1，影响恢复效果） */
  sleepQuality?: number;
  /** 恢复条件（影响恢复速率） */
  recoveryConditions?: RecoveryConditions;
}

/**
 * 每日疲劳记录
 */
export interface DayFatigueRecord {
  /** 日期索引（0-based） */
  dayIndex: number;
  /** 当日疲劳指数 */
  fatigueIndex: number;
  /** 是否是休息日 */
  isRestDay: boolean;
  /** 累积疲劳（考虑恢复后） */
  cumulativeFatigue: number;
}

/**
 * 恢复条件
 */
export interface RecoveryConditions {
  /** 住宿质量（camping/basic/comfortable/luxury） */
  accommodationType?: 'camping' | 'basic' | 'comfortable' | 'luxury';
  /** 是否有热水淋浴 */
  hasHotShower?: boolean;
  /** 是否有充足的休息时间 */
  hasAdequateRest?: boolean;
  /** 营养补充质量（0-1） */
  nutritionQuality?: number;
  /** 海拔（影响恢复速率） */
  sleepingAltitudeM?: number;
}

@Injectable()
export class FatigueCalculatorService {
  /**
   * 计算疲劳指数（基础版，兼容旧接口）
   * 
   * 经验区间：
   * - fatigueIndex <= 0.8：很轻松
   * - 0.8 < fatigueIndex <= 1.1：合理
   * - 1.1 < fatigueIndex <= 1.4：偏紧张（建议优化）
   * - > 1.4：高负荷（Dr.Dre 必须出手）
   */
  computeFatigueIndex(day: DayProfile, pace: PaceConstraints): number {
    return this.computeFatigueIndexEnhanced(day, pace);
  }

  /**
   * 计算疲劳指数（增强版，Phase 1）
   * 
   * 改进点：
   * 1. 渐进式坡度惩罚
   * 2. 累积疲劳效应
   * 3. 年龄修正（通过 context）
   */
  computeFatigueIndexEnhanced(
    day: DayProfile,
    pace: PaceConstraints,
    context?: FatigueContext
  ): number {
    // 1. 基础比值计算（避免除零）
    const maxAscent = pace.maxDailyAscentM > 0 ? pace.maxDailyAscentM : 1;
    const maxDist = pace.maxDailyDistanceKm > 0 ? pace.maxDailyDistanceKm : 1;
    const maxHours = pace.maxMovingHours > 0 ? pace.maxMovingHours : 1;
    const ascentRatio = day.totalAscentM / maxAscent;
    const distRatio = day.totalDistanceKm / maxDist;
    const hoursRatio = day.estMovingHours / maxHours;

    // 取最大值作为基础疲劳指数
    let baseFatigue = Math.max(ascentRatio, distRatio, hoursRatio);

    // 2. 渐进式坡度惩罚（替代原来的阶跃式）
    // 15% 以下无惩罚，15-30% 线性增加，30% 以上最大惩罚 0.2
    const slopePenalty = this.calculateSlopePenalty(day.maxSlopePct);
    baseFatigue += slopePenalty;

    // 3. 累积疲劳效应（行程第5天后开始累积）
    if (context?.dayOfTrip !== undefined && context.dayOfTrip >= 4) {
      const cumulativeFactor = this.calculateCumulativeFatigue(context.dayOfTrip);
      baseFatigue *= cumulativeFactor;
    }

    // 4. 高海拔效率修正（海拔 > 3000m 时）
    if (context?.averageElevationM && context.averageElevationM > 3000) {
      const altitudeFactor = this.calculateAltitudeFactor(context.averageElevationM);
      baseFatigue *= altitudeFactor;
    }

    // 5. 地形系数修正
    if (context?.terrainType) {
      const terrainFactor = this.calculateTerrainFactor(context.terrainType);
      baseFatigue *= terrainFactor;
    }

    // 6. 高累计爬升的非线性放大（高爬升日 timeSlack / 疲劳信号更快触顶）
    if (day.totalAscentM > 1000) {
      baseFatigue *= Math.pow(1.1, day.totalAscentM / 500);
    } else if (day.totalAscentM > 500) {
      baseFatigue *= 1 + (day.totalAscentM - 500) / 2500;
    }

    return baseFatigue;
  }

  /**
   * 估算移动时间（小时）- 基础版
   */
  estimateMovingHours(distanceKm: number, ascentM: number): number {
    return this.estimateMovingHoursEnhanced(distanceKm, ascentM);
  }

  /**
   * 估算移动时间（增强版，Phase 1）
   * 
   * 改进点：
   * 1. 考虑地形类型
   * 2. 考虑海拔影响
   * 3. 考虑下坡时间
   */
  estimateMovingHoursEnhanced(
    distanceKm: number,
    ascentM: number,
    options?: {
      descentM?: number;
      terrainType?: 'easy' | 'moderate' | 'technical' | 'extreme';
      averageElevationM?: number;
      /** 爬升垂直速度（米/小时）；画像或反馈校准可覆盖默认值 600 */
      ascentSpeedMPerH?: number;
    }
  ): number {
    // 基础速度参数
    let flatSpeedKmH = 4.0;  // 平路速度
    let ascentSpeedMH =
      typeof options?.ascentSpeedMPerH === 'number' && options.ascentSpeedMPerH > 0
        ? options.ascentSpeedMPerH
        : 600;
    let descentSpeedMH = 900; // 下坡速度（米/小时）

    // 地形系数修正
    if (options?.terrainType) {
      const terrainMultiplier = this.getTerrainSpeedMultiplier(options.terrainType);
      flatSpeedKmH *= terrainMultiplier;
      ascentSpeedMH *= terrainMultiplier;
      descentSpeedMH *= terrainMultiplier;
    }

    // 高海拔修正（> 3000m 时效率下降）
    if (options?.averageElevationM && options.averageElevationM > 3000) {
      const altitudeMultiplier = this.getAltitudeSpeedMultiplier(options.averageElevationM);
      flatSpeedKmH *= altitudeMultiplier;
      ascentSpeedMH *= altitudeMultiplier;
    }

    // 计算各部分时间
    const flatTime = distanceKm / flatSpeedKmH;
    const ascentTime = ascentM / ascentSpeedMH;
    const descentTime = (options?.descentM || 0) / descentSpeedMH;

    return flatTime + ascentTime + descentTime;
  }

  /**
   * 获取疲劳等级描述
   */
  getFatigueLevel(fatigueIndex: number): {
    level: 'easy' | 'moderate' | 'challenging' | 'extreme';
    description: string;
    descriptionZh: string;
    emoji: string;
  } {
    if (fatigueIndex <= 0.8) {
      return {
        level: 'easy',
        description: 'Easy pace, plenty of energy reserve',
        descriptionZh: '轻松，有充足的体能余量',
        emoji: '😊',
      };
    }
    if (fatigueIndex <= 1.1) {
      return {
        level: 'moderate',
        description: 'Reasonable pace, sustainable',
        descriptionZh: '合理，可持续的节奏',
        emoji: '🙂',
      };
    }
    if (fatigueIndex <= 1.4) {
      return {
        level: 'challenging',
        description: 'Challenging, consider optimization',
        descriptionZh: '偏紧张，建议优化',
        emoji: '😓',
      };
    }
    return {
      level: 'extreme',
      description: 'Very demanding, adjustment required',
      descriptionZh: '高负荷，需要调整',
      emoji: '🥵',
    };
  }

  // ========== 私有计算方法 ==========

  /**
   * 计算渐进式坡度惩罚
   * 
   * 改进：从阶跃式改为渐进式
   * - 15% 以下：无惩罚
   * - 15-30%：线性增加 (0 → 0.2)
   * - 30% 以上：固定 0.2
   */
  private calculateSlopePenalty(maxSlopePct: number): number {
    if (maxSlopePct <= 15) {
      return 0;
    }
    if (maxSlopePct >= 30) {
      return 0.2;
    }
    // 15-30% 之间线性插值
    return ((maxSlopePct - 15) / 15) * 0.2;
  }

  /**
   * 计算累积疲劳系数
   * 
   * Phase 2 改进：支持长途徒步（20天+）
   * - 行程第5天后开始累积
   * - 第5-12天：每天 +3%
   * - 第13-20天：每天 +2%（适应期，增速放缓）
   * - 第21天+：每天 +1%（长途适应）
   * - 最大增加到 1.45（约第30天）
   */
  private calculateCumulativeFatigue(dayOfTrip: number): number {
    if (dayOfTrip < 4) {
      return 1.0;
    }
    
    let cumulativeFactor = 1.0;
    
    // Phase 1: 第5-12天，每天 +3%
    if (dayOfTrip >= 4) {
      const phase1Days = Math.min(dayOfTrip - 4, 8); // 最多8天
      cumulativeFactor += phase1Days * 0.03;
    }
    
    // Phase 2: 第13-20天，每天 +2%（身体开始适应）
    if (dayOfTrip >= 12) {
      const phase2Days = Math.min(dayOfTrip - 12, 8); // 最多8天
      cumulativeFactor += phase2Days * 0.02;
    }
    
    // Phase 3: 第21天+，每天 +1%（长途适应期）
    if (dayOfTrip >= 20) {
      const phase3Days = dayOfTrip - 20;
      cumulativeFactor += phase3Days * 0.01;
    }
    
    // 最大累积系数：1.45（约第30天达到）
    return Math.min(cumulativeFactor, 1.45);
  }

  /**
   * 计算海拔效率因子
   * 
   * 海拔 > 3000m 时，每增加 500m，效率下降约 5%
   */
  private calculateAltitudeFactor(elevationM: number): number {
    if (elevationM <= 3000) {
      return 1.0;
    }
    const extraElevation = elevationM - 3000;
    const factor = 1 + (extraElevation / 500) * 0.05;
    return Math.min(factor, 1.4); // 最大增加 40%
  }

  /**
   * 计算地形系数
   * 
   * Phase 2 扩展：支持更多地形类型
   */
  private calculateTerrainFactor(terrainType: string): number {
    const factors: Record<string, number> = {
      // 基础地形
      'easy': 1.0,
      'moderate': 1.1,
      'technical': 1.25,
      'extreme': 1.4,
      // Phase 2 新增地形
      'alpine': 1.2,    // 高山草甸，海拔已单独计算，这里只算地形
      'glacier': 1.35,  // 冰川地形，需要额外体力和注意力
      'desert': 1.3,    // 沙漠，软沙耗能大
      'jungle': 1.25,   // 丛林，潮湿泥泞
      'coastal': 1.1,   // 海岸，沙滩和礁石
      'scree': 1.35,    // 碎石坡，不稳定地面
    };
    return factors[terrainType] || 1.0;
  }

  /**
   * 获取地形对速度的影响系数
   * 
   * Phase 2 扩展：支持更多地形类型
   */
  private getTerrainSpeedMultiplier(terrainType: string): number {
    const multipliers: Record<string, number> = {
      // 基础地形
      'easy': 1.0,      // 良好路况
      'moderate': 0.85, // 一般路况
      'technical': 0.7, // 技术路段
      'extreme': 0.5,   // 极端路况
      // Phase 2 新增地形
      'alpine': 0.8,    // 高山草甸
      'glacier': 0.55,  // 冰川，需要谨慎行进
      'desert': 0.65,   // 沙漠，软沙减速
      'jungle': 0.6,    // 丛林，需要开路
      'coastal': 0.9,   // 海岸，相对平坦
      'scree': 0.55,    // 碎石坡，不稳定
    };
    return multipliers[terrainType] || 1.0;
  }

  /**
   * 获取地形特性（Phase 2 新增）
   */
  getTerrainCharacteristics(terrainType: TerrainType): TerrainCharacteristics {
    const characteristics: Record<TerrainType, TerrainCharacteristics> = {
      'easy': {
        type: 'easy',
        fatigueFactor: 1.0,
        speedMultiplier: 1.0,
        riskLevel: 'LOW',
        description: 'Well-maintained trails or paved roads',
        descriptionZh: '维护良好的步道或铺装路面',
      },
      'moderate': {
        type: 'moderate',
        fatigueFactor: 1.1,
        speedMultiplier: 0.85,
        riskLevel: 'LOW',
        description: 'Standard mountain trails, gravel paths',
        descriptionZh: '普通山地步道、碎石路',
      },
      'technical': {
        type: 'technical',
        fatigueFactor: 1.25,
        speedMultiplier: 0.7,
        riskLevel: 'MEDIUM',
        description: 'Rocky terrain, scrambling sections',
        descriptionZh: '技术路段、岩石路面、需要手脚并用',
        requiredGear: ['trekking poles', 'sturdy boots'],
      },
      'extreme': {
        type: 'extreme',
        fatigueFactor: 1.4,
        speedMultiplier: 0.5,
        riskLevel: 'HIGH',
        description: 'Dangerous terrain, exposed sections',
        descriptionZh: '极端路况、悬崖、危险路段',
        requiredGear: ['helmet', 'rope', 'harness'],
      },
      'alpine': {
        type: 'alpine',
        fatigueFactor: 1.2,
        speedMultiplier: 0.8,
        riskLevel: 'MEDIUM',
        description: 'High mountain meadows, above treeline',
        descriptionZh: '高山草甸、雪线以上',
        requiredGear: ['warm layers', 'sun protection'],
        bestSeasons: [6, 7, 8, 9],
      },
      'glacier': {
        type: 'glacier',
        fatigueFactor: 1.35,
        speedMultiplier: 0.55,
        riskLevel: 'HIGH',
        description: 'Glacial terrain, crevasse risk',
        descriptionZh: '冰川地形、需要冰爪',
        requiredGear: ['crampons', 'ice axe', 'rope', 'harness'],
        bestSeasons: [5, 6, 7, 8, 9],
      },
      'desert': {
        type: 'desert',
        fatigueFactor: 1.3,
        speedMultiplier: 0.65,
        riskLevel: 'MEDIUM',
        description: 'Desert terrain, soft sand',
        descriptionZh: '沙漠地形、软沙路面',
        requiredGear: ['sun protection', 'extra water', 'gaiters'],
        bestSeasons: [3, 4, 10, 11],
      },
      'jungle': {
        type: 'jungle',
        fatigueFactor: 1.25,
        speedMultiplier: 0.6,
        riskLevel: 'MEDIUM',
        description: 'Tropical rainforest, humid and muddy',
        descriptionZh: '热带丛林、潮湿泥泞',
        requiredGear: ['rain gear', 'insect repellent', 'machete'],
        bestSeasons: [12, 1, 2],
      },
      'coastal': {
        type: 'coastal',
        fatigueFactor: 1.1,
        speedMultiplier: 0.9,
        riskLevel: 'LOW',
        description: 'Coastal paths, beaches, rocky shores',
        descriptionZh: '海岸线、沙滩、礁石',
        requiredGear: ['water shoes'],
      },
      'scree': {
        type: 'scree',
        fatigueFactor: 1.35,
        speedMultiplier: 0.55,
        riskLevel: 'MEDIUM',
        description: 'Loose rock slopes, unstable footing',
        descriptionZh: '碎石坡、流石滩',
        requiredGear: ['gaiters', 'sturdy boots', 'trekking poles'],
      },
    };
    return characteristics[terrainType];
  }

  /**
   * 获取海拔对速度的影响系数
   */
  private getAltitudeSpeedMultiplier(elevationM: number): number {
    if (elevationM <= 3000) return 1.0;
    if (elevationM <= 4000) return 0.9;
    if (elevationM <= 5000) return 0.75;
    return 0.6;
  }

  // ========== Phase 2 疲劳恢复方法 ==========

  /**
   * 计算疲劳恢复系数
   * 
   * 基于运动科学研究：
   * - 完全休息日可恢复 30-50% 的累积疲劳
   * - 轻度活动日可恢复 15-25%
   * - 恢复受睡眠、营养、海拔、住宿条件影响
   * 
   * @param context 恢复上下文
   * @returns 恢复系数（0-0.5，表示恢复的疲劳百分比）
   */
  calculateRecoveryFactor(context: {
    isRestDay: boolean;
    sleepQuality?: number;
    recoveryConditions?: RecoveryConditions;
    humanModel?: HumanCapabilityModel;
    fatigueHistory?: DayFatigueRecord[];
  }): number {
    // 基础恢复率
    let baseRecovery = context.isRestDay ? 0.40 : 0.15;

    // 1. 睡眠质量影响（0-1）
    const sleepQuality = context.sleepQuality ?? 0.7;
    baseRecovery *= 0.7 + sleepQuality * 0.5; // 范围：0.7-1.2

    // 2. 住宿条件影响
    if (context.recoveryConditions?.accommodationType) {
      const accommodationModifier: Record<string, number> = {
        'camping': 0.8,
        'basic': 0.9,
        'comfortable': 1.0,
        'luxury': 1.1,
      };
      baseRecovery *= accommodationModifier[context.recoveryConditions.accommodationType] || 1.0;
    }

    // 3. 热水淋浴影响（有助于肌肉恢复）
    if (context.recoveryConditions?.hasHotShower) {
      baseRecovery *= 1.1;
    }

    // 4. 营养补充影响
    if (context.recoveryConditions?.nutritionQuality !== undefined) {
      baseRecovery *= 0.8 + context.recoveryConditions.nutritionQuality * 0.3;
    }

    // 5. 高海拔影响（海拔越高，恢复越慢）
    if (context.recoveryConditions?.sleepingAltitudeM) {
      const altitude = context.recoveryConditions.sleepingAltitudeM;
      if (altitude > 3000) {
        const altitudePenalty = Math.min(0.3, (altitude - 3000) / 5000 * 0.3);
        baseRecovery *= 1 - altitudePenalty;
      }
    }

    // 6. 年龄影响（年龄越大，恢复越慢）
    if (context.humanModel?.ageModifier) {
      baseRecovery *= 0.8 + context.humanModel.ageModifier * 0.3;
    }

    // 7. 体能水平影响（体能好，恢复快）
    if (context.humanModel?.fitnessLevel) {
      const fitnessModifier: Record<string, number> = {
        'LOW': 0.85,
        'MEDIUM_LOW': 0.92,
        'MEDIUM': 1.0,
        'MEDIUM_HIGH': 1.08,
        'HIGH': 1.15,
      };
      baseRecovery *= fitnessModifier[context.humanModel.fitnessLevel] || 1.0;
    }

    // 8. 连续休息日加成（第2个连续休息日额外+10%）
    if (context.fatigueHistory && context.fatigueHistory.length > 0) {
      const lastDay = context.fatigueHistory[context.fatigueHistory.length - 1];
      if (lastDay.isRestDay && context.isRestDay) {
        baseRecovery *= 1.1;
      }
    }

    // 限制恢复上限
    return Math.min(0.50, Math.max(0.10, baseRecovery));
  }

  /**
   * 计算累积疲劳（考虑恢复效应）
   * 
   * Phase 2 核心改进：
   * - 每天的疲劳会部分恢复
   * - 累积疲劳 = 前一天累积 × (1 - 恢复率) + 今天新增疲劳
   * 
   * @param currentDayFatigue 当天疲劳指数
   * @param context 疲劳上下文
   * @returns 累积疲劳值
   */
  calculateCumulativeFatigueWithRecovery(
    currentDayFatigue: number,
    context: FatigueContext
  ): number {
    const history = context.fatigueHistory || [];
    
    if (history.length === 0) {
      return currentDayFatigue;
    }

    // 获取前一天的累积疲劳
    const previousDay = history[history.length - 1];
    const previousCumulative = previousDay.cumulativeFatigue;

    // 计算恢复因子
    const recoveryFactor = this.calculateRecoveryFactor({
      isRestDay: context.isRestDay || false,
      sleepQuality: context.recoveryConditions?.nutritionQuality,
      recoveryConditions: context.recoveryConditions,
      humanModel: context.humanModel,
      fatigueHistory: history,
    });

    // 累积疲劳 = 前一天累积 × (1 - 恢复率) + 今天新增
    // 休息日新增疲劳很低（约 0.2）
    const todayAddition = context.isRestDay ? 0.2 : currentDayFatigue;
    const cumulativeFatigue = previousCumulative * (1 - recoveryFactor) + todayAddition;

    return cumulativeFatigue;
  }

  /**
   * 计算疲劳指数（终极版，Phase 2）
   * 
   * 整合所有改进：
   * 1. 渐进式坡度惩罚
   * 2. 累积疲劳效应
   * 3. 疲劳恢复机制
   * 4. 年龄/体能/海拔修正
   */
  computeFatigueIndexUltimate(
    day: DayProfile,
    pace: PaceConstraints,
    context: FatigueContext
  ): {
    dailyFatigue: number;
    cumulativeFatigue: number;
    recoveryFactor: number;
    effectiveFatigue: number;
    warnings: string[];
  } {
    const warnings: string[] = [];

    // 1. 计算当日基础疲劳
    const dailyFatigue = this.computeFatigueIndexEnhanced(day, pace, context);

    // 2. 计算恢复因子
    const recoveryFactor = this.calculateRecoveryFactor({
      isRestDay: context.isRestDay || false,
      sleepQuality: context.recoveryConditions?.nutritionQuality,
      recoveryConditions: context.recoveryConditions,
      humanModel: context.humanModel,
      fatigueHistory: context.fatigueHistory,
    });

    // 3. 计算累积疲劳（考虑恢复）
    const cumulativeFatigue = this.calculateCumulativeFatigueWithRecovery(
      dailyFatigue,
      context
    );

    // 4. 计算有效疲劳（当日疲劳 + 累积影响）
    // 累积疲劳对当日表现的影响系数：每累积1.0疲劳，当日效率降低5%
    const cumulativeImpact = Math.max(0, (cumulativeFatigue - 1.0) * 0.05);
    const effectiveFatigue = dailyFatigue * (1 + cumulativeImpact);

    // 5. 生成警告
    if (cumulativeFatigue > 3.0) {
      warnings.push('累积疲劳过高，强烈建议增加休息日');
    } else if (cumulativeFatigue > 2.0) {
      warnings.push('累积疲劳较高，建议安排休息日');
    }

    if (dailyFatigue > 1.4) {
      warnings.push('当日负荷过高，建议减少行程强度');
    }

    if (context.recoveryConditions?.sleepingAltitudeM && 
        context.recoveryConditions.sleepingAltitudeM > 4000 &&
        cumulativeFatigue > 1.5) {
      warnings.push('高海拔+疲劳叠加，高反风险增加');
    }

    return {
      dailyFatigue,
      cumulativeFatigue,
      recoveryFactor,
      effectiveFatigue,
      warnings,
    };
  }

  /**
   * 建议最佳休息日位置
   * 
   * 基于疲劳积累预测，推荐休息日插入点
   * 
   * @param dayProfiles 各天行程配置
   * @param pace 节奏约束
   * @param humanModel 人体能力模型
   * @returns 建议的休息日索引
   */
  suggestRestDays(
    dayProfiles: DayProfile[],
    pace: PaceConstraints,
    humanModel?: HumanCapabilityModel
  ): {
    suggestedRestDayIndices: number[];
    reason: string;
    projectedMaxCumulativeFatigue: number;
  } {
    const suggestedRestDayIndices: number[] = [];
    let cumulativeFatigue = 0;
    let maxCumulativeFatigue = 0;

    // 模拟行程，预测疲劳积累
    const fatigueHistory: DayFatigueRecord[] = [];
    
    for (let i = 0; i < dayProfiles.length; i++) {
      const dayFatigue = this.computeFatigueIndexEnhanced(dayProfiles[i], pace, {
        dayOfTrip: i,
        humanModel,
      });

      // 模拟恢复（假设没有休息日）
      const recoveryFactor = this.calculateRecoveryFactor({
        isRestDay: false,
        humanModel,
        fatigueHistory,
      });

      cumulativeFatigue = cumulativeFatigue * (1 - recoveryFactor) + dayFatigue;
      maxCumulativeFatigue = Math.max(maxCumulativeFatigue, cumulativeFatigue);

      // 记录历史
      fatigueHistory.push({
        dayIndex: i,
        fatigueIndex: dayFatigue,
        isRestDay: false,
        cumulativeFatigue,
      });

      // 如果累积疲劳超过阈值，建议插入休息日
      if (cumulativeFatigue > 2.0 && !suggestedRestDayIndices.includes(i)) {
        // 在当前天之前插入休息日
        suggestedRestDayIndices.push(i);
        // 模拟休息日效果
        cumulativeFatigue *= 0.6; // 休息日恢复40%
      }
    }

    // 生成建议原因
    let reason = '';
    if (suggestedRestDayIndices.length === 0) {
      reason = '行程强度适中，无需额外休息日';
    } else if (suggestedRestDayIndices.length <= 2) {
      reason = `建议在第${suggestedRestDayIndices.map(i => i + 1).join('、')}天前插入休息日，以控制累积疲劳`;
    } else {
      reason = `行程强度较高，建议多个休息日以确保安全和舒适`;
    }

    return {
      suggestedRestDayIndices,
      reason,
      projectedMaxCumulativeFatigue: maxCumulativeFatigue,
    };
  }

  /**
   * 计算恢复到目标疲劳水平需要的休息天数
   * 
   * @param currentCumulativeFatigue 当前累积疲劳
   * @param targetFatigue 目标疲劳水平
   * @param context 恢复上下文
   * @returns 需要的休息天数
   */
  calculateRestDaysNeeded(
    currentCumulativeFatigue: number,
    targetFatigue: number,
    context?: {
      recoveryConditions?: RecoveryConditions;
      humanModel?: HumanCapabilityModel;
    }
  ): number {
    if (currentCumulativeFatigue <= targetFatigue) {
      return 0;
    }

    const recoveryFactor = this.calculateRecoveryFactor({
      isRestDay: true,
      recoveryConditions: context?.recoveryConditions,
      humanModel: context?.humanModel,
    });

    // 计算需要多少天恢复到目标水平
    // currentFatigue × (1 - recoveryFactor)^days + restDayFatigue × days ≤ targetFatigue
    // 简化计算：假设休息日新增疲劳为 0.2
    let fatigue = currentCumulativeFatigue;
    let days = 0;
    const maxDays = 7; // 最多计算7天

    while (fatigue > targetFatigue && days < maxDays) {
      fatigue = fatigue * (1 - recoveryFactor) + 0.2;
      days++;
    }

    return days;
  }
}

