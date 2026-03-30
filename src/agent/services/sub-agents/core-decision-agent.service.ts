// src/agent/services/sub-agents/core-decision-agent.service.ts

import { Injectable, Logger, Optional } from '@nestjs/common';
import { CoreDecisionAgent } from '../../interfaces/sub-agent.interface';
import { TripPlanRequest, OrchestratorState, Itinerary } from '../../interfaces/trip-plan.interface';
import { ToTEvaluatorService } from '../../../trips/decision/tot/tot-evaluator.service';
import { RankingService } from '../../../planning-policy/services/ranking.service';
import {
  DecisionNode,
  DecisionOption,
  DecisionOutput,
  TradeoffDimension,
  TradeoffModel,
  UncertaintyProfile,
  ComparisonMatrix,
} from '../../interfaces/decision-node.interface';

/**
 * CoreDecision Agent Service (Dr.Dre - Claude Orchestration)
 * 
 * AI-Native 决策系统的核心权衡 Agent
 * 
 * 职责：
 * - 多候选方案权衡（Trade-off 四象限：时间/成本/体验/风险）
 * - 不确定性作为一等公民
 * - 生成可解释的决策理由
 * - 识别需要用户判断的点
 * 
 * 核心理念：
 * - 不是"推荐最好的"，而是"解释每个选择的代价"
 * - 输出多个候选方案 + 风险分布
 * - 用户是"裁判"，不是"输入者"
 */
@Injectable()
export class ClaudeCoreDecisionAgentService implements CoreDecisionAgent {
  private readonly logger = new Logger(ClaudeCoreDecisionAgentService.name);

  // Trade-off 默认权重
  private readonly DEFAULT_WEIGHTS: Record<TradeoffDimension, number> = {
    TIME: 0.25,
    COST: 0.25,
    EXPERIENCE: 0.30,
    RISK: 0.20,
  };

  constructor(
    @Optional() private readonly totEvaluator?: ToTEvaluatorService,
    @Optional() private readonly rankingService?: RankingService,
  ) {
    this.logger.log(`[CoreDecision/Dr.Dre] Initialized`);
  }

  /**
   * 权衡多个候选方案并做出最终决策
   */
  async makeDecision(
    candidates: Array<{
      itinerary: Itinerary;
      score: number;
      pros: string[];
      cons: string[];
      evidence_refs: string[];
    }>,
    request: TripPlanRequest,
    _context: OrchestratorState,
  ): Promise<{
    selected_itinerary: Itinerary;
    decision_reasoning: string;
    rejected_candidates: Array<{
      itinerary_id: string;
      reason: string;
    }>;
  }> {
    this.logger.debug(`[ClaudeCoreDecisionAgent] 权衡候选方案: request_id=${request.request_id}, 候选数量=${candidates.length}`);

    try {
      if (candidates.length === 0) {
        throw new Error('没有候选方案可供选择');
      }

      // 1. 按分数排序
      const sortedCandidates = [...candidates].sort((a, b) => b.score - a.score);

      // 2. 选择最高分的方案
      const selected = sortedCandidates[0];

      // 3. 生成决策理由
      const decision_reasoning = this.generateDecisionReasoning(selected, sortedCandidates, request);

      // 4. 生成被拒绝的候选方案说明
      const rejected_candidates = sortedCandidates.slice(1).map((candidate, index) => ({
        itinerary_id: candidate.itinerary.request_id || `candidate_${index + 1}`,
        reason: `得分较低（${candidate.score.toFixed(2)} vs ${selected.score.toFixed(2)}）`,
      }));

      this.logger.log(`[ClaudeCoreDecisionAgent] 选择方案: request_id=${selected.itinerary.request_id}, 得分=${selected.score.toFixed(2)}`);

      return {
        selected_itinerary: selected.itinerary,
        decision_reasoning,
        rejected_candidates,
      };
    } catch (error: any) {
      this.logger.error(`[ClaudeCoreDecisionAgent] 决策失败: ${error?.message}`, error?.stack);
      throw error;
    }
  }

