// src/agent/services/planning-workbench-agent.service.ts
/**
 * PlanningWorkbenchAgent
 * 
 * 规划工作台的主 Agent，负责编排所有规划技能
 * 
 * 职责：
 * - 维护唯一 PlanState（唯一真相）
 * - 决定走 System1 还是 System2
 * - 在冲突时触发仲裁
 * - 在关键点要求用户确认
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { PlanState, PlanContext, PlanSkeletonSet } from '../../skills/plan/shared/plan-state.types';
import { ContextBuildSkill } from '../../skills/context/context-build.skill';
import { PlanArchitectGenerateSkeletonSkill } from '../../skills/plan/architect/plan-architect-generate-skeleton.skill';
import { PlanArchitectCompareOptionsSkill } from '../../skills/plan/architect/plan-architect-compare-options.skill';
import { PlanArchitectCommitOptionSkill } from '../../skills/plan/architect/plan-architect-commit-option.skill';
import { PlanBudgetEstimateBaselineSkill } from '../../skills/plan/budget/plan-budget-estimate-baseline.skill';
import { PlanBudgetDetectOverrunSkill } from '../../skills/plan/budget/plan-budget-detect-overrun.skill';
import { PlanTransitBuildTransferGraphSkill } from '../../skills/plan/transit/plan-transit-build-transfer-graph.skill';
import { PlanPaceComputeTimeWindowsSkill } from '../../skills/plan/pace/plan-pace-compute-time-windows.skill';
import { PlanPaceFatigueScoreSkill } from '../../skills/plan/pace/plan-pace-fatigue-score.skill';
import { PlanGatePrecheckSkill } from '../../skills/plan/gate/plan-gate-precheck.skill';
import { PlanGateRunThreeGuardiansSkill } from '../../skills/plan/gate/plan-gate-run-three-guardians.skill';
import { PlanConstraintsDetectConflictsSkill } from '../../skills/plan/constraints/plan-constraints-detect-conflicts.skill';
import { PlanLogAppendDecisionSkill } from '../../skills/plan/log/plan-log-append-decision.skill';
import { PersonaShellService, PersonaShellOutput } from './persona-shell.service';

export interface PlanningWorkbenchRequest {
  /** 规划上下文 */
  context: PlanContext;
  
  /** Trip ID（可选） */
  tripId?: string;
  
  /** 现有 PlanState（如果有） */
  existingPlanState?: PlanState;
  
  /** 用户操作（可选） */
  userAction?: 'generate' | 'compare' | 'commit' | 'adjust';
}

export interface PlanningWorkbenchResponse {
  /** 更新后的 PlanState */
  planState: PlanState;
  
  /** 输出到 UI 的内容 */
  uiOutput: {
    /** 方案卡（隐藏，仅内部使用） */
    skeletonOptions?: PlanSkeletonSet;
    
    /** 对比卡（隐藏，仅内部使用） */
    comparison?: any;
    
    /** 三人格输出（面向用户） */
    personas?: PersonaShellOutput;
    
    /** 健康度（隐藏，仅内部使用） */
    health?: {
      budget: 'healthy' | 'warning' | 'critical';
      pace: 'healthy' | 'warning' | 'critical';
      feasibility: 'healthy' | 'warning' | 'critical';
    };
    
    /** 需要用户确认的事项 */
    confirmations?: string[];
  };
}

@Injectable()
export class PlanningWorkbenchAgentService {
  private readonly logger = new Logger(PlanningWorkbenchAgentService.name);

