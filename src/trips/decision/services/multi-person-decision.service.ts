// src/trips/decision/services/multi-person-decision.service.ts

import { Injectable, Logger } from '@nestjs/common';
import {
  IndividualPreference,
  Conflict,
  ConflictType,
  Consensus,
  CoordinationOption,
  CoordinationStrategy,
  CoordinationResult,
  IndividualFitAnalysis,
  DiscussionTopic,
  RoutePlanDraft,
} from '../interfaces/multi-person-coordination.interface';
import { TravelerInfo, InterestProfile, MobilityProfile } from '../../interfaces/pacing-config.interface';
import { RouteDirectionData } from '../../../route-directions/interfaces/route-direction.interface';
import { UserPersona } from '../../../agent/memory/interfaces/multi-persona.interface';
import { RhythmMatchingService } from './rhythm-matching.service';
import { RhythmType } from '../interfaces/rhythm-matching.interface';

/**
 * 多人决策协调服务
 * 
 * 实现多人旅行的决策协调：
 * - 理解每个人的需求
 * - 分析冲突与共识
 * - 提供协调方案
 * - 支持群体决策讨论
 */
@Injectable()
export class MultiPersonDecisionService {
  private readonly logger = new Logger(MultiPersonDecisionService.name);

  constructor(private readonly rhythmMatchingService: RhythmMatchingService) {}

  /**
   * 支持多人决策协调
   */
  async supportMultiPersonDecision(
    groupMembers: TravelerInfo[],
    proposedItinerary: RoutePlanDraft,
    personas?: Map<string, UserPersona>,
  ): Promise<CoordinationResult> {
    // Step 1: 理解每个人的需求
    const individualPreferences = this.analyzeIndividualPreferences(groupMembers, personas);

    // Step 2: 分析冲突与共识
    const conflicts = this.analyzeConflicts(individualPreferences);
    const consensus = this.findConsensus(individualPreferences);

    // Step 3: 为每个成员分析路线匹配度
    const individualAnalysis = await this.analyzeFitForEachMember(
      individualPreferences,
      proposedItinerary,
    );

    // Step 4: 提供协调方案
    const coordinationOptions = this.generateCoordinationOptions(
      conflicts,
      consensus,
      individualPreferences,
      proposedItinerary,
    );

    // Step 5: 生成讨论话题
    const discussionTopics = this.suggestDiscussionTopics(conflicts, consensus);

    // Step 6: 生成总体建议
    const overallRecommendation = this.generateOverallRecommendation(
      conflicts,
      consensus,
      coordinationOptions,
    );

    return {
      individualAnalysis,
      conflictAreas: conflicts,
      consensus,
      optionsForCoordination: coordinationOptions,
      suggestedDiscussionPoints: discussionTopics,
      overallRecommendation,
    };
  }

  // ========== 个人偏好分析 ==========

  /**
   * 分析个人偏好
   */
  private analyzeIndividualPreferences(
    groupMembers: TravelerInfo[],
    personas?: Map<string, UserPersona>,
  ): IndividualPreference[] {
    return groupMembers.map((member, index) => {
      const travelerId = `traveler_${index}`;
      const persona = personas?.get(travelerId);

      // 从persona中提取偏好
      const rhythmPreference = this.extractRhythmPreference(member, persona);
      const riskTolerance = this.extractRiskTolerance(member, persona);
      const interests = this.extractInterests(member, persona);
      const budgetPreference = this.extractBudgetPreference(member, persona);
      const timePreference = this.extractTimePreference(member, persona);

      return {
        travelerId,
        travelerInfo: member,
        persona,
        rhythmPreference,
        riskTolerance,
        interests,
        budgetPreference,
        timePreference,
      };
    });
  }

  /**
   * 提取节奏偏好
   */
  private extractRhythmPreference(
    member: TravelerInfo,
    persona?: UserPersona,
  ): RhythmType | undefined {
    // 基于体能画像推断节奏偏好
    if (member.mobilityProfile === MobilityProfile.IRON_LEGS) {
      return 'INTENSIVE';
    } else if (member.mobilityProfile === MobilityProfile.ACTIVE_SENIOR) {
      return 'RELAXED';
    } else if (member.mobilityProfile === MobilityProfile.CITY_POTATO) {
      return 'FLEXIBLE';
    } else if (member.mobilityProfile === MobilityProfile.LIMITED) {
      return 'RELAXED';
    }

    // 如果有persona，从persona中提取
    if (persona?.preferences?.pacePreference) {
      const pace = persona.preferences.pacePreference;
      if (pace === 'FAST') return 'INTENSIVE';
      if (pace === 'SLOW') return 'RELAXED';
      if (pace === 'MODERATE') return 'FLEXIBLE';
    }

    return undefined;
  }

