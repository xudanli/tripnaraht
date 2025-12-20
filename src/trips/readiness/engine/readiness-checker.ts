// src/trips/readiness/engine/readiness-checker.ts

/**
 * Readiness Checker - 准备度检查器
 * 
 * 核心服务：评估旅行准备度，输出 Findings
 */

import { Injectable } from '@nestjs/common';
import { ReadinessPack, Rule } from '../types/readiness-pack.types';
import { TripContext } from '../types/trip-context.types';
import { ReadinessFinding, ReadinessFindingItem, ReadinessCheckResult } from '../types/readiness-findings.types';
import { RuleEngine } from './rule-engine';
import { requiresSchengenVisa } from '../types/trip-context.types';

@Injectable()
export class ReadinessChecker {
  private ruleEngine = new RuleEngine();

  /**
   * 检查单个目的地的准备度
   */
  checkDestination(
    pack: ReadinessPack,
    context: TripContext
  ): ReadinessFinding {
    // 增强上下文：添加计算字段
    const enhancedContext = this.enhanceContext(context);

    const blockers: ReadinessFindingItem[] = [];
    const must: ReadinessFindingItem[] = [];
    const should: ReadinessFindingItem[] = [];
    const optional: ReadinessFindingItem[] = [];

    // 评估所有规则
    for (const rule of pack.rules) {
      // 检查规则是否适用
      if (!this.ruleEngine.isRuleApplicable(rule, enhancedContext)) {
        continue;
      }

      // 评估条件
      if (this.ruleEngine.evaluate(rule.when, enhancedContext)) {
        const item = this.ruleToFindingItem(rule);
        
        // 按 level 分类
        if (rule.then.level === 'blocker') {
          blockers.push(item);
        } else if (rule.then.level === 'must') {
          must.push(item);
        } else if (rule.then.level === 'should') {
          should.push(item);
        } else if (rule.then.level === 'optional') {
          optional.push(item);
        }
      }
    }

    // 收集风险信息
    const risks = (pack.hazards || []).map(h => ({
      type: h.type,
      severity: h.severity,
      summary: h.summary,
      mitigations: h.mitigations,
    }));

    // 收集缺失信息
    const missingInfo: string[] = [];
    for (const item of [...blockers, ...must, ...should]) {
      if (item.askUser) {
        missingInfo.push(...item.askUser);
      }
    }

    return {
      destinationId: pack.destinationId,
      packId: pack.packId,
      packVersion: pack.version,
      blockers,
      must,
      should,
      optional,
      risks,
      missingInfo: missingInfo.length > 0 ? missingInfo : undefined,
    };
  }

  /**
   * 检查多个目的地
   */
  checkMultipleDestinations(
    packs: ReadinessPack[],
    context: TripContext
  ): ReadinessCheckResult {
    const findings = packs.map(pack => this.checkDestination(pack, context));

    // 汇总统计
    const summary = {
      totalBlockers: findings.reduce((sum, f) => sum + f.blockers.length, 0),
      totalMust: findings.reduce((sum, f) => sum + f.must.length, 0),
      totalShould: findings.reduce((sum, f) => sum + f.should.length, 0),
      totalOptional: findings.reduce((sum, f) => sum + f.optional.length, 0),
      totalRisks: findings.reduce((sum, f) => sum + f.risks.length, 0),
    };

    return {
      findings,
      summary,
    };
  }

  /**
   * 增强上下文：添加计算字段
   */
  private enhanceContext(context: TripContext): TripContext {
    const enhanced = { ...context };
    
    // 添加 nationalityRequiresSchengen 字段（用于规则判定）
    if (context.traveler.nationality) {
      (enhanced.traveler as any).nationalityRequiresSchengen = 
        requiresSchengenVisa(context.traveler.nationality);
    }

    return enhanced;
  }

  /**
   * 将规则转换为 Finding Item
   */
  private ruleToFindingItem(rule: Rule): ReadinessFindingItem {
    return {
      id: rule.id,
      category: rule.category,
      severity: rule.severity,
      level: rule.then.level,
      message: rule.then.message,
      tasks: rule.then.tasks,
      askUser: rule.then.askUser,
      evidence: rule.evidence?.map(e => ({
        sourceId: e.sourceId,
        sectionId: e.sectionId,
        quote: e.quote,
      })),
    };
  }
}

