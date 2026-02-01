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

import { Injectable, Logger, Optional, NotFoundException } from '@nestjs/common';
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
import { PrismaService } from '../../prisma/prisma.service';
import { StateStoreService } from '../infra/state-store.service';
import { TripRunManagerService } from './trip-run-manager.service';
import { DecisionDraftStorageService } from '../../decision-draft/storage/decision-draft-storage.service';

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
    @Optional() private readonly prisma?: PrismaService,
    @Optional() private readonly stateStore?: StateStoreService,
    @Optional() private readonly tripRunManager?: TripRunManagerService,
    @Optional() private readonly decisionDraftStorage?: DecisionDraftStorageService,
  ) {}

  /**
   * 执行规划工作台流程
   */
  async execute(request: PlanningWorkbenchRequest): Promise<PlanningWorkbenchResponse> {
    this.logger.debug(`执行规划工作台: action=${request.userAction || 'generate'}, tripId=${request.tripId || 'none'}`);
    this.logger.debug(`技能注入状态: architectGenerateSkeleton=${!!this.architectGenerateSkeleton}, budgetEstimateBaseline=${!!this.budgetEstimateBaseline}, personaShell=${!!this.personaShell}`);

    // === 创建或获取 TripRun 记录 ===
    let tripRunId: string | null = null;
    let attemptNumber = 1;
    let attemptId: string | null = null;
    
    if (this.tripRunManager) {
      try {
        // 从 request 的 metadata 中获取 tripRunId（如果 AgentService 已创建）
        const metadata = (request as any).metadata || {};
        tripRunId = metadata.tripRunId || null;
        
        if (!tripRunId) {
          // 创建新的 TripRun
          tripRunId = await this.tripRunManager.createTripRun({
            tripId: request.tripId || null,
            userId: metadata.userId || null,
            userQuery: `规划工作台: ${request.context.destination.city || request.context.destination.country}`,
            planningPhase: 'PLANNING',
            currentAgent: 'PlanningWorkbench',
            metadata: {
              userAction: request.userAction || 'generate',
            },
          });
        }
        
        if (tripRunId) {
          this.logger.debug(`Using TripRun: ${tripRunId} for PlanningWorkbench`);
        }
      } catch (error: any) {
        this.logger.warn(`Failed to create/get TripRun: ${error.message}`);
        // 不阻塞主流程
      }
    }

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
          // 生成骨架方案（技能层已有超时保护，不需要重复）
          if (this.architectGenerateSkeleton) {
            this.logger.debug('开始生成行程骨架方案...');
            
            // === 创建 TripAttempt 记录 ===
            if (tripRunId && this.tripRunManager) {
              try {
                attemptId = await this.tripRunManager.createTripAttempt({
                  tripRunId,
                  attemptNumber,
                  planOutline: `生成行程骨架方案: ${request.context.destination.city || request.context.destination.country}`,
                  nextActions: ['plan.architect.generateSkeleton'],
                  metadata: {
                    userAction: 'generate',
                  },
                });
                if (attemptId) {
                  this.logger.debug(`Created TripAttempt: ${attemptId} for generate`);
                }
              } catch (error: any) {
                this.logger.warn(`Failed to create TripAttempt: ${error.message}`);
              }
            }
            
            try {
              // 直接调用，技能层会处理超时和错误
              const skeletonResult = await this.architectGenerateSkeleton.execute({
                context: request.context,
                tripId: request.tripId,
                world,
              });
              uiOutput.skeletonOptions = skeletonResult.skeletonSet;
              
              // === 更新 TripAttempt 为 COMPLETED ===
              if (attemptId && this.tripRunManager) {
                try {
                  await this.tripRunManager.completeTripAttempt(
                    attemptId,
                    `成功生成 ${skeletonResult.skeletonSet.options?.length || 0} 个骨架方案`,
                    {
                      skeletonSet: {
                        optionCount: skeletonResult.skeletonSet.options?.length || 0,
                        recommendation: skeletonResult.skeletonSet.recommendation,
                      },
                    },
                  );
                } catch (error: any) {
                  this.logger.warn(`Failed to update TripAttempt to COMPLETED: ${error.message}`);
                }
              }
              
              // 检查是否是默认方案
              const isDefault = skeletonResult.skeletonSet.options?.some(
                opt => opt.id === 'default_1' || opt.name === '默认方案'
              );
              
              if (isDefault) {
                this.logger.warn(`生成骨架方案失败，已使用默认方案（${skeletonResult.skeletonSet.options?.length || 0} 个方案）`);
              } else {
                this.logger.debug(`行程骨架方案生成完成: ${skeletonResult.skeletonSet.options?.length || 0} 个方案`);
              }
            } catch (skeletonError: any) {
              // === 更新 TripAttempt 为 FAILED ===
              if (attemptId && this.tripRunManager) {
                try {
                  await this.tripRunManager.failTripAttempt(
                    attemptId,
                    `生成骨架方案失败: ${skeletonError.message}`,
                  );
                } catch (error: any) {
                  this.logger.warn(`Failed to update TripAttempt to FAILED: ${error.message}`);
                }
              }
              
              // 技能层应该已经返回默认方案，这里只记录日志
              const isTimeout = skeletonError.message?.includes('超时') || skeletonError.message?.includes('timeout');
              if (isTimeout) {
                this.logger.warn(`生成骨架方案超时: ${skeletonError.message}，技能层应已返回默认方案`);
              } else {
                this.logger.error(`生成骨架方案失败: ${skeletonError.message}，技能层应已返回默认方案`);
              }
              // 如果技能层抛出异常（不应该发生），创建一个默认方案作为兜底
              if (!uiOutput.skeletonOptions) {
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
          // 默认流程：生成方案（技能层已有超时保护，不需要重复）
          if (this.architectGenerateSkeleton) {
            this.logger.debug('默认流程：开始生成行程骨架方案...');
            try {
              // 直接调用，技能层会处理超时和错误
              const skeletonResult = await this.architectGenerateSkeleton.execute({
                context: request.context,
                tripId: request.tripId,
                world,
              });
              uiOutput.skeletonOptions = skeletonResult.skeletonSet;
              
              // 检查是否是默认方案
              const isDefault = skeletonResult.skeletonSet.options?.some(
                opt => opt.id === 'default_1' || opt.name === '默认方案'
              );
              
              if (isDefault) {
                this.logger.warn(`默认流程：生成骨架方案失败，已使用默认方案（${skeletonResult.skeletonSet.options?.length || 0} 个方案）`);
              } else {
                this.logger.debug(`默认流程：行程骨架方案生成完成: ${skeletonResult.skeletonSet.options?.length || 0} 个方案`);
              }
            } catch (skeletonError: any) {
              // 技能层应该已经返回默认方案，这里只记录日志
              const isTimeout = skeletonError.message?.includes('超时') || skeletonError.message?.includes('timeout');
              if (isTimeout) {
                this.logger.warn(`默认流程：生成骨架方案超时: ${skeletonError.message}，技能层应已返回默认方案`);
              } else {
                this.logger.error(`默认流程：生成骨架方案失败: ${skeletonError.message}，技能层应已返回默认方案`);
              }
              // 如果技能层抛出异常（不应该发生），创建一个默认方案作为兜底
              if (!uiOutput.skeletonOptions) {
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
            }
          } else {
            this.logger.warn('PlanArchitectGenerateSkeletonSkill 未注入，跳过生成骨架方案');
          }
      }

      // 3. System 1 快速检查（预算、交通、节奏）
      if (planState.plan_id) {
        this.logger.debug('开始 System 1 快速检查...');
        
        // 预算估算（添加错误处理，失败时继续执行）
        if (this.budgetEstimateBaseline) {
          this.logger.debug('执行预算估算...');
          try {
            const budgetResult = await this.budgetEstimateBaseline.execute({
              planState,
              destination: request.context.destination,
            });
            planState.budget.breakdown = budgetResult.budgetBreakdown;
            this.logger.debug('预算估算完成');
          } catch (budgetError: any) {
            // 预算估算失败，记录警告但继续执行
            const isTimeout = budgetError.message?.includes('超时') || budgetError.message?.includes('timeout');
            if (isTimeout) {
              this.logger.warn(`预算估算超时: ${budgetError.message}，已使用默认预算拆分`);
            } else {
              this.logger.warn(`预算估算失败: ${budgetError.message}，已使用默认预算拆分`);
            }
            // 技能层应该已经返回默认预算拆分，这里不需要额外处理
          }
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

      // 8. 保存方案到 StateStore 和数据库
      if (planState.plan_id && request.tripId) {
        await this.savePlan(planState, uiOutput, request.tripId);
      }

      // === 更新 TripRun 为 COMPLETED ===
      if (tripRunId && this.tripRunManager) {
        try {
          await this.tripRunManager.completeTripRun(tripRunId, {
            userAction: request.userAction || 'generate',
            completed: true,
          });
        } catch (error: any) {
          this.logger.warn(`Failed to update TripRun to COMPLETED: ${error.message}`);
        }
      }
      
      return {
        planState,
        uiOutput,
      };
    } catch (error: any) {
      this.logger.error(`规划工作台执行失败: ${error.message}`, error.stack);
      
      // === 更新 TripRun 为 FAILED ===
      if (tripRunId && this.tripRunManager) {
        try {
          await this.tripRunManager.failTripRun(tripRunId, error, {
            userAction: request.userAction || 'generate',
          });
        } catch (updateError: any) {
          this.logger.warn(`Failed to update TripRun to FAILED: ${updateError.message}`);
        }
      }
      
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

  /**
   * 提交规划方案到行程
   */
  async commitPlan(
    planId: string,
    tripId: string,
    options?: { partialCommit?: boolean; commitDays?: number[] },
  ): Promise<{
    tripId: string;
    planId: string;
    committedAt: string;
    changes: {
      added: number;
      modified: number;
      removed: number;
    };
  }> {
    this.logger.debug(`提交方案: planId=${planId}, tripId=${tripId}, partialCommit=${options?.partialCommit || false}`);

    try {
      // 1. 获取 PlanState
      let planState: PlanState | null = null;
      
      // 尝试从 StateStore 获取
      if (this.stateStore) {
        const stored = await this.stateStore.get<PlanState>(planId, 'PlanState');
        if (stored) {
          planState = stored.data;
          this.logger.debug(`从 StateStore 获取 PlanState: ${planId}`);
        }
      }

      // 如果 StateStore 中没有，尝试从 Trip metadata 获取
      if (!planState && this.prisma) {
        const trip = await this.prisma.trip.findUnique({
          where: { id: tripId },
          select: { metadata: true },
        });

        if (trip?.metadata) {
          const metadata = trip.metadata as any;
          if (metadata.planState && metadata.planState.plan_id === planId) {
            planState = metadata.planState;
            this.logger.debug(`从 Trip metadata 获取 PlanState: ${planId}`);
          }
        }
      }

      if (!planState) {
        throw new NotFoundException(`找不到规划方案: ${planId}`);
      }

      // 2. 验证 Trip 是否存在
      if (this.prisma) {
        const trip = await this.prisma.trip.findUnique({
          where: { id: tripId },
          include: {
            TripDay: {
              include: {
                ItineraryItem: true,
              },
              orderBy: {
                date: 'asc',
              },
            },
          },
        });

        if (!trip) {
          throw new NotFoundException(`找不到行程: ${tripId}`);
        }

        // 3. 计算变更统计
        const changes = {
          added: 0,
          modified: 0,
          removed: 0,
        };

        // 4. 保存 PlanState 到 Trip metadata
        const metadata = (trip.metadata as any) || {};
        const previousPlanState = metadata.planState;
        
        metadata.planState = planState;
        metadata.lastCommittedPlanId = planId;
        metadata.lastCommittedAt = new Date().toISOString();

        // 5. 如果支持部分提交，只更新指定的天数
        if (options?.partialCommit && options?.commitDays && options.commitDays.length > 0) {
          // 部分提交：只更新指定天数的行程项
          // 这里简化处理，实际应该根据 PlanState.itinerary.segments 来更新对应的 ItineraryItem
          this.logger.debug(`部分提交: 更新天数 ${options.commitDays.join(', ')}`);
          
          // 更新 PlanState 状态
          planState.status = 'PROPOSED';
          
          // 计算变更（简化处理）
          const affectedDays = options.commitDays;
          changes.added = affectedDays.length; // 简化：假设都是新增
        } else {
          // 全量提交：更新整个 PlanState
          planState.status = 'LOCKED';
          
          // 计算变更（简化处理）
          if (previousPlanState) {
            const previousSegments = previousPlanState.itinerary?.segments || [];
            const currentSegments = planState.itinerary?.segments || [];
            changes.added = currentSegments.length - previousSegments.length;
            changes.modified = Math.min(previousSegments.length, currentSegments.length);
          } else {
            changes.added = planState.itinerary?.segments?.length || 0;
          }
        }

        // 6. 更新 Trip metadata
        await this.prisma.trip.update({
          where: { id: tripId },
          data: {
            metadata: metadata as any,
            updatedAt: new Date(),
          },
        });

        // 7. 更新 StateStore（如果可用）
        if (this.stateStore) {
          const currentVersion = await this.stateStore.getVersion(planId, 'PlanState');
          if (currentVersion !== null) {
            await this.stateStore.update(
              planId,
              'PlanState',
              [{ op: 'replace', path: '/', value: planState }],
              currentVersion,
              'PlanningWorkbenchAgentService',
              `commit_${planId}`,
              { 
                action: 'commit', 
                reason: `Commit plan to trip ${tripId}${options?.partialCommit ? ' (partial)' : ''}`,
              },
            );
          } else {
            await this.stateStore.create(
              planId,
              'PlanState',
              planState,
              'PlanningWorkbenchAgentService',
              `commit_${planId}`,
            );
          }
        }

        this.logger.debug(`方案提交成功: planId=${planId}, tripId=${tripId}, changes=${JSON.stringify(changes)}`);

        return {
          tripId,
          planId,
          committedAt: new Date().toISOString(),
          changes,
        };
      } else {
        // 如果没有 Prisma，只返回基本响应
        this.logger.warn('PrismaService 未注入，无法保存到数据库');
        return {
          tripId,
          planId,
          committedAt: new Date().toISOString(),
          changes: {
            added: 0,
            modified: 0,
            removed: 0,
          },
        };
      }
    } catch (error: any) {
      this.logger.error(`提交方案失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 获取 PlanState
   */
  async getPlanState(planId: string): Promise<{ planId: string; planState: PlanState | null }> {
    this.logger.debug(`获取 PlanState: planId=${planId}`);

    // 尝试从 StateStore 获取
    if (this.stateStore) {
      const stored = await this.stateStore.get<PlanState>(planId, 'PlanState');
      if (stored) {
        return {
          planId,
          planState: stored.data,
        };
      }
    }

    // 如果 StateStore 中没有，尝试从数据库获取（如果使用 PlanningPlan 表）
    // 目前先返回 null，后续可以添加数据库查询

    return {
      planId,
      planState: null,
    };
  }

  /**
   * 获取行程的规划工作台数据
   */
  async getTripWorkbench(tripId: string): Promise<{
    tripId: string;
    currentPlan?: {
      planId: string;
      planVersion: number;
      status: 'DRAFT' | 'PROPOSED' | 'NEED_CONFIRM' | 'LOCKED';
      planState: PlanState;
      uiOutput: PlanningWorkbenchResponse['uiOutput'];
      createdAt: string;
      updatedAt: string;
    };
    planHistory: Array<{
      planId: string;
      planVersion: number;
      status: string;
      createdAt: string;
      summary?: string;
    }>;
    workbenchStatus: 'DRAFT' | 'PROPOSED' | 'NEED_CONFIRM' | 'LOCKED';
    decisionProcess?: {
      draftId: string;
      decisionSteps: any[]; // DecisionStep[]
      userMode: 'toc' | 'expert' | 'studio';
    };
  }> {
    this.logger.debug(`获取行程工作台数据: tripId=${tripId}`);

    // 1. 验证 Trip 是否存在
    if (!this.prisma) {
      throw new Error('PrismaService 未注入');
    }

    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { id: true, metadata: true },
    });

    if (!trip) {
      throw new NotFoundException(`找不到行程: ${tripId}`);
    }

    // 2. 从 Trip metadata 获取当前方案
    const metadata = (trip.metadata as any) || {};
    const currentPlanId = metadata.lastCommittedPlanId || metadata.currentPlanId;
    let currentPlan: any = null;

    if (currentPlanId) {
      // 尝试从 StateStore 获取
      if (this.stateStore) {
        const stored = await this.stateStore.get<PlanState>(currentPlanId, 'PlanState');
        if (stored) {
          const planState = stored.data;
          // 获取 UIOutput（需要从某个地方获取，暂时从 metadata 获取）
          const uiOutput = metadata.plans?.[currentPlanId]?.uiOutput || {};
          
          currentPlan = {
            planId: currentPlanId,
            planVersion: planState.plan_version || 1,
            status: planState.status || 'DRAFT',
            planState,
            uiOutput,
            createdAt: metadata.plans?.[currentPlanId]?.createdAt || new Date().toISOString(),
            updatedAt: metadata.plans?.[currentPlanId]?.updatedAt || new Date().toISOString(),
          };
        }
      }
    }

    // 3. 获取方案历史（从 metadata 或 StateStore 历史）
    const planHistory: Array<{
      planId: string;
      planVersion: number;
      status: string;
      createdAt: string;
      summary?: string;
    }> = [];

    // 从 metadata 获取历史
    if (metadata.plans) {
      for (const [planId, planData] of Object.entries(metadata.plans as any)) {
        planHistory.push({
          planId,
          planVersion: (planData as any).planVersion || 1,
          status: (planData as any).status || 'DRAFT',
          createdAt: (planData as any).createdAt || new Date().toISOString(),
          summary: (planData as any).summary,
        });
      }
    }

    // 按创建时间排序（最新的在前）
    planHistory.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    // 4. 确定工作台状态
    const workbenchStatus = currentPlan?.status || metadata.workbenchStatus || 'DRAFT';

    // 5. 加载决策过程（如果存在决策草案）
    let decisionProcess: {
      draftId: string;
      decisionSteps: any[];
      userMode: 'toc' | 'expert' | 'studio';
    } | undefined = undefined;

    if (this.decisionDraftStorage) {
      try {
        const decisionDraft = await this.decisionDraftStorage.loadDecisionDraftByTripId(tripId);
        if (decisionDraft) {
          decisionProcess = {
            draftId: decisionDraft.draft_id,
            decisionSteps: decisionDraft.decision_steps || [],
            userMode: decisionDraft.user_mode || 'toc',
          };
          this.logger.debug(`加载决策过程: draftId=${decisionDraft.draft_id}, steps=${decisionDraft.decision_steps?.length || 0}`);
        } else {
          this.logger.debug(`行程 ${tripId} 没有关联的决策草案`);
        }
      } catch (error: any) {
        this.logger.warn(`加载决策草案失败: ${error.message}`, error.stack);
        // 不阻塞主流程，继续返回其他数据
      }
    }

    return {
      tripId,
      currentPlan: currentPlan || undefined,
      planHistory,
      workbenchStatus: workbenchStatus as any,
      decisionProcess,
    };
  }

  /**
   * 获取行程的规划方案列表
   */
  async getTripPlans(
    tripId: string,
    options?: {
      status?: 'DRAFT' | 'PROPOSED' | 'NEED_CONFIRM' | 'LOCKED';
      limit?: number;
      offset?: number;
    },
  ): Promise<{
    plans: Array<{
      planId: string;
      planVersion: number;
      status: 'DRAFT' | 'PROPOSED' | 'NEED_CONFIRM' | 'LOCKED';
      createdAt: string;
      updatedAt: string;
      summary?: {
        itemCount: number;
        days: number;
        budget?: {
          total: number;
          currency: string;
        };
        consolidatedDecision?: {
          status: string;
          summary: string;
        };
        personas?: {
          abu?: { verdict: string };
          drdre?: { verdict: string };
          neptune?: { verdict: string };
        };
      };
    }>;
    total: number;
    hasMore: boolean;
  }> {
    this.logger.debug(`获取行程方案列表: tripId=${tripId}, options=${JSON.stringify(options)}`);

    if (!this.prisma) {
      throw new Error('PrismaService 未注入');
    }

    // 验证 Trip 是否存在
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { id: true, metadata: true },
    });

    if (!trip) {
      throw new NotFoundException(`找不到行程: ${tripId}`);
    }

    // 从 metadata 获取方案列表
    const metadata = (trip.metadata as any) || {};
    const allPlans: Array<{
      planId: string;
      planVersion: number;
      status: string;
      createdAt: string;
      updatedAt: string;
      summary?: any;
    }> = [];

    if (metadata.plans) {
      for (const [planId, planData] of Object.entries(metadata.plans as any)) {
        const plan = planData as any;
        allPlans.push({
          planId,
          planVersion: plan.planVersion || 1,
          status: plan.status || 'DRAFT',
          createdAt: plan.createdAt || new Date().toISOString(),
          updatedAt: plan.updatedAt || new Date().toISOString(),
          summary: plan.summary,
        });
      }
    }

    // 状态筛选
    let filteredPlans = allPlans;
    if (options?.status) {
      filteredPlans = allPlans.filter(p => p.status === options.status);
    }

    // 按创建时间排序（最新的在前）
    filteredPlans.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    // 分页
    const limit = options?.limit || 20;
    const offset = options?.offset || 0;
    const paginatedPlans = filteredPlans.slice(offset, offset + limit);
    const hasMore = offset + limit < filteredPlans.length;

    return {
      plans: paginatedPlans as any,
      total: filteredPlans.length,
      hasMore,
    };
  }

  /**
   * 获取方案详情
   */
  async getPlan(planId: string): Promise<{
    planId: string;
    planVersion: number;
    tripId: string;
    status: 'DRAFT' | 'PROPOSED' | 'NEED_CONFIRM' | 'LOCKED';
    planState: PlanState;
    uiOutput: PlanningWorkbenchResponse['uiOutput'];
    createdAt: string;
    updatedAt: string;
    createdBy?: string;
  }> {
    this.logger.debug(`获取方案详情: planId=${planId}`);

    // 尝试从 StateStore 获取
    if (this.stateStore) {
      const stored = await this.stateStore.get<PlanState>(planId, 'PlanState');
      if (stored) {
        const planState = stored.data;
        
        // 尝试从 Trip metadata 获取 UIOutput 和其他信息
        let tripId = planState.itinerary?.tripId || '';
        let uiOutput: PlanningWorkbenchResponse['uiOutput'] = {};
        let createdAt = new Date().toISOString();
        let updatedAt = new Date().toISOString();
        let createdBy: string | undefined;

        if (tripId && this.prisma) {
          const trip = await this.prisma.trip.findUnique({
            where: { id: tripId },
            select: { metadata: true },
          });

          if (trip?.metadata) {
            const metadata = trip.metadata as any;
            const planData = metadata.plans?.[planId];
            if (planData) {
              uiOutput = planData.uiOutput || {};
              createdAt = planData.createdAt || createdAt;
              updatedAt = planData.updatedAt || updatedAt;
              createdBy = planData.createdBy;
            }
          }
        }

        return {
          planId,
          planVersion: planState.plan_version || 1,
          tripId: tripId || '',
          status: planState.status || 'DRAFT',
          planState,
          uiOutput,
          createdAt,
          updatedAt,
          createdBy,
        };
      }
    }

    throw new NotFoundException(`找不到规划方案: ${planId}`);
  }

  /**
   * 对比多个规划方案
   */
  async comparePlans(
    planIds: string[],
    compareFields?: string[],
  ): Promise<{
    plans: Array<{
      planId: string;
      planVersion: number;
      planState: PlanState;
      uiOutput: PlanningWorkbenchResponse['uiOutput'];
    }>;
    differences: Array<{
      field: string;
      plan1Value: any;
      plan2Value: any;
      impact: 'low' | 'medium' | 'high';
      description?: string;
    }>;
    summary: {
      bestBudget?: string;
      bestRoute?: string;
      bestTime?: string;
      recommendations?: string[];
    };
  }> {
    this.logger.debug(`对比方案: planIds=${planIds.join(', ')}`);

    if (planIds.length < 2) {
      throw new Error('至少需要 2 个方案进行对比');
    }

    // 获取所有方案
    const plans: Array<{
      planId: string;
      planVersion: number;
      planState: PlanState;
      uiOutput: PlanningWorkbenchResponse['uiOutput'];
    }> = [];

    for (const planId of planIds) {
      const plan = await this.getPlan(planId);
      plans.push({
        planId: plan.planId,
        planVersion: plan.planVersion,
        planState: plan.planState,
        uiOutput: plan.uiOutput,
      });
    }

    // 对比方案（简化实现）
    const differences: Array<{
      field: string;
      plan1Value: any;
      plan2Value: any;
      impact: 'low' | 'medium' | 'high';
      description?: string;
    }> = [];

    // 对比预算
    if (plans.length >= 2) {
      const plan1 = plans[0];
      const plan2 = plans[1];
      
      const budget1 = plan1.planState.budget?.breakdown?.categories?.reduce((sum, cat) => sum + (cat.estimated || 0), 0) || 0;
      const budget2 = plan2.planState.budget?.breakdown?.categories?.reduce((sum, cat) => sum + (cat.estimated || 0), 0) || 0;
      
      if (budget1 !== budget2) {
        differences.push({
          field: 'budget.total',
          plan1Value: budget1,
          plan2Value: budget2,
          impact: Math.abs(budget1 - budget2) / Math.max(budget1, budget2) > 0.2 ? 'high' : 'medium',
          description: `预算差异: ${Math.abs(budget1 - budget2)}`,
        });
      }

      // 对比天数
      const days1 = plan1.planState.constraints?.time?.days || 0;
      const days2 = plan2.planState.constraints?.time?.days || 0;
      
      if (days1 !== days2) {
        differences.push({
          field: 'constraints.time.days',
          plan1Value: days1,
          plan2Value: days2,
          impact: 'medium',
          description: `行程天数差异: ${Math.abs(days1 - days2)} 天`,
        });
      }
    }

    // 生成摘要
    const summary: {
      bestBudget?: string;
      bestRoute?: string;
      bestTime?: string;
      recommendations?: string[];
    } = {
      recommendations: [],
    };

    if (plans.length >= 2) {
      // 找出预算最优的方案
      const budgets = plans.map(p => ({
        planId: p.planId,
        budget: p.planState.budget?.breakdown?.categories?.reduce((sum, cat) => sum + (cat.estimated || 0), 0) || 0,
      }));
      const bestBudgetPlan = budgets.reduce((min, p) => (p.budget < min.budget ? p : min));
      summary.bestBudget = bestBudgetPlan.planId;

      // 生成推荐
      summary.recommendations?.push(`方案 ${bestBudgetPlan.planId} 预算最优`);
    }

    return {
      plans,
      differences,
      summary,
    };
  }

  /**
   * 调整规划方案
   */
  async adjustPlan(
    planId: string,
    adjustments: Array<{ type: string; data: any }>,
    regenerate: boolean = true,
  ): Promise<{
    newPlanId: string;
    newPlanVersion: number;
    planState: PlanState;
    uiOutput: PlanningWorkbenchResponse['uiOutput'];
    changes: Array<{
      type: string;
      description: string;
      impact: 'low' | 'medium' | 'high';
    }>;
  }> {
    this.logger.debug(`调整方案: planId=${planId}, adjustments=${adjustments.length}`);

    // 1. 获取现有方案
    const existingPlan = await this.getPlan(planId);
    let planState = existingPlan.planState;

    // 2. 应用调整
    const changes: Array<{
      type: string;
      description: string;
      impact: 'low' | 'medium' | 'high';
    }> = [];

    for (const adjustment of adjustments) {
      switch (adjustment.type) {
        case 'add_place':
          changes.push({
            type: 'add_place',
            description: `添加地点: ${adjustment.data.placeName || '未知'}`,
            impact: 'medium',
          });
          // TODO: 实际应用调整到 planState
          break;

        case 'remove_place':
          changes.push({
            type: 'remove_place',
            description: `移除地点: ${adjustment.data.placeName || '未知'}`,
            impact: 'medium',
          });
          // TODO: 实际应用调整到 planState
          break;

        case 'modify_constraint':
          changes.push({
            type: 'modify_constraint',
            description: `修改约束: ${adjustment.data.constraintType || '未知'}`,
            impact: 'high',
          });
          // TODO: 实际应用调整到 planState
          if (adjustment.data.budget) {
            planState.constraints.budget = {
              ...planState.constraints.budget,
              ...adjustment.data.budget,
            };
          }
          break;

        case 'change_day':
          changes.push({
            type: 'change_day',
            description: `调整天数: ${adjustment.data.day || '未知'}`,
            impact: 'high',
          });
          // TODO: 实际应用调整到 planState
          break;

        case 'modify_budget':
          changes.push({
            type: 'modify_budget',
            description: `修改预算: ${adjustment.data.total || '未知'}`,
            impact: 'high',
          });
          if (adjustment.data.total) {
            planState.constraints.budget = {
              ...planState.constraints.budget,
              total: adjustment.data.total,
            };
          }
          break;

        default:
          this.logger.warn(`未知的调整类型: ${adjustment.type}`);
      }
    }

    // 3. 如果需要重新生成，调用 execute
    let uiOutput: PlanningWorkbenchResponse['uiOutput'] = existingPlan.uiOutput;
    
    if (regenerate) {
      // 创建新的 planId
      const newPlanId = `plan_${Date.now()}`;
      planState.plan_id = newPlanId;
      planState.plan_version = (planState.plan_version || 1) + 1;
      planState.status = 'DRAFT';

      // 调用 execute 重新生成
      const context: PlanContext = {
        destination: {
          country: planState.metadata?.destination?.country,
          city: planState.metadata?.destination?.city,
          region: planState.metadata?.destination?.region,
        },
        days: planState.constraints.time.days,
        travelMode: planState.constraints.travelMode,
        constraints: {
          budget: planState.constraints.budget,
          fitness: planState.constraints.fitness,
          accommodation: planState.constraints.accommodation,
          companions: planState.constraints.companions,
        },
        mustDo: planState.constraints.mustDo,
        mustAvoid: planState.constraints.mustAvoid,
      };

      const result = await this.execute({
        context,
        tripId: existingPlan.tripId,
        existingPlanState: planState,
        userAction: 'generate',
      });

      planState = result.planState;
      uiOutput = result.uiOutput;

      // 保存新方案
      if (this.stateStore) {
        await this.stateStore.create(
          newPlanId,
          'PlanState',
          planState,
          'PlanningWorkbenchAgentService',
          `adjust_${planId}`,
        );
      }

      // 更新 Trip metadata
      if (this.prisma && existingPlan.tripId) {
        const trip = await this.prisma.trip.findUnique({
          where: { id: existingPlan.tripId },
          select: { metadata: true },
        });

        if (trip) {
          const metadata = (trip.metadata as any) || {};
          if (!metadata.plans) {
            metadata.plans = {};
          }
          metadata.plans[newPlanId] = {
            planVersion: planState.plan_version,
            status: planState.status,
            uiOutput,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            createdBy: existingPlan.createdBy,
          };

          await this.prisma.trip.update({
            where: { id: existingPlan.tripId },
            data: {
              metadata: metadata as any,
              updatedAt: new Date(),
            },
          });
        }
      }

      return {
        newPlanId,
        newPlanVersion: planState.plan_version,
        planState,
        uiOutput,
        changes,
      };
    } else {
      // 不重新生成，只更新现有方案
      planState.plan_version = (planState.plan_version || 1) + 1;
      planState.status = 'DRAFT';

      // 更新 StateStore
      if (this.stateStore) {
        const currentVersion = await this.stateStore.getVersion(planId, 'PlanState');
        if (currentVersion !== null) {
          await this.stateStore.update(
            planId,
            'PlanState',
            [{ op: 'replace', path: '/', value: planState }],
            currentVersion,
            'PlanningWorkbenchAgentService',
            `adjust_${planId}`,
            {
              action: 'adjust',
              reason: `Adjust plan: ${adjustments.map(a => a.type).join(', ')}`,
            },
          );
        }
      }

      return {
        newPlanId: planId,
        newPlanVersion: planState.plan_version,
        planState,
        uiOutput,
        changes,
      };
    }
  }

  /**
   * 保存方案到 StateStore 和数据库
   */
  private async savePlan(
    planState: PlanState,
    uiOutput: PlanningWorkbenchResponse['uiOutput'],
    tripId: string,
  ): Promise<void> {
    const planId = planState.plan_id;

    // 1. 保存到 StateStore
    if (this.stateStore) {
      const currentVersion = await this.stateStore.getVersion(planId, 'PlanState');
      if (currentVersion !== null) {
        // 更新现有方案
        await this.stateStore.update(
          planId,
          'PlanState',
          [{ op: 'replace', path: '/', value: planState }],
          currentVersion,
          'PlanningWorkbenchAgentService',
          `save_${planId}`,
          {
            action: 'save',
            reason: 'Save plan after execution',
          },
        );
      } else {
        // 创建新方案
        await this.stateStore.create(
          planId,
          'PlanState',
          planState,
          'PlanningWorkbenchAgentService',
          `save_${planId}`,
        );
      }
    }

    // 2. 保存到 Trip metadata
    if (this.prisma) {
      try {
        const trip = await this.prisma.trip.findUnique({
          where: { id: tripId },
          select: { metadata: true },
        });

        if (trip) {
          const metadata = (trip.metadata as any) || {};
          if (!metadata.plans) {
            metadata.plans = {};
          }

          // 生成方案摘要
          const summary = {
            itemCount: planState.itinerary?.segments?.length || 0,
            days: planState.constraints.time.days,
            budget: planState.budget?.breakdown
              ? {
                  total: planState.budget.breakdown.categories?.reduce((sum, cat) => sum + (cat.estimated || 0), 0) || 0,
                  currency: planState.constraints.budget?.currency || 'CNY',
                }
              : undefined,
            consolidatedDecision: uiOutput.personas
              ? {
                  status: planState.gate.status,
                  summary: uiOutput.personas.consolidatedDecision?.summary || '',
                }
              : undefined,
            personas: uiOutput.personas?.personas
              ? {
                  abu: uiOutput.personas.personas.abu ? { verdict: uiOutput.personas.personas.abu.verdict } : undefined,
                  drdre: uiOutput.personas.personas.drdre ? { verdict: uiOutput.personas.personas.drdre.verdict } : undefined,
                  neptune: uiOutput.personas.personas.neptune ? { verdict: uiOutput.personas.personas.neptune.verdict } : undefined,
                }
              : undefined,
          };

          metadata.plans[planId] = {
            planVersion: planState.plan_version || 1,
            status: planState.status,
            uiOutput,
            summary,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };

          // 更新当前方案引用
          metadata.currentPlanId = planId;
          metadata.lastCommittedPlanId = planState.status === 'LOCKED' ? planId : metadata.lastCommittedPlanId;

          await this.prisma.trip.update({
            where: { id: tripId },
            data: {
              metadata: metadata as any,
              updatedAt: new Date(),
            },
          });

          this.logger.debug(`方案已保存到 Trip metadata: planId=${planId}, tripId=${tripId}`);
        }
      } catch (error: any) {
        this.logger.warn(`保存方案到 Trip metadata 失败: ${error.message}`);
        // 不抛出错误，避免影响主流程
      }
    }
  }
}
