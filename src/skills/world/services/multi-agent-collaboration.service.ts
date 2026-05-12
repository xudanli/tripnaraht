/**
 * 多智能体协作世界模型服务
 * 
 * 负责管理智能体间世界模型数据的共享和协调，包括：
 * - 智能体间通信（世界模型数据共享）
 * - 智能体间协调（世界模型更新协调）
 * - 智能体间冲突解决（不同智能体对同一世界状态的不同评估）
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import {
  UnifiedWorldModel,
  type BudgetStrategyProposal,
  type ExperienceStrategyProposal,
} from '../interfaces/unified-world-model.interface';
import { WorldModelEventsService } from './world-model-events.service';

/**
 * 智能体类型
 */
export type AgentType =
  | 'GEO_AGENT'
  | 'WEATHER_AGENT'
  | 'COST_AGENT'
  | 'EXPERIENCE_AGENT'
  | 'GATEKEEPER_AGENT'
  | 'PLANNER_AGENT'
  | 'CORE_DECISION_AGENT'
  | 'LOCAL_INSIGHT_AGENT';

/**
 * 智能体世界模型贡献
 */
export interface AgentWorldModelContribution {
  agentId: string;
  agentType: AgentType;
  contribution: Partial<UnifiedWorldModel>;
  confidence: number; // 0-1
  timestamp: Date;
  metadata?: {
    source?: string;
    reasoning?: string;
  };
}

/**
 * 智能体间冲突
 */
export interface AgentConflict {
  id: string;
  conflictType:
    | 'DATA_CONFLICT'
    | 'ASSESSMENT_CONFLICT'
    | 'PREDICTION_CONFLICT'
    | 'STRATEGY_CONFLICT';
  agents: string[];
  conflictingData: {
    agentId: string;
    data: any;
    confidence: number;
  }[];
  resolution?: ConflictResolution;
}

/**
 * 冲突解决
 */
export interface ConflictResolution {
  resolutionType: 'CONSENSUS' | 'WEIGHTED_AVERAGE' | 'HIGHEST_CONFIDENCE' | 'USER_INPUT';
  resolvedData: any;
  confidence: number;
  explanation: string;
}

/**
 * 智能体协作状态
 */
export interface AgentCollaborationState {
  contributions: Map<string, AgentWorldModelContribution>;
  conflicts: AgentConflict[];
  consensus: Partial<UnifiedWorldModel>;
  lastUpdate: Date;
}

@Injectable()
export class MultiAgentCollaborationService {
  private readonly logger = new Logger(MultiAgentCollaborationService.name);

  /** 智能体协作状态缓存 */
  private readonly collaborationStates = new Map<string, AgentCollaborationState>();

  constructor(
    @Optional() private worldModelEventsService?: WorldModelEventsService,
  ) {}

  /**
   * 注册智能体贡献
   */
  async registerContribution(
    tripId: string,
    contribution: AgentWorldModelContribution,
  ): Promise<void> {
    this.logger.log(
      `[MultiAgentCollaboration] 注册智能体贡献: tripId=${tripId}, agentId=${contribution.agentId}, agentType=${contribution.agentType}`,
    );

    // 获取或创建协作状态
    let state = this.collaborationStates.get(tripId);
    if (!state) {
      state = {
        contributions: new Map(),
        conflicts: [],
        consensus: {},
        lastUpdate: new Date(),
      };
      this.collaborationStates.set(tripId, state);
    }

    // 添加贡献
    state.contributions.set(contribution.agentId, contribution);
    state.lastUpdate = new Date();

    // 检测冲突
    const conflicts = await this.detectConflicts(tripId, contribution, state);
    if (conflicts.length > 0) {
      state.conflicts.push(...conflicts);
      this.logger.warn(
        `[MultiAgentCollaboration] 检测到 ${conflicts.length} 个冲突`,
      );
    }

    // 更新共识
    await this.updateConsensus(tripId, state);
  }