  /**
   * 提取风险容忍度
   */
  private extractRiskTolerance(
    member: TravelerInfo,
    persona?: UserPersona,
  ): 'LOW' | 'MEDIUM' | 'HIGH' | undefined {
    if (persona?.preferences?.riskTolerance) {
      const risk = persona.preferences.riskTolerance;
      if (risk === 'LOW') return 'LOW';
      if (risk === 'MEDIUM') return 'MEDIUM';
      if (risk === 'HIGH') return 'HIGH';
    }

    // 基于年龄推断
    if (member.interestProfile === InterestProfile.ELDERLY) {
      return 'LOW';
    } else if (member.interestProfile === InterestProfile.CHILD) {
      return 'LOW';
    }

    return 'MEDIUM';
  }

  /**
   * 提取兴趣
   */
  private extractInterests(member: TravelerInfo, persona?: UserPersona): string[] {
    const interests: string[] = [];

    // 基于年龄推断兴趣
    if (member.interestProfile === InterestProfile.ELDERLY) {
      interests.push('文化', '历史', '自然');
    } else if (member.interestProfile === InterestProfile.ADULT) {
      interests.push('文化', '美食', '购物');
    } else if (member.interestProfile === InterestProfile.CHILD) {
      interests.push('娱乐', '互动', '教育');
    }

    // 从persona中提取
    if (persona?.preferences?.interests) {
      interests.push(...persona.preferences.interests);
    }

    return Array.from(new Set(interests));
  }

  /**
   * 提取预算偏好
   */
  private extractBudgetPreference(
    member: TravelerInfo,
    persona?: UserPersona,
  ): 'BUDGET' | 'MODERATE' | 'LUXURY' | undefined {
    // 从persona中提取
    if (persona?.preferences?.budgetPreference) {
      return persona.preferences.budgetPreference;
    }

    return 'MODERATE';
  }

  /**
   * 提取时间偏好
   */
  private extractTimePreference(
    member: TravelerInfo,
    persona?: UserPersona,
  ): 'EARLY_BIRD' | 'NORMAL' | 'NIGHT_OWL' | undefined {
    // 从persona中提取
    if (persona?.preferences?.timePreference) {
      return persona.preferences.timePreference;
    }

    // 基于年龄推断
    if (member.interestProfile === InterestProfile.ELDERLY) {
      return 'EARLY_BIRD';
    }

    return 'NORMAL';
  }

  // ========== 冲突分析 ==========

  /**
   * 分析冲突
   */
  private analyzeConflicts(preferences: IndividualPreference[]): Conflict[] {
    const conflicts: Conflict[] = [];

    // 1. 节奏不匹配
    const rhythmConflicts = this.detectRhythmConflicts(preferences);
    conflicts.push(...rhythmConflicts);

    // 2. 风险容忍度差异
    const riskConflicts = this.detectRiskConflicts(preferences);
    conflicts.push(...riskConflicts);

    // 3. 兴趣分歧
    const interestConflicts = this.detectInterestConflicts(preferences);
    conflicts.push(...interestConflicts);

    // 4. 预算冲突
    const budgetConflicts = this.detectBudgetConflicts(preferences);
    conflicts.push(...budgetConflicts);

    // 5. 时间偏好差异
    const timeConflicts = this.detectTimeConflicts(preferences);
    conflicts.push(...timeConflicts);

    // 6. 体能差异
    const physicalConflicts = this.detectPhysicalConflicts(preferences);
    conflicts.push(...physicalConflicts);

    return conflicts;
  }

  /**
   * 检测节奏冲突
   */
  private detectRhythmConflicts(preferences: IndividualPreference[]): Conflict[] {
    const conflicts: Conflict[] = [];
    const rhythmGroups = new Map<RhythmType, string[]>();

    for (const pref of preferences) {
      if (pref.rhythmPreference) {
        const group = rhythmGroups.get(pref.rhythmPreference) || [];
        group.push(pref.travelerId);
        rhythmGroups.set(pref.rhythmPreference, group);
      }
    }

    if (rhythmGroups.size > 1) {
      const groups = Array.from(rhythmGroups.entries());
      for (let i = 0; i < groups.length; i++) {
        for (let j = i + 1; j < groups.length; j++) {
          const [rhythm1, travelers1] = groups[i];
          const [rhythm2, travelers2] = groups[j];

          // 如果节奏差异很大（如INTENSIVE vs RELAXED），冲突严重
          const severity = this.getRhythmConflictSeverity(rhythm1, rhythm2);

          conflicts.push({
            id: `rhythm-conflict-${rhythm1}-${rhythm2}`,
            type: 'RHYTHM_MISMATCH',
            severity,
            involvedTravelers: [...travelers1, ...travelers2],
            description: `节奏偏好差异：部分成员偏好${rhythm1}节奏，部分偏好${rhythm2}节奏`,
            reason: '不同成员对旅行节奏的期望不同',
            impact: ['行程安排', '每日活动数量', '休息时间'],
          });
        }
      }
    }

    return conflicts;
  }