  /**
   * 生成决策理由
   */
  private generateDecisionReasoning(
    selected: { itinerary: Itinerary; score: number; pros: string[]; cons: string[] },
    allCandidates: Array<{ itinerary: Itinerary; score: number; pros: string[]; cons: string[] }>,
    _request: TripPlanRequest,
  ): string {
    const parts: string[] = [];

    parts.push(`选择得分最高的方案（${selected.score.toFixed(2)}分）`);

    if (selected.pros.length > 0) {
      parts.push(`优点：${selected.pros.slice(0, 3).join('、')}`);
    }

    if (allCandidates.length > 1) {
      const secondBest = allCandidates[1];
      parts.push(`相比第二方案（${secondBest.score.toFixed(2)}分），优势在于：${selected.pros.filter(p => !secondBest.pros.includes(p)).slice(0, 2).join('、') || '综合评分更高'}`);
    }

    return parts.join('。');
  }

  // ============================================================================
  // AI-Native 增强方法 - Trade-off 模型
  // ============================================================================

  /**
   * 执行完整的决策分析（AI-Native 增强版）
   * 
   * 输出：多个候选方案 + 风险分布 + 用户判断点
   */
  async analyzeDecision(
    candidates: Array<{
      itinerary: Itinerary;
      score: number;
      pros: string[];
      cons: string[];
      evidence_refs: string[];
    }>,
    request: TripPlanRequest,
    context: OrchestratorState,
    userPreferences?: {
      priority?: TradeoffDimension;
      risk_tolerance?: 'LOW' | 'MEDIUM' | 'HIGH';
      weights?: Partial<Record<TradeoffDimension, number>>;
    },
  ): Promise<DecisionOutput> {
    this.logger.debug(`[CoreDecision/Dr.Dre] Analyzing ${candidates.length} candidates`);

    // 1. 构建 Trade-off 模型
    const weights = { ...this.DEFAULT_WEIGHTS, ...userPreferences?.weights };
    if (userPreferences?.priority) {
      weights[userPreferences.priority] = Math.min(0.5, weights[userPreferences.priority] + 0.15);
      this.normalizeWeights(weights);
    }

    // 2. 分析每个候选方案
    const analyzedOptions: DecisionOption[] = candidates.map((candidate, index) => 
      this.analyzeCandidate(candidate, index, weights, userPreferences?.risk_tolerance || 'MEDIUM')
    );

    // 3. 排序并分配排名
    const rankedOptions = this.rankOptions(analyzedOptions, weights);

    // 4. 构建比较矩阵
    const comparison = this.buildComparisonMatrix(rankedOptions);

    // 5. 识别用户判断点
    const userJudgmentRequired = this.identifyUserJudgmentPoints(rankedOptions, comparison);

    // 6. 构建决策节点
    const decisionNode = this.buildDecisionNode(request, rankedOptions, userPreferences);

    // 7. 构建输出
    const output: DecisionOutput = {
      decision_node: decisionNode,
      ranked_plans: rankedOptions.map((opt, idx) => ({
        plan: opt,
        rank: idx + 1,
        uncertainty: opt.uncertainty,
        tradeoffs: {
          TIME: { value: opt.tradeoffs.time.value, impact: opt.tradeoffs.time.impact },
          COST: { value: opt.tradeoffs.cost.value, impact: opt.tradeoffs.cost.impact },
          EXPERIENCE: { value: opt.tradeoffs.experience.value, impact: opt.tradeoffs.experience.description },
          RISK: { value: opt.tradeoffs.risk.value, impact: opt.tradeoffs.risk.factors.join(', ') },
        },
        what_you_pay_for: this.generateWhatYouPayFor(opt),
        what_you_get: this.generateWhatYouGet(opt),
      })),
      comparison,
      user_judgment_required: userJudgmentRequired,
      evidence_summary: this.summarizeEvidence(rankedOptions),
    };

    this.logger.debug(`[CoreDecision/Dr.Dre] Analysis complete: ${rankedOptions.length} plans ranked`);

    return output;
  }

