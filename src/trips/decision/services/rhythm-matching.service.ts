// src/trips/decision/services/rhythm-matching.service.ts

import { Injectable, Logger, Inject, Optional } from '@nestjs/common';
import {
  RhythmType,
  RouteRhythmProfile,
  UserRhythmCapacity,
  RhythmMatchResult,
  RhythmMatchScores,
  RhythmAdjustment,
  RhythmTypeDefinition,
  TravelProgress,
  RhythmAdjustmentResult,
} from '../interfaces/rhythm-matching.interface';
import { RouteDirectionData } from '../../../route-directions/interfaces/route-direction.interface';
import { UserPersona } from '../../../agent/memory/interfaces/multi-persona.interface';
import { PersonaChangeSignals } from '../../../agent/memory/interfaces/multi-persona.interface';

/**
 * 节奏匹配服务
 * 
 * 实现完整的节奏匹配算法：
 * - 提取路线节奏特性
 * - 提取用户节奏容量
 * - 计算匹配度评分
 * - 推荐节奏类型
 * - 动态节奏调整
 */
@Injectable()
export class RhythmMatchingService {
  private readonly logger = new Logger(RhythmMatchingService.name);

  /**
   * 节奏类型定义
   */
  private readonly rhythmTypeDefinitions: Record<RhythmType, RhythmTypeDefinition> = {
    INTENSIVE: {
      type: 'INTENSIVE',
      dailySteps: { min: 15000, max: 25000 },
      poiCount: { min: 5, max: 8 },
      restTime: { min: 0.5, max: 1.5 },
      suitableFor: ['体力充沛', '时间紧张', '追求效率'],
      warnings: ['可能过于疲劳', '需要充分休息'],
      typicalSchedule: '早出晚归，密集活动，少量休息',
    },
    RELAXED: {
      type: 'RELAXED',
      dailySteps: { min: 5000, max: 10000 },
      poiCount: { min: 1, max: 3 },
      restTime: { min: 2, max: 4 },
      suitableFor: ['想要放松', '时间充足', '注重体验'],
      warnings: ['可能错过一些景点', '需要更多时间'],
      typicalSchedule: '晚起早归，少量活动，充分休息',
    },
    FLEXIBLE: {
      type: 'FLEXIBLE',
      dailySteps: { min: 8000, max: 15000 },
      poiCount: { min: 2, max: 5 },
      restTime: { min: 1, max: 3 },
      suitableFor: ['喜欢灵活', '不确定偏好', '首次旅行'],
      warnings: ['需要灵活调整', '可能不够紧凑'],
      typicalSchedule: '根据当天状态灵活调整',
    },
    THEMED: {
      type: 'THEMED',
      dailySteps: { min: 10000, max: 18000 },
      poiCount: { min: 3, max: 6 },
      restTime: { min: 1, max: 2.5 },
      suitableFor: ['有明确主题', '深度体验', '文化探索'],
      warnings: ['需要提前规划', '可能错过其他类型'],
      typicalSchedule: '围绕主题安排，深度体验',
    },
    HYBRID: {
      type: 'HYBRID',
      dailySteps: { min: 10000, max: 20000 },
      poiCount: { min: 3, max: 7 },
      restTime: { min: 1, max: 3 },
      suitableFor: ['多样化需求', '平衡体验', '经验丰富'],
      warnings: ['需要良好规划', '可能过于复杂'],
      typicalSchedule: '混合不同类型，平衡安排',
    },
  };

  /**
   * 计算节奏匹配度
   */
  async calculateRhythmMatch(
    route: RouteDirectionData,
    userPersona: UserPersona,
    tripContext?: {
      availableDays?: number;
      timePressure?: number;
    },
  ): Promise<RhythmMatchResult> {
    // Step 1: 提取路线节奏特性
    const routeProfile = this.extractRouteRhythmProfile(route);

    // Step 2: 提取用户节奏容量
    const userCapacity = this.extractUserRhythmCapacity(userPersona, tripContext);

    // Step 3: 计算匹配度
    const scores = this.computeMatchingScores(routeProfile, userCapacity);

    // Step 4: 推荐节奏类型
    const recommendedRhythm = this.recommendRhythmType(scores, routeProfile, userCapacity);

    // Step 5: 生成调整建议
    const adjustments = this.generateRhythmAdjustments(recommendedRhythm, routeProfile, userCapacity);

    // Step 6: 生成替代节奏类型
    const alternativeRhythms = this.generateAlternativeRhythms(scores, recommendedRhythm);

    return {
      scores,
      recommendedRhythm,
      recommendationReason: this.generateRecommendationReason(recommendedRhythm, scores),
      adjustments,
      alternativeRhythms,
    };
  }

