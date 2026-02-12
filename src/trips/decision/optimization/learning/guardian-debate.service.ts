// src/trips/decision/optimization/learning/guardian-debate.service.ts
/**
 * Guardian 辩论服务
 * 
 * Phase 3 核心：实现多智能体内部辩论系统
 * 
 * 流程：
 * 1. 各人格独立评估计划
 * 2. 检测分歧
 * 3. 多轮辩论
 * 4. 协商投票
 * 5. 生成最终决策
 */

import { Injectable, Logger } from '@nestjs/common';
import { RoutePlanDraft, WorldModelContext } from '../../shared/world-model.types';
import { ObjectiveFunctionService } from '../objective-function.service';
import { ObjectiveEvaluationResult, ObjectiveFunctionWeights } from '../objective-function.interface';
import {
  GuardianPersonaType,
  PersonaValues,
  PersonaEvaluation,
  DebateArgument,
  DebateRound,
  VoteResult,
  NegotiationResult,
  NegotiationConfig,
  DEFAULT_NEGOTIATION_CONFIG,
  ABU_VALUES,
  DRE_VALUES,
  NEPTUNE_VALUES,
} from './guardian-persona.interface';

@Injectable()
export class GuardianDebateService {
  private readonly logger = new Logger(GuardianDebateService.name);

  constructor(
    private readonly objectiveFunction: ObjectiveFunctionService,
  ) {}

  /**
   * 执行完整的协商流程
   */
  async negotiate(
    plan: RoutePlanDraft,
    world: WorldModelContext,
    config: NegotiationConfig = DEFAULT_NEGOTIATION_CONFIG
  ): Promise<NegotiationResult> {
    // 参数验证
    if (!plan) {
      throw new Error('协商失败: plan 参数不能为空。请提供有效的 RoutePlanDraft 对象');
    }
    if (!plan.tripId) {
      throw new Error('协商失败: plan.tripId 不能为空。请确保计划对象包含有效的 tripId');
    }
    if (!world) {
      throw new Error('协商失败: world 参数不能为空。请提供有效的 WorldModelContext 对象');
    }
    
    this.logger.log(`[GuardianDebate] 开始多智能体协商: ${plan.tripId}`);

    // 1. 基础评估
    const baseEvaluation = this.objectiveFunction.evaluate(plan, world);
    
    // 2. 各人格独立评估
    const evaluations = this.evaluateWithAllPersonas(plan, world, baseEvaluation);
    
    // 3. 检测分歧
    const initialConsensus = this.calculateConsensus(evaluations);
    this.logger.debug(`[GuardianDebate] 初始共识度: ${(initialConsensus * 100).toFixed(1)}%`);
    
    // 如果初始共识高，跳过辩论
    if (initialConsensus >= config.consensusThreshold) {
      return this.buildQuickConsensusResult(evaluations, initialConsensus);
    }
    
    // 4. 多轮辩论
    const debateRounds = await this.conductDebate(
      plan,
      world,
      evaluations,
      config
    );
    
    // 5. 投票
    const votes = this.conductVoting(
      plan,
      world,
      evaluations,
      debateRounds,
      config
    );
    
    // 6. 汇总结果
    const finalConsensus = this.calculateFinalConsensus(evaluations, debateRounds);
    const decision = this.determineDecision(votes, finalConsensus, config);
    
    return this.buildNegotiationResult(
      evaluations,
      debateRounds,
      votes,
      finalConsensus,
      decision,
      config
    );
  }

  /**
   * 各人格独立评估
   */
  private evaluateWithAllPersonas(
    plan: RoutePlanDraft,
    world: WorldModelContext,
    baseEvaluation: ObjectiveEvaluationResult
  ): PersonaEvaluation[] {
    return [
      this.evaluateAsPersona(ABU_VALUES, plan, world, baseEvaluation),
      this.evaluateAsPersona(DRE_VALUES, plan, world, baseEvaluation),
      this.evaluateAsPersona(NEPTUNE_VALUES, plan, world, baseEvaluation),
    ];
  }