  /**
   * 获取节奏冲突严重程度
   */
  private getRhythmConflictSeverity(
    rhythm1: RhythmType,
    rhythm2: RhythmType,
  ): 'LOW' | 'MEDIUM' | 'HIGH' {
    const intensityMap: Record<RhythmType, number> = {
      INTENSIVE: 5,
      HYBRID: 4,
      THEMED: 3,
      FLEXIBLE: 2,
      RELAXED: 1,
    };

    const diff = Math.abs(intensityMap[rhythm1] - intensityMap[rhythm2]);
    if (diff >= 3) return 'HIGH';
    if (diff >= 2) return 'MEDIUM';
    return 'LOW';
  }

  /**
   * 检测风险冲突
   */
  private detectRiskConflicts(preferences: IndividualPreference[]): Conflict[] {
    const conflicts: Conflict[] = [];
    const riskGroups = new Map<'LOW' | 'MEDIUM' | 'HIGH', string[]>();

    for (const pref of preferences) {
      if (pref.riskTolerance) {
        const group = riskGroups.get(pref.riskTolerance) || [];
        group.push(pref.travelerId);
        riskGroups.set(pref.riskTolerance, group);
      }
    }

    if (riskGroups.has('LOW') && riskGroups.has('HIGH')) {
      conflicts.push({
        id: 'risk-conflict-low-high',
        type: 'RISK_TOLERANCE_GAP',
        severity: 'HIGH',
        involvedTravelers: [
          ...(riskGroups.get('LOW') || []),
          ...(riskGroups.get('HIGH') || []),
        ],
        description: '风险容忍度差异：部分成员偏好低风险活动，部分偏好高风险活动',
        reason: '不同成员对风险的接受程度不同',
        impact: ['活动选择', '路线规划', '安全考虑'],
      });
    }

    return conflicts;
  }

  /**
   * 检测兴趣冲突
   */
  private detectInterestConflicts(preferences: IndividualPreference[]): Conflict[] {
    const conflicts: Conflict[] = [];

    // 计算兴趣重叠度
    for (let i = 0; i < preferences.length; i++) {
      for (let j = i + 1; j < preferences.length; j++) {
        const pref1 = preferences[i];
        const pref2 = preferences[j];

        const interests1 = pref1.interests || [];
        const interests2 = pref2.interests || [];

        const overlap = interests1.filter(i => interests2.includes(i)).length;
        const totalUnique = new Set([...interests1, ...interests2]).size;

        // 如果重叠度很低，存在兴趣分歧
        if (totalUnique > 0 && overlap / totalUnique < 0.3) {
          conflicts.push({
            id: `interest-conflict-${pref1.travelerId}-${pref2.travelerId}`,
            type: 'INTEREST_DIVERGENCE',
            severity: 'MEDIUM',
            involvedTravelers: [pref1.travelerId, pref2.travelerId],
            description: `兴趣分歧：${pref1.travelerId}和${pref2.travelerId}的兴趣重叠度较低`,
            reason: '不同成员对旅行内容的期望不同',
            impact: ['景点选择', '活动安排', '体验满意度'],
          });
        }
      }
    }

    return conflicts;
  }

  /**
   * 检测预算冲突
   */
  private detectBudgetConflicts(preferences: IndividualPreference[]): Conflict[] {
    const conflicts: Conflict[] = [];
    const budgetGroups = new Map<'BUDGET' | 'MODERATE' | 'LUXURY', string[]>();

    for (const pref of preferences) {
      if (pref.budgetPreference) {
        const group = budgetGroups.get(pref.budgetPreference) || [];
        group.push(pref.travelerId);
        budgetGroups.set(pref.budgetPreference, group);
      }
    }

    if (budgetGroups.has('BUDGET') && budgetGroups.has('LUXURY')) {
      conflicts.push({
        id: 'budget-conflict',
        type: 'BUDGET_CONFLICT',
        severity: 'HIGH',
        involvedTravelers: [
          ...(budgetGroups.get('BUDGET') || []),
          ...(budgetGroups.get('LUXURY') || []),
        ],
        description: '预算偏好差异：部分成员偏好经济型，部分偏好豪华型',
        reason: '不同成员对消费水平的期望不同',
        impact: ['住宿选择', '餐饮选择', '活动选择', '总预算'],
      });
    }

    return conflicts;
  }