  /**
   * 动态节奏调整
   */
  async triggerRhythmAdjustment(
    userPersona: UserPersona,
    travelProgress: TravelProgress,
    newSignals: PersonaChangeSignals,
  ): Promise<RhythmAdjustmentResult> {
    const needsAdjustment = this.shouldTriggerAdjustment(userPersona, travelProgress, newSignals);

    if (!needsAdjustment) {
      return {
        needsAdjustment: false,
        adjustments: [],
        reasons: [],
        expectedEffects: [],
      };
    }

    // 确定调整类型
    const adjustmentType = this.determineAdjustmentType(travelProgress, newSignals);

    // 生成调整建议
    const adjustments = this.generateDynamicAdjustments(userPersona, travelProgress, newSignals);

    // 生成原因和预期效果
    const reasons = this.generateAdjustmentReasons(travelProgress, newSignals);
    const expectedEffects = this.generateExpectedEffects(adjustments);

    return {
      needsAdjustment: true,
      adjustmentType,
      adjustments,
      reasons,
      expectedEffects,
    };
  }

  /**
   * 推荐节奏类型
   */
  recommendRhythmType(
    scores: RhythmMatchScores,
    routeProfile: RouteRhythmProfile,
    userCapacity: UserRhythmCapacity,
  ): RhythmType {
    // 如果用户有明确偏好，优先考虑
    if (userCapacity.preferredRhythmType) {
      const preferredScore = this.calculateRhythmTypeScore(
        userCapacity.preferredRhythmType,
        routeProfile,
        userCapacity,
      );
      if (preferredScore >= 0.7) {
        return userCapacity.preferredRhythmType;
      }
    }

    // 否则，根据匹配度选择最佳节奏类型
    const rhythmScores = Object.keys(this.rhythmTypeDefinitions).map(type => ({
      type: type as RhythmType,
      score: this.calculateRhythmTypeScore(type as RhythmType, routeProfile, userCapacity),
    }));

    rhythmScores.sort((a, b) => b.score - a.score);
    return rhythmScores[0].type;
  }

  // ========== 路线节奏特性提取 ==========

  /**
   * 提取路线节奏特性
   */
  private extractRouteRhythmProfile(route: RouteDirectionData): RouteRhythmProfile {
    // 从路线数据中提取节奏特性
    const constraints = route.constraints || {};
    const itinerarySkeleton = route.itinerarySkeleton || {};
    const metadata = route.metadata || {};

    // 估算物理强度（基于海拔、坡度等）
    const maxElevation = constraints.hard?.maxElevationM || 0;
    const maxSlope = constraints.hard?.maxSlopePct || 0;
    const physicalIntensity = this.calculatePhysicalIntensity(maxElevation, maxSlope);

    // 估算心理负荷（基于复杂度、决策点等）
    const mentalLoad = this.calculateMentalLoad(route);

    // 估算信息密度（基于POI数量、描述长度等）
    const informationDensity = this.calculateInformationDensity(route);

    // 估算决策频率（基于路线复杂度）
    const decisionFrequency = this.calculateDecisionFrequency(route);

    // 估算环境刺激（基于路线类型、标签等）
    const environmentalStimulation = this.calculateEnvironmentalStimulation(route);

    // 估算每日数据
    const estimatedDuration = metadata.estimatedDuration || 7;
    const averageDailySteps = this.estimateDailySteps(route, estimatedDuration);
    const averageDailyPois = this.estimateDailyPois(route, estimatedDuration);
    const averageDailyRestTime = this.estimateDailyRestTime(route, estimatedDuration);

    // 计算节奏变化度
    const rhythmVariation = this.calculateRhythmVariation(route);

    return {
      physicalIntensity,
      mentalLoad,
      informationDensity,
      decisionFrequency,
      environmentalStimulation,
      averageDailySteps,
      averageDailyPois,
      averageDailyRestTime,
      rhythmVariation,
    };
  }