  /**
   * 作为特定人格评估
   */
  private evaluateAsPersona(
    values: PersonaValues,
    plan: RoutePlanDraft,
    world: WorldModelContext,
    baseEvaluation: ObjectiveEvaluationResult
  ): PersonaEvaluation {
    // 1. 应用人格权重偏好计算效用
    const adjustedWeights = this.applyWeightBias(values.weightBias);
    const personalUtility = this.calculateWeightedUtility(baseEvaluation, adjustedWeights);
    
    // 2. 识别核心关注点
    const concerns = this.identifyPersonaConcerns(values, baseEvaluation);
    
    // 3. 识别正面方面
    const positives = this.identifyPositiveAspects(values, baseEvaluation);
    
    // 4. 生成建议
    const suggestions = this.generatePersonaSuggestions(values, baseEvaluation, world);
    
    // 5. 确定立场
    const stance = this.determineStance(personalUtility, concerns.length);
    
    // 6. 生成推理过程
    const reasoning = this.generateReasoning(values, baseEvaluation, personalUtility);
    
    return {
      persona: values.persona,
      utility: personalUtility,
      primaryConcerns: concerns,
      positiveAspects: positives,
      suggestedAdjustments: suggestions,
      stance,
      confidence: this.calculateConfidence(baseEvaluation, values),
      reasoning,
    };
  }

  /**
   * 应用权重偏好
   */
  private applyWeightBias(bias: Partial<ObjectiveFunctionWeights>): ObjectiveFunctionWeights {
    const baseWeights = this.objectiveFunction.weights;
    const adjusted = { ...baseWeights };
    
    for (const [key, delta] of Object.entries(bias)) {
      if (key in adjusted) {
        (adjusted as any)[key] = Math.max(0, (adjusted as any)[key] + (delta as number));
      }
    }
    
    // 归一化
    const sum = Object.values(adjusted).reduce((a, b) => a + b, 0);
    for (const key of Object.keys(adjusted)) {
      (adjusted as any)[key] /= sum;
    }
    
    return adjusted;
  }

  /**
   * 计算加权效用
   */
  private calculateWeightedUtility(
    evaluation: ObjectiveEvaluationResult,
    weights: ObjectiveFunctionWeights
  ): number {
    const breakdown = evaluation.breakdown;
    
    const positive = 
      weights.safety * breakdown.safetyScore +
      weights.experienceDensity * breakdown.experienceScore +
      weights.philosophyAlignment * breakdown.philosophyScore +
      weights.timeSlack * breakdown.timeSlackScore;
    
    const negative = 
      weights.fatigueRisk * breakdown.fatigueRiskPenalty +
      weights.weatherRisk * breakdown.weatherRiskPenalty +
      weights.budgetOverrun * breakdown.budgetOverrunPenalty +
      weights.pacingVariance * breakdown.pacingVariancePenalty;
    
    return Math.max(0, Math.min(1, positive - negative));
  }

  /**
   * 识别人格关注点
   */
  private identifyPersonaConcerns(
    values: PersonaValues,
    evaluation: ObjectiveEvaluationResult
  ): string[] {
    const concerns: string[] = [];
    const breakdown = evaluation.breakdown;
    const constraints = evaluation.constraints || { hardViolations: [], softViolations: [] };
    
    // Abu 关注点
    if (values.persona === 'ABU') {
      if (breakdown.safetyScore < 0.6) {
        concerns.push(`安全性评分较低 (${(breakdown.safetyScore * 100).toFixed(0)}%)`);
      }
      if (breakdown.weatherRiskPenalty > 0.2) {
        concerns.push('存在显著天气风险');
      }
      if ((constraints.hardViolations || []).length > 0) {
        concerns.push(`存在 ${constraints.hardViolations.length} 个硬约束违反`);
      }
    }
    
    // Dre 关注点
    if (values.persona === 'DRE') {
      if (breakdown.fatigueRiskPenalty > 0.2) {
        concerns.push(`疲劳风险偏高 (${(breakdown.fatigueRiskPenalty * 100).toFixed(0)}%)`);
      }
      if (breakdown.pacingVariancePenalty > 0.15) {
        concerns.push('节奏不均衡，存在明显波动');
      }
      if (breakdown.timeSlackScore < 0.5) {
        concerns.push('时间余量不足');
      }
    }
    
    // Neptune 关注点
    if (values.persona === 'NEPTUNE') {
      if (breakdown.philosophyScore < 0.7) {
        concerns.push(`路线哲学匹配度不足 (${(breakdown.philosophyScore * 100).toFixed(0)}%)`);
      }
      if (breakdown.experienceScore < 0.6) {
        concerns.push('体验密度偏低');
      }
    }
    
    return concerns;
  }

