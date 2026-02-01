// src/trips/readiness/engine/readiness-checker.ts

/**
 * Readiness Checker - 准备度检查器
 * 
 * 核心服务：评估旅行准备度，输出 Findings
 */

import { Injectable, Optional } from '@nestjs/common';
import { ReadinessPack, Rule, SupportedLanguage, UserQuestion, LocalizedString } from '../types/readiness-pack.types';
import { TripContext } from '../types/trip-context.types';
import { ReadinessFinding, ReadinessFindingItem, ReadinessCheckResult, FrontendUserQuestion } from '../types/readiness-findings.types';
import { RuleEngine } from './rule-engine';
import { requiresSchengenVisa } from '../types/trip-context.types';
import { getLocalizedText, getLocalizedTexts } from '../utils/i18n.utils';
import { RiskQuantificationService } from '../services/risk-quantification.service';

@Injectable()
export class ReadinessChecker {
  private ruleEngine = new RuleEngine();

  constructor(
    @Optional() private readonly riskQuantificationService?: RiskQuantificationService
  ) {}

  /**
   * 检查单个目的地的准备度
   * 
   * @param pack - 准备度包
   * @param context - 行程上下文
   * @param lang - 目标语言（默认 'en'）
   */
  checkDestination(
    pack: ReadinessPack,
    context: TripContext,
    lang: SupportedLanguage = 'en'
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

      // 如果规则没有 when 条件，跳过（或根据业务逻辑决定是否触发）
      if (!rule.when) {
        // 如果没有条件，可以选择跳过或默认触发
        // 这里选择跳过，因为通常规则应该有明确的条件
        continue;
      }

      // 评估条件
      if (this.ruleEngine.evaluate(rule.when, enhancedContext)) {
        const item = this.ruleToFindingItem(rule, lang);
        
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

    // 收集风险信息（🆕 关联 Pack 的官方来源）
    const packSources = (pack.sources || []).map(s => ({
      sourceId: s.sourceId,
      authority: s.authority,
      type: s.type,
      title: getLocalizedText(s.title, lang) || s.authority,
      canonicalUrl: s.canonicalUrl,
    }));

    const risks = (pack.hazards || []).map(h => ({
      type: h.type,
      severity: h.severity,
      summary: getLocalizedText(h.summary, lang),
      mitigations: getLocalizedTexts(h.mitigations || [], lang),
      // 🆕 关联 Pack 的官方来源
      sources: packSources,
      // 🆕 风险量化指标（如果服务可用）
      quantification: this.riskQuantificationService
        ? this.riskQuantificationService.quantifyRisk(h.type, h.severity, enhancedContext, lang)
        : undefined,
    }));

    // 收集缺失信息
    const missingInfo: string[] = [];
    for (const item of [...blockers, ...must, ...should]) {
      if (item.askUser) {
        // 🆕 支持两种格式：字符串数组或结构化格式
        if (Array.isArray(item.askUser)) {
          if (item.askUser.length > 0) {
            // 检查第一个元素是否是字符串（旧格式）
            if (typeof item.askUser[0] === 'string') {
              missingInfo.push(...(item.askUser as string[]));
            } else {
              // 结构化格式：提取问题文本
              const questions = item.askUser as FrontendUserQuestion[];
              questions.forEach(q => {
                const text = typeof q.text === 'string' ? q.text : (q.text.zh || q.text.en || '');
                if (text) {
                  missingInfo.push(text);
                }
              });
            }
          }
        }
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
   * 
   * @param packs - 准备度包列表
   * @param context - 行程上下文
   * @param lang - 目标语言（默认 'en'）
   */
  checkMultipleDestinations(
    packs: ReadinessPack[],
    context: TripContext,
    lang: SupportedLanguage = 'en'
  ): ReadinessCheckResult {
    const findings = packs.map(pack => this.checkDestination(pack, context, lang));

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
   * 
   * @param rule - 规则
   * @param lang - 目标语言（默认 'en'）
   */
  private ruleToFindingItem(rule: Rule, lang: SupportedLanguage = 'en'): ReadinessFindingItem {
    return {
      id: rule.id,
      category: rule.category,
      severity: rule.severity,
      level: rule.then.level,
      message: getLocalizedText(rule.then.message, lang),
      tasks: rule.then.tasks?.map(task => ({
        ...task,
        title: getLocalizedText(task.title, lang),
      })),
      askUser: rule.then.askUser ? getLocalizedTexts(rule.then.askUser, lang) : undefined,
      evidence: rule.evidence?.map(e => ({
        sourceId: e.sourceId,
        sectionId: e.sectionId,
        quote: e.quote,
      })),
    };
  }
}