  /**
   * 计算物理强度
   */
  private calculatePhysicalIntensity(maxElevation: number, maxSlope: number): number {
    let intensity = 0;

    // 海拔因素（0-0.5）
    if (maxElevation > 4000) {
      intensity += 0.5;
    } else if (maxElevation > 3000) {
      intensity += 0.4;
    } else if (maxElevation > 2000) {
      intensity += 0.3;
    } else if (maxElevation > 1000) {
      intensity += 0.2;
    } else {
      intensity += 0.1;
    }

    // 坡度因素（0-0.5）
    if (maxSlope > 30) {
      intensity += 0.5;
    } else if (maxSlope > 20) {
      intensity += 0.4;
    } else if (maxSlope > 15) {
      intensity += 0.3;
    } else if (maxSlope > 10) {
      intensity += 0.2;
    } else {
      intensity += 0.1;
    }

    return Math.min(1.0, intensity);
  }

  /**
   * 计算心理负荷
   */
  private calculateMentalLoad(route: RouteDirectionData): number {
    let load = 0;

    // 基于路线复杂度
    const constraints = route.constraints || {};
    if (constraints.requiresPermit) load += 0.2;
    if (constraints.hard?.requiresGuide) load += 0.2;

    // 基于风险因素
    const riskProfile = route.riskProfile || {};
    if (riskProfile.altitudeSickness) load += 0.2;
    if (riskProfile.weatherWindow) load += 0.15;
    if (riskProfile.roadClosure) load += 0.15;

    // 基于路线类型
    const tags = route.tags || [];
    if (tags.includes('挑战') || tags.includes('冒险')) load += 0.1;

    return Math.min(1.0, load);
  }

  /**
   * 计算信息密度
   */
  private calculateInformationDensity(route: RouteDirectionData): number {
    let density = 0;

    // 基于POI数量
    const signaturePois = route.signaturePois || {};
    const poiTypes = signaturePois.types || [];
    density += Math.min(poiTypes.length / 10, 0.4);

    // 基于描述长度
    const description = route.description || '';
    density += Math.min(description.length / 1000, 0.3);

    // 基于标签数量
    const tags = route.tags || [];
    density += Math.min(tags.length / 10, 0.3);

    return Math.min(1.0, density);
  }

  /**
   * 计算决策频率
   */
  private calculateDecisionFrequency(route: RouteDirectionData): number {
    // 基于路线复杂度和选项数量
    const itinerarySkeleton = route.itinerarySkeleton || {};
    const dayThemes = itinerarySkeleton.dayThemes || [];
    const optionalActivities = itinerarySkeleton.optionalActivities || [];

    let frequency = 0;
    frequency += Math.min(dayThemes.length / 10, 0.4);
    frequency += Math.min(optionalActivities.length / 10, 0.6);

    return Math.min(1.0, frequency);
  }

  /**
   * 计算环境刺激
   */
  private calculateEnvironmentalStimulation(route: RouteDirectionData): number {
    const tags = route.tags || [];
    let stimulation = 0;

    // 基于标签类型
    if (tags.includes('自然') || tags.includes('风景')) stimulation += 0.3;
    if (tags.includes('文化') || tags.includes('历史')) stimulation += 0.2;
    if (tags.includes('城市') || tags.includes('现代')) stimulation += 0.2;
    if (tags.includes('冒险') || tags.includes('挑战')) stimulation += 0.3;

    return Math.min(1.0, stimulation);
  }

  /**
   * 估算每日步数
   */
  private estimateDailySteps(route: RouteDirectionData, duration: number): number {
    // 简化实现：基于路线类型和时长估算
    const tags = route.tags || [];
    const baseSteps = tags.includes('徒步') || tags.includes('登山') ? 15000 : 10000;
    return baseSteps;
  }

  /**
   * 估算每日POI数
   */
  private estimateDailyPois(route: RouteDirectionData, duration: number): number {
    const signaturePois = route.signaturePois || {};
    const poiTypes = signaturePois.types || [];
    return duration > 0 ? Math.ceil(poiTypes.length / duration) : 3;
  }