  /**
   * 识别正面方面
   */
  private identifyPositiveAspects(
    values: PersonaValues,
    evaluation: ObjectiveEvaluationResult
  ): string[] {
    const positives: string[] = [];
    const breakdown = evaluation.breakdown;
    const constraints = evaluation.constraints || { hardViolations: [], softViolations: [] };
    
    if (values.persona === 'ABU') {
      if (breakdown.safetyScore >= 0.8) {
        positives.push('安全性良好');
      }
      if ((constraints.hardViolations || []).length === 0) {
        positives.push('所有硬约束满足');
      }
    }
    
    if (values.persona === 'DRE') {
      if (breakdown.fatigueRiskPenalty < 0.1) {
        positives.push('疲劳风险可控');
      }
      if (breakdown.timeSlackScore >= 0.7) {
        positives.push('时间安排从容');
      }
    }
    
    if (values.persona === 'NEPTUNE') {
      if (breakdown.philosophyScore >= 0.85) {
        positives.push('充分体现路线哲学');
      }
      if (breakdown.experienceScore >= 0.8) {
        positives.push('体验丰富');
      }
    }
    
    return positives;
  }

  /**
   * 生成人格建议
   */
  private generatePersonaSuggestions(
    values: PersonaValues,
    evaluation: ObjectiveEvaluationResult,
    world: WorldModelContext
  ): string[] {
    const suggestions: string[] = [];
    const constraints = evaluation.constraints || { hardViolations: [], softViolations: [] };
    
    if (values.persona === 'ABU') {
      if ((constraints.softViolations || []).length > 0) {
        suggestions.push('建议处理软约束以降低风险');
      }
    }
    
    if (values.persona === 'DRE') {
      if (evaluation.breakdown.fatigueRiskPenalty > 0.15) {
        suggestions.push('建议拆分高负荷天或插入休息日');
      }
      if (evaluation.breakdown.pacingVariancePenalty > 0.1) {
        suggestions.push('建议重新平衡各天的负荷');
      }
    }
    
    if (values.persona === 'NEPTUNE') {
      if (evaluation.breakdown.philosophyScore < 0.8) {
        suggestions.push('建议确保核心体验不被削减');
      }
    }
    
    return suggestions;
  }

  /**
   * 确定立场
   */
  private determineStance(utility: number, concernCount: number): PersonaEvaluation['stance'] {
    if (utility >= 0.8 && concernCount === 0) return 'STRONG_SUPPORT';
    if (utility >= 0.65 && concernCount <= 1) return 'SUPPORT';
    if (utility >= 0.5 && concernCount <= 2) return 'NEUTRAL';
    if (utility >= 0.35) return 'CONCERN';
    return 'STRONG_OPPOSE';
  }

  /**
   * 计算置信度
   */
  private calculateConfidence(
    evaluation: ObjectiveEvaluationResult,
    values: PersonaValues
  ): number {
    let confidence = 0.7;
    
    // 数据质量影响
    if (evaluation.metrics['hardViolationCount'] !== undefined) {
      confidence += 0.1;
    }
    
    // 人格相关性
    if (values.persona === 'ABU' && evaluation.isFeasible !== undefined) {
      confidence += 0.1;
    }
    
    return Math.min(0.95, confidence);
  }

  /**
   * 生成推理过程
   */
  private generateReasoning(
    values: PersonaValues,
    evaluation: ObjectiveEvaluationResult,
    personalUtility: number
  ): string {
    const personaName = {
      ABU: '守护者 Abu',
      DRE: '节奏大师 Dre',
      NEPTUNE: '哲学守护者 Neptune',
    }[values.persona];
    
    const stanceWord = personalUtility >= 0.7 ? '支持' 
      : personalUtility >= 0.5 ? '谨慎支持'
      : personalUtility >= 0.35 ? '存有顾虑'
      : '反对';
    
    return `作为${personaName}，从${values.coreObjective}的角度出发，我${stanceWord}这个计划。` +
           `基于我的评估标准，效用为 ${(personalUtility * 100).toFixed(0)}%。`;
  }

  /**
   * 计算共识度
   */
  private calculateConsensus(evaluations: PersonaEvaluation[]): number {
    const stanceScores: number[] = evaluations.map(e => {
      switch (e.stance) {
        case 'STRONG_SUPPORT': return 1;
        case 'SUPPORT': return 0.75;
        case 'NEUTRAL': return 0.5;
        case 'CONCERN': return 0.25;
        case 'STRONG_OPPOSE': return 0;
      }
    });
    
    const mean = stanceScores.reduce((a, b) => a + b, 0) / stanceScores.length;
    const variance = stanceScores.reduce((sum, s) => sum + Math.pow(s - mean, 2), 0) / stanceScores.length;
    
    // 共识度 = 1 - 标准差（标准差越小共识越高）
    return Math.max(0, 1 - Math.sqrt(variance));
  }

