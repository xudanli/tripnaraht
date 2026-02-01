// src/decision-draft/services/decision-explanation.service.ts

/**
 * Decision Explanation Service
 * 
 * 决策解释服务
 * 支持 ToC 模式（轻解释）和 Expert 模式（完整解释）
 */

import { Injectable, Logger } from '@nestjs/common';
import {
  DecisionDraft,
  DecisionStep,
  DecisionExplanation,
  DecisionQualityMetrics,
  StudioExplanation,
} from '../interfaces/decision-draft.interface';
import { EvidenceRef } from '../../agent/interfaces/trip-plan.interface';

/**
 * 解释模式
 */
export type ExplanationMode = 'toc' | 'expert' | 'studio';

/**
 * ToC 模式解释（轻解释）
 */
export interface TocExplanation {
  summary: string; // "我们为你做了 6 个关键判断"
  decision_count: number;
  key_decisions: Array<{
    title: string;
    conclusion: string; // 简短结论
    confidence: number;
    expandable?: boolean; // 是否可展开查看详情
  }>;
}

/**
 * Expert 模式解释（完整解释）
 */
export interface ExpertExplanation {
  decision_steps: DecisionStep[];
  step_drafts: any[]; // TripNARAStepDraft[]
  evidence_chain: any[]; // EvidenceRef[]
  decision_log: any[]; // DecisionLogEntry[]
  three_guardians_review?: {
    abu?: any;
    dr_dre?: any;
    neptune?: any;
  };
  quality_metrics: DecisionQualityMetrics;
}

/**
 * Decision Explanation Service
 */
@Injectable()
export class DecisionExplanationService {
  private readonly logger = new Logger(DecisionExplanationService.name);

  /**
   * 生成决策解释
   */
  async generateExplanation(
    decisionDraft: DecisionDraft,
    mode: ExplanationMode = 'toc',
  ): Promise<TocExplanation | ExpertExplanation | StudioExplanation> {
    this.logger.log(`[DecisionExplanation] 生成决策解释: mode=${mode}`);

    if (mode === 'toc') {
      return this.generateTocExplanation(decisionDraft);
    } else if (mode === 'expert') {
      return this.generateExpertExplanation(decisionDraft);
    } else {
      return await this.generateStudioExplanation(decisionDraft);
    }
  }

  /**
   * 生成 ToC 模式解释（轻解释）
   */
  private generateTocExplanation(decisionDraft: DecisionDraft): TocExplanation {
    const decisionCount = decisionDraft.decision_steps.length;
    const summary = `我们为你做了 ${decisionCount} 个关键判断`;

    // 提取关键决策（按置信度排序，取前 3-5 个）
    const keyDecisions = decisionDraft.decision_steps
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, Math.min(5, decisionCount))
      .map((step) => ({
        title: step.title,
        conclusion: this.extractConclusion(step),
        confidence: step.confidence,
        expandable: true, // 默认可展开
      }));

