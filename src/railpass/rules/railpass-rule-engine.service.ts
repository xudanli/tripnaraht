// src/railpass/rules/railpass-rule-engine.service.ts

/**
 * RailPass 规则引擎
 * 
 * 统一的规则引擎结构，支持扩展不同 Pass 类型（Eurail/Interrail/未来 JR Pass 等）
 */

import { Injectable, Logger } from '@nestjs/common';
import {
  RailPassProfile,
  RailSegment,
  ReservationTask,
} from '../interfaces/railpass.interface';

/**
 * 规则严重程度
 */
export type RuleSeverity = 'error' | 'warning' | 'info';

/**
 * 规则效果
 */
export interface RuleEffect {
  /** 对 schedule 的影响类型 */
  type:
    | 'TRAVEL_DAY_CONSUMPTION'  // Travel Day 消耗变化
    | 'BUDGET_IMPACT'            // 预算影响
    | 'HARD_CONSTRAINT'          // 硬约束（不可执行）
    | 'RISK_LEVEL'               // 风险等级
    | 'FALLBACK_REQUIRED';       // 需要备用方案

  /** 具体影响值 */
  value?: number;
  
  /** 风险等级（如果 type 是 RISK_LEVEL） */
  riskLevel?: 'LOW' | 'MEDIUM' | 'HIGH';
  
  /** 备用方案集合（如果 type 是 FALLBACK_REQUIRED） */
  fallbackOptions?: string[];
  
  /** 错误消息（如果 type 是 HARD_CONSTRAINT） */
  errorMessage?: string;
}

/**
 * 规则证据（引用来源）
 */
export interface RuleEvidence {
  /** 规则来源（官方文档、FAQ 等） */
  source: string;
  
  /** 引用链接 */
  reference?: string;
  
  /** 规则版本/更新时间 */
  version?: string;
}

/**
 * 规则定义
 */
export interface RailPassRule {
  /** 规则 ID */
  id: string;
  
  /** 规则名称 */
  name: string;
  
  /** 触发条件（函数：返回 true 表示触发） */
  condition: (args: RuleConditionArgs) => boolean;
  
  /** 规则效果 */
  effect: RuleEffect;
  
  /** 严重程度 */
  severity: RuleSeverity;
  
  /** 证据 */
  evidence: RuleEvidence;
  
  /** 规则描述 */
  description: string;
}

/**
 * 规则条件参数
 */
export interface RuleConditionArgs {
  segment: RailSegment;
  passProfile: RailPassProfile;
  reservationTask?: ReservationTask;
  allSegments?: RailSegment[];
  travelDayResult?: {
    totalDaysUsed: number;
    daysByDate: Record<string, any>;
  };
  isLastDayOfValidity?: boolean;
}

/**
 * 规则评估结果
 */
export interface RuleEvaluationResult {
  /** 触发的规则 */
  triggeredRules: Array<{
    rule: RailPassRule;
    segmentId: string;
    effect: RuleEffect;
    message: string;
  }>;
  
  /** 是否有 error 级别的违规 */
  hasErrors: boolean;
  
  /** 综合风险等级 */
  overallRisk: 'LOW' | 'MEDIUM' | 'HIGH';
}

@Injectable()
export class RailPassRuleEngineService {
  private readonly logger = new Logger(RailPassRuleEngineService.name);
  private readonly rules: RailPassRule[] = [];

  constructor() {
    // 初始化所有规则
    this.initializeRules();
  }