  /**
   * 快速共识结果
   */
  private buildQuickConsensusResult(
    evaluations: PersonaEvaluation[],
    consensus: number
  ): NegotiationResult {
    const avgUtility = evaluations.reduce((sum, e) => sum + e.utility, 0) / evaluations.length;
    
    return {
      decision: avgUtility >= 0.6 ? 'APPROVE' : 'CONDITIONAL_APPROVE',
      evaluations,
      debateRounds: [],
      votes: evaluations.map(e => ({
        persona: e.persona,
        vote: e.stance === 'STRONG_OPPOSE' ? 'REJECT' 
          : e.stance === 'CONCERN' ? 'ABSTAIN' 
          : 'APPROVE',
        weight: 1,
        rationale: e.reasoning,
      })),
      consensusLevel: consensus,
      keyTradeoffs: [],
      summary: `三位守护者快速达成共识（共识度 ${(consensus * 100).toFixed(0)}%），无需辩论。`,
    };
  }

  /**
   * 执行辩论
   */
  private async conductDebate(
    plan: RoutePlanDraft,
    world: WorldModelContext,
    evaluations: PersonaEvaluation[],
    config: NegotiationConfig
  ): Promise<DebateRound[]> {
    const rounds: DebateRound[] = [];
    let previousArguments: DebateArgument[] = [];
    
    for (let r = 0; r < config.maxDebateRounds; r++) {
      const roundArguments: DebateArgument[] = [];
      
      // 每个人格发言
      for (const evaluation of evaluations) {
        const argument = this.generateArgument(
          evaluation,
          plan,
          world,
          evaluations.filter(e => e.persona !== evaluation.persona),
          previousArguments
        );
        roundArguments.push(argument);
      }
      
      // 计算本轮后的共识变化
      const consensusBefore = rounds.length > 0 
        ? rounds[rounds.length - 1].consensusShift 
        : this.calculateConsensus(evaluations);
      const consensusAfter = this.estimateConsensusAfterRound(roundArguments, evaluations);
      
      // 识别关键分歧
      const disagreements = this.identifyDisagreements(roundArguments);
      
      rounds.push({
        roundNumber: r + 1,
        arguments: roundArguments,
        consensusShift: consensusAfter - consensusBefore,
        keyDisagreements: disagreements,
      });
      
      previousArguments = [...previousArguments, ...roundArguments];
      
      // 检查是否达成共识
      if (consensusAfter >= config.consensusThreshold) {
        this.logger.debug(`[GuardianDebate] 第 ${r + 1} 轮后达成共识`);
        break;
      }
    }
    
    return rounds;
  }

  /**
   * 生成辩论论点
   */
  private generateArgument(
    evaluation: PersonaEvaluation,
    plan: RoutePlanDraft,
    world: WorldModelContext,
    otherEvaluations: PersonaEvaluation[],
    previousArguments: DebateArgument[]
  ): DebateArgument {
    const type = evaluation.stance === 'STRONG_OPPOSE' || evaluation.stance === 'CONCERN'
      ? 'OPPOSE'
      : evaluation.stance === 'STRONG_SUPPORT' || evaluation.stance === 'SUPPORT'
      ? 'SUPPORT'
      : 'CONDITIONAL';
    
    // 找出与其他人格的分歧
    const opposingPersona = otherEvaluations.find(
      e => (e.stance.includes('OPPOSE') && !evaluation.stance.includes('OPPOSE')) ||
           (e.stance.includes('SUPPORT') && !evaluation.stance.includes('SUPPORT'))
    );
    
    let content: string;
    if (type === 'SUPPORT') {
      content = `支持这个计划。${evaluation.positiveAspects.join('，')}。`;
    } else if (type === 'OPPOSE') {
      content = `对这个计划存有顾虑。${evaluation.primaryConcerns.join('；')}。`;
    } else {
      content = `有条件地支持，但建议${evaluation.suggestedAdjustments.join('；')}。`;
    }
    
    return {
      fromPersona: evaluation.persona,
      type,
      content,
      strength: evaluation.confidence * (evaluation.utility > 0.5 ? 0.8 : 0.6),
      evidence: evaluation.primaryConcerns.length > 0 
        ? evaluation.primaryConcerns 
        : evaluation.positiveAspects,
      targetPersona: opposingPersona?.persona,
    };
  }

