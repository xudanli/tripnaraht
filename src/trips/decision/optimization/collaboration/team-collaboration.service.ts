// src/trips/decision/optimization/collaboration/team-collaboration.service.ts
/**
 * 团队协同服务
 * 
 * 实现多用户（家庭/团队）的协同决策：
 * 1. 团队权重聚合
 * 2. 约束合并（最弱链原则）
 * 3. 冲突检测与解决
 * 4. 分组建议
 */

import { Injectable, Logger } from '@nestjs/common';
import { ObjectiveFunctionService } from '../objective-function.service';
import { ObjectiveFunctionWeights, DEFAULT_OBJECTIVE_WEIGHTS } from '../objective-function.interface';
import { WorldModelContext, RoutePlanDraft } from '../../shared/world-model.types';
import {
  ITeamCollaborationService,
  TeamConfig,
  TeamMember,
  TeamNegotiationResult,
  MemberEvaluation,
  TeamConflict,
  DecisionWeightMode,
} from './multi-user-collaboration.interface';

/**
 * 默认团队约束
 */
const DEFAULT_TEAM_CONSTRAINTS = {
  useWeakestLink: true,
  maxAcceptableDisagreement: 0.3,
  unanimityRequired: ['SAFETY_CRITICAL', 'EMERGENCY'],
};

@Injectable()
export class TeamCollaborationService implements ITeamCollaborationService {
  private readonly logger = new Logger(TeamCollaborationService.name);
  
  // 团队存储（生产环境应使用数据库）
  private teams: Map<string, TeamConfig> = new Map();

  constructor(
    private readonly objectiveFunction: ObjectiveFunctionService,
  ) {}