  /**
   * 估算每日休息时间
   */
  private estimateDailyRestTime(route: RouteDirectionData, duration: number): number {
    const physicalIntensity = this.calculatePhysicalIntensity(
      route.constraints?.hard?.maxElevationM || 0,
      route.constraints?.hard?.maxSlopePct || 0,
    );
    // 强度越高，需要的休息时间越多
    return 1 + physicalIntensity * 2;
  }

  /**
   * 计算节奏变化度
   */
  private calculateRhythmVariation(route: RouteDirectionData): number {
    const itinerarySkeleton = route.itinerarySkeleton || {};
    const dayThemes = itinerarySkeleton.dayThemes || [];
    const dailyPace = itinerarySkeleton.dailyPace || [];

    // 基于每日主题和节奏的变化
    const themeVariation = dayThemes.length > 1 ? 0.5 : 0.2;
    const paceVariation = dailyPace.length > 1 ? 0.5 : 0.2;

    return Math.min(1.0, (themeVariation + paceVariation) / 2);
  }

  // ========== 用户节奏容量提取 ==========

  /**
   * 提取用户节奏容量
   */
  private extractUserRhythmCapacity(
    userPersona: UserPersona,
    tripContext?: {
      availableDays?: number;
      timePressure?: number;
    },
  ): UserRhythmCapacity {
    const physicalState = userPersona.currentState.physical;
    const psychologicalState = userPersona.currentState.psychological;
    const temporalState = userPersona.currentState.temporal;
    const preferences = userPersona.preferences;

    // 物理容量（基于体力水平和疲劳度）
    const physicalCapacity = this.calculatePhysicalCapacity(physicalState);

    // 注意力容量（基于心理状态）
    const attentionCapacity = this.calculateAttentionCapacity(psychologicalState);

    // 情绪容量（基于心理状态）
    const emotionalCapacity = this.calculateEmotionalCapacity(psychologicalState);

    // 每日可用时间
    const dailyAvailableTime = temporalState.availableDays > 0
      ? (temporalState.availableDays * 8) / temporalState.availableDays
      : 8;

    // 偏好节奏类型
    const preferredRhythmType = this.mapPreferenceToRhythmType(preferences);

    // 节奏灵活性
    const rhythmFlexibility = this.determineRhythmFlexibility(userPersona, tripContext);

    return {
      physicalCapacity,
      attentionCapacity,
      emotionalCapacity,
      dailyAvailableTime,
      preferredRhythmType,
      rhythmFlexibility,
    };
  }

  /**
   * 计算物理容量
   */
  private calculatePhysicalCapacity(physicalState: any): number {
    const fitnessLevel = physicalState.fitnessLevel || 5;
    const fatigueLevel = physicalState.fatigueLevel || 0.3;
    const healthStatus = physicalState.healthStatus || 'GOOD';

    let capacity = fitnessLevel / 10;
    capacity -= fatigueLevel * 0.3;

    // 健康状态调整
    if (healthStatus === 'EXCELLENT') capacity += 0.1;
    else if (healthStatus === 'POOR') capacity -= 0.2;

    return Math.max(0, Math.min(1, capacity));
  }

  /**
   * 计算注意力容量
   */
  private calculateAttentionCapacity(psychologicalState: any): number {
    const stressLevel = psychologicalState.stressLevel || 0.3;
    const confidenceLevel = psychologicalState.confidenceLevel || 0.5;

    let capacity = confidenceLevel;
    capacity -= stressLevel * 0.3;

    return Math.max(0, Math.min(1, capacity));
  }

  /**
   * 计算情绪容量
   */
  private calculateEmotionalCapacity(psychologicalState: any): number {
    const excitementLevel = psychologicalState.excitementLevel || 0.6;
    const mood = psychologicalState.mood || 'POSITIVE';

    let capacity = excitementLevel;
    if (mood === 'POSITIVE') capacity += 0.2;
    else if (mood === 'NEGATIVE') capacity -= 0.2;

    return Math.max(0, Math.min(1, capacity));
  }

  /**
   * 映射偏好到节奏类型
   */
  private mapPreferenceToRhythmType(preferences: any): RhythmType | undefined {
    const pacePreference = preferences.pacePreference;
    if (pacePreference === 'FAST') return 'INTENSIVE';
    if (pacePreference === 'SLOW') return 'RELAXED';
    if (pacePreference === 'MODERATE') return 'FLEXIBLE';
    return undefined;
  }