  constructor(
    @Optional() private readonly contextBuild?: ContextBuildSkill,
    @Optional() private readonly architectGenerateSkeleton?: PlanArchitectGenerateSkeletonSkill,
    @Optional() private readonly architectCompareOptions?: PlanArchitectCompareOptionsSkill,
    @Optional() private readonly architectCommitOption?: PlanArchitectCommitOptionSkill,
    @Optional() private readonly budgetEstimateBaseline?: PlanBudgetEstimateBaselineSkill,
    @Optional() private readonly budgetDetectOverrun?: PlanBudgetDetectOverrunSkill,
    @Optional() private readonly transitBuildTransferGraph?: PlanTransitBuildTransferGraphSkill,
    @Optional() private readonly paceComputeTimeWindows?: PlanPaceComputeTimeWindowsSkill,
    @Optional() private readonly paceFatigueScore?: PlanPaceFatigueScoreSkill,
    @Optional() private readonly gatePrecheck?: PlanGatePrecheckSkill,
    @Optional() private readonly gateRunThreeGuardians?: PlanGateRunThreeGuardiansSkill,
    @Optional() private readonly constraintsDetectConflicts?: PlanConstraintsDetectConflictsSkill,
    @Optional() private readonly logAppendDecision?: PlanLogAppendDecisionSkill,
    @Optional() private readonly personaShell?: PersonaShellService,
  ) {}