  /**
   * 获取智能体协作的世界模型
   */
  async getCollaborativeWorldModel(
    tripId: string,
  ): Promise<Partial<UnifiedWorldModel>> {
    const state = this.collaborationStates.get(tripId);
    if (!state) {
      return {};
    }

    return state.consensus;
  }

  /**
   * 解决冲突
   */
  async resolveConflict(
    tripId: string,
    conflictId: string,
    resolution: ConflictResolution,
  ): Promise<void> {
    this.logger.log(
      `[MultiAgentCollaboration] 解决冲突: tripId=${tripId}, conflictId=${conflictId}`,
    );

    const state = this.collaborationStates.get(tripId);
    if (!state) {
      return;
    }

    const conflict = state.conflicts.find((c) => c.id === conflictId);
    if (!conflict) {
      return;
    }

    // 应用冲突解决
    conflict.resolution = resolution;

    // 更新共识
    await this.updateConsensus(tripId, state);
  }

  /**
   * 检测冲突
   */
  private async detectConflicts(
    tripId: string,
    newContribution: AgentWorldModelContribution,
    state: AgentCollaborationState,
  ): Promise<AgentConflict[]> {
    const conflicts: AgentConflict[] = [];

    // 检查与其他贡献的冲突
    for (const [agentId, existingContribution] of state.contributions.entries()) {
      if (agentId === newContribution.agentId) {
        continue;
      }

      // 检测数据冲突
      const dataConflicts = this.detectDataConflicts(
        newContribution,
        existingContribution,
      );
      if (dataConflicts.length > 0) {
        conflicts.push(...dataConflicts);
      }

      // 检测评估冲突
      const assessmentConflicts = this.detectAssessmentConflicts(
        newContribution,
        existingContribution,
      );
      if (assessmentConflicts.length > 0) {
        conflicts.push(...assessmentConflicts);
      }

      // 检测预测冲突
      const predictionConflicts = this.detectPredictionConflicts(
        newContribution,
        existingContribution,
      );
      if (predictionConflicts.length > 0) {
        conflicts.push(...predictionConflicts);
      }

      const strategyConflict = this.detectStrategyConflict(
        newContribution,
        existingContribution,
      );
      if (strategyConflict) {
        conflicts.push(strategyConflict);
      }
    }

    return conflicts;
  }