  /**
   * 创建团队
   */
  async createTeam(
    config: Omit<TeamConfig, 'teamId' | 'createdAt' | 'updatedAt'>
  ): Promise<TeamConfig> {
    const teamId = `team_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date().toISOString();
    
    const team: TeamConfig = {
      ...config,
      teamId,
      createdAt: now,
      updatedAt: now,
    };
    
    // 验证并规范化成员权重
    this.normalizeDecisionWeights(team);
    
    this.teams.set(teamId, team);
    this.logger.log(`[TeamCollaboration] 创建团队: ${team.name} (${teamId})`);
    
    return team;
  }

  /**
   * 添加成员
   */
  async addMember(
    teamId: string,
    member: Omit<TeamMember, 'joinedAt'>
  ): Promise<TeamConfig> {
    const team = this.teams.get(teamId);
    if (!team) {
      throw new Error(`团队不存在: ${teamId}`);
    }
    
    const newMember: TeamMember = {
      ...member,
      joinedAt: new Date().toISOString(),
    };
    
    team.members.push(newMember);
    team.updatedAt = new Date().toISOString();
    
    // 重新规范化权重
    this.normalizeDecisionWeights(team);
    
    this.logger.log(`[TeamCollaboration] 添加成员: ${member.displayName} -> ${team.name}`);
    
    return team;
  }

  /**
   * 移除成员
   */
  async removeMember(teamId: string, userId: string): Promise<TeamConfig> {
    const team = this.teams.get(teamId);
    if (!team) {
      throw new Error(`团队不存在: ${teamId}`);
    }
    
    team.members = team.members.filter(m => m.userId !== userId);
    team.updatedAt = new Date().toISOString();
    
    // 重新规范化权重
    this.normalizeDecisionWeights(team);
    
    return team;
  }

  /**
   * 获取团队
   */
  getTeam(teamId: string): TeamConfig | undefined {
    return this.teams.get(teamId);
  }

  /**
   * 计算团队综合权重
   */
  calculateTeamWeights(team: TeamConfig): ObjectiveFunctionWeights {
    if (team.members.length === 0) {
      return { ...DEFAULT_OBJECTIVE_WEIGHTS };
    }
    
    const weightKeys: (keyof ObjectiveFunctionWeights)[] = [
      'safety', 'experienceDensity', 'philosophyAlignment', 'timeSlack',
      'fatigueRisk', 'weatherRisk', 'budgetOverrun', 'pacingVariance',
    ];
    
    const aggregatedWeights: ObjectiveFunctionWeights = { ...DEFAULT_OBJECTIVE_WEIGHTS };
    
    // 根据决策权重模式聚合
    for (const key of weightKeys) {
      let weightedSum = 0;
      let totalWeight = 0;
      
      for (const member of team.members) {
        const memberWeight = this.getMemberDecisionWeight(member, team.decisionWeightMode);
        weightedSum += member.personalWeights[key] * memberWeight;
        totalWeight += memberWeight;
      }
      
      aggregatedWeights[key] = totalWeight > 0 ? weightedSum / totalWeight : DEFAULT_OBJECTIVE_WEIGHTS[key];
    }
    
    // 如果使用最弱链原则，提升安全和疲劳权重
    if (team.teamConstraints.useWeakestLink) {
      const weakestMember = this.findWeakestMember(team);
      if (weakestMember) {
        // 提升安全相关权重
        aggregatedWeights.safety = Math.max(aggregatedWeights.safety, 0.25);
        aggregatedWeights.fatigueRisk = Math.max(aggregatedWeights.fatigueRisk, 0.15);
      }
    }
    
    // 归一化
    return this.normalizeWeights(aggregatedWeights);
  }

  /**
   * 计算团队综合约束
   */
  calculateTeamConstraints(team: TeamConfig): TeamMember['specialConstraints'] {
    if (team.members.length === 0) {
      return undefined;
    }
    
    // 使用最保守的约束（最弱链原则）
    let minDailyAscent = Infinity;
    let minDailyHours = Infinity;
    let minAltitude = Infinity;
    let maxRestFrequency: 'LOW' | 'MEDIUM' | 'HIGH' = 'LOW';
    const allSpecialNeeds: string[] = [];
    
    for (const member of team.members) {
      const constraints = member.specialConstraints;
      if (!constraints) continue;
      
      if (constraints.maxDailyAscentM !== undefined) {
        minDailyAscent = Math.min(minDailyAscent, constraints.maxDailyAscentM);
      }
      if (constraints.maxDailyHours !== undefined) {
        minDailyHours = Math.min(minDailyHours, constraints.maxDailyHours);
      }
      if (constraints.altitudeLimit !== undefined) {
        minAltitude = Math.min(minAltitude, constraints.altitudeLimit);
      }
      if (constraints.restFrequency) {
        const freqOrder = { 'LOW': 0, 'MEDIUM': 1, 'HIGH': 2 };
        if (freqOrder[constraints.restFrequency] > freqOrder[maxRestFrequency]) {
          maxRestFrequency = constraints.restFrequency;
        }
      }
      if (constraints.specialNeeds) {
        allSpecialNeeds.push(...constraints.specialNeeds);
      }
    }
    
    return {
      maxDailyAscentM: minDailyAscent === Infinity ? undefined : minDailyAscent,
      maxDailyHours: minDailyHours === Infinity ? undefined : minDailyHours,
      altitudeLimit: minAltitude === Infinity ? undefined : minAltitude,
      restFrequency: maxRestFrequency,
      specialNeeds: [...new Set(allSpecialNeeds)],
    };
  }

  /**
   * 团队协商
   */
  async negotiateAsTeam(
    teamId: string,
    plan: RoutePlanDraft,
    world: WorldModelContext,
  ): Promise<TeamNegotiationResult> {
    const team = this.teams.get(teamId);
    if (!team) {
      throw new Error(`团队不存在: ${teamId}`);
    }
    
    this.logger.log(`[TeamCollaboration] 开始团队协商: ${team.name}`);
    
    // 1. 各成员独立评估
    const memberEvaluations = this.evaluateForAllMembers(team, plan, world);
    
    // 2. 计算团队综合权重和效用
    const teamWeights = this.calculateTeamWeights(team);
    this.objectiveFunction.updateWeights(teamWeights);
    const teamEvaluation = this.objectiveFunction.evaluate(plan, world);
    
    // 3. 检测冲突
    const conflicts = this.detectConflicts(team, memberEvaluations);
    
    // 4. 计算共识水平
    const consensusLevel = this.calculateConsensus(memberEvaluations);
    
    // 5. 确定团队决策
    const decision = this.determineTeamDecision(
      memberEvaluations,
      conflicts,
      consensusLevel,
      team.teamConstraints
    );
    
    // 6. 生成调整建议
    const recommendedAdjustments = this.generateAdjustmentRecommendations(
      team,
      memberEvaluations,
      conflicts
    );
    
    // 7. 分组建议（如果需要）
    const splitSuggestion = decision === 'SPLIT_REQUIRED'
      ? this.generateSplitSuggestion(team, conflicts)
      : undefined;
    
    // 8. 人工决策点
    const humanDecisionPoints = this.identifyHumanDecisionPoints(
      team,
      conflicts,
      memberEvaluations
    );
    
    // 9. 生成摘要
    const summary = this.generateSummary(
      team,
      decision,
      consensusLevel,
      conflicts,
      memberEvaluations
    );
    
    return {
      decision,
      consensusLevel,
      memberEvaluations,
      teamWeights,
      teamUtility: teamEvaluation.totalUtility,
      conflicts,
      recommendedAdjustments,
      splitSuggestion,
      humanDecisionPoints,
      summary,
    };
  }

  /**
   * 检测冲突
   */
  detectConflicts(team: TeamConfig, memberEvaluations: MemberEvaluation[]): TeamConflict[] {
    const conflicts: TeamConflict[] = [];
    
    // 1. 能力不匹配冲突
    const capabilityConflict = this.detectCapabilityMismatch(team);
    if (capabilityConflict) {
      conflicts.push(capabilityConflict);
    }
    
    // 2. 偏好冲突
    const preferenceConflicts = this.detectPreferenceConflicts(team, memberEvaluations);
    conflicts.push(...preferenceConflicts);
    
    // 3. 约束违规
    const constraintConflicts = this.detectConstraintViolations(team, memberEvaluations);
    conflicts.push(...constraintConflicts);
    
    // 4. 节奏分歧
    const paceConflict = this.detectPaceDisagreement(memberEvaluations);
    if (paceConflict) {
      conflicts.push(paceConflict);
    }
    
    return conflicts;
  }

  /**
   * 生成分组建议
   */
  generateSplitSuggestion(
    team: TeamConfig,
    conflicts: TeamConflict[],
  ): TeamNegotiationResult['splitSuggestion'] {
    // 只有严重冲突才建议分组
    const severeConflicts = conflicts.filter(c => 
      c.severity === 'HIGH' || c.severity === 'CRITICAL'
    );
    
    if (severeConflicts.length === 0) {
      return { needed: false, reason: '冲突可调和', groups: [] };
    }
    
    // 基于能力分组
    const groups = this.clusterMembersByCapability(team);
    
    if (groups.length <= 1) {
      return { needed: false, reason: '无法有效分组', groups: [] };
    }
    
    return {
      needed: true,
      reason: `检测到 ${severeConflicts.length} 个严重冲突，建议分组行动`,
      groups: groups.map((memberIds, idx) => ({
        groupId: `group_${idx + 1}`,
        members: memberIds,
        adjustedPlan: `针对 ${this.getGroupCapabilityLabel(team, memberIds)} 能力组的调整计划`,
      })),
    };
  }

  // ========== 私有方法 ==========

  /**
   * 规范化决策权重
   */
  private normalizeDecisionWeights(team: TeamConfig): void {
    if (team.members.length === 0) return;
    
    const totalWeight = team.members.reduce((sum, m) => sum + m.decisionWeight, 0);
    if (totalWeight > 0) {
      for (const member of team.members) {
        member.decisionWeight = member.decisionWeight / totalWeight;
      }
    } else {
      // 平均分配
      const equalWeight = 1 / team.members.length;
      for (const member of team.members) {
        member.decisionWeight = equalWeight;
      }
    }
  }

  /**
   * 获取成员决策权重
   */
  private getMemberDecisionWeight(member: TeamMember, mode: DecisionWeightMode): number {
    switch (mode) {
      case 'EQUAL':
        return 1;
      case 'LEADER_PRIORITY':
        return member.role === 'LEADER' ? 2 : 1;
      case 'CAPABILITY_BASED':
        // 能力越弱，权重越高（保护弱者）
        const capabilityScore = this.getCapabilityScore(member);
        return 2 - capabilityScore; // 0-1 -> 2-1
      case 'EXPERIENCE_BASED':
        return this.getExperienceScore(member);
      case 'CUSTOM':
      default:
        return member.decisionWeight;
    }
  }

  /**
   * 获取能力分数
   */
  private getCapabilityScore(member: TeamMember): number {
    const fitnessScores = { 'BEGINNER': 0.25, 'INTERMEDIATE': 0.5, 'ADVANCED': 0.75, 'EXPERT': 1 };
    const expScores = { 'NOVICE': 0.25, 'SOME_EXPERIENCE': 0.5, 'EXPERIENCED': 0.75, 'EXPERT': 1 };
    
    return (fitnessScores[member.fitnessLevel] + expScores[member.experienceLevel]) / 2;
  }

  /**
   * 获取经验分数
   */
  private getExperienceScore(member: TeamMember): number {
    const scores = { 'NOVICE': 0.5, 'SOME_EXPERIENCE': 0.75, 'EXPERIENCED': 1, 'EXPERT': 1.25 };
    return scores[member.experienceLevel];
  }

  /**
   * 找到最弱成员
   */
  private findWeakestMember(team: TeamConfig): TeamMember | undefined {
    if (team.members.length === 0) return undefined;
    
    return team.members.reduce((weakest, current) => {
      const weakestScore = this.getCapabilityScore(weakest);
      const currentScore = this.getCapabilityScore(current);
      return currentScore < weakestScore ? current : weakest;
    });
  }

  /**
   * 归一化权重
   */
  private normalizeWeights(weights: ObjectiveFunctionWeights): ObjectiveFunctionWeights {
    const total = Object.values(weights).reduce((sum, v) => sum + v, 0);
    if (total === 0) return weights;
    
    const normalized = { ...weights };
    for (const key of Object.keys(normalized) as (keyof ObjectiveFunctionWeights)[]) {
      normalized[key] = normalized[key] / total;
    }
    return normalized;
  }

  /**
   * 为所有成员评估计划
   */
  private evaluateForAllMembers(
    team: TeamConfig,
    plan: RoutePlanDraft,
    world: WorldModelContext,
  ): MemberEvaluation[] {
    return team.members.map(member => this.evaluateForMember(member, plan, world));
  }

  /**
   * 为单个成员评估计划
   */
  private evaluateForMember(
    member: TeamMember,
    plan: RoutePlanDraft,
    world: WorldModelContext,
  ): MemberEvaluation {
    // 使用成员个人权重评估
    this.objectiveFunction.updateWeights(member.personalWeights);
    const evaluation = this.objectiveFunction.evaluate(plan, world);
    
    // 检查个人约束
    const constraintViolations = this.checkMemberConstraints(member, plan);
    
    // 确定立场
    let stance: 'APPROVE' | 'CONCERN' | 'REJECT' = 'APPROVE';
    if (constraintViolations.length > 0 || evaluation.totalUtility < 0.4) {
      stance = 'REJECT';
    } else if (evaluation.totalUtility < 0.6 || !evaluation.isFeasible) {
      stance = 'CONCERN';
    }
    
    // 风险评估
    const fatigueRisk = this.assessFatigueRisk(member, plan);
    const safetyRisk = evaluation.breakdown.safetyScore < 0.7 ? 0.7 : 0.3;
    const enjoymentRisk = evaluation.breakdown.experienceScore < 0.5 ? 0.6 : 0.2;
    
    return {
      memberId: member.userId,
      memberName: member.displayName,
      personalUtility: evaluation.totalUtility,
      stance,
      concerns: constraintViolations,
      suggestions: this.generateMemberSuggestions(member, evaluation),
      riskAssessment: {
        overallRisk: this.calculateOverallRisk(fatigueRisk, safetyRisk, enjoymentRisk),
        fatigueRisk,
        safetyRisk,
        enjoymentRisk,
      },
      warnings: constraintViolations.length > 0 ? constraintViolations : undefined,
    };
  }

  /**
   * 检查成员约束
   */
  private checkMemberConstraints(member: TeamMember, plan: RoutePlanDraft): string[] {
    const violations: string[] = [];
    const constraints = member.specialConstraints;
    
    if (!constraints) return violations;
    
    // 检查日爬升
    if (constraints.maxDailyAscentM) {
      for (const segment of plan.segments) {
        if (segment.ascentM > constraints.maxDailyAscentM) {
          violations.push(`日爬升 ${segment.ascentM}m 超过 ${member.displayName} 的限制 ${constraints.maxDailyAscentM}m`);
        }
      }
    }
    
    // 更多约束检查...
    
    return violations;
  }

  /**
   * 评估疲劳风险
   */
  private assessFatigueRisk(member: TeamMember, plan: RoutePlanDraft): number {
    const capabilityScore = this.getCapabilityScore(member);
    // 能力越低，疲劳风险越高
    const baseRisk = 1 - capabilityScore;
    
    // 根据计划强度调整
    const avgAscent = plan.segments.reduce((sum, s) => sum + s.ascentM, 0) / Math.max(plan.segments.length, 1);
    const intensityFactor = Math.min(avgAscent / 800, 1); // 800m 作为基准
    
    return Math.min(baseRisk + intensityFactor * 0.3, 1);
  }

  /**
   * 计算总体风险
   */
  private calculateOverallRisk(
    fatigue: number,
    safety: number,
    enjoyment: number
  ): 'LOW' | 'MEDIUM' | 'HIGH' {
    const avg = (fatigue + safety + enjoyment) / 3;
    if (avg < 0.3) return 'LOW';
    if (avg < 0.6) return 'MEDIUM';
    return 'HIGH';
  }

  /**
   * 生成成员建议
   */
  private generateMemberSuggestions(
    member: TeamMember,
    evaluation: any
  ): string[] {
    const suggestions: string[] = [];
    
    if (evaluation.totalUtility < 0.5) {
      suggestions.push('建议降低行程强度');
    }
    
    if (member.fitnessLevel === 'BEGINNER') {
      suggestions.push('建议增加休息时间');
    }
    
    return suggestions;
  }

  /**
   * 计算共识水平
   */
  private calculateConsensus(evaluations: MemberEvaluation[]): number {
    if (evaluations.length === 0) return 1;
    
    const utilities = evaluations.map(e => e.personalUtility);
    const mean = utilities.reduce((a, b) => a + b, 0) / utilities.length;
    const variance = utilities.reduce((sum, u) => sum + Math.pow(u - mean, 2), 0) / utilities.length;
    
    // 共识 = 1 - 标准差
    return Math.max(0, 1 - Math.sqrt(variance));
  }

  /**
   * 确定团队决策
   */
  private determineTeamDecision(
    evaluations: MemberEvaluation[],
    conflicts: TeamConflict[],
    consensus: number,
    constraints: TeamConfig['teamConstraints']
  ): TeamNegotiationResult['decision'] {
    // 检查是否有拒绝
    const rejectCount = evaluations.filter(e => e.stance === 'REJECT').length;
    const concernCount = evaluations.filter(e => e.stance === 'CONCERN').length;
    
    // 严重冲突
    if (conflicts.some(c => c.severity === 'CRITICAL')) {
      return 'REQUIRES_DISCUSSION';
    }
    
    // 多人拒绝
    if (rejectCount > evaluations.length / 2) {
      return 'REJECT';
    }
    
    // 分歧过大
    if (consensus < (1 - constraints.maxAcceptableDisagreement)) {
      return 'SPLIT_REQUIRED';
    }
    
    // 有关切但可接受
    if (concernCount > 0 || rejectCount > 0) {
      return 'CONDITIONAL_APPROVE';
    }
    
    return 'APPROVE';
  }

  /**
   * 生成调整建议
   */
  private generateAdjustmentRecommendations(
    team: TeamConfig,
    evaluations: MemberEvaluation[],
    conflicts: TeamConflict[]
  ): TeamNegotiationResult['recommendedAdjustments'] {
    const adjustments: TeamNegotiationResult['recommendedAdjustments'] = [];
    
    // 基于冲突生成调整
    for (const conflict of conflicts) {
      if (conflict.severity === 'HIGH' || conflict.severity === 'CRITICAL') {
        for (const resolution of conflict.possibleResolutions.slice(0, 2)) {
          adjustments.push({
            type: conflict.type,
            description: resolution.description,
            priority: conflict.severity === 'CRITICAL' ? 'CRITICAL' : 'HIGH',
            beneficiaries: conflict.involvedMembers,
          });
        }
      }
    }
    
    // 基于个人关切生成调整
    for (const evaluation of evaluations) {
      if (evaluation.stance === 'REJECT' || evaluation.stance === 'CONCERN') {
        for (const suggestion of evaluation.suggestions) {
          adjustments.push({
            type: 'MEMBER_SUGGESTION',
            description: suggestion,
            priority: evaluation.stance === 'REJECT' ? 'HIGH' : 'MEDIUM',
            beneficiaries: [evaluation.memberId],
          });
        }
      }
    }
    
    return adjustments;
  }

  /**
   * 识别人工决策点
   */
  private identifyHumanDecisionPoints(
    team: TeamConfig,
    conflicts: TeamConflict[],
    evaluations: MemberEvaluation[]
  ): TeamNegotiationResult['humanDecisionPoints'] {
    const points: TeamNegotiationResult['humanDecisionPoints'] = [];
    
    // 严重冲突需要人工介入
    for (const conflict of conflicts.filter(c => c.severity === 'CRITICAL')) {
      points.push({
        id: conflict.conflictId,
        question: `如何解决 ${conflict.description}？`,
        options: conflict.possibleResolutions.map(r => r.description),
        recommendation: conflict.possibleResolutions[0]?.description || '需要讨论',
      });
    }
    
    // 立场分歧需要人工决策
    const approveCount = evaluations.filter(e => e.stance === 'APPROVE').length;
    const rejectCount = evaluations.filter(e => e.stance === 'REJECT').length;
    
    if (approveCount > 0 && rejectCount > 0) {
      points.push({
        id: 'stance_conflict',
        question: '团队成员意见分歧，如何决定？',
        options: ['采用领队意见', '多数决定', '重新规划', '分组行动'],
        recommendation: '重新规划以协调各方需求',
      });
    }
    
    return points;
  }

  /**
   * 检测能力不匹配
   */
  private detectCapabilityMismatch(team: TeamConfig): TeamConflict | null {
    const capabilities = team.members.map(m => ({
      id: m.userId,
      score: this.getCapabilityScore(m),
    }));
    
    const max = Math.max(...capabilities.map(c => c.score));
    const min = Math.min(...capabilities.map(c => c.score));
    const gap = max - min;
    
    if (gap > 0.5) {
      const weakMembers = capabilities.filter(c => c.score < 0.4).map(c => c.id);
      const strongMembers = capabilities.filter(c => c.score > 0.7).map(c => c.id);
      
      return {
        conflictId: `cap_mismatch_${Date.now()}`,
        type: 'CAPABILITY_MISMATCH',
        involvedMembers: [...weakMembers, ...strongMembers],
        description: `能力差距过大 (${(gap * 100).toFixed(0)}%)，可能导致节奏不协调`,
        severity: gap > 0.7 ? 'CRITICAL' : 'HIGH',
        possibleResolutions: [
          {
            id: 'reduce_intensity',
            description: '降低整体行程强度以适应所有成员',
            impact: '经验丰富者可能感到不够刺激',
            acceptability: 0.7,
          },
          {
            id: 'split_activities',
            description: '部分活动分组进行',
            impact: '减少团队共同体验',
            acceptability: 0.5,
          },
          {
            id: 'add_rest_days',
            description: '增加休息日以平衡',
            impact: '延长行程总时间',
            acceptability: 0.6,
          },
        ],
      };
    }
    
    return null;
  }

  /**
   * 检测偏好冲突
   */
  private detectPreferenceConflicts(
    team: TeamConfig,
    evaluations: MemberEvaluation[]
  ): TeamConflict[] {
    const conflicts: TeamConflict[] = [];
    
    // 检查效用分歧
    const utilities = evaluations.map(e => e.personalUtility);
    const avgUtility = utilities.reduce((a, b) => a + b, 0) / utilities.length;
    
    const lowUtilityMembers = evaluations.filter(e => e.personalUtility < avgUtility - 0.2);
    const highUtilityMembers = evaluations.filter(e => e.personalUtility > avgUtility + 0.2);
    
    if (lowUtilityMembers.length > 0 && highUtilityMembers.length > 0) {
      conflicts.push({
        conflictId: `pref_conflict_${Date.now()}`,
        type: 'PREFERENCE_CONFLICT',
        involvedMembers: [...lowUtilityMembers.map(e => e.memberId), ...highUtilityMembers.map(e => e.memberId)],
        description: '成员对计划的满意度差异较大',
        severity: 'MEDIUM',
        possibleResolutions: [
          {
            id: 'adjust_activities',
            description: '调整活动组合以平衡各方偏好',
            impact: '需要重新规划部分行程',
            acceptability: 0.8,
          },
          {
            id: 'add_options',
            description: '增加可选活动让成员自由选择',
            impact: '增加协调复杂度',
            acceptability: 0.6,
          },
        ],
      });
    }
    
    return conflicts;
  }

  /**
   * 检测约束违规
   */
  private detectConstraintViolations(
    team: TeamConfig,
    evaluations: MemberEvaluation[]
  ): TeamConflict[] {
    const conflicts: TeamConflict[] = [];
    
    for (const evaluation of evaluations) {
      if (evaluation.warnings && evaluation.warnings.length > 0) {
        conflicts.push({
          conflictId: `constraint_${evaluation.memberId}_${Date.now()}`,
          type: 'CONSTRAINT_VIOLATION',
          involvedMembers: [evaluation.memberId],
          description: evaluation.warnings.join('; '),
          severity: 'HIGH',
          possibleResolutions: [
            {
              id: 'modify_plan',
              description: `调整计划以满足 ${evaluation.memberName} 的约束`,
              impact: '可能降低整体体验密度',
              acceptability: 0.9,
            },
          ],
        });
      }
    }
    
    return conflicts;
  }

  /**
   * 检测节奏分歧
   */
  private detectPaceDisagreement(evaluations: MemberEvaluation[]): TeamConflict | null {
    const fatigueRisks = evaluations.map(e => e.riskAssessment.fatigueRisk);
    const maxFatigue = Math.max(...fatigueRisks);
    const minFatigue = Math.min(...fatigueRisks);
    
    if (maxFatigue - minFatigue > 0.4) {
      const highFatigueMembers = evaluations.filter(e => e.riskAssessment.fatigueRisk > 0.6).map(e => e.memberId);
      const lowFatigueMembers = evaluations.filter(e => e.riskAssessment.fatigueRisk < 0.3).map(e => e.memberId);
      
      return {
        conflictId: `pace_${Date.now()}`,
        type: 'PACE_DISAGREEMENT',
        involvedMembers: [...highFatigueMembers, ...lowFatigueMembers],
        description: '成员间疲劳承受能力差异大，节奏难以统一',
        severity: 'MEDIUM',
        possibleResolutions: [
          {
            id: 'slower_pace',
            description: '采用较慢节奏适应所有人',
            impact: '可能无法完成所有计划活动',
            acceptability: 0.7,
          },
          {
            id: 'flexible_schedule',
            description: '增加弹性时间缓冲',
            impact: '需要更长的行程时间',
            acceptability: 0.6,
          },
        ],
      };
    }
    
    return null;
  }

  /**
   * 基于能力聚类成员
   */
  private clusterMembersByCapability(team: TeamConfig): string[][] {
    const members = team.members.map(m => ({
      id: m.userId,
      score: this.getCapabilityScore(m),
    }));
    
    // 简单二分法
    const threshold = 0.5;
    const lowCapacity = members.filter(m => m.score < threshold).map(m => m.id);
    const highCapacity = members.filter(m => m.score >= threshold).map(m => m.id);
    
    if (lowCapacity.length === 0 || highCapacity.length === 0) {
      return [members.map(m => m.id)];
    }
    
    return [lowCapacity, highCapacity];
  }

  /**
   * 获取组能力标签
   */
  private getGroupCapabilityLabel(team: TeamConfig, memberIds: string[]): string {
    const members = team.members.filter(m => memberIds.includes(m.userId));
    const avgScore = members.reduce((sum, m) => sum + this.getCapabilityScore(m), 0) / members.length;
    
    if (avgScore < 0.4) return '初级';
    if (avgScore < 0.7) return '中级';
    return '高级';
  }

  /**
   * 生成摘要
   */
  private generateSummary(
    team: TeamConfig,
    decision: TeamNegotiationResult['decision'],
    consensus: number,
    conflicts: TeamConflict[],
    evaluations: MemberEvaluation[]
  ): string {
    const decisionText = {
      'APPROVE': '通过',
      'REJECT': '拒绝',
      'CONDITIONAL_APPROVE': '有条件通过',
      'SPLIT_REQUIRED': '建议分组',
      'REQUIRES_DISCUSSION': '需要讨论',
    }[decision];
    
    const approveCount = evaluations.filter(e => e.stance === 'APPROVE').length;
    const conflictText = conflicts.length > 0
      ? `，检测到 ${conflicts.length} 个冲突`
      : '';
    
    return `团队决策：${decisionText}。共识度 ${(consensus * 100).toFixed(0)}%，` +
           `${approveCount}/${evaluations.length} 成员支持${conflictText}。`;
  }
}