  /**
   * 检测时间冲突
   */
  private detectTimeConflicts(preferences: IndividualPreference[]): Conflict[] {
    const conflicts: Conflict[] = [];
    const timeGroups = new Map<'EARLY_BIRD' | 'NORMAL' | 'NIGHT_OWL', string[]>();

    for (const pref of preferences) {
      if (pref.timePreference) {
        const group = timeGroups.get(pref.timePreference) || [];
        group.push(pref.travelerId);
        timeGroups.set(pref.timePreference, group);
      }
    }

    if (timeGroups.has('EARLY_BIRD') && timeGroups.has('NIGHT_OWL')) {
      conflicts.push({
        id: 'time-conflict',
        type: 'TIME_PREFERENCE_GAP',
        severity: 'MEDIUM',
        involvedTravelers: [
          ...(timeGroups.get('EARLY_BIRD') || []),
          ...(timeGroups.get('NIGHT_OWL') || []),
        ],
        description: '时间偏好差异：部分成员偏好早起，部分偏好晚起',
        reason: '不同成员的作息习惯不同',
        impact: ['每日开始时间', '活动安排', '休息时间'],
      });
    }

    return conflicts;
  }

  /**
   * 检测体能冲突
   */
  private detectPhysicalConflicts(preferences: IndividualPreference[]): Conflict[] {
    const conflicts: Conflict[] = [];

    const hasHighCapacity = preferences.some(
      p => p.travelerInfo.mobilityProfile === MobilityProfile.IRON_LEGS,
    );
    const hasLowCapacity = preferences.some(
      p =>
        p.travelerInfo.mobilityProfile === MobilityProfile.CITY_POTATO ||
        p.travelerInfo.mobilityProfile === MobilityProfile.LIMITED,
    );

    if (hasHighCapacity && hasLowCapacity) {
      conflicts.push({
        id: 'physical-conflict',
        type: 'PHYSICAL_CAPACITY_GAP',
        severity: 'HIGH',
        involvedTravelers: preferences.map(p => p.travelerId),
        description: '体能差异：部分成员体能充沛，部分成员体能有限',
        reason: '不同成员的体能水平差异较大',
        impact: ['路线选择', '活动强度', '休息安排', '整体节奏'],
      });
    }

    return conflicts;
  }

  // ========== 共识分析 ==========

  /**
   * 寻找共识
   */
  private findConsensus(preferences: IndividualPreference[]): Consensus[] {
    const consensus: Consensus[] = [];

    // 1. 节奏共识
    const rhythmConsensus = this.findRhythmConsensus(preferences);
    if (rhythmConsensus) consensus.push(rhythmConsensus);

    // 2. 兴趣共识
    const interestConsensus = this.findInterestConsensus(preferences);
    if (interestConsensus) consensus.push(...interestConsensus);

    // 3. 风险共识
    const riskConsensus = this.findRiskConsensus(preferences);
    if (riskConsensus) consensus.push(riskConsensus);

    return consensus;
  }

  /**
   * 寻找节奏共识
   */
  private findRhythmConsensus(preferences: IndividualPreference[]): Consensus | null {
    const rhythmCounts = new Map<RhythmType, number>();

    for (const pref of preferences) {
      if (pref.rhythmPreference) {
        rhythmCounts.set(
          pref.rhythmPreference,
          (rhythmCounts.get(pref.rhythmPreference) || 0) + 1,
        );
      }
    }

    if (rhythmCounts.size === 0) return null;

    const maxCount = Math.max(...Array.from(rhythmCounts.values()));
    const total = preferences.length;

    // 如果超过50%的人有相同节奏偏好，认为有共识
    if (maxCount / total >= 0.5) {
      const consensusRhythm = Array.from(rhythmCounts.entries()).find(
        ([, count]) => count === maxCount,
      )?.[0];

      if (consensusRhythm) {
        return {
          id: 'rhythm-consensus',
          type: 'RHYTHM',
          involvedTravelers: preferences
            .filter(p => p.rhythmPreference === consensusRhythm)
            .map(p => p.travelerId),
          description: `大多数成员偏好${consensusRhythm}节奏`,
          strength: maxCount / total,
        };
      }
    }

    return null;
  }