  /**
   * 执行规划工作台流程
   */
  async execute(request: PlanningWorkbenchRequest): Promise<PlanningWorkbenchResponse> {
    this.logger.debug(`执行规划工作台: action=${request.userAction || 'generate'}, tripId=${request.tripId || 'none'}`);
    this.logger.debug(`技能注入状态: architectGenerateSkeleton=${!!this.architectGenerateSkeleton}, budgetEstimateBaseline=${!!this.budgetEstimateBaseline}, personaShell=${!!this.personaShell}`);

    try {
      // 1. 构建上下文（System 1）- 添加超时保护
      let world;
      if (request.tripId && this.contextBuild) {
        this.logger.debug('构建世界模型上下文...');
        try {
          const contextPromise = this.contextBuild.execute({
            tripId: request.tripId,
            phase: 'PLANNING',
            agent: 'PlanningWorkbench',
            userQuery: `规划工作台: ${request.context.destination.city || request.context.destination.country}`,
            tokenBudget: 3000,
          });
          const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('构建上下文超时（10秒）')), 10000);
          });
          const contextResult = await Promise.race([contextPromise, timeoutPromise]);
          // world 可以从 contextPackage 中提取
          this.logger.debug('世界模型上下文构建完成');
        } catch (contextError: any) {
          this.logger.warn(`构建上下文失败或超时: ${contextError.message}，继续执行`);
          // 继续执行，不阻塞
        }
      }

      // 2. 根据用户操作执行不同流程
      let planState: PlanState = request.existingPlanState || this.createInitialPlanState(request.context);
      const uiOutput: PlanningWorkbenchResponse['uiOutput'] = {};

      switch (request.userAction) {
        case 'generate':
          // 生成骨架方案 - 添加超时保护
          if (this.architectGenerateSkeleton) {
            this.logger.debug('开始生成行程骨架方案...');
            try {
              const skeletonPromise = this.architectGenerateSkeleton.execute({
                context: request.context,
                tripId: request.tripId,
                world,
              });
              const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('生成骨架方案超时（35秒）')), 35000);
              });
              const skeletonResult = await Promise.race([skeletonPromise, timeoutPromise]) as any;
              uiOutput.skeletonOptions = skeletonResult.skeletonSet;
              this.logger.debug(`行程骨架方案生成完成: ${skeletonResult.skeletonSet.options?.length || 0} 个方案`);
            } catch (skeletonError: any) {
              this.logger.error(`生成骨架方案失败或超时: ${skeletonError.message}`);
              // 返回默认方案，不阻塞整个流程
              uiOutput.skeletonOptions = {
                options: [{
                  id: 'default_1',
                  name: '默认方案',
                  dayThemes: Array.from({ length: request.context.days }, (_, i) => ({
                    day: i + 1,
                    theme: `第${i + 1}天`,
                    description: `在${request.context.destination.city || request.context.destination.country}的第${i + 1}天行程`,
                  })),
                  anchors: [],
                  transferDays: [],
                  rationale: {
                    philosophy: '默认方案（生成失败时使用）',
                    tradeoffs: [],
                    strengths: [],
                    weaknesses: [],
                  },
                }],
                recommendation: {
                  optionId: 'default_1',
                  reason: '生成失败，使用默认方案',
                },
              };
            }
          } else {
            this.logger.warn('PlanArchitectGenerateSkeletonSkill 未注入，跳过生成骨架方案');
          }
          break;

        case 'compare':
          // 对比方案（需要先有骨架方案）
          // 这里简化，实际应该从 request 或 planState 中获取 options
          break;

        case 'commit':
          // 提交方案（需要先有选定的方案）
          // 这里简化，实际应该从 request 中获取 selectedOption
          break;

        case 'adjust':
          // 调整计划
          break;

        default:
          // 默认流程：生成方案 - 添加超时保护
          if (this.architectGenerateSkeleton) {
            this.logger.debug('默认流程：开始生成行程骨架方案...');
            try {
              const skeletonPromise = this.architectGenerateSkeleton.execute({
                context: request.context,
                tripId: request.tripId,
                world,
              });
              const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('生成骨架方案超时（35秒）')), 35000);
              });
              const skeletonResult = await Promise.race([skeletonPromise, timeoutPromise]) as any;
              uiOutput.skeletonOptions = skeletonResult.skeletonSet;
              this.logger.debug(`默认流程：行程骨架方案生成完成: ${skeletonResult.skeletonSet.options?.length || 0} 个方案`);
            } catch (skeletonError: any) {
              this.logger.error(`默认流程：生成骨架方案失败或超时: ${skeletonError.message}`);
              // 返回默认方案
              uiOutput.skeletonOptions = {
                options: [{
                  id: 'default_1',
                  name: '默认方案',
                  dayThemes: Array.from({ length: request.context.days }, (_, i) => ({
                    day: i + 1,
                    theme: `第${i + 1}天`,
                    description: `在${request.context.destination.city || request.context.destination.country}的第${i + 1}天行程`,
                  })),
                  anchors: [],
                  transferDays: [],
                  rationale: {
                    philosophy: '默认方案（生成失败时使用）',
                    tradeoffs: [],
                    strengths: [],
                    weaknesses: [],
                  },
                }],
                recommendation: {
                  optionId: 'default_1',
                  reason: '生成失败，使用默认方案',
                },
              };
            }
          } else {
            this.logger.warn('PlanArchitectGenerateSkeletonSkill 未注入，跳过生成骨架方案');
          }
      }

      // 3. System 1 快速检查（预算、交通、节奏）
      if (planState.plan_id) {
        this.logger.debug('开始 System 1 快速检查...');
        
        // 预算估算
        if (this.budgetEstimateBaseline) {
          this.logger.debug('执行预算估算...');
          const budgetResult = await this.budgetEstimateBaseline.execute({
            planState,
            destination: request.context.destination,
          });
          planState.budget.breakdown = budgetResult.budgetBreakdown;
          this.logger.debug('预算估算完成');
        } else {
          this.logger.warn('PlanBudgetEstimateBaselineSkill 未注入，跳过预算估算');
        }

        // 超支检测
        if (this.budgetDetectOverrun) {
          const overrunResult = await this.budgetDetectOverrun.execute({ planState });
          if (overrunResult.overrun) {
            planState.budget.overrun = overrunResult.overrun;
          }
        }

        // 构建可达图
        if (this.transitBuildTransferGraph) {
          const transitResult = await this.transitBuildTransferGraph.execute({ planState });
          planState.mobility.transferGraph = transitResult.transferGraph;
        }

        // 计算时间窗
        if (this.paceComputeTimeWindows) {
          const timeWindowsResult = await this.paceComputeTimeWindows.execute({ planState });
          planState.pace.timeWindows = timeWindowsResult.timeWindows;
        }

        // 疲劳评分
        if (this.paceFatigueScore) {
          const fatigueResult = await this.paceFatigueScore.execute({ planState });
          planState.pace.fatigueScore = fatigueResult.fatigueScore;
        }

        // 门控预检查（System 1）
        if (this.gatePrecheck) {
          const gateResult = await this.gatePrecheck.execute({ planState });
          planState.gate = gateResult.gateStatus;
        }

        // 冲突检测
        if (this.constraintsDetectConflicts) {
          const conflictsResult = await this.constraintsDetectConflicts.execute({ planState });
          // 如果有冲突，可以触发仲裁
        }
      }

      // 4. System 2 深度评审（如果需要）
      if (planState.gate.status === 'NEED_CONFIRM' && this.gateRunThreeGuardians) {
        const guardiansResult = await this.gateRunThreeGuardians.execute({
          planState,
          tripId: request.tripId,
        });
        planState.gate = guardiansResult.gateStatus;
        if (guardiansResult.gateStatus.requiredUserConfirmations) {
          uiOutput.confirmations = guardiansResult.gateStatus.requiredUserConfirmations;
        }
      }

      // 5. 计算健康度（内部使用，不暴露给用户）
      uiOutput.health = this.computeHealth(planState);

      // 6. 包装为三人格输出（面向用户）
      if (this.personaShell) {
        this.logger.debug('包装为三人格输出...');
        uiOutput.personas = await this.personaShell.wrapAsPersonas(planState);
        this.logger.debug('三人格输出完成');
      } else {
        this.logger.warn('PersonaShellService 未注入，跳过三人格输出');
      }

      // 7. 记录决策日志
      if (this.logAppendDecision && planState.plan_id) {
        await this.logAppendDecision.execute({
          decision_id: `decision_${Date.now()}`,
          diff: { type: 'plan_update' },
          evidence_refs: planState.evidence_refs.map(e => e.source_title),
          rule_version: '1.0.0',
        });
      }

      return {
        planState,
        uiOutput,
      };
    } catch (error: any) {
      this.logger.error(`规划工作台执行失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 创建初始 PlanState
   */
  private createInitialPlanState(context: PlanContext): PlanState {
    return {
      plan_id: `plan_${Date.now()}`,
      plan_version: 1,
      constraints: {
        time: {
          days: context.days,
        },
        budget: context.constraints?.budget || {},
        fitness: context.constraints?.fitness || {},
        travelMode: context.travelMode,
        accommodation: context.constraints?.accommodation,
        mustDo: context.mustDo,
        mustAvoid: context.mustAvoid,
        companions: context.constraints?.companions,
      },
      itinerary: {
        tripId: context.existingPlanState?.plan_id || `trip_${Date.now()}`,
        routeDirectionId: `route_${Date.now()}`,
        segments: [],
      },
      mobility: {
        transferSegments: [],
      },
      budget: {},
      pace: {},
      gate: {
        status: 'NEED_CONFIRM',
        reasons: ['初始状态，待验证'],
        missingEvidence: [],
      },
      evidence_refs: [],
      decision_log_refs: [],
      status: 'DRAFT',
      metadata: {},
    };
  }

  /**
   * 计算健康度
   */
  private computeHealth(planState: PlanState): PlanningWorkbenchResponse['uiOutput']['health'] {
    const health: PlanningWorkbenchResponse['uiOutput']['health'] = {
      budget: 'healthy',
      pace: 'healthy',
      feasibility: 'healthy',
    };

    // 预算健康度
    if (planState.budget.overrun) {
      const overrunRatio = planState.budget.overrun.overrunAmount / (planState.constraints.budget?.total || 1);
      if (overrunRatio > 0.2) {
        health.budget = 'critical';
      } else if (overrunRatio > 0.1) {
        health.budget = 'warning';
      }
    }

    // 节奏健康度
    if (planState.pace.fatigueScore) {
      if (planState.pace.fatigueScore.paceScore > 85) {
        health.pace = 'critical';
      } else if (planState.pace.fatigueScore.paceScore > 70) {
        health.pace = 'warning';
      }
    }

    // 可达性健康度
    const infeasibleCount = planState.mobility.transferSegments.filter(
      seg => seg.feasibility === 'infeasible'
    ).length;
    if (infeasibleCount > 0) {
      health.feasibility = infeasibleCount > planState.mobility.transferSegments.length / 2 ? 'critical' : 'warning';
    }

    return health;
  }
}
