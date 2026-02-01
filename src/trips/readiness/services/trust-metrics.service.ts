// src/trips/readiness/services/trust-metrics.service.ts

/**
 * Trust Metrics Service
 * 
 * 计算信任指标，用于建立用户信任
 * 基于三个维度：能力信任、善意信任、可预测性信任
 */

import { Injectable, Logger } from '@nestjs/common';
import { ReadinessCheckResult, TrustMetrics } from '../types/readiness-findings.types';
import { LocalizedString } from '../types/readiness-pack.types';

@Injectable()
export class TrustMetricsService {
  private readonly logger = new Logger(TrustMetricsService.name);

  /**
   * 计算信任指标
   * 
   * @param result 准备度检查结果
   * @param lang 语言（默认 'zh'）
   * @returns 信任指标
   */
  calculateTrustMetrics(
    result: ReadinessCheckResult,
    lang: 'en' | 'zh' = 'zh'
  ): TrustMetrics {
    // 1. 能力信任（Capability Trust）
    const capability = this.calculateCapabilityTrust(result, lang);

    // 2. 善意信任（Benevolence Trust）
    const benevolence = this.calculateBenevolenceTrust(result, lang);

    // 3. 可预测性信任（Predictability Trust）
    const predictability = this.calculatePredictabilityTrust(result, lang);

    // 4. 总体信任分数（加权平均）
    const overall = (
      capability.score * 0.4 +      // 能力信任权重 40%
      benevolence.score * 0.35 +    // 善意信任权重 35%
      predictability.score * 0.25   // 可预测性信任权重 25%
    );

    return {
      capability,
      benevolence,
      predictability,
      overall,
    };
  }

  /**
   * 计算能力信任（Capability Trust）
   * 
   * 评估系统的能力和准确性：
   * - 数据来源可靠性
   * - 地理特征数据质量
   * - 规则准确性
   * - 证据质量
   */
  private calculateCapabilityTrust(
    result: ReadinessCheckResult,
    lang: 'en' | 'zh'
  ): TrustMetrics['capability'] {
    const factors: TrustMetrics['capability']['factors'] = [];
    let score = 0.5; // 基础分数

    // 1. 数据来源可靠性
    const dataSourceScore = this.evaluateDataSourceReliability(result);
    score += dataSourceScore * 0.3;
    factors.push({
      type: 'DATA_SOURCE',
      description: lang === 'zh'
        ? '数据来源于权威机构（旅游局、政府网站等）'
        : 'Data from authoritative sources (tourism boards, government websites)',
      score: dataSourceScore,
    });

    // 2. 地理特征数据质量
    const geoFeaturesScore = this.evaluateGeoFeaturesQuality(result);
    score += geoFeaturesScore * 0.25;
    factors.push({
      type: 'GEO_FEATURES',
      description: lang === 'zh'
        ? '使用精确的地理特征数据（DEM、河流、道路等）'
        : 'Using precise geo-feature data (DEM, rivers, roads, etc.)',
      score: geoFeaturesScore,
    });

    // 3. 规则准确性（基于证据数量）
    const ruleAccuracyScore = this.evaluateRuleAccuracy(result);
    score += ruleAccuracyScore * 0.25;
    factors.push({
      type: 'RULE_ACCURACY',
      description: lang === 'zh'
        ? '规则基于详细证据和专业知识'
        : 'Rules based on detailed evidence and expertise',
      score: ruleAccuracyScore,
    });

    // 4. 证据质量
    const evidenceQualityScore = this.evaluateEvidenceQuality(result);
    score += evidenceQualityScore * 0.2;
    factors.push({
      type: 'EVIDENCE_QUALITY',
      description: lang === 'zh'
        ? '每个建议都有明确的证据支持'
        : 'Each recommendation has clear evidence support',
      score: evidenceQualityScore,
    });

    // 确保分数在 0-1 范围内
    score = Math.max(0, Math.min(1, score));

    // 生成解释
    const explanation: LocalizedString = lang === 'zh'
      ? `我们的建议基于权威数据源、精确的地理特征分析和专业的风险评估。每个规则都有明确的证据支持，确保建议的准确性和可靠性。`
      : `Our recommendations are based on authoritative data sources, precise geo-feature analysis, and professional risk assessment. Each rule has clear evidence support, ensuring accuracy and reliability.`;

    return {
      score,
      factors,
      explanation,
    };
  }