  /**
   * 分析单个候选方案
   */
  private analyzeCandidate(
    candidate: { itinerary: Itinerary; score: number; pros: string[]; cons: string[]; evidence_refs: string[] },
    index: number,
    weights: Record<TradeoffDimension, number>,
    riskTolerance: 'LOW' | 'MEDIUM' | 'HIGH',
  ): DecisionOption {
    const itinerary = candidate.itinerary;

    // 计算各维度值
    const timeValue = this.calculateTimeScore(itinerary);
    const costValue = this.calculateCostScore(itinerary);
    const experienceValue = this.calculateExperienceScore(itinerary, candidate.pros);
    const riskValue = this.calculateRiskScore(itinerary, candidate.cons, riskTolerance);

    // 计算不确定性
    const uncertainty = this.calculateUncertainty(candidate, riskTolerance);

    // 计算加权总分
    const weightedScore = 
      timeValue * weights.TIME +
      costValue * weights.COST +
      experienceValue * weights.EXPERIENCE +
      (100 - riskValue) * weights.RISK; // 风险是负向的

    return {
      id: itinerary.request_id || `plan_${index + 1}`,
      name: this.generatePlanName(itinerary, index),
      description: this.generatePlanDescription(itinerary, candidate.pros),
      tradeoffs: {
        time: {
          value: timeValue,
          unit: 'score',
          impact: timeValue > 70 ? 'Efficient use of time' : timeValue > 40 ? 'Balanced pace' : 'Relaxed pace',
        },
        cost: {
          value: costValue,
          currency: 'USD',
          impact: costValue > 70 ? 'Budget-friendly' : costValue > 40 ? 'Moderate expense' : 'Premium experience',
        },
        experience: {
          value: experienceValue,
          description: experienceValue > 70 ? 'Rich and diverse' : experienceValue > 40 ? 'Good coverage' : 'Focused experience',
        },
        risk: {
          value: riskValue,
          factors: candidate.cons.slice(0, 3),
        },
      },
      uncertainty,
      evidence_refs: candidate.evidence_refs,
      constraint_satisfaction: [],
      score: weightedScore,
    };
  }

  /**
   * 对方案进行排序
   */
  private rankOptions(options: DecisionOption[], _weights: Record<TradeoffDimension, number>): DecisionOption[] {
    return [...options]
      .sort((a, b) => b.score - a.score)
      .map((opt, idx) => ({ ...opt, ranking: idx + 1 }));
  }

  /**
   * 构建比较矩阵
   */
  private buildComparisonMatrix(options: DecisionOption[]): ComparisonMatrix {
    const dimensions: TradeoffDimension[] = ['TIME', 'COST', 'EXPERIENCE', 'RISK'];
    
    const matrix = dimensions.map(dim => {
      const values = options.map(opt => {
        const value = dim === 'TIME' ? opt.tradeoffs.time.value :
                     dim === 'COST' ? opt.tradeoffs.cost.value :
                     dim === 'EXPERIENCE' ? opt.tradeoffs.experience.value :
                     opt.tradeoffs.risk.value;
        return {
          plan_id: opt.id,
          value,
          display: `${Math.round(value)}`,
          is_best: false,
        };
      });

      // 标记最佳值（风险是越低越好）
      const bestValue = dim === 'RISK' 
        ? Math.min(...values.map(v => v.value))
        : Math.max(...values.map(v => v.value));
      values.forEach(v => { v.is_best = v.value === bestValue; });

      return { dimension: dim, values };
    });

    const recommendation = options.length > 0 ? {
      plan_id: options[0].id,
      confidence: options[0].uncertainty.confidence,
      reasoning: `Based on weighted analysis: ${this.generateWhatYouGet(options[0])}`,
    } : {
      plan_id: '',
      confidence: 0,
      reasoning: 'No candidates available',
    };

    return {
      plans: options.map(opt => ({
        plan_id: opt.id,
        name: opt.name,
        summary: opt.description,
      })),
      dimensions,
      matrix,
      recommendation,
    };
  }