  /**
   * 估算辩论后的共识度
   */
  private estimateConsensusAfterRound(
    arguments_: DebateArgument[],
    evaluations: PersonaEvaluation[]
  ): number {
    // 简化：如果论点强度接近，共识提高
    const strengths = arguments_.map(a => a.strength);
    const avgStrength = strengths.reduce((a, b) => a + b, 0) / strengths.length;
    const variance = strengths.reduce((sum, s) => sum + Math.pow(s - avgStrength, 2), 0) / strengths.length;
    
    const baseConsensus = this.calculateConsensus(evaluations);
    // 方差小 → 共识提高
    return Math.min(1, baseConsensus + (0.3 - variance) * 0.2);
  }

  /**
   * 识别分歧
   */
  private identifyDisagreements(arguments_: DebateArgument[]): string[] {
    const disagreements: string[] = [];
    
    const supportArgs = arguments_.filter(a => a.type === 'SUPPORT');
    const opposeArgs = arguments_.filter(a => a.type === 'OPPOSE');
    
    if (supportArgs.length > 0 && opposeArgs.length > 0) {
      disagreements.push(
        `${supportArgs.map(a => a.fromPersona).join('/')} 支持 vs ${opposeArgs.map(a => a.fromPersona).join('/')} 反对`
      );
    }
    
    return disagreements;
  }

  /**
   * 投票
   */
  private conductVoting(
    plan: RoutePlanDraft,
    world: WorldModelContext,
    evaluations: PersonaEvaluation[],
    debateRounds: DebateRound[],
    config: NegotiationConfig
  ): VoteResult[] {
    return evaluations.map(evaluation => {
      // 基于辩论可能调整立场
      let adjustedStance = evaluation.stance;
      
      // 如果辩论中有强有力的反驳，可能改变立场
      for (const round of debateRounds) {
        const counterArgs = round.arguments.filter(
          a => a.targetPersona === evaluation.persona && a.type === 'OPPOSE' && a.strength > 0.7
        );
        if (counterArgs.length > 0 && evaluation.stance === 'SUPPORT') {
          adjustedStance = 'NEUTRAL';
        }
      }
      
      // 计算投票权重
      let weight = 1;
      if (config.votingWeightMode === 'DOMAIN_BASED') {
        // Abu 在安全问题上权重更高
        if (evaluation.persona === 'ABU' && evaluation.primaryConcerns.some(c => c.includes('安全'))) {
          weight = 1.5;
        }
        // Dre 在疲劳问题上权重更高
        if (evaluation.persona === 'DRE' && evaluation.primaryConcerns.some(c => c.includes('疲劳'))) {
          weight = 1.3;
        }
      } else if (config.votingWeightMode === 'CONFIDENCE_BASED') {
        weight = evaluation.confidence;
      }
      
      const vote = adjustedStance === 'STRONG_OPPOSE' ? 'REJECT'
        : adjustedStance === 'CONCERN' ? 'ABSTAIN'
        : 'APPROVE';
      
      return {
        persona: evaluation.persona,
        vote,
        weight,
        rationale: evaluation.reasoning,
        conditions: evaluation.suggestedAdjustments.length > 0 
          ? evaluation.suggestedAdjustments 
          : undefined,
      };
    });
  }

  /**
   * 计算最终共识度
   */
  private calculateFinalConsensus(
    evaluations: PersonaEvaluation[],
    debateRounds: DebateRound[]
  ): number {
    let consensus = this.calculateConsensus(evaluations);
    
    // 辩论可能提高共识
    for (const round of debateRounds) {
      consensus += round.consensusShift;
    }
    
    return Math.max(0, Math.min(1, consensus));
  }