  /**
   * 初始化规则
   */
  private initializeRules() {
    // 1. Pass 覆盖校验规则
    this.rules.push({
      id: 'PASS_COVERAGE_CHECK',
      name: 'Pass 覆盖校验',
      condition: (args) => {
        // 这里需要实际的覆盖列表检查
        // 简化实现：假设所有 segment 都需要检查覆盖
        return args.passProfile.passType === 'GLOBAL';
      },
      effect: {
        type: 'HARD_CONSTRAINT',
        errorMessage: '该线路不在 Pass 覆盖范围内',
      },
      severity: 'error',
      evidence: {
        source: 'Interrail Official Rules',
        reference: 'https://www.interrail.eu/en/plan-your-trip/interrail-passes/interrail-global-pass',
      },
      description: 'Global Pass 覆盖的是一组国家 + 一组合作铁路/轮渡伙伴，但并非所有线路都覆盖。城市地铁/公交/有轨电车通常不包含。',
    });

    // 2. 居住国 outbound/inbound 限制规则（重要：只有 2 次机会，不是额外送的天数）
    this.rules.push({
      id: 'HOME_COUNTRY_OUTBOUND_INBOUND_LIMIT',
      name: 'Interrail 居住国使用限制',
      condition: (args) => {
        if (args.passProfile.passFamily !== 'INTERRAIL') return false;
        if (args.passProfile.passType !== 'GLOBAL') return false;
        // 检查是否是居住国段
        const isResidencyCountrySegment = 
          args.segment.fromCountryCode === args.passProfile.residencyCountry ||
          args.segment.toCountryCode === args.passProfile.residencyCountry;
        if (!isResidencyCountrySegment) return false;
        // 检查是否超出限制（这里简化处理，实际应该统计所有居住国段）
        return false; // 暂时返回 false，实际需要更复杂的逻辑
      },
      effect: {
        type: 'HARD_CONSTRAINT',
        errorMessage: 'Interrail Global Pass 在居住国只能使用 1 个 outbound + 1 个 inbound（共 2 次），且都占用 travel day，不是额外送的天数',
      },
      severity: 'error',
      evidence: {
        source: 'Interrail Official Rules',
        reference: 'https://www.interrail.eu/en/help/faq/pass-validity',
      },
      description: 'Interrail Global Pass 在居住国只能用 1 个 outbound（离境）+ 1 个 inbound（返程），共 2 次机会。它们占用你的 travel day，不是额外送的天数。同一天多次换乘仍算 1 travel day。',
    });

    // 3. 午夜换乘 Travel Day 规则（夜车计日规则）
    this.rules.push({
      id: 'TRAVEL_DAY_MIDNIGHT_TRANSFER',
      name: '夜车计日规则：过午夜换乘需算 2 天',
      condition: (args) => {
        if (args.passProfile.validityType !== 'FLEXI') return false;
        // 夜车且过午夜（假设 crossesMidnight=true 表示过午夜换乘）
        // 注意：实际应该根据具体的列车时刻表判断是否有换乘
        return args.segment.isNightTrain && 
               args.segment.crossesMidnight === true;
      },
      effect: {
        type: 'TRAVEL_DAY_CONSUMPTION',
        value: 2, // 消耗 2 个 travel day（出发日 + 到达日）
      },
      severity: 'warning',
      evidence: {
        source: 'Eurail Official Rules',
      },
      description: '夜车计日规则：不换乘可只算出发日 1 天；过午夜换乘要算 2 天（出发日 + 到达日）',
    });

    // 4. 最后一天夜车规则（重要！）
    this.rules.push({
      id: 'LAST_DAY_NIGHT_TRAIN',
      name: '有效期最后一天不能乘坐跨日夜车',
      condition: (args) => {
        if (!args.isLastDayOfValidity) return false;
        return args.segment.isNightTrain && args.segment.crossesMidnight === true;
      },
      effect: {
        type: 'HARD_CONSTRAINT',
        errorMessage: 'Pass 在有效期最后一天 23:59 过期，不能乘坐需要跨到次日的夜车',
        fallbackOptions: ['SWITCH_TO_DAY_TRAIN', 'MOVE_TO_PREVIOUS_DAY'],
      },
      severity: 'error',
      evidence: {
        source: 'Eurail Official Rules',
      },
      description: 'Pass 在有效期最后一天 23:59 到期，因此不能用来乘坐会跨到次日的夜车（因为 validity 到 23:59 就结束）',
    });

    // 5. 订座硬约束规则
    this.rules.push({
      id: 'RESERVATION_REQUIRED',
      name: '必须订座但未订',
      condition: (args) => {
        // 需要检查 reservation requirement
        // 这里简化处理，实际应该调用 ReservationDecisionEngineService
        if (!args.reservationTask) return false;
        // 假设夜车/高铁必须订座
        const required = args.segment.isNightTrain || args.segment.isHighSpeed;
        return required && args.reservationTask.status !== 'BOOKED';
      },
      effect: {
        type: 'HARD_CONSTRAINT',
        errorMessage: '该段必须订座但尚未订座，无法执行',
        fallbackOptions: ['BOOK_RESERVATION', 'SWITCH_TO_SLOW_TRAIN', 'SHIFT_TIME'],
      },
      severity: 'error',
      evidence: {
        source: 'Eurail Official Rules',
      },
      description: '多数高速列车、以及所有夜车都需要（或强烈建议）订座；夜车订铺位更是硬性。没有订座可能无法上车。',
    });

    // 6. 订座配额风险规则
    this.rules.push({
      id: 'RESERVATION_QUOTA_RISK',
      name: '订座配额紧张风险',
      condition: (args) => {
        // 需要检查配额风险
        // 简化：假设热门线路（如 Eurostar）风险高
        const isHotRoute = args.segment.isInternational && 
          (args.segment.fromCountryCode === 'FR' || args.segment.toCountryCode === 'GB');
        return isHotRoute;
      },
      effect: {
        type: 'RISK_LEVEL',
        riskLevel: 'HIGH',
        fallbackOptions: ['BOOK_EARLY', 'SHIFT_TIME', 'SWITCH_TO_ALTERNATIVE_ROUTE'],
      },
      severity: 'warning',
      evidence: {
        source: 'Eurostar Official Guidelines',
      },
      description: 'Eurostar 等热门线路存在 passholder seat 配额/票价桶机制，确实会出现"有车但 Pass 名额没了"的情况。建议尽早订座（Eurostar 建议尽早订，会放出提前期，但会卖完）',
    });

    // 7. 市内交通不在 Pass 覆盖规则（用于 Transport 层）
    this.rules.push({
      id: 'CITY_TRANSPORT_NOT_COVERED',
      name: '市内交通不在 Pass 覆盖',
      condition: (args) => {
        // 这个规则主要用于提示，不阻止执行
        // 实际应该在 Transport 层处理
        return false; // 不在此处触发，由 Transport 层处理
      },
      effect: {
        type: 'BUDGET_IMPACT',
        value: 0, // 预算影响由 Transport 层计算
      },
      severity: 'info',
      evidence: {
        source: 'Eurail Community',
      },
      description: '城市地铁/公交/有轨电车通常不包含在 Global Pass 内，需要另外预算',
    });
  }