  /**
   * 识别用户判断点
   */
  private identifyUserJudgmentPoints(
    options: DecisionOption[],
    _comparison: ComparisonMatrix,
  ): Array<{
    question: string;
    context: string;
    options: Array<{ id: string; label: string; impact: string }>;
    recommendation?: string;
  }> {
    const points: Array<{
      question: string;
      context: string;
      options: Array<{ id: string; label: string; impact: string }>;
      recommendation?: string;
    }> = [];

    if (options.length < 2) return points;

    // 检查分数接近的方案
    const top2 = options.slice(0, 2);
    const scoreDiff = Math.abs(top2[0].score - top2[1].score);
    if (scoreDiff < 10) {
      points.push({
        question: 'Two plans have similar scores. Which aspect is more important to you?',
        context: `Plan A (${top2[0].name}) vs Plan B (${top2[1].name}) differ by only ${scoreDiff.toFixed(1)} points`,
        options: [
          { id: 'time', label: 'Optimize for time efficiency', impact: `May favor ${top2[0].tradeoffs.time.value > top2[1].tradeoffs.time.value ? 'Plan A' : 'Plan B'}` },
          { id: 'cost', label: 'Optimize for budget', impact: `May favor ${top2[0].tradeoffs.cost.value > top2[1].tradeoffs.cost.value ? 'Plan A' : 'Plan B'}` },
          { id: 'experience', label: 'Optimize for experience', impact: `May favor ${top2[0].tradeoffs.experience.value > top2[1].tradeoffs.experience.value ? 'Plan A' : 'Plan B'}` },
        ],
      });
    }

    // 检查高风险方案
    const highRiskPlans = options.filter(opt => opt.tradeoffs.risk.value > 60);
    if (highRiskPlans.length > 0) {
      points.push({
        question: 'Some plans have elevated risk. Are you comfortable with higher risk for better rewards?',
        context: `${highRiskPlans.length} plan(s) have risk scores above 60`,
        options: [
          { id: 'accept', label: 'Accept higher risk for better experience', impact: 'Keep all plans in consideration' },
          { id: 'avoid', label: 'Prefer safer options', impact: 'Filter out high-risk plans' },
        ],
        recommendation: 'avoid',
      });
    }

    return points;
  }

  /**
   * 构建决策节点
   */
  private buildDecisionNode(
    request: TripPlanRequest,
    options: DecisionOption[],
    preferences?: { priority?: TradeoffDimension; risk_tolerance?: 'LOW' | 'MEDIUM' | 'HIGH' },
  ): DecisionNode {
    const now = new Date().toISOString();

    return {
      id: `decision_${request.request_id || Date.now()}`,
      type: 'ROOT',
      name: 'Trip Plan Selection',
      description: `Select optimal plan for ${request.destination || 'destination'}`,
      context: {
        destination: typeof request.destination === 'string' ? request.destination : undefined,
        date_range: request.date_range ? { start: request.date_range.start_date, end: request.date_range.end_date } : undefined,
        travelers: request.party ? { count: request.party.count, profile: request.party.fitness_level || 'medium' } : undefined,
        current_phase: 'PLAN_SELECTION',
      },
      constraints: {
        hard: [],
        soft: [],
      },
      preferences: {
        pace: 'BALANCED',
        priority: preferences?.priority || 'EXPERIENCE',
        risk_tolerance: preferences?.risk_tolerance || 'MEDIUM',
      },
      options,
      tradeoff_model: this.buildTradeoffModels(options),
      overall_uncertainty: this.calculateOverallUncertainty(options),
      decision: options.length > 0 ? {
        selected_option_id: options[0].id,
        reasoning: this.generateWhatYouGet(options[0]),
        alternatives_considered: options.slice(1).map(o => o.id),
      } : undefined,
      metadata: {
        created_at: now,
        updated_at: now,
        version: 1,
      },
    };
  }

  // ============================================================================
  // 辅助方法
  // ============================================================================

  private normalizeWeights(weights: Record<TradeoffDimension, number>): void {
    const sum = Object.values(weights).reduce((a, b) => a + b, 0);
    if (sum > 0) {
      for (const key of Object.keys(weights) as TradeoffDimension[]) {
        weights[key] /= sum;
      }
    }
  }

  private calculateTimeScore(itinerary: Itinerary): number {
    const days = itinerary.days?.length || 1;
    const avgItemsPerDay = (itinerary.days?.reduce((sum, d) => sum + (d.items?.length || 0), 0) || 0) / days;
    return Math.min(100, Math.max(0, 50 + avgItemsPerDay * 10 - days * 2));
  }

  private calculateCostScore(_itinerary: Itinerary): number {
    return 60; // Placeholder - would integrate with CostAgent
  }

  private calculateExperienceScore(itinerary: Itinerary, pros: string[]): number {
    const baseScore = 50;
    const prosBonus = Math.min(30, pros.length * 10);
    const diversityBonus = itinerary.days?.length ? Math.min(20, itinerary.days.length * 3) : 0;
    return Math.min(100, baseScore + prosBonus + diversityBonus);
  }

  private calculateRiskScore(_itinerary: Itinerary, cons: string[], tolerance: 'LOW' | 'MEDIUM' | 'HIGH'): number {
    const baseRisk = 20;
    const consRisk = Math.min(40, cons.length * 15);
    const toleranceFactor = tolerance === 'LOW' ? 1.3 : tolerance === 'HIGH' ? 0.7 : 1;
    return Math.min(100, (baseRisk + consRisk) * toleranceFactor);
  }