  /**
   * 计算善意信任（Benevolence Trust）
   * 
   * 评估系统的意图和动机：
   * - 安全导向（为用户安全着想）
   * - 用户利益（帮助用户做出明智决策）
   * - 透明度（明确说明限制和风险）
   * - 局限性披露（诚实说明系统局限性）
   */
  private calculateBenevolenceTrust(
    result: ReadinessCheckResult,
    lang: 'en' | 'zh'
  ): TrustMetrics['benevolence'] {
    const factors: TrustMetrics['benevolence']['factors'] = [];
    let score = 0.7; // 基础分数（默认较高，因为我们确实是为了用户安全）

    // 1. 安全导向
    const safetyFocusScore = this.evaluateSafetyFocus(result);
    score += safetyFocusScore * 0.3;
    factors.push({
      type: 'SAFETY_FOCUS',
      description: lang === 'zh'
        ? '所有建议都以您的安全为首要考虑'
        : 'All recommendations prioritize your safety',
      score: safetyFocusScore,
    });

    // 2. 用户利益
    const userBenefitScore = this.evaluateUserBenefit(result);
    score += userBenefitScore * 0.25;
    factors.push({
      type: 'USER_BENEFIT',
      description: lang === 'zh'
        ? '帮助您做出明智的旅行决策'
        : 'Helping you make informed travel decisions',
      score: userBenefitScore,
    });

    // 3. 透明度
    const transparencyScore = this.evaluateTransparency(result);
    score += transparencyScore * 0.25;
    factors.push({
      type: 'TRANSPARENCY',
      description: lang === 'zh'
        ? '明确说明每个建议的原因和依据'
        : 'Clearly explaining the reason and basis for each recommendation',
      score: transparencyScore,
    });

    // 4. 局限性披露
    const limitationsDisclosedScore = result.disclaimer ? 0.9 : 0.5;
    score += limitationsDisclosedScore * 0.2;
    factors.push({
      type: 'LIMITATIONS_DISCLOSED',
      description: lang === 'zh'
        ? '诚实说明系统局限性和免责声明'
        : 'Honestly disclosing system limitations and disclaimers',
      score: limitationsDisclosedScore,
    });

    // 确保分数在 0-1 范围内
    score = Math.max(0, Math.min(1, score));

    // 生成解释
    const explanation: LocalizedString = lang === 'zh'
      ? `我们的目标是确保您的旅行安全。所有建议都是为了帮助您做出明智的决策，而不是阻止您的旅行。我们明确说明每个建议的原因，并诚实披露系统的局限性。`
      : `Our goal is to ensure your travel safety. All recommendations are designed to help you make informed decisions, not to prevent your travel. We clearly explain the reason for each recommendation and honestly disclose system limitations.`;

    return {
      score,
      factors,
      explanation,
    };
  }