  /**
   * 体验策略（高阶体验提案） vs 预算策略（软顶 / 超支）张力检测 — 「极光玻璃屋 vs 超支」切口
   */
  private detectStrategyConflict(
    contribution1: AgentWorldModelContribution,
    contribution2: AgentWorldModelContribution,
  ): AgentConflict | null {
    const exp = this.pickExperienceProposal(contribution1, contribution2);
    const bud = this.pickBudgetProposal(contribution1, contribution2);
    if (!exp || !bud) {
      return null;
    }

    const premiumExperience =
      exp.tier === 'ULTRA' || exp.tier === 'PREMIUM';
    const budgetStress =
      bud.overrunVsCeiling ||
      (bud.softCeiling != null &&
        bud.softCeiling > 0 &&
        bud.expectedSpend > bud.softCeiling * 1.05);

    if (premiumExperience && budgetStress) {
      return {
        id: `strategy_conflict_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        conflictType: 'STRATEGY_CONFLICT',
        agents: [exp.agentId, bud.agentId],
        conflictingData: [
          {
            agentId: exp.agentId,
            data: { kind: 'EXPERIENCE_PROPOSAL', proposal: exp },
            confidence: exp.confidence,
          },
          {
            agentId: bud.agentId,
            data: { kind: 'BUDGET_PROPOSAL', proposal: bud },
            confidence: bud.confidence,
          },
        ],
      };
    }

    return null;
  }

  private pickExperienceProposal(
    a: AgentWorldModelContribution,
    b: AgentWorldModelContribution,
  ): ExperienceStrategyProposal | undefined {
    return (
      a.contribution.strategyLayer?.experienceProposal ||
      b.contribution.strategyLayer?.experienceProposal
    );
  }

  private pickBudgetProposal(
    a: AgentWorldModelContribution,
    b: AgentWorldModelContribution,
  ): BudgetStrategyProposal | undefined {
    return (
      a.contribution.strategyLayer?.budgetProposal ||
      b.contribution.strategyLayer?.budgetProposal
    );
  }

  /**
   * 检测数据冲突
   */
  private detectDataConflicts(
    contribution1: AgentWorldModelContribution,
    contribution2: AgentWorldModelContribution,
  ): AgentConflict[] {
    const conflicts: AgentConflict[] = [];

    // 检查实时状态冲突
    if (
      contribution1.contribution.realtimeState &&
      contribution2.contribution.realtimeState
    ) {
      const state1 = contribution1.contribution.realtimeState;
      const state2 = contribution2.contribution.realtimeState;

      // 检查道路状态冲突
      if (state1.roadStatusUpdates && state2.roadStatusUpdates) {
        const roadConflicts = this.compareRoadStatusUpdates(
          state1.roadStatusUpdates,
          state2.roadStatusUpdates,
        );
        if (roadConflicts.length > 0) {
          conflicts.push({
            id: `data_conflict_${Date.now()}_${Math.random()}`,
            conflictType: 'DATA_CONFLICT',
            agents: [contribution1.agentId, contribution2.agentId],
            conflictingData: [
              {
                agentId: contribution1.agentId,
                data: state1.roadStatusUpdates,
                confidence: contribution1.confidence,
              },
              {
                agentId: contribution2.agentId,
                data: state2.roadStatusUpdates,
                confidence: contribution2.confidence,
              },
            ],
          });
        }
      }
    }

    return conflicts;
  }

  /**
   * 检测评估冲突
   */
  private detectAssessmentConflicts(
    contribution1: AgentWorldModelContribution,
    contribution2: AgentWorldModelContribution,
  ): AgentConflict[] {
    const conflicts: AgentConflict[] = [];

    // 检查自适应参数冲突
    if (
      contribution1.contribution.adaptiveParameters &&
      contribution2.contribution.adaptiveParameters
    ) {
      const params1 = contribution1.contribution.adaptiveParameters;
      const params2 = contribution2.contribution.adaptiveParameters;

      // 检查路线难度调整冲突（差异超过20%）
      const difficultyDiff = Math.abs(
        (params1.routeDifficultyAdjustment || 1.0) -
          (params2.routeDifficultyAdjustment || 1.0),
      );
      if (difficultyDiff > 0.2) {
        conflicts.push({
          id: `assessment_conflict_${Date.now()}_${Math.random()}`,
          conflictType: 'ASSESSMENT_CONFLICT',
          agents: [contribution1.agentId, contribution2.agentId],
          conflictingData: [
            {
              agentId: contribution1.agentId,
              data: params1,
              confidence: contribution1.confidence,
            },
            {
              agentId: contribution2.agentId,
              data: params2,
              confidence: contribution2.confidence,
            },
          ],
        });
      }
    }

    return conflicts;
  }

  /**
   * 检测预测冲突
   */
  private detectPredictionConflicts(
    contribution1: AgentWorldModelContribution,
    contribution2: AgentWorldModelContribution,
  ): AgentConflict[] {
    const conflicts: AgentConflict[] = [];

    // 检查失败风险预测冲突
    if (
      contribution1.contribution.predictions?.failureRisk &&
      contribution2.contribution.predictions?.failureRisk
    ) {
      const risk1 = contribution1.contribution.predictions.failureRisk;
      const risk2 = contribution2.contribution.predictions.failureRisk;

      // 检查高风险天数差异（超过2天）
      const highRiskDays1 = risk1.predictions.filter(
        (p) => p.riskLevel === 'HIGH',
      ).length;
      const highRiskDays2 = risk2.predictions.filter(
        (p) => p.riskLevel === 'HIGH',
      ).length;

      if (Math.abs(highRiskDays1 - highRiskDays2) > 2) {
        conflicts.push({
          id: `prediction_conflict_${Date.now()}_${Math.random()}`,
          conflictType: 'PREDICTION_CONFLICT',
          agents: [contribution1.agentId, contribution2.agentId],
          conflictingData: [
            {
              agentId: contribution1.agentId,
              data: risk1,
              confidence: contribution1.confidence,
            },
            {
              agentId: contribution2.agentId,
              data: risk2,
              confidence: contribution2.confidence,
            },
          ],
        });
      }
    }

    return conflicts;
  }

  /**
   * 比较道路状态更新
   */
  private compareRoadStatusUpdates(
    updates1: any[],
    updates2: any[],
  ): any[] {
    const conflicts: any[] = [];

    // 按roadId分组
    const updates1Map = new Map(
      updates1.map((u) => [u.roadId || u.id, u]),
    );
    const updates2Map = new Map(
      updates2.map((u) => [u.roadId || u.id, u]),
    );

    // 检查冲突
    for (const [roadId, update1] of updates1Map.entries()) {
      const update2 = updates2Map.get(roadId);
      if (update2 && update1.currentStatus !== update2.currentStatus) {
        conflicts.push({
          roadId,
          status1: update1.currentStatus,
          status2: update2.currentStatus,
        });
      }
    }

    return conflicts;
  }

  /**
   * 更新共识（增强：考虑智能体历史表现）
   */
  private async updateConsensus(
    tripId: string,
    state: AgentCollaborationState,
  ): Promise<void> {
    this.logger.log(
      `[MultiAgentCollaboration] 更新共识: tripId=${tripId}`,
    );

    const consensus: Partial<UnifiedWorldModel> = {};

    // 计算智能体权重（基于历史表现和置信度）
    const agentWeights = this.calculateAgentWeights(state.contributions);

    // 合并所有贡献（使用加权平均，权重考虑历史表现）
    for (const contribution of state.contributions.values()) {
      const agentWeight = agentWeights.get(contribution.agentId) || contribution.confidence;
      // 合并实时状态
      if (contribution.contribution.realtimeState) {
        if (!consensus.realtimeState) {
          consensus.realtimeState = contribution.contribution.realtimeState;
        } else {
          // 合并道路状态更新（使用最高置信度）
          if (contribution.contribution.realtimeState.roadStatusUpdates) {
            const existingUpdates =
              consensus.realtimeState.roadStatusUpdates || [];
            const newUpdates =
              contribution.contribution.realtimeState.roadStatusUpdates;
            consensus.realtimeState.roadStatusUpdates = this.mergeRoadStatusUpdates(
              existingUpdates,
              newUpdates,
            );
          }
        }
      }

      // 合并预测数据（使用加权平均）
      if (contribution.contribution.predictions) {
        if (!consensus.predictions) {
          consensus.predictions = contribution.contribution.predictions;
        } else {
          // 合并失败风险预测（使用加权平均）
          if (contribution.contribution.predictions.failureRisk) {
            consensus.predictions.failureRisk = this.mergeFailureRiskPredictions(
              consensus.predictions.failureRisk,
              contribution.contribution.predictions.failureRisk,
              agentWeight, // 使用调整后的权重
            );
          }
        }
      }

      // 合并自适应参数（使用加权平均）
      if (contribution.contribution.adaptiveParameters) {
        if (!consensus.adaptiveParameters) {
          consensus.adaptiveParameters = contribution.contribution.adaptiveParameters;
        } else {
          consensus.adaptiveParameters = this.mergeAdaptiveParameters(
            consensus.adaptiveParameters,
            contribution.contribution.adaptiveParameters,
            agentWeight, // 使用调整后的权重
          );
        }
      }

      // 合并策略层（体验 / 预算分端写入，由不同 Agent 贡献）
      if (contribution.contribution.strategyLayer) {
        if (!consensus.strategyLayer) {
          consensus.strategyLayer = {};
        }
        const sl = contribution.contribution.strategyLayer;
        if (sl.experienceProposal) {
          consensus.strategyLayer.experienceProposal = sl.experienceProposal;
        }
        if (sl.budgetProposal) {
          consensus.strategyLayer.budgetProposal = sl.budgetProposal;
        }
      }
    }

    // 应用冲突解决
    for (const conflict of state.conflicts) {
      if (conflict.resolution) {
        // 应用冲突解决到共识
        this.applyConflictResolution(consensus, conflict);
      }
    }

    consensus.strategyLayer = {
      ...consensus.strategyLayer,
      consensusSummary: this.buildStrategyConsensusSummary(state, consensus),
    };

    state.consensus = consensus;
  }

  /**
   * 策略层中文摘要：显式标出未解决 STRATEGY_CONFLICT，供 UI / route_and_run 消费
   */
  private buildStrategyConsensusSummary(
    state: AgentCollaborationState,
    consensus: Partial<UnifiedWorldModel>,
  ): string {
    const openStrategy = state.conflicts.filter(
      (c) => c.conflictType === 'STRATEGY_CONFLICT' && !c.resolution,
    );
    const exp = consensus.strategyLayer?.experienceProposal;
    const bud = consensus.strategyLayer?.budgetProposal;
    const weightTiltLine = (): string | null => {
      if (!exp || !bud) {
        return null;
      }
      const wExp = exp.reasoningWeight ?? 0;
      const wBud = bud.reasoningWeight ?? 0;
      if (wExp > wBud * 1.05) {
        return `【加权倾向】reasoningWeight 对比略偏向体验侧（Exp ${wExp.toFixed(2)} vs Budget ${wBud.toFixed(2)}）；可与 DNA 享乐轴一致。`;
      }
      if (wBud > wExp * 1.05) {
        return `【加权倾向】reasoningWeight 对比略偏向预算侧（Budget ${wBud.toFixed(2)} vs Exp ${wExp.toFixed(2)}）；可与 DNA 节俭轴一致。`;
      }
      return `【加权倾向】体验与预算 reasoningWeight 接近（Exp ${wExp.toFixed(2)} / Budget ${wBud.toFixed(2)}），建议结合决策模板显式取舍。`;
    };
    if (openStrategy.length > 0) {
      return [
        '【策略层·待仲裁】高阶体验诉求与预算软顶存在冲突，需用户或规划器在体验溢价与预算之间做显式取舍。',
        exp
          ? `体验侧：${exp.tier}（置信度 ${(exp.confidence * 100).toFixed(0)}%）`
          : null,
        bud
          ? `预算侧：预期 ${bud.currency} ${bud.expectedSpend}，软顶 ${bud.softCeiling ?? '—'}，超支标记=${bud.overrunVsCeiling}`
          : null,
        weightTiltLine(),
      ]
        .filter(Boolean)
        .join(' ');
    }
    if (exp || bud) {
      return '【策略层】体验与预算提案已对齐记录；当前无未解决的策略冲突。';
    }
    return '【策略层】暂无体验/预算策略提案。';
  }

  /**
   * 外部可读快照（UnifiedWorldModelService / PlanningWorkbench）
   */
  getCollaborationBridgeView(tripId: string): {
    contributions: Array<{
      agentId: string;
      agentType: AgentType;
      confidence: number;
      timestamp: Date;
    }>;
    conflicts: Array<{
      id: string;
      conflictType: AgentConflict['conflictType'];
      agents: string[];
      resolution?: ConflictResolution;
    }>;
    consensusSummary: string | null;
    consensusConfidence: number;
    openConflictCount: number;
    strategyLayer?: UnifiedWorldModel['strategyLayer'];
  } {
    const state = this.collaborationStates.get(tripId);
    if (!state) {
      return {
        contributions: [],
        conflicts: [],
        consensusSummary: null,
        consensusConfidence: 0,
        openConflictCount: 0,
      };
    }

    const open = state.conflicts.filter((c) => !c.resolution);
    const contributions = Array.from(state.contributions.values()).map((c) => ({
      agentId: c.agentId,
      agentType: c.agentType,
      confidence: c.confidence,
      timestamp: c.timestamp,
    }));

    const unresolvedStrategy = open.filter(
      (c) => c.conflictType === 'STRATEGY_CONFLICT',
    ).length;

    let consensusConfidence = 0.75;
    if (open.length > 0) {
      consensusConfidence = Math.max(
        0.35,
        0.85 - open.length * 0.08 - unresolvedStrategy * 0.05,
      );
    }

    return {
      contributions,
      conflicts: state.conflicts.map((c) => ({
        id: c.id,
        conflictType: c.conflictType,
        agents: c.agents,
        resolution: c.resolution,
      })),
      consensusSummary:
        state.consensus.strategyLayer?.consensusSummary ?? null,
      consensusConfidence,
      openConflictCount: open.length,
      strategyLayer: state.consensus.strategyLayer,
    };
  }

  /**
   * 合并道路状态更新
   */
  private mergeRoadStatusUpdates(updates1: any[], updates2: any[]): any[] {
    const merged = new Map<string, any>();

    // 添加第一个集合的更新
    for (const update of updates1) {
      const key = update.roadId || update.id;
      merged.set(key, update);
    }

    // 合并第二个集合的更新（使用最高置信度）
    for (const update of updates2) {
      const key = update.roadId || update.id;
      const existing = merged.get(key);
      if (!existing || (update.confidence || 0) > (existing.confidence || 0)) {
        merged.set(key, update);
      }
    }

    return Array.from(merged.values());
  }

  /**
   * 合并失败风险预测
   */
  private mergeFailureRiskPredictions(
    prediction1: any,
    prediction2: any,
    weight2: number,
  ): any {
    // 简单合并：使用加权平均
    const weight1 = 1 - weight2;

    // 合并预测（简化实现）
    return {
      ...prediction1,
      predictions: prediction1.predictions.map((p1: any, index: number) => {
        const p2 = prediction2.predictions[index];
        if (!p2) {
          return p1;
        }

        // 合并风险级别（使用加权平均）
        const riskLevel1 = this.riskLevelToNumber(p1.riskLevel);
        const riskLevel2 = this.riskLevelToNumber(p2.riskLevel);
        const mergedRiskLevel =
          riskLevel1 * weight1 + riskLevel2 * weight2;

        return {
          ...p1,
          riskLevel: this.numberToRiskLevel(mergedRiskLevel),
        };
      }),
    };
  }

  /**
   * 合并自适应参数
   */
  private mergeAdaptiveParameters(
    params1: any,
    params2: any,
    weight2: number,
  ): any {
    const weight1 = 1 - weight2;

    return {
      routeDifficultyAdjustment:
        (params1.routeDifficultyAdjustment || 1.0) * weight1 +
        (params2.routeDifficultyAdjustment || 1.0) * weight2,
      timeEstimateAdjustment:
        (params1.timeEstimateAdjustment || 1.0) * weight1 +
        (params2.timeEstimateAdjustment || 1.0) * weight2,
      riskAssessmentAdjustment:
        (params1.riskAssessmentAdjustment || 1.0) * weight1 +
        (params2.riskAssessmentAdjustment || 1.0) * weight2,
    };
  }

  /**
   * 应用冲突解决
   */
  private applyConflictResolution(
    consensus: Partial<UnifiedWorldModel>,
    conflict: AgentConflict,
  ): void {
    if (!conflict.resolution) {
      return;
    }

    // 根据解决类型应用解决
    switch (conflict.resolution.resolutionType) {
      case 'HIGHEST_CONFIDENCE':
        // 使用最高置信度的数据
        const highestConfidence = conflict.conflictingData.reduce(
          (max, d) => (d.confidence > max.confidence ? d : max),
          conflict.conflictingData[0],
        );
        // 应用最高置信度数据到共识
        this.applyHighestConfidenceResolution(consensus, conflict, highestConfidence);
        break;

      case 'WEIGHTED_AVERAGE':
        // 使用加权平均
        this.applyWeightedAverageResolution(consensus, conflict);
        break;

      case 'CONSENSUS':
        // 使用共识数据（多数投票）
        this.applyConsensusResolution(consensus, conflict);
        break;

      case 'USER_INPUT':
        // 使用用户输入（已解决的数据）
        this.applyUserInputResolution(consensus, conflict);
        break;
    }
  }

  /**
   * 应用最高置信度解决策略
   */
  private applyHighestConfidenceResolution(
    consensus: Partial<UnifiedWorldModel>,
    conflict: AgentConflict,
    highestConfidence: AgentConflict['conflictingData'][0],
  ): void {
    // 根据冲突类型应用数据
    if (conflict.conflictType === 'DATA_CONFLICT') {
      // 应用道路状态数据
      if (highestConfidence.data.roadStatusUpdates) {
        if (!consensus.realtimeState) {
          consensus.realtimeState = {} as any;
        }
        const rt = consensus.realtimeState!;
        rt.roadStatusUpdates = highestConfidence.data.roadStatusUpdates;
      }
    } else if (conflict.conflictType === 'ASSESSMENT_CONFLICT') {
      // 应用自适应参数
      if (highestConfidence.data.adaptiveParameters) {
        consensus.adaptiveParameters = highestConfidence.data.adaptiveParameters;
      }
    } else if (conflict.conflictType === 'PREDICTION_CONFLICT') {
      // 应用预测数据
      if (highestConfidence.data.predictions) {
        consensus.predictions = highestConfidence.data.predictions;
      }
    }
  }

  /**
   * 应用加权平均解决策略
   */
  private applyWeightedAverageResolution(
    consensus: Partial<UnifiedWorldModel>,
    conflict: AgentConflict,
  ): void {
    // 计算总置信度
    const totalConfidence = conflict.conflictingData.reduce(
      (sum, d) => sum + d.confidence,
      0,
    );

    if (totalConfidence === 0) {
      return;
    }

    // 根据冲突类型应用加权平均
    if (conflict.conflictType === 'ASSESSMENT_CONFLICT') {
      // 加权平均自适应参数
      const weightedParams = conflict.conflictingData.reduce(
        (acc, d) => {
          const weight = d.confidence / totalConfidence;
          const params = d.data.adaptiveParameters || {};
          return {
            routeDifficultyAdjustment:
              (acc.routeDifficultyAdjustment || 1.0) +
              (params.routeDifficultyAdjustment || 1.0) * weight,
            timeEstimateAdjustment:
              (acc.timeEstimateAdjustment || 1.0) +
              (params.timeEstimateAdjustment || 1.0) * weight,
            riskAssessmentAdjustment:
              (acc.riskAssessmentAdjustment || 1.0) +
              (params.riskAssessmentAdjustment || 1.0) * weight,
          };
        },
        {
          routeDifficultyAdjustment: 0,
          timeEstimateAdjustment: 0,
          riskAssessmentAdjustment: 0,
        },
      );

      consensus.adaptiveParameters = weightedParams;
    } else if (conflict.conflictType === 'PREDICTION_CONFLICT') {
      // 加权平均预测数据（简化实现）
      // TODO: 实现更复杂的预测数据加权平均
    }
  }

  /**
   * 应用共识解决策略（多数投票）
   */
  private applyConsensusResolution(
    consensus: Partial<UnifiedWorldModel>,
    conflict: AgentConflict,
  ): void {
    // 统计每个值的投票数
    const votes = new Map<string, { count: number; confidence: number }>();

    for (const data of conflict.conflictingData) {
      const key = JSON.stringify(data.data);
      const existing = votes.get(key);
      if (existing) {
        existing.count++;
        existing.confidence = Math.max(existing.confidence, data.confidence);
      } else {
        votes.set(key, { count: 1, confidence: data.confidence });
      }
    }

    // 选择投票最多的值
    let maxVotes = 0;
    let consensusData: AgentConflict['conflictingData'][0] | null = null;

    for (const [key, vote] of votes.entries()) {
      if (vote.count > maxVotes) {
        maxVotes = vote.count;
        consensusData = conflict.conflictingData.find(
          (d) => JSON.stringify(d.data) === key,
        ) || null;
      }
    }

    if (consensusData) {
      // 应用共识数据
      this.applyHighestConfidenceResolution(consensus, conflict, consensusData);
    }
  }

  /**
   * 应用用户输入解决策略
   */
  private applyUserInputResolution(
    consensus: Partial<UnifiedWorldModel>,
    conflict: AgentConflict,
  ): void {
    // 用户输入已经在conflict.resolution.resolvedData中
    if (conflict.resolution?.resolvedData) {
      // 根据冲突类型应用用户输入的数据
      if (conflict.conflictType === 'DATA_CONFLICT') {
        if (conflict.resolution.resolvedData.roadStatusUpdates) {
          if (!consensus.realtimeState) {
            consensus.realtimeState = {} as any;
          }
          const rt = consensus.realtimeState!;
          rt.roadStatusUpdates =
            conflict.resolution.resolvedData.roadStatusUpdates;
        }
      } else if (conflict.conflictType === 'ASSESSMENT_CONFLICT') {
        if (conflict.resolution.resolvedData.adaptiveParameters) {
          consensus.adaptiveParameters =
            conflict.resolution.resolvedData.adaptiveParameters;
        }
      } else if (conflict.conflictType === 'PREDICTION_CONFLICT') {
        if (conflict.resolution.resolvedData.predictions) {
          consensus.predictions = conflict.resolution.resolvedData.predictions;
        }
      }
    }
  }

  /**
   * 风险级别转数字
   */
  private riskLevelToNumber(riskLevel: string): number {
    const map: Record<string, number> = {
      LOW: 0.25,
      MEDIUM: 0.5,
      HIGH: 0.75,
      CRITICAL: 1.0,
    };
    return map[riskLevel] || 0.5;
  }

  /**
   * 数字转风险级别
   */
  private numberToRiskLevel(num: number): string {
    if (num < 0.375) {
      return 'LOW';
    } else if (num < 0.625) {
      return 'MEDIUM';
    } else if (num < 0.875) {
      return 'HIGH';
    } else {
      return 'CRITICAL';
    }
  }

  /**
   * 计算智能体权重（基于历史表现和置信度）
   */
  private calculateAgentWeights(
    contributions: Map<string, AgentWorldModelContribution>,
  ): Map<string, number> {
    const weights = new Map<string, number>();

    for (const [agentId, contribution] of contributions) {
      // 基础权重 = 置信度
      let weight = contribution.confidence;

      // 基于智能体类型调整权重
      const typeWeights: Record<AgentType, number> = {
        GATEKEEPER_AGENT: 1.2,    // 门控智能体权重最高
        CORE_DECISION_AGENT: 1.15, // 核心决策智能体次之
        WEATHER_AGENT: 1.1,       // 天气智能体
        GEO_AGENT: 1.05,          // 地理智能体
        PLANNER_AGENT: 1.0,       // 规划智能体
        COST_AGENT: 0.95,         // 成本智能体
        EXPERIENCE_AGENT: 0.9,    // 体验智能体
        LOCAL_INSIGHT_AGENT: 0.85, // 本地洞察智能体
      };

      weight *= typeWeights[contribution.agentType] || 1.0;

      // 归一化权重到 0-1 范围
      weight = Math.min(1.0, Math.max(0.0, weight));

      weights.set(agentId, weight);
    }

    return weights;
  }
}