  /**
   * 寻找兴趣共识
   */
  private findInterestConsensus(preferences: IndividualPreference[]): Consensus[] {
    const interestCounts = new Map<string, number>();

    for (const pref of preferences) {
      const interests = pref.interests || [];
      for (const interest of interests) {
        interestCounts.set(interest, (interestCounts.get(interest) || 0) + 1);
      }
    }

    const consensus: Consensus[] = [];
    const total = preferences.length;

    for (const [interest, count] of interestCounts.entries()) {
      if (count / total >= 0.5) {
        consensus.push({
          id: `interest-consensus-${interest}`,
          type: 'INTEREST',
          involvedTravelers: preferences
            .filter(p => (p.interests || []).includes(interest))
            .map(p => p.travelerId),
          description: `大多数成员对"${interest}"感兴趣`,
          strength: count / total,
        });
      }
    }

    return consensus;
  }

  /**
   * 寻找风险共识
   */
  private findRiskConsensus(preferences: IndividualPreference[]): Consensus | null {
    const riskCounts = new Map<'LOW' | 'MEDIUM' | 'HIGH', number>();

    for (const pref of preferences) {
      if (pref.riskTolerance) {
        riskCounts.set(
          pref.riskTolerance,
          (riskCounts.get(pref.riskTolerance) || 0) + 1,
        );
      }
    }

    if (riskCounts.size === 0) return null;

    const maxCount = Math.max(...Array.from(riskCounts.values()));
    const total = preferences.length;

    if (maxCount / total >= 0.5) {
      const consensusRisk = Array.from(riskCounts.entries()).find(
        ([, count]) => count === maxCount,
      )?.[0];

      if (consensusRisk) {
        return {
          id: 'risk-consensus',
          type: 'RISK',
          involvedTravelers: preferences
            .filter(p => p.riskTolerance === consensusRisk)
            .map(p => p.travelerId),
          description: `大多数成员的风险容忍度为${consensusRisk}`,
          strength: maxCount / total,
        };
      }
    }

    return null;
  }

  // ========== 个人匹配分析 ==========

  /**
   * 为每个成员分析匹配度
   */
  private async analyzeFitForEachMember(
    preferences: IndividualPreference[],
    proposedItinerary: RoutePlanDraft,
  ): Promise<IndividualFitAnalysis[]> {
    const analyses: IndividualFitAnalysis[] = [];

    for (const pref of preferences) {
      // 使用节奏匹配服务计算匹配度
      let rhythmMatch = 0.5;
      if (pref.persona && proposedItinerary.route) {
        try {
          const rhythmResult = await this.rhythmMatchingService.calculateRhythmMatch(
            proposedItinerary.route,
            pref.persona,
          );
          rhythmMatch = rhythmResult.scores.overallMatch;
        } catch (error) {
          this.logger.warn(`Failed to calculate rhythm match for ${pref.travelerId}: ${error}`);
        }
      }

      // 计算兴趣匹配度
      const interestMatch = this.calculateInterestMatch(pref, proposedItinerary);

      // 计算风险匹配度
      const riskMatch = this.calculateRiskMatch(pref, proposedItinerary);

      // 计算体能匹配度
      const physicalMatch = this.calculatePhysicalMatch(pref, proposedItinerary);

      // 整体匹配度
      const overallMatch = (rhythmMatch + interestMatch + riskMatch + physicalMatch) / 4;

      analyses.push({
        travelerId: pref.travelerId,
        overallMatch,
        rhythmMatch,
        interestMatch,
        riskMatch,
        physicalMatch,
        matchPoints: this.identifyMatchPoints(pref, proposedItinerary),
        mismatchPoints: this.identifyMismatchPoints(pref, proposedItinerary),
        suggestions: this.generateIndividualSuggestions(pref, proposedItinerary),
      });
    }

    return analyses;
  }

  /**
   * 计算兴趣匹配度
   */
  private calculateInterestMatch(
    preference: IndividualPreference,
    itinerary: RoutePlanDraft,
  ): number {
    const interests = preference.interests || [];
    if (interests.length === 0) return 0.5;

    const routeTags = itinerary.route?.tags || [];
    const matches = interests.filter(i => routeTags.includes(i)).length;

    return matches / interests.length;
  }