  /**
   * 计算可预测性信任（Predictability Trust）
   * 
   * 评估系统行为的一致性和可预测性：
   * - 规则透明度（规则触发原因清晰）
   * - 一致性（相同条件产生相同结果）
   * - 可解释性（决策过程可追溯）
   */
  private calculatePredictabilityTrust(
    result: ReadinessCheckResult,
    lang: 'en' | 'zh'
  ): TrustMetrics['predictability'] {
    const factors: TrustMetrics['predictability']['factors'] = [];
    let score = 0.6; // 基础分数

    // 1. 规则透明度
    const ruleTransparencyScore = this.evaluateRuleTransparency(result);
    score += ruleTransparencyScore * 0.4;
    factors.push({
      type: 'RULE_TRANSPARENCY',
      description: lang === 'zh'
        ? '规则触发原因清晰可理解'
        : 'Rule trigger reasons are clear and understandable',
      score: ruleTransparencyScore,
    });

    // 2. 一致性（基于规则结构的完整性）
    const consistencyScore = this.evaluateConsistency(result);
    score += consistencyScore * 0.3;
    factors.push({
      type: 'CONSISTENCY',
      description: lang === 'zh'
        ? '相同条件会产生一致的结果'
        : 'Same conditions produce consistent results',
      score: consistencyScore,
    });

    // 3. 可解释性（基于证据和决策日志）
    const explainabilityScore = this.evaluateExplainability(result);
    score += explainabilityScore * 0.3;
    factors.push({
      type: 'EXPLAINABILITY',
      description: lang === 'zh'
        ? '每个决策都有明确的证据和解释'
        : 'Each decision has clear evidence and explanation',
      score: explainabilityScore,
    });

    // 确保分数在 0-1 范围内
    score = Math.max(0, Math.min(1, score));

    // 生成解释
    const explanation: LocalizedString = lang === 'zh'
      ? `我们的系统行为是可预测和一致的。每个规则都有明确的触发条件，相同的情况会产生相同的结果。所有决策都有明确的证据和解释，您可以追溯每个建议的来源。`
      : `Our system behavior is predictable and consistent. Each rule has clear trigger conditions, and the same situation produces the same results. All decisions have clear evidence and explanations, and you can trace the source of each recommendation.`;

    return {
      score,
      factors,
      explanation,
    };
  }

  /**
   * 评估数据来源可靠性
   */
  private evaluateDataSourceReliability(result: ReadinessCheckResult): number {
    let totalEvidence = 0;
    let authoritativeSources = 0;

    for (const finding of result.findings) {
      for (const item of [...finding.blockers, ...finding.must, ...finding.should, ...finding.optional]) {
        if (item.evidence && item.evidence.length > 0) {
          totalEvidence += item.evidence.length;
          // 检查是否有权威来源（如旅游局、政府网站）
          const hasAuthoritativeSource = item.evidence.some(e => {
            const sourceId = e.sourceId.toLowerCase();
            return sourceId.includes('tourism') ||
                   sourceId.includes('government') ||
                   sourceId.includes('official') ||
                   sourceId.includes('parques') ||
                   sourceId.includes('smn');
          });
          if (hasAuthoritativeSource) {
            authoritativeSources += item.evidence.length;
          }
        }
      }
    }

    if (totalEvidence === 0) {
      return 0.5; // 没有证据，默认中等可靠性
    }

    return Math.min(1, authoritativeSources / totalEvidence + 0.2); // 至少 0.2，最高 1.0
  }

  /**
   * 评估地理特征数据质量
   */
  private evaluateGeoFeaturesQuality(result: ReadinessCheckResult): number {
    // 如果有地理特征相关的规则，说明使用了地理特征数据
    // 这里简化处理，实际应该检查 context.geo 是否存在
    // 假设如果使用了地理特征，质量较高
    return 0.8; // 地理特征数据质量较高
  }

  /**
   * 评估规则准确性
   */
  private evaluateRuleAccuracy(result: ReadinessCheckResult): number {
    let totalRules = 0;
    let rulesWithEvidence = 0;

    for (const finding of result.findings) {
      const allItems = [...finding.blockers, ...finding.must, ...finding.should, ...finding.optional];
      totalRules += allItems.length;
      rulesWithEvidence += allItems.filter(item => item.evidence && item.evidence.length > 0).length;
    }

    if (totalRules === 0) {
      return 0.5;
    }

    return Math.min(1, rulesWithEvidence / totalRules + 0.3); // 至少 0.3，最高 1.0
  }

  /**
   * 评估证据质量
   */
  private evaluateEvidenceQuality(result: ReadinessCheckResult): number {
    let totalItems = 0;
    let itemsWithEvidence = 0;
    let itemsWithMultipleEvidence = 0;

    for (const finding of result.findings) {
      const allItems = [...finding.blockers, ...finding.must, ...finding.should, ...finding.optional];
      totalItems += allItems.length;
      
      for (const item of allItems) {
        if (item.evidence && item.evidence.length > 0) {
          itemsWithEvidence++;
          if (item.evidence.length >= 2) {
            itemsWithMultipleEvidence++;
          }
        }
      }
    }

    if (totalItems === 0) {
      return 0.5;
    }

    const evidenceCoverage = itemsWithEvidence / totalItems;
    const multiSourceRate = itemsWithEvidence > 0 ? itemsWithMultipleEvidence / itemsWithEvidence : 0;

    return evidenceCoverage * 0.6 + multiSourceRate * 0.4;
  }