  private calculateUncertainty(
    candidate: { evidence_refs: string[]; cons: string[] },
    _tolerance: 'LOW' | 'MEDIUM' | 'HIGH',
  ): UncertaintyProfile {
    const evidenceCount = candidate.evidence_refs.length;
    const confidence = Math.min(0.95, 0.5 + evidenceCount * 0.1);

    return {
      confidence,
      data_quality: evidenceCount > 5 ? 'HIGH' : evidenceCount > 2 ? 'MEDIUM' : 'LOW',
      uncertainty_sources: candidate.cons.slice(0, 3).map(con => ({
        source: con,
        impact: 'MEDIUM' as const,
      })),
      risk_distribution: {
        optimistic: confidence + 0.1,
        expected: confidence,
        pessimistic: confidence - 0.15,
      },
    };
  }

  private calculateOverallUncertainty(options: DecisionOption[]): UncertaintyProfile {
    if (options.length === 0) {
      return { confidence: 0, data_quality: 'UNKNOWN', uncertainty_sources: [] };
    }
    const avgConfidence = options.reduce((sum, o) => sum + o.uncertainty.confidence, 0) / options.length;
    return {
      confidence: avgConfidence,
      data_quality: avgConfidence > 0.7 ? 'HIGH' : avgConfidence > 0.4 ? 'MEDIUM' : 'LOW',
      uncertainty_sources: [],
    };
  }

  private buildTradeoffModels(options: DecisionOption[]): TradeoffModel[] {
    if (options.length === 0) return [];

    const dimensions: TradeoffDimension[] = ['TIME', 'COST', 'EXPERIENCE', 'RISK'];
    return dimensions.map(dim => {
      const values = options.map(o => 
        dim === 'TIME' ? o.tradeoffs.time.value :
        dim === 'COST' ? o.tradeoffs.cost.value :
        dim === 'EXPERIENCE' ? o.tradeoffs.experience.value :
        o.tradeoffs.risk.value
      );
      const min = Math.min(...values);
      const max = Math.max(...values);
      const avg = values.reduce((a, b) => a + b, 0) / values.length;

      return {
        dimension: dim,
        weight: this.DEFAULT_WEIGHTS[dim],
        current_value: avg,
        optimal_value: dim === 'RISK' ? min : max,
        acceptable_range: { min, max },
        loss_function: dim === 'RISK' ? 'minimize' : 'maximize',
      };
    });
  }

  private generatePlanName(itinerary: Itinerary, index: number): string {
    const days = itinerary.days?.length || 0;
    const prefix = ['Optimal', 'Alternative', 'Budget', 'Premium'][Math.min(index, 3)];
    return `${prefix} ${days}-Day Plan`;
  }

  private generatePlanDescription(itinerary: Itinerary, pros: string[]): string {
    return pros.length > 0 ? pros.slice(0, 2).join('. ') : 'A balanced itinerary option.';
  }

  private generateWhatYouPayFor(option: DecisionOption): string {
    const costs: string[] = [];
    if (option.tradeoffs.time.value < 50) costs.push('More travel time');
    if (option.tradeoffs.cost.value < 50) costs.push('Higher budget');
    if (option.tradeoffs.risk.value > 50) costs.push('Some uncertainty');
    return costs.length > 0 ? costs.join(', ') : 'Minimal trade-offs';
  }

  private generateWhatYouGet(option: DecisionOption): string {
    const benefits: string[] = [];
    if (option.tradeoffs.experience.value > 60) benefits.push('Rich experiences');
    if (option.tradeoffs.time.value > 60) benefits.push('Efficient scheduling');
    if (option.tradeoffs.cost.value > 60) benefits.push('Value for money');
    if (option.tradeoffs.risk.value < 40) benefits.push('Low risk');
    return benefits.length > 0 ? benefits.join(', ') : 'Balanced experience';
  }

  private summarizeEvidence(options: DecisionOption[]): { total_evidence: number; verified: number; unverified: number; assumptions: number } {
    const allRefs = options.flatMap(o => o.evidence_refs);
    return {
      total_evidence: allRefs.length,
      verified: Math.floor(allRefs.length * 0.6),
      unverified: Math.floor(allRefs.length * 0.3),
      assumptions: Math.floor(allRefs.length * 0.1),
    };
  }
}