  /**
   * 评估所有规则
   */
  evaluateRules(args: {
    segments: RailSegment[];
    passProfile: RailPassProfile;
    reservationTasks?: ReservationTask[];
    travelDayResult?: {
      totalDaysUsed: number;
      daysByDate: Record<string, any>;
    };
  }): RuleEvaluationResult {
    const triggeredRules: RuleEvaluationResult['triggeredRules'] = [];
    let hasErrors = false;
    let maxRisk: 'LOW' | 'MEDIUM' | 'HIGH' = 'LOW';

    // 检查是否是最后一天
    const validityEndDate = new Date(args.passProfile.validityEndDate);
    
    for (const segment of args.segments) {
      const segmentDate = new Date(segment.departureDate);
      const isLastDayOfValidity = segmentDate.getTime() === validityEndDate.getTime();

      const reservationTask = args.reservationTasks?.find(
        t => t.segmentId === segment.segmentId
      );

      // 评估每个规则
      for (const rule of this.rules) {
        const conditionArgs: RuleConditionArgs = {
          segment,
          passProfile: args.passProfile,
          reservationTask,
          allSegments: args.segments,
          travelDayResult: args.travelDayResult,
          isLastDayOfValidity,
        };

        if (rule.condition(conditionArgs)) {
          triggeredRules.push({
            rule,
            segmentId: segment.segmentId,
            effect: rule.effect,
            message: this.generateRuleMessage(rule, segment),
          });

          if (rule.severity === 'error') {
            hasErrors = true;
          }

          if (rule.effect.type === 'RISK_LEVEL' && rule.effect.riskLevel) {
            const riskOrder = { LOW: 0, MEDIUM: 1, HIGH: 2 };
            if (riskOrder[rule.effect.riskLevel] > riskOrder[maxRisk]) {
              maxRisk = rule.effect.riskLevel;
            }
          }
        }
      }
    }

    return {
      triggeredRules,
      hasErrors,
      overallRisk: hasErrors ? 'HIGH' : maxRisk,
    };
  }

  /**
   * 生成规则消息
   */
  private generateRuleMessage(rule: RailPassRule, segment: RailSegment): string {
    if (rule.effect.errorMessage) {
      return rule.effect.errorMessage;
    }

    switch (rule.effect.type) {
      case 'TRAVEL_DAY_CONSUMPTION':
        return `该段将消耗 ${rule.effect.value} 个 Travel Day`;
      
      case 'RISK_LEVEL':
        return `风险等级：${rule.effect.riskLevel}`;
      
      case 'FALLBACK_REQUIRED':
        return `需要备用方案：${rule.effect.fallbackOptions?.join(', ')}`;
      
      default:
        return rule.description;
    }
  }

  /**
   * 获取所有规则
   */
  getAllRules(): RailPassRule[] {
    return [...this.rules];
  }

  /**
   * 根据规则 ID 获取规则
   */
  getRuleById(ruleId: string): RailPassRule | undefined {
    return this.rules.find(r => r.id === ruleId);
  }
}