  /**
   * 计算风险匹配度
   */
  private calculateRiskMatch(
    preference: IndividualPreference,
    itinerary: RoutePlanDraft,
  ): number {
    const riskTolerance = preference.riskTolerance || 'MEDIUM';
    const routeRisk = itinerary.route?.riskProfile || {};

    // 简化实现：基于路线风险特征匹配
    if (riskTolerance === 'LOW' && routeRisk.altitudeSickness) {
      return 0.3;
    }
    if (riskTolerance === 'HIGH' && !routeRisk.altitudeSickness && !routeRisk.weatherWindow) {
      return 0.7;
    }

    return 0.5;
  }

  /**
   * 计算体能匹配度
   */
  private calculatePhysicalMatch(
    preference: IndividualPreference,
    itinerary: RoutePlanDraft,
  ): number {
    const mobility = preference.travelerInfo.mobilityProfile;
    const constraints = itinerary.route?.constraints || {};

    if (mobility === MobilityProfile.LIMITED && constraints.hard?.maxSlopePct) {
      return constraints.hard.maxSlopePct > 10 ? 0.2 : 0.8;
    }

    if (mobility === MobilityProfile.ACTIVE_SENIOR && constraints.hard?.requiresStairs) {
      return 0.3;
    }

    return 0.7;
  }

  /**
   * 识别匹配点
   */
  private identifyMatchPoints(
    preference: IndividualPreference,
    itinerary: RoutePlanDraft,
  ): string[] {
    const points: string[] = [];

    if (preference.rhythmPreference === itinerary.suggestedRhythm) {
      points.push('节奏偏好匹配');
    }

    const interestMatch = this.calculateInterestMatch(preference, itinerary);
    if (interestMatch > 0.6) {
      points.push('兴趣匹配度高');
    }

    return points;
  }

  /**
   * 识别不匹配点
   */
  private identifyMismatchPoints(
    preference: IndividualPreference,
    itinerary: RoutePlanDraft,
  ): string[] {
    const points: string[] = [];

    if (preference.rhythmPreference && preference.rhythmPreference !== itinerary.suggestedRhythm) {
      points.push('节奏偏好不匹配');
    }

    const interestMatch = this.calculateInterestMatch(preference, itinerary);
    if (interestMatch < 0.4) {
      points.push('兴趣匹配度低');
    }

    return points;
  }

  /**
   * 生成个人建议
   */
  private generateIndividualSuggestions(
    preference: IndividualPreference,
    itinerary: RoutePlanDraft,
  ): string[] {
    const suggestions: string[] = [];

    if (preference.rhythmPreference && preference.rhythmPreference !== itinerary.suggestedRhythm) {
      suggestions.push(`考虑调整节奏以匹配你的偏好（${preference.rhythmPreference}）`);
    }

    const interestMatch = this.calculateInterestMatch(preference, itinerary);
    if (interestMatch < 0.5) {
      suggestions.push('考虑增加你感兴趣的活动类型');
    }

    return suggestions;
  }

  // ========== 协调方案生成 ==========

  /**
   * 生成协调方案
   */
  private generateCoordinationOptions(
    conflicts: Conflict[],
    consensus: Consensus[],
    preferences: IndividualPreference[],
    itinerary: RoutePlanDraft,
  ): CoordinationOption[] {
    const options: CoordinationOption[] = [];

    // 1. 分段不同节奏
    if (conflicts.some(c => c.type === 'RHYTHM_MISMATCH')) {
      options.push(this.generateSegmentedRhythmOption(conflicts, preferences));
    }

    // 2. 整体舒缓有升级选项
    if (conflicts.some(c => c.type === 'RHYTHM_MISMATCH' || c.type === 'PHYSICAL_CAPACITY_GAP')) {
      options.push(this.generateRelaxedWithUpgradeOption(conflicts, preferences));
    }

    // 3. 分开活动
    if (conflicts.some(c => c.type === 'INTEREST_DIVERGENCE')) {
      options.push(this.generateSplitActivitiesOption(conflicts, preferences));
    }

    // 4. 折中方案
    options.push(this.generateCompromiseOption(conflicts, preferences));

    // 5. 轮流优先
    if (conflicts.length > 0) {
      options.push(this.generateRotatingPriorityOption(conflicts, preferences));
    }

    // 6. 独立时间
    if (conflicts.some(c => c.type === 'TIME_PREFERENCE_GAP')) {
      options.push(this.generateIndependentTimeOption(conflicts, preferences));
    }

    // 计算每个方案的适用性评分
    return options.map(option => ({
      ...option,
      suitabilityScore: this.calculateSuitabilityScore(option, conflicts, preferences),
      expectedSatisfaction: this.calculateExpectedSatisfaction(option, preferences),
    }));
  }

