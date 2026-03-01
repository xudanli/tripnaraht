/**
 * 决策可解释性服务
 *
 * P3.1 优化：生成人类可读的决策解释
 *
 * 功能：
 * - 解释为什么选择某个方案
 * - 分析关键决策因素
 * - 生成权衡说明
 * - 支持多语言输出
 */

import { Injectable, Logger } from '@nestjs/common';
import type { DecisionState } from '../../../../decision/kernel/decision-state.types';
import { ObjectiveFunctionWeights } from '../objective-function.interface';

export interface DecisionExplanation {
  summary: string;
  confidence: number;
  keyFactors: KeyFactor[];
  tradeoffs: Tradeoff[];
  constraints: ConstraintExplanation[];
  alternatives: AlternativeExplanation[];
  riskAssessment: RiskExplanation;
  recommendation: RecommendationExplanation;
  metadata: ExplanationMetadata;
}

export interface KeyFactor {
  name: string;
  importance: number;
  value: number;
  contribution: number;
  description: string;
  icon?: string;
}

export interface Tradeoff {
  dimension1: string;
  dimension2: string;
  ratio: number;
  explanation: string;
  recommendation: string;
}

export interface ConstraintExplanation {
  name: string;
  type: 'hard' | 'soft';
  status: 'satisfied' | 'violated' | 'marginal';
  degree: number;
  explanation: string;
  impact: string;
}

export interface AlternativeExplanation {
  id: string;
  rank: number;
  utilityDifference: number;
  whyNotChosen: string[];
  advantages: string[];
  disadvantages: string[];
}

export interface RiskExplanation {
  overallLevel: 'low' | 'medium' | 'high';
  score: number;
  factors: Array<{
    name: string;
    level: 'low' | 'medium' | 'high';
    probability: number;
    impact: string;
    mitigation?: string;
  }>;
  summary: string;
}

export interface RecommendationExplanation {
  action: string;
  confidence: number;
  reasoning: string[];
  caveats: string[];
  nextSteps: string[];
}

export interface ExplanationMetadata {
  generatedAt: string;
  modelVersion: string;
  language: string;
  detailLevel: 'brief' | 'standard' | 'detailed';
  processingTimeMs: number;
}

export interface ExplainerConfig {
  language: 'zh' | 'en';
  detailLevel: 'brief' | 'standard' | 'detailed';
  includeAlternatives: boolean;
  maxAlternatives: number;
  includeTradeoffs: boolean;
  includeRiskAssessment: boolean;
}

const DEFAULT_CONFIG: ExplainerConfig = {
  language: 'zh',
  detailLevel: 'standard',
  includeAlternatives: true,
  maxAlternatives: 3,
  includeTradeoffs: true,
  includeRiskAssessment: true,
};

const DIMENSION_LABELS: Record<string, Record<string, string>> = {
  zh: {
    safety: '安全性',
    experienceDensity: '体验密度',
    philosophyAlignment: '理念匹配',
    timeSlack: '时间余量',
    fatigueRisk: '疲劳风险',
    weatherRisk: '天气风险',
    budgetOverrun: '预算超支',
    pacingVariance: '节奏波动',
  },
  en: {
    safety: 'Safety',
    experienceDensity: 'Experience Density',
    philosophyAlignment: 'Philosophy Alignment',
    timeSlack: 'Time Slack',
    fatigueRisk: 'Fatigue Risk',
    weatherRisk: 'Weather Risk',
    budgetOverrun: 'Budget Overrun',
    pacingVariance: 'Pacing Variance',
  },
};

@Injectable()
export class DecisionExplainerService {
  private readonly logger = new Logger(DecisionExplainerService.name);
  private config: ExplainerConfig = DEFAULT_CONFIG;