    return {
      summary,
      decision_count: decisionCount,
      key_decisions: keyDecisions,
    };
  }

  /**
   * 生成 Expert 模式解释（完整解释）
   */
  private generateExpertExplanation(decisionDraft: DecisionDraft): ExpertExplanation {
    // 提取 Step Drafts
    const stepDrafts = decisionDraft.step_draft?.steps || [];

    // 提取证据链（DecisionStep.evidence 已经是 EvidenceRef 格式）
    const evidenceChain: EvidenceRef[] = [];
    decisionDraft.decision_steps.forEach((step) => {
      step.evidence.forEach((ev) => {
        evidenceChain.push(ev); // 直接使用，已经是 EvidenceRef 格式
      });
    });

    // 提取决策日志
    const decisionLog: any[] = [];
    decisionDraft.decision_steps.forEach((step) => {
      step.decision_log.forEach((entry) => {
        decisionLog.push(entry);
      });
    });

    // 提取三人格评审
    const threeGuardiansReview: any = {};
    decisionDraft.decision_steps.forEach((step) => {
      if (step.guardian_review) {
        if (step.guardian_review.abu) {
          threeGuardiansReview.abu = step.guardian_review.abu;
        }
        if (step.guardian_review.dr_dre) {
          threeGuardiansReview.dr_dre = step.guardian_review.dr_dre;
        }
        if (step.guardian_review.neptune) {
          threeGuardiansReview.neptune = step.guardian_review.neptune;
        }
      }
    });

    // 计算质量指标
    const qualityMetrics = this.calculateQualityMetrics(decisionDraft);

    return {
      decision_steps: decisionDraft.decision_steps,
      step_drafts: stepDrafts,
      evidence_chain: evidenceChain,
      decision_log: decisionLog,
      three_guardians_review:
        Object.keys(threeGuardiansReview).length > 0
          ? (threeGuardiansReview as any)
          : undefined,
      quality_metrics: qualityMetrics,
    };
  }

  /**
   * 提取决策结论（简短版本）
   */
  private extractConclusion(decisionStep: DecisionStep): string {
    if (decisionStep.outputs.length === 0) {
      return '待生成';
    }

    // 取第一个输出的值作为结论
    const firstOutput = decisionStep.outputs[0];
    if (typeof firstOutput.value === 'boolean') {
      return firstOutput.value ? '是' : '否';
    }
    if (typeof firstOutput.value === 'string') {
      return firstOutput.value;
    }
    if (typeof firstOutput.value === 'number') {
      return firstOutput.value.toString();
    }

    return JSON.stringify(firstOutput.value);
  }

  /**
   * 计算质量指标
   */
  private calculateQualityMetrics(decisionDraft: DecisionDraft): DecisionQualityMetrics {
    // 1. 证据完整性：计算有证据的决策步骤比例
    const stepsWithEvidence = decisionDraft.decision_steps.filter(
      (step) => step.evidence.length > 0,
    ).length;
    const evidenceCompleteness =
      decisionDraft.decision_steps.length > 0
        ? stepsWithEvidence / decisionDraft.decision_steps.length
        : 0;

    // 2. 决策一致性：计算平均置信度
    const avgConfidence =
      decisionDraft.decision_steps.length > 0
        ? decisionDraft.decision_steps.reduce(
            (sum, step) => sum + step.confidence,
            0,
          ) / decisionDraft.decision_steps.length
        : 0;

    // 3. 用户满意度：基于用户反馈（如果有）
    // TODO: 从数据库或用户反馈系统获取
    const userSatisfaction = 0.85; // 默认值

    // 4. 解释点击率：基于用户行为（如果有）
    // TODO: 从用户行为追踪系统获取
    const explanationClickRate = 0.4; // 默认值

    // 5. 重生成次数：基于版本历史（如果有）
    // TODO: 从版本管理系统获取
    const regenerationCount = 0; // 默认值

    return {
      evidence_completeness: evidenceCompleteness,
      decision_consistency: avgConfidence,
      user_satisfaction: userSatisfaction,
      explanation_click_rate: explanationClickRate,
      regeneration_count: regenerationCount,
    };
  }

  /**
   * 生成单个决策步骤的详细解释
   */
  async generateStepExplanation(
    decisionDraft: DecisionDraft,
    decisionStepId: string,
  ): Promise<DecisionExplanation | null> {
    const decisionStep = decisionDraft.decision_steps.find(
      (step) => step.id === decisionStepId,
    );

    if (!decisionStep) {
      return null;
    }

    // 提取关联的 Step Drafts
    const stepDrafts =
      decisionDraft.step_draft?.steps.filter((step) =>
        decisionStep.step_draft_ids.includes(step.id),
      ) || [];

    // 提取证据链（DecisionStep.evidence 已经是 EvidenceRef 格式）
    const evidenceChain: EvidenceRef[] = decisionStep.evidence.map((ev) => ({
      ...ev,
      // 确保所有必需字段都存在
      evidence_id: ev.evidence_id,
      source: ev.source || ev.source_title || 'unknown',
      last_verified_at: ev.last_verified_at || ev.retrieved_at || new Date().toISOString(),
      confidence: ev.confidence, // EvidenceRef 已有 confidence 字段
    }));

    return {
      decision_step: decisionStep,
      step_drafts: stepDrafts,
      evidence_chain: evidenceChain,
      decision_log: decisionStep.decision_log,
      three_guardians_review: decisionStep.guardian_review as any, // 类型兼容性处理
    };
  }

  /**
   * 生成 Studio 模式解释（完整技术解释）
   */
  private async generateStudioExplanation(decisionDraft: DecisionDraft): Promise<StudioExplanation> {
    // Studio 模式需要返回 DecisionExplanation 格式（单个决策步骤）
    // 这里返回第一个决策步骤的解释，或者创建一个汇总解释
    const firstStep = decisionDraft.decision_steps[0];
    if (!firstStep) {
      throw new Error('决策草案中没有决策步骤');
    }

    // 生成单个步骤的解释
    const stepExplanation = await this.generateStepExplanation(decisionDraft, firstStep.id);
    if (!stepExplanation) {
      throw new Error('无法生成决策步骤解释');
    }

    // 提取 Studio 模式特有信息
    const debugInfo = decisionDraft.debug_info || {};

    // 生成优化建议（基于质量指标）
    const optimizationSuggestions = this.generateOptimizationSuggestions(decisionDraft);

    // 确保返回完整的 StudioExplanation 结构
    const studioExplanation: StudioExplanation = {
      decision_step: stepExplanation.decision_step,
      step_drafts: stepExplanation.step_drafts,
      evidence_chain: stepExplanation.evidence_chain,
      decision_log: stepExplanation.decision_log,
      three_guardians_review: stepExplanation.three_guardians_review,
      llm_calls: debugInfo.llm_calls,
      skill_calls: debugInfo.skill_calls,
      performance_metrics: debugInfo.performance_metrics,
      optimization_suggestions: optimizationSuggestions,
    };

    return studioExplanation;
  }

  /**
   * 生成优化建议
   */
  private generateOptimizationSuggestions(decisionDraft: DecisionDraft): string[] {
    const suggestions: string[] = [];
    const qualityMetrics = this.calculateQualityMetrics(decisionDraft);

    // 基于质量指标生成建议
    if (qualityMetrics.evidence_completeness < 0.8) {
      suggestions.push('建议增加更多证据支持，提高决策的可信度');
    }

    if (qualityMetrics.decision_consistency < 0.85) {
      suggestions.push('部分决策的置信度较低，建议重新评估相关决策');
    }

    if (qualityMetrics.user_satisfaction < 0.75) {
      suggestions.push('用户满意度较低，建议收集用户反馈并优化决策逻辑');
    }

    if (qualityMetrics.explanation_click_rate < 0.4) {
      suggestions.push('解释点击率较低，建议优化解释的可读性和相关性');
    }

    if (qualityMetrics.regeneration_count > 3) {
      suggestions.push('重生成次数较多，建议优化决策生成逻辑，减少不必要的重生成');
    }

    return suggestions;
  }
}