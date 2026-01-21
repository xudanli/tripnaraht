// src/agent/training/services/domain-expert-knowledge.service.ts

import { Injectable, Logger } from '@nestjs/common';
import {
  RedLineRule,
  SeasonalRisk,
  EvaluationSetAnnotation,
  AntiPatternCase,
} from '../interfaces/enhancement.interface';
import { randomUUID } from 'crypto';

/**
 * DomainExpertKnowledgeService
 * 
 * 职责：构建红线规则、季节性风险、评测集标注、反例库
 */
@Injectable()
export class DomainExpertKnowledgeService {
  private readonly logger = new Logger(DomainExpertKnowledgeService.name);
  private readonly redLineRules: Map<string, RedLineRule> = new Map();
  private readonly seasonalRisks: Map<string, SeasonalRisk> = new Map();
  private readonly annotations: Map<string, EvaluationSetAnnotation> = new Map();
  private readonly antiPatterns: Map<string, AntiPatternCase> = new Map();

  constructor() {
    this.initializeKnowledge();
  }

  /**
   * 添加红线规则
   */
  addRedLineRule(rule: Omit<RedLineRule, 'rule_id'>): RedLineRule {
    const fullRule: RedLineRule = {
      ...rule,
      rule_id: `rule_${randomUUID()}`,
    };

    this.redLineRules.set(fullRule.rule_id, fullRule);

    this.logger.log(
      `[DomainExpert] 添加红线规则: ruleId=${fullRule.rule_id}, name=${fullRule.name}`,
    );

    return fullRule;
  }

  /**
   * 添加季节性风险
   */
  addSeasonalRisk(risk: Omit<SeasonalRisk, 'risk_id'>): SeasonalRisk {
    const fullRisk: SeasonalRisk = {
      ...risk,
      risk_id: `risk_${randomUUID()}`,
    };

    this.seasonalRisks.set(fullRisk.risk_id, fullRisk);

    this.logger.log(
      `[DomainExpert] 添加季节性风险: riskId=${fullRisk.risk_id}, destination=${fullRisk.destination}`,
    );

    return fullRisk;
  }

  /**
   * 添加评测集标注
   */
  addAnnotation(annotation: Omit<EvaluationSetAnnotation, 'annotation_id'>): EvaluationSetAnnotation {
    const fullAnnotation: EvaluationSetAnnotation = {
      ...annotation,
      annotation_id: `annotation_${randomUUID()}`,
    };

    this.annotations.set(fullAnnotation.annotation_id, fullAnnotation);

    this.logger.log(
      `[DomainExpert] 添加评测集标注: annotationId=${fullAnnotation.annotation_id}`,
    );

    return fullAnnotation;
  }

  /**
   * 添加反例
   */
  addAntiPattern(antiPattern: Omit<AntiPatternCase, 'case_id'>): AntiPatternCase {
    const fullCase: AntiPatternCase = {
      ...antiPattern,
      case_id: `case_${randomUUID()}`,
    };

    this.antiPatterns.set(fullCase.case_id, fullCase);

    this.logger.log(
      `[DomainExpert] 添加反例: caseId=${fullCase.case_id}, incidentType=${fullCase.incident_type}`,
    );

    return fullCase;
  }

  /**
   * 获取红线规则
   */
  getRedLineRules(destination?: string): RedLineRule[] {
    let rules = Array.from(this.redLineRules.values());

    if (destination) {
      rules = rules.filter((r) => r.destination === destination);
    }

    return rules;
  }

  /**
   * 获取季节性风险
   */
  getSeasonalRisks(destination?: string, month?: number): SeasonalRisk[] {
    let risks = Array.from(this.seasonalRisks.values());

    if (destination) {
      risks = risks.filter((r) => r.destination === destination);
    }

    if (month !== undefined) {
      risks = risks.filter((r) => r.risk_months.includes(month));
    }

    return risks;
  }

  /**
   * 初始化知识库
   */
  private initializeKnowledge(): void {
    // 红线规则示例
    this.addRedLineRule({
      name: '冰岛冬季极端天气禁止',
      destination: 'IS',
      condition: 'season === "WINTER" AND weather.wind_speed > 20',
      action: 'BLOCK',
      sev_level: 'SEV-1',
      description: '冰岛冬季极端天气条件下禁止户外活动',
      examples: ['风速超过20m/s的冬季路线'],
    });

    // 季节性风险示例
    this.addSeasonalRisk({
      destination: 'IS',
      risk_months: [11, 12, 1, 2, 3], // 冬季月份
      risk_type: 'WEATHER',
      description: '冰岛冬季极端天气风险',
      mitigation_measures: [
        '检查天气预报',
        '准备应急装备',
        '考虑使用导游服务',
      ],
      sev_level: 'SEV-2',
    });

    // 反例示例
    this.addAntiPattern({
      incident_type: '极端天气事故',
      description: '游客在极端天气条件下被困',
      root_cause: '未充分考虑天气风险',
      pattern: '高风险季节 + 缺乏准备 + 独自旅行',
      prevention_measures: [
        '加强天气风险评估',
        '要求用户确认风险',
        '提供应急方案',
      ],
      related_rules: [],
    });
  }
}