  /**
   * 确定最终决定
   */
  private determineDecision(
    votes: VoteResult[],
    consensus: number,
    config: NegotiationConfig
  ): NegotiationResult['decision'] {
    const totalWeight = votes.reduce((sum, v) => sum + v.weight, 0);
    const approveWeight = votes
      .filter(v => v.vote === 'APPROVE')
      .reduce((sum, v) => sum + v.weight, 0);
    const rejectWeight = votes
      .filter(v => v.vote === 'REJECT')
      .reduce((sum, v) => sum + v.weight, 0);
    
    const approveRatio = approveWeight / totalWeight;
    const rejectRatio = rejectWeight / totalWeight;
    
    // 需要一致同意
    if (config.requireUnanimity) {
      if (rejectWeight > 0) return 'REJECT';
      if (approveRatio === 1) return 'APPROVE';
      return 'CONDITIONAL_APPROVE';
    }
    
    // 分歧太大，需要人类判断
    if (consensus < config.humanInterventionThreshold) {
      return 'REQUIRES_HUMAN';
    }
    
    // 多数决
    if (approveRatio > 0.6) {
      const hasConditions = votes.some(v => v.conditions && v.conditions.length > 0);
      return hasConditions && config.allowConditionalApproval 
        ? 'CONDITIONAL_APPROVE' 
        : 'APPROVE';
    }
    
    if (rejectRatio > 0.4) {
      return 'REJECT';
    }
    
    return 'CONDITIONAL_APPROVE';
  }

  /**
   * 构建协商结果
   */
  private buildNegotiationResult(
    evaluations: PersonaEvaluation[],
    debateRounds: DebateRound[],
    votes: VoteResult[],
    consensus: number,
    decision: NegotiationResult['decision'],
    config: NegotiationConfig
  ): NegotiationResult {
    // 收集所有条件
    const allConditions = votes
      .flatMap(v => v.conditions || [])
      .filter((c, i, arr) => arr.indexOf(c) === i);
    
    // 收集关键权衡
    const tradeoffs = debateRounds
      .flatMap(r => r.keyDisagreements)
      .filter((t, i, arr) => arr.indexOf(t) === i);
    
    // 需要人类判断的问题
    const humanPoints = decision === 'REQUIRES_HUMAN'
      ? evaluations
          .filter(e => e.stance === 'CONCERN' || e.stance === 'STRONG_OPPOSE')
          .map(e => `${e.persona}: ${e.primaryConcerns.join('; ')}`)
      : undefined;
    
    // 生成摘要
    const decisionText = {
      APPROVE: '通过',
      REJECT: '拒绝',
      CONDITIONAL_APPROVE: '有条件通过',
      REQUIRES_HUMAN: '需要人类判断',
    }[decision];
    
    const summary = `经过 ${debateRounds.length} 轮辩论，三位守护者最终${decisionText}。` +
                    `共识度 ${(consensus * 100).toFixed(0)}%。` +
                    (allConditions.length > 0 ? `附带 ${allConditions.length} 个条件。` : '');
    
    return {
      decision,
      evaluations,
      debateRounds,
      votes,
      consensusLevel: consensus,
      keyTradeoffs: tradeoffs,
      conditions: allConditions.length > 0 ? allConditions : undefined,
      humanDecisionPoints: humanPoints,
      summary,
    };
  }

  /**
   * 获取协商摘要（用于 UI 展示）
   */
  getSummaryForDisplay(result: NegotiationResult): {
    decision: string;
    decisionEmoji: string;
    consensus: string;
    personaSummaries: Array<{ persona: string; stance: string; emoji: string }>;
    conditions: string[];
    needsHumanInput: boolean;
  } {
    const decisionMap = {
      APPROVE: { text: '通过', emoji: '✅' },
      REJECT: { text: '拒绝', emoji: '❌' },
      CONDITIONAL_APPROVE: { text: '有条件通过', emoji: '⚠️' },
      REQUIRES_HUMAN: { text: '需要您的判断', emoji: '🤔' },
    };
    
    const stanceEmojiMap = {
      STRONG_SUPPORT: '💚',
      SUPPORT: '👍',
      NEUTRAL: '😐',
      CONCERN: '😟',
      STRONG_OPPOSE: '🛑',
    };
    
    return {
      decision: decisionMap[result.decision].text,
      decisionEmoji: decisionMap[result.decision].emoji,
      consensus: `${(result.consensusLevel * 100).toFixed(0)}%`,
      personaSummaries: result.evaluations.map(e => ({
        persona: { ABU: '守护者', DRE: '节奏师', NEPTUNE: '哲学家' }[e.persona],
        stance: e.stance,
        emoji: stanceEmojiMap[e.stance],
      })),
      conditions: result.conditions || [],
      needsHumanInput: result.decision === 'REQUIRES_HUMAN',
    };
  }
}