  /**
   * 确定节奏灵活性
   */
  private determineRhythmFlexibility(
    userPersona: UserPersona,
    tripContext?: { timePressure?: number },
  ): 'LOW' | 'MEDIUM' | 'HIGH' {
    const timePressure = tripContext?.timePressure || userPersona.currentState.temporal.timePressure;
    const timeFlexibility = userPersona.currentState.temporal.timeFlexibility;

    if (timePressure > 0.7 || timeFlexibility === 'LOW') return 'LOW';
    if (timePressure < 0.3 || timeFlexibility === 'HIGH') return 'HIGH';
    return 'MEDIUM';
  }

  // ========== 匹配度计算 ==========

  /**
   * 计算匹配分数
   */
  private computeMatchingScores(
    routeProfile: RouteRhythmProfile,
    userCapacity: UserRhythmCapacity,
  ): RhythmMatchScores {
    // 物理匹配度
    const physicalMatch = this.calculatePhysicalMatch(
      routeProfile.physicalIntensity,
      userCapacity.physicalCapacity,
    );

    // 注意力匹配度
    const attentionMatch = this.calculateAttentionMatch(
      routeProfile.mentalLoad + routeProfile.informationDensity,
      userCapacity.attentionCapacity,
    );

    // 情绪匹配度
    const emotionalMatch = this.calculateEmotionalMatch(
      routeProfile.environmentalStimulation,
      userCapacity.emotionalCapacity,
    );

    // 时间匹配度
    const timeMatch = this.calculateTimeMatch(routeProfile, userCapacity);

    // 整体匹配度（加权平均）
    const overallMatch =
      physicalMatch * 0.3 +
      attentionMatch * 0.25 +
      emotionalMatch * 0.2 +
      timeMatch * 0.25;

    return {
      physicalMatch,
      attentionMatch,
      emotionalMatch,
      timeMatch,
      overallMatch,
    };
  }

  /**
   * 计算物理匹配度
   */
  private calculatePhysicalMatch(routeIntensity: number, userCapacity: number): number {
    // 理想情况：路线强度略低于用户容量（留有余地）
    const idealIntensity = userCapacity * 0.8;
    const diff = Math.abs(routeIntensity - idealIntensity);
    return Math.max(0, 1 - diff * 2);
  }

  /**
   * 计算注意力匹配度
   */
  private calculateAttentionMatch(routeLoad: number, userCapacity: number): number {
    // 理想情况：路线负荷不超过用户容量
    if (routeLoad <= userCapacity) {
      return 1.0;
    }
    // 超负荷时，按超出比例扣分
    const overload = routeLoad - userCapacity;
    return Math.max(0, 1 - overload * 2);
  }

  /**
   * 计算情绪匹配度
   */
  private calculateEmotionalMatch(routeStimulation: number, userCapacity: number): number {
    // 理想情况：路线刺激与用户情绪容量匹配
    const diff = Math.abs(routeStimulation - userCapacity);
    return Math.max(0, 1 - diff * 1.5);
  }

  /**
   * 计算时间匹配度
   */
  private calculateTimeMatch(routeProfile: RouteRhythmProfile, userCapacity: UserRhythmCapacity): number {
    // 估算路线所需时间
    const estimatedRouteTime =
      routeProfile.averageDailyPois * 2 + routeProfile.averageDailyRestTime;

    // 与用户可用时间比较
    const timeRatio = estimatedRouteTime / userCapacity.dailyAvailableTime;
    if (timeRatio <= 0.8) {
      return 1.0; // 时间充足
    } else if (timeRatio <= 1.0) {
      return 0.8; // 时间刚好
    } else if (timeRatio <= 1.2) {
      return 0.5; // 时间较紧
    } else {
      return 0.2; // 时间不足
    }
  }