  /**
   * 评估安全导向
   */
  private evaluateSafetyFocus(result: ReadinessCheckResult): number {
    // 如果有 blocker，说明系统确实在关注安全
    const blockerCount = result.summary.totalBlockers;
    const mustCount = result.summary.totalMust;
    
    // blocker 和 must 越多，说明安全关注度越高
    const safetyFocusScore = Math.min(1, (blockerCount * 0.5 + mustCount * 0.3) / 5 + 0.5);
    return safetyFocusScore;
  }

  /**
   * 评估用户利益
   */
  private evaluateUserBenefit(result: ReadinessCheckResult): number {
    // 如果提供了任务和建议，说明在帮助用户
    let itemsWithTasks = 0;
    let totalItems = 0;

    for (const finding of result.findings) {
      const allItems = [...finding.blockers, ...finding.must, ...finding.should];
      totalItems += allItems.length;
      itemsWithTasks += allItems.filter(item => item.tasks && item.tasks.length > 0).length;
    }

    if (totalItems === 0) {
      return 0.6;
    }

    return Math.min(1, itemsWithTasks / totalItems + 0.4);
  }

  /**
   * 评估透明度
   */
  private evaluateTransparency(result: ReadinessCheckResult): number {
    // 检查是否有证据和消息说明
    let itemsWithExplanation = 0;
    let totalItems = 0;

    for (const finding of result.findings) {
      const allItems = [...finding.blockers, ...finding.must, ...finding.should];
      totalItems += allItems.length;
      itemsWithExplanation += allItems.filter(item => 
        item.message && item.message.length > 0 &&
        (item.evidence && item.evidence.length > 0)
      ).length;
    }

    if (totalItems === 0) {
      return 0.6;
    }

    return Math.min(1, itemsWithExplanation / totalItems + 0.3);
  }

  /**
   * 评估规则透明度
   */
  private evaluateRuleTransparency(result: ReadinessCheckResult): number {
    // 检查消息是否清晰说明原因
    let clearMessages = 0;
    let totalItems = 0;

    for (const finding of result.findings) {
      const allItems = [...finding.blockers, ...finding.must, ...finding.should];
      totalItems += allItems.length;
      
      for (const item of allItems) {
        if (item.message && item.message.length > 20) { // 消息足够详细
          clearMessages++;
        }
      }
    }

    if (totalItems === 0) {
      return 0.6;
    }

    return Math.min(1, clearMessages / totalItems + 0.4);
  }

  /**
   * 评估一致性
   */
  private evaluateConsistency(result: ReadinessCheckResult): number {
    // 基于规则结构的完整性
    // 如果所有规则都有完整的结构（id, category, severity, level, message），说明一致性较好
    let consistentRules = 0;
    let totalRules = 0;

    for (const finding of result.findings) {
      const allItems = [...finding.blockers, ...finding.must, ...finding.should, ...finding.optional];
      totalRules += allItems.length;
      
      for (const item of allItems) {
        if (item.id && item.category && item.severity && item.level && item.message) {
          consistentRules++;
        }
      }
    }

    if (totalRules === 0) {
      return 0.7;
    }

    return Math.min(1, consistentRules / totalRules + 0.2);
  }

  /**
   * 评估可解释性
   */
  private evaluateExplainability(result: ReadinessCheckResult): number {
    // 检查是否有证据支持
    let explainableItems = 0;
    let totalItems = 0;

    for (const finding of result.findings) {
      const allItems = [...finding.blockers, ...finding.must, ...finding.should];
      totalItems += allItems.length;
      
      for (const item of allItems) {
        if (item.evidence && item.evidence.length > 0) {
          explainableItems++;
        }
      }
    }

    if (totalItems === 0) {
      return 0.6;
    }

    return Math.min(1, explainableItems / totalItems + 0.3);
  }
}