  /**
   * 生成分段节奏方案
   */
  private generateSegmentedRhythmOption(
    conflicts: Conflict[],
    preferences: IndividualPreference[],
  ): CoordinationOption {
    const rhythmConflicts = conflicts.filter(c => c.type === 'RHYTHM_MISMATCH');

    return {
      id: 'segmented-rhythm',
      strategy: 'SEGMENTED_RHYTHM',
      description: '分段采用不同节奏，满足不同成员的需求',
      implementation: [
        '将行程分为几个阶段',
        '每个阶段采用不同节奏（如前期紧凑，后期舒缓）',
        '让不同成员在不同阶段得到满足',
      ],
      resolvedConflicts: rhythmConflicts.map(c => c.id),
      advantages: [
        '满足不同成员的节奏需求',
        '避免全程妥协',
        '提供多样化体验',
      ],
      disadvantages: [
        '需要更详细的规划',
        '可能增加复杂度',
      ],
      suitabilityScore: 0,
      expectedSatisfaction: {},
    };
  }

  /**
   * 生成整体舒缓有升级选项方案
   */
  private generateRelaxedWithUpgradeOption(
    conflicts: Conflict[],
    preferences: IndividualPreference[],
  ): CoordinationOption {
    return {
      id: 'relaxed-with-upgrade',
      strategy: 'OVERALL_RELAXED_WITH_UPGRADE',
      description: '整体采用舒缓节奏，为体能充沛的成员提供升级选项',
      implementation: [
        '基础行程采用舒缓节奏',
        '为体能充沛的成员提供额外活动选项',
        '允许成员选择是否参与升级活动',
      ],
      resolvedConflicts: conflicts
        .filter(c => c.type === 'RHYTHM_MISMATCH' || c.type === 'PHYSICAL_CAPACITY_GAP')
        .map(c => c.id),
      advantages: [
        '照顾体能较弱的成员',
        '为体能充沛的成员提供选择',
        '保持整体节奏一致',
      ],
      disadvantages: [
        '部分成员可能觉得不够挑战',
        '需要额外的活动规划',
      ],
      suitabilityScore: 0,
      expectedSatisfaction: {},
    };
  }

  /**
   * 生成分开活动方案
   */
  private generateSplitActivitiesOption(
    conflicts: Conflict[],
    preferences: IndividualPreference[],
  ): CoordinationOption {
    return {
      id: 'split-activities',
      strategy: 'SPLIT_ACTIVITIES',
      description: '部分时间分开活动，各自选择感兴趣的内容',
      implementation: [
        '识别兴趣差异较大的时间段',
        '允许成员分开选择活动',
        '约定集合时间和地点',
      ],
      resolvedConflicts: conflicts.filter(c => c.type === 'INTEREST_DIVERGENCE').map(c => c.id),
      advantages: [
        '满足不同兴趣',
        '提高个人满意度',
        '增加灵活性',
      ],
      disadvantages: [
        '减少共同体验',
        '需要协调集合',
        '可能增加安全风险',
      ],
      suitabilityScore: 0,
      expectedSatisfaction: {},
    };
  }

  /**
   * 生成折中方案
   */
  private generateCompromiseOption(
    conflicts: Conflict[],
    preferences: IndividualPreference[],
  ): CoordinationOption {
    return {
      id: 'compromise-middle',
      strategy: 'COMPROMISE_MIDDLE',
      description: '采用折中方案，平衡各方需求',
      implementation: [
        '找出各方偏好的中间值',
        '采用中等节奏、中等风险',
        '平衡不同兴趣',
      ],
      resolvedConflicts: conflicts.map(c => c.id),
      advantages: [
        '简单易行',
        '平衡各方需求',
        '减少冲突',
      ],
      disadvantages: [
        '可能无法完全满足任何人',
        '缺乏特色',
      ],
      suitabilityScore: 0,
      expectedSatisfaction: {},
    };
  }

  /**
   * 生成轮流优先方案
   */
  private generateRotatingPriorityOption(
    conflicts: Conflict[],
    preferences: IndividualPreference[],
  ): CoordinationOption {
    return {
      id: 'rotating-priority',
      strategy: 'ROTATING_PRIORITY',
      description: '轮流让不同成员优先选择，确保每个人都有机会',
      implementation: [
        '将行程分为几个阶段',
        '每个阶段由不同成员优先选择',
        '其他成员提供建议和支持',
      ],
      resolvedConflicts: conflicts.map(c => c.id),
      advantages: [
        '公平分配决策权',
        '满足不同需求',
        '增强参与感',
      ],
      disadvantages: [
        '需要良好的沟通',
        '可能增加规划时间',
      ],
      suitabilityScore: 0,
      expectedSatisfaction: {},
    };
  }