  /**
   * 计算特定节奏类型的匹配分数
   */
  private calculateRhythmTypeScore(
    rhythmType: RhythmType,
    routeProfile: RouteRhythmProfile,
    userCapacity: UserRhythmCapacity,
  ): number {
    const definition = this.rhythmTypeDefinitions[rhythmType];

    // 检查是否符合节奏类型的特征
    let score = 0;
    let factors = 0;

    // 步数匹配
    const stepsMatch = this.matchRange(
      routeProfile.averageDailySteps,
      definition.dailySteps.min,
      definition.dailySteps.max,
    );
    score += stepsMatch * 0.3;
    factors += 0.3;

    // POI数量匹配
    const poiMatch = this.matchRange(
      routeProfile.averageDailyPois,
      definition.poiCount.min,
      definition.poiCount.max,
    );
    score += poiMatch * 0.3;
    factors += 0.3;

    // 休息时间匹配
    const restMatch = this.matchRange(
      routeProfile.averageDailyRestTime,
      definition.restTime.min,
      definition.restTime.max,
    );
    score += restMatch * 0.2;
    factors += 0.2;

    // 用户偏好匹配
    if (userCapacity.preferredRhythmType === rhythmType) {
      score += 0.2;
    }
    factors += 0.2;

    return factors > 0 ? score / factors : 0.5;
  }

  /**
   * 匹配范围
   */
  private matchRange(value: number, min: number, max: number): number {
    if (value >= min && value <= max) {
      return 1.0;
    } else if (value < min) {
      return Math.max(0, 1 - (min - value) / min);
    } else {
      return Math.max(0, 1 - (value - max) / max);
    }
  }

  // ========== 调整建议生成 ==========

  /**
   * 生成节奏调整建议
   */
  private generateRhythmAdjustments(
    recommendedRhythm: RhythmType,
    routeProfile: RouteRhythmProfile,
    userCapacity: UserRhythmCapacity,
  ): RhythmAdjustment[] {
    const adjustments: RhythmAdjustment[] = [];

    // 检查物理强度
    if (routeProfile.physicalIntensity > userCapacity.physicalCapacity * 1.2) {
      adjustments.push({
        type: 'REDUCE_INTENSITY',
        description: '路线物理强度超出你的能力范围',
        priority: 'HIGH',
        suggestions: [
          '考虑减少每日活动量',
          '增加休息时间',
          '选择强度较低的替代路线',
        ],
      });
    }

    // 检查心理负荷
    const totalLoad = routeProfile.mentalLoad + routeProfile.informationDensity;
    if (totalLoad > userCapacity.attentionCapacity * 1.2) {
      adjustments.push({
        type: 'REDUCE_POIS',
        description: '信息密度和决策频率较高',
        priority: 'MEDIUM',
        suggestions: [
          '减少每日POI数量',
          '简化决策点',
          '提前规划以减少现场决策',
        ],
      });
    }

    // 检查时间
    const estimatedTime =
      routeProfile.averageDailyPois * 2 + routeProfile.averageDailyRestTime;
    if (estimatedTime > userCapacity.dailyAvailableTime * 1.2) {
      adjustments.push({
        type: 'ADJUST_SCHEDULE',
        description: '预计时间超出你的可用时间',
        priority: 'HIGH',
        suggestions: [
          '减少每日活动数量',
          '缩短每个活动的停留时间',
          '延长旅行天数',
        ],
      });
    }

    return adjustments;
  }

