// Recruiting Attribution Service
// 招募归因服务 - 分析招募决策原因

import { Injectable, Logger } from '@nestjs/common';
import {
  RecruitingDecisionReason,
  RecruitingSignal,
  RecruitingAttribution,
  RecruitingAttributionResult,
  RecruitingAttributionRequest,
  RecruitingAttributionContext,
} from '../types/recruiting-runtime.types';
import { DecisionCauseType, AttributionConfidence } from '../../trips/attribution/types/decision-attribution.types';

interface RecruitingAttributionRule {
  id: string;
  causeType: DecisionCauseType;
  priority: number;
  applicableEventTypes: string[];
  condition: string;
  signals: Partial<Record<RecruitingSignal, number>>;
  reason: string;
  reasonCodes: string[];
}

@Injectable()
export class RecruitingAttributionService {
  private readonly logger = new Logger(RecruitingAttributionService.name);
  private rules: RecruitingAttributionRule[] = [];

  constructor() {
    this.initializeRules();
  }

  /**
   * 分析单个招募决策归因
   */
  async analyze(request: RecruitingAttributionRequest): Promise<RecruitingAttributionResult> {
    const { eventType, payload, context } = request;

    // 查找匹配的规则
    const matchedRules = this.rules
      .filter(rule => rule.applicableEventTypes.includes(eventType))
      .filter(rule => this.evaluateCondition(rule.condition, payload))
      .sort((a, b) => b.priority - a.priority);

    // 使用最高优先级规则作为主要归因
    const primaryRule = matchedRules[0];
    const alternativeRules = matchedRules.slice(1);

    if (!primaryRule) {
      // 默认归因
      return this.createDefaultAttribution(request);
    }

    // 计算信号分数
    const signalScores = this.calculateSignalScores(primaryRule, payload, context);

    // 计算置信度
    const confidence = this.calculateConfidence(primaryRule, matchedRules.length);

    const attribution: RecruitingAttribution = {
      causeType: primaryRule.causeType,
      primaryReason: this.mapReasonStringToEnum(primaryRule.reason),
      reasonCodes: primaryRule.reasonCodes,
      signalScores,
      confidence,
      metadata: {
        ruleId: primaryRule.id,
        alternativeReasons: alternativeRules.map(r => this.mapReasonStringToEnum(r.reason)),
        compatibilityScore: payload.compatibilityScore,
        skillMatchScore: this.calculateSkillMatchScore(payload),
        scheduleMatchScore: this.calculateScheduleMatchScore(payload),
        budgetMatchScore: this.calculateBudgetMatchScore(payload),
      },
    };

    const alternatives = alternativeRules.map(rule => ({
      causeType: rule.causeType,
      primaryReason: this.mapReasonStringToEnum(rule.reason),
      reasonCodes: rule.reasonCodes,
      signalScores: this.calculateSignalScores(rule, payload, context),
      confidence: this.calculateConfidence(rule, matchedRules.length),
    }));

    return {
      attribution,
      alternatives,
      timestamp: new Date(),
    };
  }

  /**
   * 批量分析招募决策归因
   */
  async analyzeBatch(requests: RecruitingAttributionRequest[]): Promise<RecruitingAttributionResult[]> {
    return Promise.all(requests.map(req => this.analyze(req)));
  }

  /**
   * 评估条件
   */
  private evaluateCondition(condition: string, payload: any): boolean {
    // 处理 AND 条件
    if (condition.includes('&&')) {
      const andParts = condition.split('&&').map(p => p.trim());
      return andParts.every(part => this.evaluateSingleCondition(part, payload));
    }

    // 处理 OR 条件
    if (condition.includes('||')) {
      const orParts = condition.split('||').map(p => p.trim());
      return orParts.some(part => this.evaluateSingleCondition(part, payload));
    }

    return this.evaluateSingleCondition(condition, payload);
  }