  /**
   * 生成独立时间方案
   */
  private generateIndependentTimeOption(
    conflicts: Conflict[],
    preferences: IndividualPreference[],
  ): CoordinationOption {
    return {
      id: 'independent-time',
      strategy: 'INDEPENDENT_TIME',
      description: '为不同作息习惯的成员安排独立时间',
      implementation: [
        '早起成员可以先行活动',
        '晚起成员可以晚些开始',
        '约定共同活动时间',
      ],
      resolvedConflicts: conflicts.filter(c => c.type === 'TIME_PREFERENCE_GAP').map(c => c.id),
      advantages: [
        '尊重不同作息',
        '减少时间冲突',
        '提高舒适度',
      ],
      disadvantages: [
        '减少共同时间',
        '需要协调',
      ],
      suitabilityScore: 0,
      expectedSatisfaction: {},
    };
  }

  /**
   * 计算适用性评分
   */
  private calculateSuitabilityScore(
    option: CoordinationOption,
    conflicts: Conflict[],
    preferences: IndividualPreference[],
  ): number {
    let score = 0.5; // 基础分

    // 解决的冲突越多，分数越高
    const resolvedRatio = option.resolvedConflicts.length / Math.max(1, conflicts.length);
    score += resolvedRatio * 0.3;

    // 优点越多，分数越高
    score += (option.advantages.length / 5) * 0.1;

    // 缺点越少，分数越高
    score += (1 - option.disadvantages.length / 5) * 0.1;

    return Math.min(1.0, score);
  }

  /**
   * 计算预期满意度
   */
  private calculateExpectedSatisfaction(
    option: CoordinationOption,
    preferences: IndividualPreference[],
  ): Record<string, number> {
    const satisfaction: Record<string, number> = {};

    for (const pref of preferences) {
      // 简化实现：基于方案解决的冲突计算满意度
      let score = 0.5;

      // 如果方案解决了该成员的冲突，满意度提高
      const memberConflicts = option.resolvedConflicts.filter(id =>
        id.includes(pref.travelerId),
      );
      if (memberConflicts.length > 0) {
        score += 0.2;
      }

      satisfaction[pref.travelerId] = Math.min(1.0, score);
    }

    return satisfaction;
  }

  // ========== 讨论话题生成 ==========

  /**
   * 建议讨论话题
   */
  private suggestDiscussionTopics(conflicts: Conflict[], consensus: Consensus[]): DiscussionTopic[] {
    const topics: DiscussionTopic[] = [];

    // 为每个高严重度冲突生成讨论话题
    for (const conflict of conflicts.filter(c => c.severity === 'HIGH')) {
      topics.push({
        id: `topic-${conflict.id}`,
        title: `讨论：${conflict.description}`,
        description: conflict.reason,
        relatedConflicts: [conflict.id],
        discussionPoints: [
          '为什么会有这个差异？',
          '这个差异对旅行体验的影响有多大？',
          '是否可以找到折中方案？',
        ],
        suggestedQuestions: [
          `你们对${conflict.type}的看法是什么？`,
          '这个差异是否可以接受？',
          '有什么方法可以协调？',
        ],
      });
    }

    // 为共识生成讨论话题（确认共识）
    for (const cons of consensus) {
      topics.push({
        id: `topic-${cons.id}`,
        title: `确认共识：${cons.description}`,
        description: '确认大家对这一点是否一致',
        relatedConflicts: [],
        discussionPoints: [
          '是否所有人都同意这一点？',
          '这个共识如何体现在行程中？',
        ],
        suggestedQuestions: [
          '大家对这一点是否一致？',
          '如何利用这个共识优化行程？',
        ],
      });
    }

    return topics;
  }

  /**
   * 生成总体建议
   */
  private generateOverallRecommendation(
    conflicts: Conflict[],
    consensus: Consensus[],
    options: CoordinationOption[],
  ): string {
    if (conflicts.length === 0) {
      return '团队成员偏好较为一致，建议直接采用推荐的行程方案。';
    }

    const highSeverityConflicts = conflicts.filter(c => c.severity === 'HIGH');
    if (highSeverityConflicts.length > 0) {
      return `存在${highSeverityConflicts.length}个高严重度冲突，建议优先讨论这些冲突，并考虑采用"${options[0]?.strategy}"协调方案。`;
    }

    return `存在${conflicts.length}个冲突，建议团队成员讨论协调方案，选择最适合的方案。`;
  }
}