  configure(config: Partial<ExplainerConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * 生成完整的决策解释
   */
  explain(
    state: DecisionState,
    weights: ObjectiveFunctionWeights,
    candidates: Array<{ id: string; utility: number; dimensions: Record<string, number> }>,
    selectedId: string,
  ): DecisionExplanation {
    const startTime = Date.now();
    const lang = this.config.language;

    const selected = candidates.find((c) => c.id === selectedId);
    if (!selected) {
      throw new Error(`Selected candidate ${selectedId} not found`);
    }

    const keyFactors = this.analyzeKeyFactors(selected, weights, lang);
    const tradeoffs = this.config.includeTradeoffs
      ? this.analyzeTradeoffs(selected, weights, lang)
      : [];
    const constraints = this.explainConstraints(state, lang);
    const alternatives = this.config.includeAlternatives
      ? this.explainAlternatives(candidates, selectedId, lang)
      : [];
    const riskAssessment = this.config.includeRiskAssessment
      ? this.assessRisk(state, selected, lang)
      : this.createDefaultRiskAssessment(lang);
    const recommendation = this.generateRecommendation(state, selected, keyFactors, lang);
    const summary = this.generateSummary(selected, keyFactors, constraints, lang);

    return {
      summary,
      confidence: state.confidence ?? 0.8,
      keyFactors,
      tradeoffs,
      constraints,
      alternatives,
      riskAssessment,
      recommendation,
      metadata: {
        generatedAt: new Date().toISOString(),
        modelVersion: '2.7',
        language: lang,
        detailLevel: this.config.detailLevel,
        processingTimeMs: Date.now() - startTime,
      },
    };
  }

  /**
   * 生成简短摘要
   */
  generateBriefSummary(
    state: DecisionState,
    utility: number,
    topFactors: string[],
  ): string {
    const lang = this.config.language;

    if (lang === 'zh') {
      return `推荐方案综合评分 ${(utility * 100).toFixed(0)} 分，` +
        `主要优势：${topFactors.slice(0, 3).join('、')}。` +
        `置信度 ${((state.confidence ?? 0.8) * 100).toFixed(0)}%。`;
    }

    return `Recommended plan scored ${(utility * 100).toFixed(0)} points. ` +
      `Key strengths: ${topFactors.slice(0, 3).join(', ')}. ` +
      `Confidence: ${((state.confidence ?? 0.8) * 100).toFixed(0)}%.`;
  }

  /**
   * 解释单个约束
   */
  explainConstraint(
    name: string,
    type: 'hard' | 'soft',
    satisfied: boolean,
    degree: number,
  ): ConstraintExplanation {
    const lang = this.config.language;
    const status = satisfied ? 'satisfied' : degree < 0.5 ? 'marginal' : 'violated';

    const templates = {
      zh: {
        satisfied: `${name} 约束已满足`,
        marginal: `${name} 约束接近边界（违反度 ${(degree * 100).toFixed(0)}%）`,
        violated: `${name} 约束已违反（违反度 ${(degree * 100).toFixed(0)}%）`,
      },
      en: {
        satisfied: `${name} constraint is satisfied`,
        marginal: `${name} constraint is marginal (${(degree * 100).toFixed(0)}% violation)`,
        violated: `${name} constraint is violated (${(degree * 100).toFixed(0)}% violation)`,
      },
    };

    const impactTemplates = {
      zh: {
        hard: '这是硬约束，违反将导致方案不可行',
        soft: '这是软约束，违反会降低方案评分',
      },
      en: {
        hard: 'This is a hard constraint - violation makes the plan infeasible',
        soft: 'This is a soft constraint - violation reduces the plan score',
      },
    };

    return {
      name,
      type,
      status,
      degree,
      explanation: templates[lang][status],
      impact: impactTemplates[lang][type],
    };
  }

  /**
   * 生成自然语言解释
   */
  generateNaturalLanguageExplanation(explanation: DecisionExplanation): string {
    const lang = explanation.metadata.language as 'zh' | 'en';
    const parts: string[] = [];

    parts.push(explanation.summary);

    if (explanation.keyFactors.length > 0) {
      const factorNames = explanation.keyFactors
        .slice(0, 3)
        .map((f) => f.name)
        .join(lang === 'zh' ? '、' : ', ');

      parts.push(
        lang === 'zh'
          ? `关键决策因素包括：${factorNames}。`
          : `Key decision factors include: ${factorNames}.`,
      );
    }

    if (explanation.constraints.some((c) => c.status !== 'satisfied')) {
      const issues = explanation.constraints
        .filter((c) => c.status !== 'satisfied')
        .map((c) => c.name);

      parts.push(
        lang === 'zh'
          ? `需要注意以下约束：${issues.join('、')}。`
          : `Please note the following constraints: ${issues.join(', ')}.`,
      );
    }

    if (explanation.riskAssessment.overallLevel !== 'low') {
      parts.push(
        lang === 'zh'
          ? `风险评估：${explanation.riskAssessment.summary}`
          : `Risk assessment: ${explanation.riskAssessment.summary}`,
      );
    }

    parts.push(explanation.recommendation.reasoning[0] || '');

    return parts.filter(Boolean).join('\n\n');
  }

  // ========== 私有方法 ==========

  private analyzeKeyFactors(
    candidate: { utility: number; dimensions: Record<string, number> },
    weights: ObjectiveFunctionWeights,
    lang: 'zh' | 'en',
  ): KeyFactor[] {
    const factors: KeyFactor[] = [];
    const labels = DIMENSION_LABELS[lang];

    const weightMap: Record<string, number> = {
      safety: weights.safety,
      experienceDensity: weights.experienceDensity,
      philosophyAlignment: weights.philosophyAlignment,
      timeSlack: weights.timeSlack,
      fatigueRisk: weights.fatigueRisk,
      weatherRisk: weights.weatherRisk,
      budgetOverrun: weights.budgetOverrun,
      pacingVariance: weights.pacingVariance,
    };

    for (const [key, weight] of Object.entries(weightMap)) {
      const value = candidate.dimensions[key] ?? 0.5;
      const contribution = weight * value;
      const isNegative = ['fatigueRisk', 'weatherRisk', 'budgetOverrun', 'pacingVariance'].includes(key);

      factors.push({
        name: labels[key] || key,
        importance: weight,
        value,
        contribution: isNegative ? -contribution : contribution,
        description: this.getFactorDescription(key, value, lang),
        icon: this.getFactorIcon(key),
      });
    }

    return factors
      .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
      .slice(0, this.config.detailLevel === 'brief' ? 3 : 8);
  }

  private getFactorDescription(key: string, value: number, lang: 'zh' | 'en'): string {
    const level = value > 0.7 ? 'high' : value > 0.4 ? 'medium' : 'low';

    const descriptions: Record<string, Record<string, Record<string, string>>> = {
      zh: {
        safety: { high: '安全保障充分', medium: '安全水平适中', low: '安全性需要关注' },
        experienceDensity: { high: '体验丰富', medium: '体验适中', low: '体验较为单一' },
        fatigueRisk: { high: '疲劳风险较高', medium: '疲劳风险可控', low: '疲劳风险较低' },
        weatherRisk: { high: '天气风险较高', medium: '天气风险中等', low: '天气条件良好' },
      },
      en: {
        safety: { high: 'High safety level', medium: 'Moderate safety', low: 'Safety needs attention' },
        experienceDensity: { high: 'Rich experience', medium: 'Moderate experience', low: 'Limited experience' },
        fatigueRisk: { high: 'High fatigue risk', medium: 'Manageable fatigue', low: 'Low fatigue risk' },
        weatherRisk: { high: 'High weather risk', medium: 'Moderate weather risk', low: 'Good weather conditions' },
      },
    };

    return descriptions[lang]?.[key]?.[level] || `${key}: ${(value * 100).toFixed(0)}%`;
  }

  private getFactorIcon(key: string): string {
    const icons: Record<string, string> = {
      safety: '🛡️',
      experienceDensity: '⭐',
      philosophyAlignment: '🎯',
      timeSlack: '⏰',
      fatigueRisk: '😓',
      weatherRisk: '🌧️',
      budgetOverrun: '💰',
      pacingVariance: '📊',
    };
    return icons[key] || '📌';
  }

  private analyzeTradeoffs(
    candidate: { dimensions: Record<string, number> },
    weights: ObjectiveFunctionWeights,
    lang: 'zh' | 'en',
  ): Tradeoff[] {
    const tradeoffs: Tradeoff[] = [];

    const safetyVal = candidate.dimensions['safety'] ?? 0.5;
    const experienceVal = candidate.dimensions['experienceDensity'] ?? 0.5;

    if (Math.abs(safetyVal - experienceVal) > 0.2) {
      tradeoffs.push({
        dimension1: DIMENSION_LABELS[lang]['safety'],
        dimension2: DIMENSION_LABELS[lang]['experienceDensity'],
        ratio: safetyVal / (experienceVal || 0.01),
        explanation: lang === 'zh'
          ? `当前方案在安全性和体验密度之间做出了权衡`
          : `Current plan trades off between safety and experience density`,
        recommendation: safetyVal > experienceVal
          ? (lang === 'zh' ? '方案偏向安全保守' : 'Plan favors safety')
          : (lang === 'zh' ? '方案偏向丰富体验' : 'Plan favors rich experience'),
      });
    }

    const timeSlack = candidate.dimensions['timeSlack'] ?? 0.5;
    const fatigueRisk = candidate.dimensions['fatigueRisk'] ?? 0.5;

    if (timeSlack < 0.4 && fatigueRisk > 0.5) {
      tradeoffs.push({
        dimension1: DIMENSION_LABELS[lang]['timeSlack'],
        dimension2: DIMENSION_LABELS[lang]['fatigueRisk'],
        ratio: timeSlack / (fatigueRisk || 0.01),
        explanation: lang === 'zh'
          ? `行程较紧凑，可能增加疲劳`
          : `Tight schedule may increase fatigue`,
        recommendation: lang === 'zh'
          ? '建议增加休息时间或减少景点'
          : 'Consider adding rest time or reducing stops',
      });
    }

    return tradeoffs;
  }

  private explainConstraints(state: DecisionState, lang: 'zh' | 'en'): ConstraintExplanation[] {
    const explanations: ConstraintExplanation[] = [];
    const constraints = state.constraints;

    if (!constraints?.violations) {
      return [{
        name: lang === 'zh' ? '所有约束' : 'All constraints',
        type: 'hard',
        status: 'satisfied',
        degree: 0,
        explanation: lang === 'zh' ? '所有约束条件均已满足' : 'All constraints are satisfied',
        impact: '',
      }];
    }

    for (const violation of constraints.violations) {
      explanations.push(this.explainConstraint(
        violation.constraint,
        violation.severity === 'HARD' ? 'hard' : 'soft',
        violation.degree === 0,
        violation.degree,
      ));
    }

    return explanations;
  }

  private explainAlternatives(
    candidates: Array<{ id: string; utility: number; dimensions: Record<string, number> }>,
    selectedId: string,
    lang: 'zh' | 'en',
  ): AlternativeExplanation[] {
    const selected = candidates.find((c) => c.id === selectedId);
    if (!selected) return [];

    const alternatives = candidates
      .filter((c) => c.id !== selectedId)
      .sort((a, b) => b.utility - a.utility)
      .slice(0, this.config.maxAlternatives);

    return alternatives.map((alt, idx) => {
      const diff = selected.utility - alt.utility;
      const advantages: string[] = [];
      const disadvantages: string[] = [];
      const whyNotChosen: string[] = [];

      for (const [key, value] of Object.entries(alt.dimensions)) {
        const selectedValue = selected.dimensions[key] ?? 0.5;
        const label = DIMENSION_LABELS[lang][key] || key;

        if (value > selectedValue + 0.1) {
          advantages.push(`${label} ${lang === 'zh' ? '更好' : 'better'}`);
        } else if (value < selectedValue - 0.1) {
          disadvantages.push(`${label} ${lang === 'zh' ? '较弱' : 'weaker'}`);
        }
      }

      if (disadvantages.length > advantages.length) {
        whyNotChosen.push(
          lang === 'zh'
            ? `整体评分较低（差 ${(diff * 100).toFixed(0)} 分）`
            : `Lower overall score (${(diff * 100).toFixed(0)} points less)`,
        );
      }

      if (disadvantages.length > 0) {
        whyNotChosen.push(
          lang === 'zh'
            ? `在 ${disadvantages.slice(0, 2).join('、')} 方面表现不足`
            : `Underperforms in ${disadvantages.slice(0, 2).join(', ')}`,
        );
      }

      return {
        id: alt.id,
        rank: idx + 2,
        utilityDifference: diff,
        whyNotChosen,
        advantages,
        disadvantages,
      };
    });
  }

  private assessRisk(
    state: DecisionState,
    candidate: { dimensions: Record<string, number> },
    lang: 'zh' | 'en',
  ): RiskExplanation {
    const factors: RiskExplanation['factors'] = [];

    const weatherRisk = candidate.dimensions['weatherRisk'] ?? 0;
    if (weatherRisk > 0.3) {
      factors.push({
        name: lang === 'zh' ? '天气风险' : 'Weather Risk',
        level: weatherRisk > 0.6 ? 'high' : 'medium',
        probability: weatherRisk,
        impact: lang === 'zh' ? '可能影响行程安排' : 'May affect schedule',
        mitigation: lang === 'zh' ? '建议关注天气预报，准备备选方案' : 'Monitor forecast, prepare alternatives',
      });
    }

    const fatigueRisk = candidate.dimensions['fatigueRisk'] ?? 0;
    if (fatigueRisk > 0.3) {
      factors.push({
        name: lang === 'zh' ? '疲劳风险' : 'Fatigue Risk',
        level: fatigueRisk > 0.6 ? 'high' : 'medium',
        probability: fatigueRisk,
        impact: lang === 'zh' ? '可能影响体验质量' : 'May affect experience quality',
        mitigation: lang === 'zh' ? '建议增加休息时间' : 'Consider adding rest time',
      });
    }

    const overallScore = factors.reduce((sum, f) => sum + f.probability, 0) / Math.max(factors.length, 1);
    const overallLevel: 'low' | 'medium' | 'high' = overallScore > 0.5 ? 'high' : overallScore > 0.3 ? 'medium' : 'low';

    return {
      overallLevel,
      score: overallScore,
      factors,
      summary: lang === 'zh'
        ? `整体风险${overallLevel === 'low' ? '较低' : overallLevel === 'medium' ? '中等' : '较高'}，${factors.length > 0 ? `主要关注 ${factors[0]?.name}` : '无明显风险点'}`
        : `Overall risk is ${overallLevel}. ${factors.length > 0 ? `Main concern: ${factors[0]?.name}` : 'No significant risks'}`,
    };
  }

  private createDefaultRiskAssessment(lang: 'zh' | 'en'): RiskExplanation {
    return {
      overallLevel: 'low',
      score: 0.2,
      factors: [],
      summary: lang === 'zh' ? '整体风险较低' : 'Overall risk is low',
    };
  }

  private generateRecommendation(
    state: DecisionState,
    candidate: { utility: number; dimensions: Record<string, number> },
    keyFactors: KeyFactor[],
    lang: 'zh' | 'en',
  ): RecommendationExplanation {
    const confidence = state.confidence ?? 0.8;
    const topFactors = keyFactors.slice(0, 3).map((f) => f.name);

    const reasoning = [
      lang === 'zh'
        ? `该方案在 ${topFactors.join('、')} 方面表现突出`
        : `This plan excels in ${topFactors.join(', ')}`,
      lang === 'zh'
        ? `综合评分 ${(candidate.utility * 100).toFixed(0)} 分，为当前最优选择`
        : `Overall score of ${(candidate.utility * 100).toFixed(0)}, the best current option`,
    ];

    const caveats: string[] = [];
    if (candidate.dimensions['fatigueRisk'] > 0.5) {
      caveats.push(lang === 'zh' ? '注意行程强度，适当休息' : 'Mind the intensity, take adequate rest');
    }
    if (candidate.dimensions['weatherRisk'] > 0.5) {
      caveats.push(lang === 'zh' ? '关注天气变化，灵活调整' : 'Monitor weather, be flexible');
    }

    const nextSteps = [
      lang === 'zh' ? '确认行程细节' : 'Confirm itinerary details',
      lang === 'zh' ? '预订必要资源' : 'Book necessary resources',
      lang === 'zh' ? '准备应急方案' : 'Prepare contingency plans',
    ];

    return {
      action: lang === 'zh' ? '推荐执行此方案' : 'Recommend proceeding with this plan',
      confidence,
      reasoning,
      caveats,
      nextSteps,
    };
  }

  private generateSummary(
    candidate: { utility: number; dimensions: Record<string, number> },
    keyFactors: KeyFactor[],
    constraints: ConstraintExplanation[],
    lang: 'zh' | 'en',
  ): string {
    const score = (candidate.utility * 100).toFixed(0);
    const topFactor = keyFactors[0]?.name || '';
    const hasIssues = constraints.some((c) => c.status !== 'satisfied');

    if (lang === 'zh') {
      let summary = `推荐方案综合评分 ${score} 分`;
      if (topFactor) {
        summary += `，${topFactor}表现优异`;
      }
      if (hasIssues) {
        summary += `，部分约束需要关注`;
      }
      return summary + '。';
    }

    let summary = `Recommended plan scores ${score} points`;
    if (topFactor) {
      summary += `, excelling in ${topFactor}`;
    }
    if (hasIssues) {
      summary += `, with some constraints to note`;
    }
    return summary + '.';
  }
}