  /**
   * 评估单个条件
   */
  private evaluateSingleCondition(condition: string, payload: any): boolean {
    // 布尔相等 (check this before string equality)
    if (condition.includes('=== true')) {
      const path = condition.replace('payload.', '').replace(' === true', '');
      const value = this.getNestedValue(payload, path);
      return value === true;
    }

    // 布尔不等
    if (condition.includes('=== false')) {
      const path = condition.replace('payload.', '').replace(' === false', '');
      const value = this.getNestedValue(payload, path);
      return value === false;
    }

    // 布尔 true
    if (condition === 'true') return true;

    // 检查属性存在
    if (condition.startsWith('payload.') && condition.endsWith('!== undefined')) {
      const path = condition.replace('payload.', '').replace(' !== undefined', '');
      return this.getNestedValue(payload, path) !== undefined;
    }

    // 字符串相等
    if (condition.includes('===') && !condition.includes('?.includes')) {
      const [left, right] = condition.split('===').map(s => s.trim());
      const leftValue = this.getNestedValue(payload, left.replace('payload.', ''));
      // Remove quotes from right side
      const rightValue = right.replace(/^["']|["']$/g, '');
      return leftValue === rightValue;
    }

    // 数组包含
    if (condition.includes('?.includes(')) {
      const match = condition.match(/payload\.([\w.]+)\?\.includes\(([^)]+)\)/);
      if (match) {
        const arrayPath = match[1];
        const value = match[2].replace(/"/g, '').replace(/'/g, '');
        const array = this.getNestedValue(payload, arrayPath);
        return Array.isArray(array) && array.includes(value);
      }
    }

    // Optional chaining with comparison (e.g., payload.teamBalance?.genderBalance > 0.6)
    if (condition.includes('?.') && condition.includes('>')) {
      const match = condition.match(/payload\.([\w.]+)\?\.([\w]+)\s*>\s*([\d.]+)/);
      if (match) {
        const objPath = match[1];
        const prop = match[2];
        const threshold = parseFloat(match[3]);
        const obj = this.getNestedValue(payload, objPath);
        return obj && obj[prop] !== undefined && typeof obj[prop] === 'number' && obj[prop] > threshold;
      }
    }

    // 数值比较
    if (condition.includes('>')) {
      const [left, right] = condition.split('>').map(s => s.trim());
      const leftValue = this.getNestedValue(payload, left.replace('payload.', ''));
      const rightValue = parseFloat(right);
      return typeof leftValue === 'number' && leftValue > rightValue;
    }

    // 数值比较（小于）
    if (condition.includes('<')) {
      const [left, right] = condition.split('<').map(s => s.trim());
      const leftValue = this.getNestedValue(payload, left.replace('payload.', ''));
      const rightValue = parseFloat(right);
      return typeof leftValue === 'number' && leftValue < rightValue;
    }

    return false;
  }

  /**
   * 获取嵌套属性值
   */
  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  /**
   * 计算信号分数
   */
  private calculateSignalScores(
    rule: RecruitingAttributionRule,
    payload: any,
    _context?: RecruitingAttributionContext,
  ): Record<RecruitingSignal, number> {
    const scores: Partial<Record<RecruitingSignal, number>> = { ...rule.signals };

    // MBTI 兼容性
    if (payload.mbtiCompatibility) {
      scores[RecruitingSignal.MBTI_COMPATIBILITY] =
        payload.mbtiCompatibility === 'high' ? 0.9 :
        payload.mbtiCompatibility === 'medium' ? 0.6 : 0.3;
    }

    // 技能匹配
    if (payload.requiredSkills && payload.applicantSkills) {
      const matchCount = payload.requiredSkills.filter((s: string) =>
        payload.applicantSkills.includes(s),
      ).length;
      scores[RecruitingSignal.SKILL_MATCH] = matchCount / payload.requiredSkills.length;
    }

    // 时间可用性
    if (payload.timeAvailability) {
      scores[RecruitingSignal.TIME_AVAILABILITY] =
        payload.timeAvailability === 'excellent' ? 0.9 :
        payload.timeAvailability === 'good' ? 0.6 : 0.3;
    }

    // 预算匹配
    if (payload.budgetFit) {
      scores[RecruitingSignal.BUDGET_FIT] =
        payload.budgetFit === 'perfect' ? 0.9 :
        payload.budgetFit === 'acceptable' ? 0.6 : 0.3;
    }

    // 过往合作
    if (payload.pastCollaboration !== undefined) {
      scores[RecruitingSignal.PAST_COLLABORATION] = payload.pastCollaboration ? 0.9 : 0.5;
    }

    // 团队平衡
    if (payload.teamBalance) {
      scores[RecruitingSignal.GENDER_BALANCE] = payload.teamBalance.genderBalance || 0.5;
      scores[RecruitingSignal.AGE_BALANCE] = payload.teamBalance.ageBalance || 0.5;
      scores[RecruitingSignal.ROLE_BALANCE] = payload.teamBalance.roleBalance || 0.5;
    }

    // 归一化到 0-1
    const normalized: Record<RecruitingSignal, number> = {} as any;
    Object.entries(scores).forEach(([key, value]) => {
      normalized[key as RecruitingSignal] = Math.min(1, Math.max(0, value || 0));
    });

    return normalized;
  }

  /**
   * 计算置信度
   */
  private calculateConfidence(rule: RecruitingAttributionRule, matchCount: number): AttributionConfidence {
    // If multiple rules matched, reduce confidence slightly
    const priorityAdjustment = matchCount > 1 ? 5 : 0;
    const adjustedPriority = rule.priority - priorityAdjustment;

    if (adjustedPriority >= 90) return AttributionConfidence.HIGH;
    if (adjustedPriority >= 70) return AttributionConfidence.MEDIUM;
    return AttributionConfidence.LOW;
  }

  /**
   * 计算技能匹配分数
   */
  private calculateSkillMatchScore(payload: any): number {
    if (!payload.requiredSkills || !payload.applicantSkills) return 0.5;
    const matchCount = payload.requiredSkills.filter((s: string) =>
      payload.applicantSkills.includes(s),
    ).length;
    return matchCount / payload.requiredSkills.length;
  }

  /**
   * 计算时间匹配分数
   */
  private calculateScheduleMatchScore(payload: any): number {
    if (payload.scheduleConflict) return 0.2;
    if (payload.timeAvailability === 'excellent') return 0.9;
    if (payload.timeAvailability === 'good') return 0.6;
    return 0.3;
  }

  /**
   * 计算预算匹配分数
   */
  private calculateBudgetMatchScore(payload: any): number {
    if (payload.budgetFit === 'perfect') return 0.9;
    if (payload.budgetFit === 'acceptable') return 0.6;
    return 0.3;
  }

  /**
   * 映射原因字符串到枚举
   */
  private mapReasonStringToEnum(reason: string): RecruitingDecisionReason {
    const mapping: Record<string, RecruitingDecisionReason> = {
      'MBTI 兼容性匹配': RecruitingDecisionReason.COMPATIBILITY_MATCH,
      '技能需求匹配': RecruitingDecisionReason.SKILL_REQUIREMENT,
      '技能需求不匹配': RecruitingDecisionReason.SKILL_REQUIREMENT,
      '时间不协调': RecruitingDecisionReason.SCHEDULE_ALIGNMENT,
      '时间协调': RecruitingDecisionReason.SCHEDULE_ALIGNMENT,
      '预算匹配': RecruitingDecisionReason.BUDGET_ALIGNMENT,
      '预算不匹配': RecruitingDecisionReason.BUDGET_ALIGNMENT,
      '个性匹配': RecruitingDecisionReason.PERSONA_FIT,
      '队长偏好': RecruitingDecisionReason.CAPTAIN_PREFERENCE,
      '岗位需求': RecruitingDecisionReason.SLOT_REQUIREMENT,
      '团队平衡': RecruitingDecisionReason.TEAM_BALANCE,
      '外部因素': RecruitingDecisionReason.EXTERNAL_FACTOR,
      '治理规则': RecruitingDecisionReason.GOVERNANCE,
      '过往合作': RecruitingDecisionReason.PAST_COLLABORATION,
    };
    return mapping[reason] || RecruitingDecisionReason.CAPTAIN_PREFERENCE;
  }

  /**
   * 创建默认归因
   */
  private createDefaultAttribution(_request: RecruitingAttributionRequest): RecruitingAttributionResult {
    const attribution: RecruitingAttribution = {
      causeType: DecisionCauseType.USER_ACTION,
      primaryReason: RecruitingDecisionReason.CAPTAIN_PREFERENCE,
      reasonCodes: ['CAPTAIN_PREFERENCE'],
      signalScores: {
        [RecruitingSignal.MBTI_COMPATIBILITY]: 0.5,
        [RecruitingSignal.INTERACTION_MODE]: 0.5,
        [RecruitingSignal.SKILL_MATCH]: 0.5,
        [RecruitingSignal.TIME_AVAILABILITY]: 0.5,
        [RecruitingSignal.BUDGET_FIT]: 0.5,
        [RecruitingSignal.EXPERIENCE_LEVEL]: 0.5,
        [RecruitingSignal.REPUTATION_SCORE]: 0.5,
        [RecruitingSignal.PAST_COLLABORATION]: 0.5,
        [RecruitingSignal.GENDER_BALANCE]: 0.5,
        [RecruitingSignal.AGE_BALANCE]: 0.5,
        [RecruitingSignal.ROLE_BALANCE]: 0.5,
      },
      confidence: AttributionConfidence.LOW,
      metadata: {
        ruleId: 'default_captain_preference',
      },
    };

    return {
      attribution,
      alternatives: [],
      timestamp: new Date(),
    };
  }

  /**
   * 初始化归因规则
   */
  private initializeRules(): void {
    this.rules = [
      // MBTI 兼容性匹配
      {
        id: 'mbti_compatibility_match',
        causeType: DecisionCauseType.USER_ACTION,
        priority: 90,
        applicableEventTypes: ['recruiting.application_approved'],
        condition: 'payload.compatibilityScore > 0.8 || payload.mbtiCompatibility === "high"',
        signals: {
          [RecruitingSignal.MBTI_COMPATIBILITY]: 0.9,
          [RecruitingSignal.INTERACTION_MODE]: 0.8,
        },
        reason: 'MBTI 兼容性匹配',
        reasonCodes: ['MBTI_COMPATIBILITY'],
      },

      // 技能需求匹配
      {
        id: 'skill_requirement_match',
        causeType: DecisionCauseType.CONSTRAINT,
        priority: 85,
        applicableEventTypes: ['recruiting.application_approved'],
        condition: 'payload.requiredSkills?.includes("driving") && payload.applicantSkills?.includes("driving") || payload.requiredSkills?.includes("photography") && payload.applicantSkills?.includes("photography")',
        signals: {
          [RecruitingSignal.SKILL_MATCH]: 0.9,
        },
        reason: '技能需求匹配',
        reasonCodes: ['SKILL_REQUIREMENT'],
      },

      // 技能需求不匹配
      {
        id: 'skill_requirement_mismatch',
        causeType: DecisionCauseType.CONSTRAINT,
        priority: 85,
        applicableEventTypes: ['recruiting.application_rejected'],
        condition: 'payload.requiredSkills?.length > 0 && !payload.applicantSkills?.some(s => payload.requiredSkills.includes(s))',
        signals: {
          [RecruitingSignal.SKILL_MATCH]: 0.2,
        },
        reason: '技能需求不匹配',
        reasonCodes: ['SKILL_MISMATCH'],
      },

      // 时间协调
      {
        id: 'schedule_alignment',
        causeType: DecisionCauseType.CONSTRAINT,
        priority: 80,
        applicableEventTypes: ['recruiting.application_approved'],
        condition: 'payload.scheduleConflict === false && payload.timeAvailability === "excellent"',
        signals: {
          [RecruitingSignal.TIME_AVAILABILITY]: 0.9,
        },
        reason: '时间协调',
        reasonCodes: ['SCHEDULE_ALIGNMENT'],
      },

      // 时间不协调
      {
        id: 'schedule_mismatch',
        causeType: DecisionCauseType.CONSTRAINT,
        priority: 80,
        applicableEventTypes: ['recruiting.application_rejected'],
        condition: 'payload.scheduleConflict === true || payload.timeAvailability === "poor"',
        signals: {
          [RecruitingSignal.TIME_AVAILABILITY]: 0.3,
        },
        reason: '时间不协调',
        reasonCodes: ['SCHEDULE_MISMATCH'],
      },

      // 预算匹配
      {
        id: 'budget_alignment',
        causeType: DecisionCauseType.CONSTRAINT,
        priority: 75,
        applicableEventTypes: ['recruiting.application_approved'],
        condition: 'payload.budgetFit === "perfect" || payload.budgetFit === "acceptable"',
        signals: {
          [RecruitingSignal.BUDGET_FIT]: 0.8,
        },
        reason: '预算匹配',
        reasonCodes: ['BUDGET_ALIGNMENT'],
      },

      // 预算不匹配
      {
        id: 'budget_mismatch',
        causeType: DecisionCauseType.CONSTRAINT,
        priority: 75,
        applicableEventTypes: ['recruiting.application_rejected'],
        condition: 'payload.budgetFit === "poor"',
        signals: {
          [RecruitingSignal.BUDGET_FIT]: 0.3,
        },
        reason: '预算不匹配',
        reasonCodes: ['BUDGET_MISMATCH'],
      },

      // 个性匹配
      {
        id: 'persona_fit',
        causeType: DecisionCauseType.USER_ACTION,
        priority: 85,
        applicableEventTypes: ['recruiting.application_approved'],
        condition: 'payload.mbtiCompatibility === "high" || payload.compatibilityScore > 0.7',
        signals: {
          [RecruitingSignal.MBTI_COMPATIBILITY]: 0.85,
          [RecruitingSignal.INTERACTION_MODE]: 0.8,
        },
        reason: '个性匹配',
        reasonCodes: ['PERSONA_FIT'],
      },

      // 队长偏好
      {
        id: 'captain_preference',
        causeType: DecisionCauseType.USER_ACTION,
        priority: 70,
        applicableEventTypes: ['recruiting.application_approved', 'recruiting.application_rejected'],
        condition: 'payload.captainPreference !== undefined',
        signals: {
          [RecruitingSignal.MBTI_COMPATIBILITY]: 0.6,
        },
        reason: '队长偏好',
        reasonCodes: ['CAPTAIN_PREFERENCE'],
      },

      // 岗位需求
      {
        id: 'slot_requirement',
        causeType: DecisionCauseType.CONSTRAINT,
        priority: 82,
        applicableEventTypes: ['recruiting.application_approved'],
        condition: 'payload.slotRequirement !== undefined && payload.applicantSkills?.includes(payload.slotRequirement)',
        signals: {
          [RecruitingSignal.SKILL_MATCH]: 0.85,
          [RecruitingSignal.ROLE_BALANCE]: 0.8,
        },
        reason: '岗位需求',
        reasonCodes: ['SLOT_REQUIREMENT'],
      },

      // 团队平衡
      {
        id: 'team_balance',
        causeType: DecisionCauseType.USER_ACTION,
        priority: 78,
        applicableEventTypes: ['recruiting.application_approved'],
        condition: 'payload.teamBalance?.genderBalance > 0.6 || payload.teamBalance?.ageBalance > 0.6 || payload.teamBalance?.roleBalance > 0.6',
        signals: {
          [RecruitingSignal.GENDER_BALANCE]: 0.8,
          [RecruitingSignal.AGE_BALANCE]: 0.8,
          [RecruitingSignal.ROLE_BALANCE]: 0.8,
        },
        reason: '团队平衡',
        reasonCodes: ['TEAM_BALANCE'],
      },

      // 过往合作
      {
        id: 'past_collaboration',
        causeType: DecisionCauseType.USER_ACTION,
        priority: 92,
        applicableEventTypes: ['recruiting.application_approved'],
        condition: 'payload.pastCollaboration === true',
        signals: {
          [RecruitingSignal.PAST_COLLABORATION]: 0.95,
        },
        reason: '过往合作',
        reasonCodes: ['PAST_COLLABORATION'],
      },

      // 治理规则
      {
        id: 'governance_block',
        causeType: DecisionCauseType.GOVERNANCE,
        priority: 95,
        applicableEventTypes: ['recruiting.application_rejected'],
        condition: 'payload.governanceFlags?.includes("blacklisted") || payload.governanceFlags?.includes("suspended")',
        signals: {},
        reason: '治理规则',
        reasonCodes: ['GOVERNANCE_BLOCK'],
      },
    ];

    this.logger.log(`Initialized ${this.rules.length} recruiting attribution rules`);
  }
}