  /**
   * 生成替代节奏类型
   */
  private generateAlternativeRhythms(
    scores: RhythmMatchScores,
    recommendedRhythm: RhythmType,
  ): Array<{ type: RhythmType; score: number; reason: string }> {
    const allTypes: RhythmType[] = ['INTENSIVE', 'RELAXED', 'FLEXIBLE', 'THEMED', 'HYBRID'];
    const alternatives = allTypes
      .filter(type => type !== recommendedRhythm)
      .map(type => ({
        type,
        score: scores.overallMatch * 0.8, // 替代选项分数略低
        reason: `作为${recommendedRhythm}的替代选择`,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 2);

    return alternatives;
  }

  /**
   * 生成推荐理由
   */
  private generateRecommendationReason(rhythmType: RhythmType, scores: RhythmMatchScores): string {
    const definition = this.rhythmTypeDefinitions[rhythmType];
    return `${rhythmType}节奏类型最适合你。整体匹配度${Math.round(scores.overallMatch * 100)}%，${definition.suitableFor.join('、')}。`;
  }

  // ========== 动态调整 ==========

  /**
   * 判断是否需要触发调整
   */
  private shouldTriggerAdjustment(
    userPersona: UserPersona,
    travelProgress: TravelProgress,
    newSignals: PersonaChangeSignals,
  ): boolean {
    // 检查疲劳度
    if (travelProgress.currentFatigue > 0.8) {
      return true;
    }

    // 检查物理状态变化
    if (newSignals.physical?.fatigueLevel && newSignals.physical.fatigueLevel > 0.7) {
      return true;
    }

    // 检查心理状态变化
    if (newSignals.psychological?.stressLevel && newSignals.psychological.stressLevel > 0.7) {
      return true;
    }

    // 检查满意度下降
    if (travelProgress.currentSatisfaction < 0.5) {
      return true;
    }

    return false;
  }

  /**
   * 确定调整类型
   */
  private determineAdjustmentType(
    travelProgress: TravelProgress,
    newSignals: PersonaChangeSignals,
  ): 'GRADUAL' | 'IMMEDIATE' | 'PREVENTIVE' {
    // 如果疲劳度很高，需要立即调整
    if (travelProgress.currentFatigue > 0.8) {
      return 'IMMEDIATE';
    }

    // 如果有预警信号，预防性调整
    if (
      (newSignals.physical?.fatigueLevel && newSignals.physical.fatigueLevel > 0.6) ||
      (newSignals.psychological?.stressLevel && newSignals.psychological.stressLevel > 0.6)
    ) {
      return 'PREVENTIVE';
    }

    // 否则渐进式调整
    return 'GRADUAL';
  }

  /**
   * 生成动态调整建议
   */
  private generateDynamicAdjustments(
    userPersona: UserPersona,
    travelProgress: TravelProgress,
    newSignals: PersonaChangeSignals,
  ): RhythmAdjustment[] {
    const adjustments: RhythmAdjustment[] = [];

    // 基于疲劳度调整
    if (travelProgress.currentFatigue > 0.7) {
      adjustments.push({
        type: 'INCREASE_REST',
        description: '当前疲劳度较高，建议增加休息时间',
        priority: 'HIGH',
        suggestions: [
          '明天减少活动数量',
          '增加休息时间',
          '选择更轻松的活动',
        ],
      });
    }

    // 基于物理状态调整
    if (newSignals.physical?.fatigueLevel && newSignals.physical.fatigueLevel > 0.6) {
      adjustments.push({
        type: 'REDUCE_INTENSITY',
        description: '体力消耗较大，建议降低强度',
        priority: 'MEDIUM',
        suggestions: [
          '减少高强度活动',
          '增加低强度活动',
          '延长休息间隔',
        ],
      });
    }

    // 基于心理状态调整
    if (newSignals.psychological?.stressLevel && newSignals.psychological.stressLevel > 0.6) {
      adjustments.push({
        type: 'ADJUST_SCHEDULE',
        description: '心理压力较大，建议调整行程',
        priority: 'MEDIUM',
        suggestions: [
          '简化行程安排',
          '减少决策点',
          '增加自由时间',
        ],
      });
    }

    return adjustments;
  }

  /**
   * 生成调整原因
   */
  private generateAdjustmentReasons(
    travelProgress: TravelProgress,
    newSignals: PersonaChangeSignals,
  ): string[] {
    const reasons: string[] = [];

    if (travelProgress.currentFatigue > 0.7) {
      reasons.push(`当前疲劳度${Math.round(travelProgress.currentFatigue * 100)}%，需要调整`);
    }

    if (newSignals.physical?.fatigueLevel && newSignals.physical.fatigueLevel > 0.6) {
      reasons.push('体力消耗超出预期');
    }

    if (newSignals.psychological?.stressLevel && newSignals.psychological.stressLevel > 0.6) {
      reasons.push('心理压力较大');
    }

    return reasons;
  }

  /**
   * 生成预期效果
   */
  private generateExpectedEffects(adjustments: RhythmAdjustment[]): string[] {
    const effects: string[] = [];

    if (adjustments.some(a => a.type === 'INCREASE_REST')) {
      effects.push('增加休息后，疲劳度会降低');
    }

    if (adjustments.some(a => a.type === 'REDUCE_INTENSITY')) {
      effects.push('降低强度后，体力消耗会减少');
    }

    if (adjustments.some(a => a.type === 'ADJUST_SCHEDULE')) {
      effects.push('调整行程后，压力会减轻');
    }

    return effects.length > 0 ? effects : ['调整后，整体体验会改善'];
  }
}
