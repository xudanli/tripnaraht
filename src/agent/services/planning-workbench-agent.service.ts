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
import { PlanState, PlanContext, PlanSkeletonSet, OptionComparison, PlanSkeleton } from '../../skills/plan/shared/plan-state.types';
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
import { GuardianChooseService } from '../../trips/decision/optimization/services/guardian-choose.service';
import { PlanningWorkbenchKernelBridgeService } from './planning-workbench-kernel-bridge.service';
import type { PlanningWorkbenchKernelMode } from './planning-workbench-kernel-bridge.types';
import { PrismaService } from '../../prisma/prisma.service';
import { StateStoreService } from '../../agent/infra/state-store.service';
import { DEMEffortMetadataService } from '../../trips/dem/services/dem-effort-metadata.service';
import { GeoFactsService } from '../../trips/readiness/services/geo-facts.service';
import { GeoCheckHazardZonesSkill } from '../../skills/geo/geo-check-hazard-zones.skill';
import { RouteSegment } from '../../trips/decision/shared/world-model.types';
import { TripRunManagerService } from './trip-run-manager.service';
import { DecisionDraftStorageService } from '../../decision-draft/storage/decision-draft-storage.service';
// Domain Agents (World Model Layer)
import { GeoAgentService } from './domain-agents/geo-agent.service';
import { WeatherAgentService } from './domain-agents/weather-agent.service';
import { CostAgentService } from './domain-agents/cost-agent.service';
import { ExperienceAgentService } from './domain-agents/experience-agent.service';
import { runBounded } from './orchestration-utils';
import { MultiAgentCollaborationService } from '../../skills/world/services/multi-agent-collaboration.service';
import type {
  WorldModelFactLayerAnchor,
  WorldModelStrategyLayer,
} from '../../skills/world/interfaces/unified-world-model.interface';
import {
  applyDecisionDnaToStrategyLayers,
  type DecisionDnaProfileForStrategy,
} from '../utils/strategy-conflict-dna-tuning.util';
import { SkillsRegistryService } from '../../skills/services/skills-registry.service';
import type { ConflictDetection } from '../../skills/plan/shared/plan-state.types';
import {
  resolveSelectedOptionIdFromExecuteRequest,
  resolveSkeletonOptionsFromExecuteRequest,
} from '../dto/planning-workbench-execute.dto';
import { enrichPlanningWorkbenchExecuteResponse } from '../utils/planning-workbench-execute-enrich.util';

export interface PlanningWorkbenchRequest {
  /** 规划上下文 */
  context: PlanContext;
  
  /** Trip ID（可选） */
  tripId?: string;
  
  /** 现有 PlanState（如果有） */
  existingPlanState?: PlanState;
  
  /** 用户操作（可选） */
  userAction?: 'generate' | 'compare' | 'commit' | 'adjust';

  /** 节奏调整反馈（userAction === 'adjust' 时） */
  paceFeedback?: 'too_tired' | 'too_rushed' | 'too_relaxed';

  /** 骨架方案集（compare/commit；也可从 existingPlanState.metadata.skeletonOptions 读取） */
  skeletonOptions?: PlanSkeletonSet;

  /** 选定方案 ID（commit） */
  selectedOptionId?: string;

  /** 内部元数据：tripRunId、updateProgress、taskId 等 */
  metadata?: PlanningWorkbenchRequestMetadata;
}

export interface PlanningWorkbenchRequestMetadata {
  tripRunId?: string;
  userId?: string;
  taskId?: string;
  updateProgress?: (progress: number, stage?: string) => void;
  /** 前端 Context Package id */
  contextPackageId?: string;
  /** 时间轴 revision */
  scheduleRevision?: number;
  /** Plan Studio 约束快照 id */
  constraintSnapshotId?: string;
}

export interface WorkbenchDecisionContext {
  tripId?: string;
  planId: string;
  planVersion: number;
  gateStatus: string;
  contextPackageId?: string;
  scheduleRevision?: number;
  constraintSnapshotId?: string;
}

export interface WorkbenchBudgetPreview {
  totalEstimate?: number;
  currency: string;
  vsLimit?: number;
  evaluated: boolean;
  band: 'healthy' | 'warning' | 'critical';
  message?: string;
}

export type WorkbenchConsolidatedDecisionStatus =
  | 'ALLOW'
  | 'NEED_CONFIRM'
  | 'SUGGEST_REPLACE'
  | 'REJECT';

export interface WorkbenchConsolidatedDecision {
  status: WorkbenchConsolidatedDecisionStatus;
  summary: string;
  nextSteps: string[];
}

export interface PlanningWorkbenchResponse {
  /** 更新后的 PlanState */
  planState: PlanState;
  
  /** 输出到 UI 的内容 */
  uiOutput: {
    /** 方案卡（隐藏，仅内部使用） */
    skeletonOptions?: PlanSkeletonSet;
    
    /** 对比卡（隐藏，仅内部使用） */
    comparison?: OptionComparison;
    
    /** 三人格输出（面向用户） */
    personas?: PersonaShellOutput;

    /** P3/P4: 因果内核投影（与 personas.causalPersonaProjection 相同，便于 UI 直接读取） */
    causalPersonaProjection?: PersonaShellOutput['causalPersonaProjection'];

    /** P1 单主角表达别名 — 与 personas.presentation 相同 */
    presentation?: PersonaShellOutput['presentation'];
    
    /** 健康度（隐藏，仅内部使用） */
    health?: {
      budget: 'healthy' | 'warning' | 'critical';
      pace: 'healthy' | 'warning' | 'critical';
      feasibility: 'healthy' | 'warning' | 'critical';
    };
    
    /** 需要用户确认的事项 */
    confirmations?: string[];

    /** OpenAPI 对齐：顶层 consolidatedDecision（与 personas.consolidatedDecision 同步） */
    consolidatedDecision?: WorkbenchConsolidatedDecision;

    /** OpenAPI 对齐：顶层 timestamp（与 personas.timestamp 同步） */
    timestamp?: string;

    /** RAG / 合规下游关联 */
    decisionContext?: WorkbenchDecisionContext;

    /** 预算预览（evaluated=false 时前端 lazy load） */
    budgetPreview?: WorkbenchBudgetPreview;
  };
}

@Injectable()
export class PlanningWorkbenchAgentService {
  private readonly logger = new Logger(PlanningWorkbenchAgentService.name);
  
  // 限制地理特征查询的并发度，避免数据库连接池耗尽
  // 每个segment会触发6+个数据库查询，限制为2个并发segments = 最多12个并发查询
  private readonly geoFeaturesMaxConcurrency = 2;

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
    @Optional() private readonly skillsRegistry?: SkillsRegistryService,
    @Optional() private readonly personaShell?: PersonaShellService,
    @Optional() private readonly kernelBridge?: PlanningWorkbenchKernelBridgeService,
    @Optional() private readonly prisma?: PrismaService,
    @Optional() private readonly stateStore?: StateStoreService,
    @Optional() private readonly tripRunManager?: TripRunManagerService,
    @Optional() private readonly decisionDraftStorage?: DecisionDraftStorageService,
    // Domain Agents (World Model Layer)
    @Optional() private readonly geoAgent?: GeoAgentService,
    @Optional() private readonly weatherAgent?: WeatherAgentService,
    @Optional() private readonly costAgent?: CostAgentService,
    @Optional() private readonly experienceAgent?: ExperienceAgentService,
    // DEM and Geographic Services
    @Optional() private readonly demEffortMetadataService?: DEMEffortMetadataService,
    @Optional() private readonly geoFactsService?: GeoFactsService,
    @Optional() private readonly geoCheckHazardZonesSkill?: GeoCheckHazardZonesSkill,
    @Optional()
    private readonly multiAgentCollaboration?: MultiAgentCollaborationService,
    @Optional() private readonly guardianChoose?: GuardianChooseService,
  ) {}

  /**
   * 执行规划工作台流程
   */
  async execute(request: PlanningWorkbenchRequest): Promise<PlanningWorkbenchResponse> {
    this.logger.debug(`执行规划工作台: action=${request.userAction || 'generate'}, tripId=${request.tripId || 'none'}`);
    this.logger.debug(`技能注入状态: architectGenerateSkeleton=${!!this.architectGenerateSkeleton}, budgetEstimateBaseline=${!!this.budgetEstimateBaseline}, personaShell=${!!this.personaShell}`);

    // === 创建或获取 TripRun 记录 ===
    let tripRunId: string | null = null;
    const attemptNumber = 1;
    let attemptId: string | null = null;
    
    if (this.tripRunManager) {
      try {
        // 从 request 的 metadata 中获取 tripRunId（如果 AgentService 已创建）
        const metadata: PlanningWorkbenchRequestMetadata = request.metadata ?? {};
        tripRunId = metadata.tripRunId ?? null;
        
        if (!tripRunId) {
          // 创建新的 TripRun
          tripRunId = await this.tripRunManager.createTripRun({
            tripId: request.tripId || null,
            userId: metadata.userId ?? null,
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
      // 获取进度更新函数（如果存在）
      const metadata: PlanningWorkbenchRequestMetadata = request.metadata ?? {};
      const updateProgress = metadata.updateProgress;
      const taskId = metadata.taskId;
      
      if (updateProgress) {
        this.logger.debug(`进度更新函数已注入: taskId=${taskId || 'unknown'}`);
      } else {
        this.logger.debug('进度更新函数未注入（同步模式）');
      }
      
      // 1. 构建上下文（System 1）- 添加超时保护
      let world;
      if (request.tripId && this.contextBuild) {
        this.logger.debug('构建世界模型上下文...');
        updateProgress?.(5, '正在构建世界模型上下文...');
        try {
          const workbenchUserId = await this.resolveWorkbenchUserId(request.tripId);
          const contextPromise = this.contextBuild.execute({
            tripId: request.tripId,
            phase: 'PLANNING',
            agent: 'PlanningWorkbench',
            userQuery: `规划工作台: ${request.context.destination.city || request.context.destination.country}`,
            tokenBudget: 3000,
            includePrivate: true,
            userId: workbenchUserId ?? undefined,
          });
          const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('构建上下文超时（10秒）')), 10000);
          });
          await Promise.race([contextPromise, timeoutPromise]);
          // world 可以从 contextPackage 中提取
          this.logger.debug('世界模型上下文构建完成');
          updateProgress?.(10, '世界模型上下文构建完成');
        } catch (contextError: any) {
          this.logger.warn(`构建上下文失败或超时: ${contextError.message}，继续执行`);
          // 继续执行，不阻塞
        }
      } else {
        updateProgress?.(10, '跳过上下文构建');
      }

      // 2. 根据用户操作执行不同流程
      let planState: PlanState = request.existingPlanState || this.createInitialPlanState(request.context, request.tripId);
      planState = this.hydratePlanStateFromContext(planState, request.context, request.tripId);
      const uiOutput: PlanningWorkbenchResponse['uiOutput'] = {};

      // 透传 tripId：域 Agent + MultiAgent 桥（与 UnifiedWorldModel 共享同一 trip 有界上下文）
      if (request.tripId) {
        try {
          const wm = await this.getWorldModelData(request.context, {
            tripId: request.tripId,
          });
          const summary =
            wm.collaborationBridge?.consensusSummary ??
            wm.strategyLayer?.consensusSummary ??
            null;
          planState.metadata = {
            ...(planState.metadata || {}),
            worldModelBridge: {
              tripId: request.tripId,
              collaborationRegistered: wm.collaborationBridge?.registered ?? false,
              openConflictCount: wm.collaborationBridge?.openConflictCount ?? 0,
              consensusSummary: summary,
              strategyLayer: wm.strategyLayer,
            },
          };
        } catch (e: any) {
          this.logger.warn(
            `[PlanningWorkbench] getWorldModelData skipped: ${e?.message || e}`,
          );
        }
      }

      switch (request.userAction) {
        case 'generate':
          // 生成骨架方案（技能层已有超时保护，不需要重复）
          if (this.architectGenerateSkeleton) {
            this.logger.debug('开始生成行程骨架方案...');
            updateProgress?.(15, '开始生成行程骨架方案...');
            
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
              updateProgress?.(20, '正在调用LLM生成骨架方案...');
              // 直接调用，技能层会处理超时和错误
              const skeletonResult = await this.architectGenerateSkeleton.execute({
                context: request.context,
                tripId: request.tripId,
                world,
              });
              uiOutput.skeletonOptions = skeletonResult.skeletonSet;
              this.persistSkeletonOptionsToPlanState(planState, skeletonResult.skeletonSet);
              updateProgress?.(40, '骨架方案生成完成，正在转换为segments...');
              
              // 将推荐的骨架方案转换为 segments（填充 planState.itinerary.segments）
              const recommendedOption = skeletonResult.skeletonSet.options?.find(
                opt => opt.id === skeletonResult.skeletonSet.recommendation?.optionId
              ) || skeletonResult.skeletonSet.options?.[0];
              
              if (recommendedOption && recommendedOption.dayThemes && recommendedOption.dayThemes.length > 0) {
                // 将 dayThemes 转换为 RouteSegment，并包含POI信息
                planState.itinerary.segments = recommendedOption.dayThemes.map((theme) => {
                  // 查找当天的POI信息
                  const dayPoi = recommendedOption.pois?.find(p => p.day === theme.day);
                  
                  return {
                    segmentId: `day_${theme.day}_segment_1`,
                    dayIndex: theme.day - 1, // dayIndex 从 0 开始
                    distanceKm: 0, // 初始值，后续会由其他服务填充
                    ascentM: 0, // 初始值，后续会由 DEM 服务填充
                    slopePct: 0, // 初始值
                    metadata: {
                      theme: theme.theme,
                      description: theme.description,
                      day: theme.day,
                      skeletonId: recommendedOption.id,
                      skeletonName: recommendedOption.name,
                      // 添加POI信息
                      ...(dayPoi?.accommodation && { accommodation: dayPoi.accommodation }),
                      ...(dayPoi?.restaurants && dayPoi.restaurants.length > 0 && { restaurants: dayPoi.restaurants }),
                      ...(dayPoi?.attractions && dayPoi.attractions.length > 0 && { attractions: dayPoi.attractions }),
                    },
                  };
                });
                this.logger.debug(`已将骨架方案转换为 ${planState.itinerary.segments.length} 个 segments，包含POI信息`);
                
                // 检查segments中的POI坐标
                const segmentsWithPoi = planState.itinerary.segments.filter(seg => {
                  const hasAccommodation = seg.metadata?.accommodation?.coordinates;
                  const hasRestaurants = seg.metadata?.restaurants?.some((r: any) => r.poi?.coordinates);
                  const hasAttractions = seg.metadata?.attractions?.some((a: any) => a.coordinates);
                  return hasAccommodation || hasRestaurants || hasAttractions;
                });
                this.logger.debug(`Segments中有POI坐标的数量: ${segmentsWithPoi.length}/${planState.itinerary.segments.length}`);
              } else {
                this.logger.warn(`推荐方案为空或没有dayThemes，无法转换为segments`);
              }
              
              // === 阶段 2.5: 填充DEM地形数据和地理特征 ===
              if (planState.itinerary.segments.length > 0) {
                this.logger.debug(`开始执行阶段2.5: 填充DEM地形数据和地理特征（${planState.itinerary.segments.length} 个segments）`);
                updateProgress?.(60, `正在填充DEM地形数据和地理特征（${planState.itinerary.segments.length} 个segments）...`);
                await this.enrichSegmentsWithGeographicData(planState.itinerary.segments, request.context, updateProgress);
              } else {
                this.logger.warn(`跳过阶段2.5: segments为空，无法填充DEM和地理特征`);
                updateProgress?.(80, '跳过DEM数据填充（segments为空）');
              }
              
              // === 阶段 2.6: 记录决策追溯链和排除过程 ===
              if (skeletonResult.skeletonSet.options && skeletonResult.skeletonSet.options.length > 1) {
                this.logger.debug(`开始执行阶段2.6: 记录决策追溯链（${skeletonResult.skeletonSet.options.length} 个方案）`);
                updateProgress?.(85, '正在记录决策追溯链...');
                await this.recordDecisionTraceAndExclusions(
                  planState,
                  skeletonResult.skeletonSet,
                  recommendedOption,
                  request.context
                );
                updateProgress?.(90, '决策追溯链记录完成');
              } else {
                this.logger.debug(`跳过阶段2.6: 方案数量不足（${skeletonResult.skeletonSet.options?.length || 0} 个）`);
                updateProgress?.(90, '跳过决策追溯链记录（方案数量不足）');
              }
              
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
                const defaultDayThemes = Array.from({ length: request.context.days }, (_, i) => ({
                  day: i + 1,
                  theme: `第${i + 1}天`,
                  description: `在${request.context.destination.city || request.context.destination.country}的第${i + 1}天行程`,
                }));
                
                uiOutput.skeletonOptions = {
                  options: [{
                    id: 'default_1',
                    name: '默认方案',
                    dayThemes: defaultDayThemes,
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
                this.persistSkeletonOptionsToPlanState(planState, uiOutput.skeletonOptions);
                
                // 将默认方案也转换为 segments
                planState.itinerary.segments = defaultDayThemes.map((theme) => ({
                  segmentId: `day_${theme.day}_segment_1`,
                  dayIndex: theme.day - 1,
                  distanceKm: 0,
                  ascentM: 0,
                  slopePct: 0,
                  metadata: {
                    theme: theme.theme,
                    description: theme.description,
                    day: theme.day,
                    skeletonId: 'default_1',
                    skeletonName: '默认方案',
                  },
                }));
                this.logger.debug(`已将默认骨架方案转换为 ${planState.itinerary.segments.length} 个 segments`);
              }
            }
          } else {
            this.logger.warn('PlanArchitectGenerateSkeletonSkill 未注入，跳过生成骨架方案');
          }
          break;

        case 'compare':
          // 对比方案（需要先有骨架方案）
          if (this.architectCompareOptions) {
            this.logger.debug('开始对比行程骨架方案...');
            
            // === 创建 TripAttempt 记录 ===
            if (tripRunId && this.tripRunManager) {
              try {
                attemptId = await this.tripRunManager.createTripAttempt({
                  tripRunId,
                  attemptNumber,
                  planOutline: `对比行程骨架方案`,
                  nextActions: ['plan.architect.compareOptions'],
                  metadata: {
                    userAction: 'compare',
                  },
                });
                if (attemptId) {
                  this.logger.debug(`Created TripAttempt: ${attemptId} for compare`);
                }
              } catch (error: any) {
                this.logger.warn(`Failed to create TripAttempt: ${error.message}`);
              }
            }

            try {
              // 1. 获取要对比的方案列表
              const skeletonSet = this.resolveSkeletonSetFromRequest(request, planState, uiOutput);

              if (!skeletonSet || !skeletonSet.options || skeletonSet.options.length < 2) {
                this.logger.warn(`对比方案失败: 需要至少2个方案，当前有 ${skeletonSet?.options?.length || 0} 个`);
                uiOutput.confirmations = [
                  '对比功能需要至少2个方案。请先生成多个方案后再进行对比。',
                ];
              } else {
                // 2. 调用对比技能
                const compareResult = await this.architectCompareOptions.execute({
                  options: skeletonSet.options,
                  context: request.context,
                });

                let comparison = compareResult.comparison;

                // 2b. P3: 对每个 skeleton option 并行 Kernel GATE_EVAL
                if (this.kernelBridge?.isActive()) {
                  const kernelMode = this.kernelBridge.resolveMode();
                  const kernelCompare = await this.kernelBridge.runCompareGateEvalForOptions({
                    request,
                    planState,
                    options: skeletonSet.options,
                    tripRunId,
                    llmRecommendedOptionId: comparison.recommendation?.optionId,
                  });
                  if (kernelCompare) {
                    comparison = this.kernelBridge.enrichComparisonWithGateDeltas(
                      comparison,
                      kernelCompare,
                      { overrideRecommendation: kernelMode === 'native' },
                    );
                    if (kernelCompare.divergesFromLlmRecommendation) {
                      planState.metadata = {
                        ...planState.metadata,
                        kernelCompareGateMismatch: {
                          llmRecommended: kernelCompare.llmRecommendedOptionId,
                          gateRecommended: kernelCompare.recommendedByGate,
                        },
                      };
                    }
                    this.logger.debug(
                      `[PlanningWorkbench/compare] Kernel gate eval: recommendedByGate=${kernelCompare.recommendedByGate} diverges=${kernelCompare.divergesFromLlmRecommendation}`,
                    );
                  }
                }

                // 3. 存储对比结果
                uiOutput.comparison = comparison;
                
                // 4. 更新 planState 的推荐方案（如果对比结果有推荐）
                if (comparison.recommendation) {
                  planState.metadata = {
                    ...planState.metadata,
                    comparison,
                    recommendedOptionId: comparison.recommendation.optionId,
                  };
                  
                  // 如果当前 segments 不是推荐方案，可以选择更新（但这里不自动更新，让用户决定）
                  this.logger.debug(`对比完成，推荐方案: ${comparison.recommendation.optionId}`);
                }

                // === 更新 TripAttempt 为 COMPLETED ===
                if (attemptId && this.tripRunManager) {
                  try {
                    await this.tripRunManager.completeTripAttempt(
                      attemptId,
                      `成功对比 ${skeletonSet.options.length} 个方案`,
                      {
                        comparison: {
                          optionCount: skeletonSet.options.length,
                          recommendation: comparison.recommendation,
                          kernelGateEval: comparison.kernelGateEval,
                        },
                      },
                    );
                  } catch (error: any) {
                    this.logger.warn(`Failed to update TripAttempt to COMPLETED: ${error.message}`);
                  }
                }

                this.logger.debug(`行程骨架方案对比完成: ${skeletonSet.options.length} 个方案`);
              }
            } catch (compareError: any) {
              this.logger.error(`对比方案失败: ${compareError.message}`, compareError.stack);
              
              // === 更新 TripAttempt 为 FAILED ===
              if (attemptId && this.tripRunManager) {
                try {
                  await this.tripRunManager.failTripAttempt(
                    attemptId,
                    `对比方案失败: ${compareError.message}`,
                  );
                } catch (error: any) {
                  this.logger.warn(`Failed to update TripAttempt to FAILED: ${error.message}`);
                }
              }

              uiOutput.confirmations = [
                `对比方案时发生错误: ${compareError.message}。请重试或联系支持。`,
              ];
            }
          } else {
            this.logger.warn('PlanArchitectCompareOptionsSkill 未注入，跳过对比方案');
            uiOutput.confirmations = ['对比功能暂不可用，请稍后重试。'];
          }
          break;

        case 'commit':
          // 提交方案（需要先有选定的方案）
          if (this.architectCommitOption) {
            this.logger.debug('开始提交行程骨架方案...');
            
            // === 创建 TripAttempt 记录 ===
            if (tripRunId && this.tripRunManager) {
              try {
                attemptId = await this.tripRunManager.createTripAttempt({
                  tripRunId,
                  attemptNumber,
                  planOutline: `提交行程骨架方案`,
                  nextActions: ['plan.architect.commitOption'],
                  metadata: {
                    userAction: 'commit',
                  },
                });
                if (attemptId) {
                  this.logger.debug(`Created TripAttempt: ${attemptId} for commit`);
                }
              } catch (error: any) {
                this.logger.warn(`Failed to create TripAttempt: ${error.message}`);
              }
            }

            try {
              // 1. 获取选定的方案
              const selectedOptionId = this.resolveSelectedOptionIdFromRequest(
                request,
                planState,
                uiOutput,
              );

              if (!selectedOptionId) {
                this.logger.warn('提交方案失败: 未指定要提交的方案');
                uiOutput.confirmations = [
                  '请先选择一个方案进行提交。可以从对比结果中选择推荐方案，或直接指定方案ID。',
                ];
              } else {
                // 2. 从 skeletonOptions 中查找选定的方案
                const skeletonSet = this.resolveSkeletonSetFromRequest(request, planState, uiOutput);

                if (!skeletonSet || !skeletonSet.options) {
                  this.logger.warn('提交方案失败: 未找到骨架方案集');
                  uiOutput.confirmations = [
                    '提交方案失败: 未找到骨架方案集。请先生成方案后再提交。',
                  ];
                } else {
                  const selectedOption = skeletonSet.options.find((opt: PlanSkeleton) => opt.id === selectedOptionId);
                  
                  if (!selectedOption) {
                    this.logger.warn(`提交方案失败: 未找到方案 ${selectedOptionId}`);
                    uiOutput.confirmations = [
                      `提交方案失败: 未找到方案 ${selectedOptionId}。请检查方案ID是否正确。`,
                    ];
                  } else {
                    // 3. 调用提交技能
                    const commitResult = await this.architectCommitOption.execute({
                      selectedOption,
                      existingPlanState: planState,
                      context: request.context,
                    });

                    // 4. 更新 planState
                    planState = commitResult.planState;
                    
                    // 5. 将选定的方案转换为 segments（如果还没有）
                    if (selectedOption.dayThemes && selectedOption.dayThemes.length > 0) {
                      planState.itinerary.segments = selectedOption.dayThemes.map((theme: { day: number; theme: string; description?: string }) => {
                        const dayPoi = selectedOption.pois?.find((p: { day: number }) => p.day === theme.day);
                        
                        return {
                          segmentId: `day_${theme.day}_segment_1`,
                          dayIndex: theme.day - 1,
                          distanceKm: 0,
                          ascentM: 0,
                          slopePct: 0,
                          metadata: {
                            theme: theme.theme,
                            description: theme.description,
                            day: theme.day,
                            skeletonId: selectedOption.id,
                            skeletonName: selectedOption.name,
                            ...(dayPoi?.accommodation && { accommodation: dayPoi.accommodation }),
                            ...(dayPoi?.restaurants && dayPoi.restaurants.length > 0 && { restaurants: dayPoi.restaurants }),
                            ...(dayPoi?.attractions && dayPoi.attractions.length > 0 && { attractions: dayPoi.attractions }),
                          },
                        };
                      });
                    }

                    // 6. 填充DEM地形数据和地理特征
                    if (planState.itinerary.segments.length > 0) {
                      await this.enrichSegmentsWithGeographicData(planState.itinerary.segments, request.context, updateProgress);
                    }

                    // 7. 更新 planState 状态为 PROPOSED
                    planState.status = 'PROPOSED';
                    planState.metadata = {
                      ...planState.metadata,
                      selectedSkeleton: selectedOption.id,
                      selectedSkeletonName: selectedOption.name,
                      committedAt: new Date().toISOString(),
                    };

                    // === 更新 TripAttempt 为 COMPLETED ===
                    if (attemptId && this.tripRunManager) {
                      try {
                        await this.tripRunManager.completeTripAttempt(
                          attemptId,
                          `成功提交方案: ${selectedOption.name} (${selectedOption.id})`,
                          {
                            commit: {
                              optionId: selectedOption.id,
                              optionName: selectedOption.name,
                              planVersion: commitResult.plan_version,
                            },
                          },
                        );
                      } catch (error: any) {
                        this.logger.warn(`Failed to update TripAttempt to COMPLETED: ${error.message}`);
                      }
                    }

                    this.logger.debug(`行程骨架方案提交完成: ${selectedOption.name} (版本 ${commitResult.plan_version})`);
                  }
                }
              }
            } catch (commitError: any) {
              this.logger.error(`提交方案失败: ${commitError.message}`, commitError.stack);
              
              // === 更新 TripAttempt 为 FAILED ===
              if (attemptId && this.tripRunManager) {
                try {
                  await this.tripRunManager.failTripAttempt(
                    attemptId,
                    `提交方案失败: ${commitError.message}`,
                  );
                } catch (error: any) {
                  this.logger.warn(`Failed to update TripAttempt to FAILED: ${error.message}`);
                }
              }

              uiOutput.confirmations = [
                `提交方案时发生错误: ${commitError.message}。请重试或联系支持。`,
              ];
            }
          } else {
            this.logger.warn('PlanArchitectCommitOptionSkill 未注入，跳过提交方案');
            uiOutput.confirmations = ['提交功能暂不可用，请稍后重试。'];
          }
          break;

        case 'adjust': {
          if (request.paceFeedback) {
            const adjustSkill = this.skillsRegistry?.getSkill('plan.pace.adjustSchedule');
            if (adjustSkill) {
              const adjustResult = await adjustSkill.execute({
                planState,
                userFeedback: request.paceFeedback,
              });
              planState.metadata = {
                ...planState.metadata,
                paceAdjustment: adjustResult,
              };
              const changes = adjustResult.adjustedTimeline?.changes?.map((c: { description: string }) => c.description) ?? [];
              if (changes.length > 0) {
                uiOutput.confirmations = [`节奏调整建议: ${changes.join('; ')}`];
              }
            }
          }
          break;
        }

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
              this.persistSkeletonOptionsToPlanState(planState, skeletonResult.skeletonSet);
              
              // 将推荐的骨架方案转换为 segments（填充 planState.itinerary.segments）
              const recommendedOption = skeletonResult.skeletonSet.options?.find(
                opt => opt.id === skeletonResult.skeletonSet.recommendation?.optionId
              ) || skeletonResult.skeletonSet.options?.[0];
              
              if (recommendedOption && recommendedOption.dayThemes && recommendedOption.dayThemes.length > 0) {
                // 将 dayThemes 转换为 RouteSegment，并包含POI信息
                planState.itinerary.segments = recommendedOption.dayThemes.map((theme) => {
                  // 查找当天的POI信息
                  const dayPoi = recommendedOption.pois?.find(p => p.day === theme.day);
                  
                  return {
                    segmentId: `day_${theme.day}_segment_1`,
                    dayIndex: theme.day - 1, // dayIndex 从 0 开始
                    distanceKm: 0, // 初始值，后续会由其他服务填充
                    ascentM: 0, // 初始值，后续会由 DEM 服务填充
                    slopePct: 0, // 初始值
                    metadata: {
                      theme: theme.theme,
                      description: theme.description,
                      day: theme.day,
                      skeletonId: recommendedOption.id,
                      skeletonName: recommendedOption.name,
                      // 添加POI信息
                      ...(dayPoi?.accommodation && { accommodation: dayPoi.accommodation }),
                      ...(dayPoi?.restaurants && dayPoi.restaurants.length > 0 && { restaurants: dayPoi.restaurants }),
                      ...(dayPoi?.attractions && dayPoi.attractions.length > 0 && { attractions: dayPoi.attractions }),
                    },
                  };
                });
                this.logger.debug(`已将骨架方案转换为 ${planState.itinerary.segments.length} 个 segments，包含POI信息`);
                
                // 检查segments中的POI坐标
                const segmentsWithPoi = planState.itinerary.segments.filter(seg => {
                  const hasAccommodation = seg.metadata?.accommodation?.coordinates;
                  const hasRestaurants = seg.metadata?.restaurants?.some((r: any) => r.poi?.coordinates);
                  const hasAttractions = seg.metadata?.attractions?.some((a: any) => a.coordinates);
                  return hasAccommodation || hasRestaurants || hasAttractions;
                });
                this.logger.debug(`Segments中有POI坐标的数量: ${segmentsWithPoi.length}/${planState.itinerary.segments.length}`);
              } else {
                this.logger.warn(`默认流程：推荐方案为空或没有dayThemes，无法转换为segments`);
              }
              
              // === 阶段 2.5: 填充DEM地形数据和地理特征 ===
              if (planState.itinerary.segments.length > 0) {
                this.logger.debug(`默认流程：开始执行阶段2.5: 填充DEM地形数据和地理特征（${planState.itinerary.segments.length} 个segments）`);
                await this.enrichSegmentsWithGeographicData(planState.itinerary.segments, request.context);
              } else {
                this.logger.warn(`默认流程：跳过阶段2.5: segments为空，无法填充DEM和地理特征`);
              }
              
              // === 阶段 2.6: 记录决策追溯链和排除过程 ===
              if (skeletonResult.skeletonSet.options && skeletonResult.skeletonSet.options.length > 1) {
                const defaultRecommendedOption = skeletonResult.skeletonSet.options?.[0];
                this.logger.debug(`默认流程：开始执行阶段2.6: 记录决策追溯链（${skeletonResult.skeletonSet.options.length} 个方案）`);
                await this.recordDecisionTraceAndExclusions(
                  planState,
                  skeletonResult.skeletonSet,
                  defaultRecommendedOption,
                  request.context
                );
              } else {
                this.logger.debug(`默认流程：跳过阶段2.6: 方案数量不足（${skeletonResult.skeletonSet.options?.length || 0} 个）`);
              }
              
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
                const defaultDayThemes = Array.from({ length: request.context.days }, (_, i) => ({
                  day: i + 1,
                  theme: `第${i + 1}天`,
                  description: `在${request.context.destination.city || request.context.destination.country}的第${i + 1}天行程`,
                }));
                
                uiOutput.skeletonOptions = {
                  options: [{
                    id: 'default_1',
                    name: '默认方案',
                    dayThemes: defaultDayThemes,
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
                this.persistSkeletonOptionsToPlanState(planState, uiOutput.skeletonOptions);
                
                // 将默认方案也转换为 segments
                planState.itinerary.segments = defaultDayThemes.map((theme) => ({
                  segmentId: `day_${theme.day}_segment_1`,
                  dayIndex: theme.day - 1,
                  distanceKm: 0,
                  ascentM: 0,
                  slopePct: 0,
                  metadata: {
                    theme: theme.theme,
                    description: theme.description,
                    day: theme.day,
                    skeletonId: 'default_1',
                    skeletonName: '默认方案',
                  },
                }));
                this.logger.debug(`已将默认骨架方案转换为 ${planState.itinerary.segments.length} 个 segments`);
              }
            }
          } else {
            this.logger.warn('PlanArchitectGenerateSkeletonSkill 未注入，跳过生成骨架方案');
          }
      }

      // 3. System 1 快速检查（预算、交通、节奏）
      // commit/compare 等步骤可能替换 planState，进入 System 1 前再次补齐 constraints
      planState = this.hydratePlanStateFromContext(planState, request.context, request.tripId);
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
          await this.enrichTransitWithSkills(planState);
        }

        // 计算时间窗
        if (this.paceComputeTimeWindows) {
          try {
            const timeWindowsResult = await this.paceComputeTimeWindows.execute({ planState });
            planState.pace.timeWindows = timeWindowsResult.timeWindows;
          } catch (paceError: any) {
            this.logger.warn(`计算时间窗失败: ${paceError.message}，已跳过 pace 时间窗`);
          }
        }

        // 疲劳评分
        if (this.paceFatigueScore) {
          try {
            const fatigueResult = await this.paceFatigueScore.execute({ planState });
            planState.pace.fatigueScore = fatigueResult.fatigueScore;
          } catch (paceError: any) {
            this.logger.warn(`疲劳评分失败: ${paceError.message}，已跳过 pace 疲劳评分`);
          }
        }

        // 门控预检查（System 1）
        if (this.gatePrecheck) {
          try {
            const gateResult = await this.gatePrecheck.execute({ planState });
            planState.gate = gateResult.gateStatus;
          } catch (gateError: any) {
            this.logger.warn(`门控预检查失败: ${gateError.message}，保留现有 gate 状态`);
          }
        }

        // 冲突检测
        if (this.constraintsDetectConflicts) {
          const conflictResult = await this.constraintsDetectConflicts.execute({ planState });
          if (conflictResult.conflicts.conflicts.length > 0) {
            await this.arbitrateConflicts(planState, conflictResult.conflicts, uiOutput);
          }
        }
      }

      // 4. System 2 深度评审 / Decision Kernel 桥接
      const kernelMode: PlanningWorkbenchKernelMode =
        this.kernelBridge?.resolveMode() ?? 'legacy';

      if (kernelMode === 'native' && this.kernelBridge?.isActive()) {
        this.logger.debug('[PlanningWorkbench] Kernel native gate pipeline');
        const kernelOutcome = await this.kernelBridge.runNativeGatePipeline({
          request,
          planState,
          tripRunId,
        });
        planState.gate = kernelOutcome.gateStatus;
        if (kernelOutcome.confirmations?.length) {
          uiOutput.confirmations = kernelOutcome.confirmations;
        }
        planState.metadata = {
          ...planState.metadata,
          kernelBridge: kernelOutcome.metadata,
        };
      } else {
        let legacyGuardianTriggered = false;

        if (planState.gate.status === 'NEED_CONFIRM' && this.gateRunThreeGuardians) {
          legacyGuardianTriggered = true;
          const guardiansResult = await this.gateRunThreeGuardians.execute({
            planState,
            tripId: request.tripId,
          });
          planState.gate = guardiansResult.gateStatus;
          if (guardiansResult.gateStatus.requiredUserConfirmations) {
            uiOutput.confirmations = guardiansResult.gateStatus.requiredUserConfirmations;
          }
        }

        if (kernelMode === 'shadow' && this.kernelBridge?.isActive()) {
          this.logger.debug('[PlanningWorkbench] Kernel shadow comparison');
          const shadowMeta = await this.kernelBridge.runShadowComparison(
            { request, planState, tripRunId },
            planState.gate,
            legacyGuardianTriggered,
          );
          planState.metadata = {
            ...planState.metadata,
            kernelBridge: shadowMeta,
          };
        }
      }

      // 5. 计算健康度（内部使用，不暴露给用户）
      uiOutput.health = this.computeHealth(planState);

      // 6. 包装为三人格输出（面向用户）
      if (this.personaShell) {
        this.logger.debug('包装为三人格输出...');
        uiOutput.personas = await this.personaShell.wrapAsPersonas(planState);
        uiOutput.causalPersonaProjection = uiOutput.personas?.causalPersonaProjection;
        if (kernelMode !== 'legacy' && this.kernelBridge) {
          uiOutput.personas =
            (await this.kernelBridge.enrichPersonasFromKernelLogs(
              uiOutput.personas,
              planState,
            )) ?? uiOutput.personas;
        }
        if (uiOutput.personas?.presentation) {
          uiOutput.presentation = uiOutput.personas.presentation;
        }
        if (request.tripId && uiOutput.presentation && this.guardianChoose) {
          await this.guardianChoose.persistLastPresentation(
            request.tripId,
            uiOutput.presentation,
            uiOutput.personas?.consolidatedDecision?.nextSteps,
          );
        }
        this.logger.debug('三人格输出完成');
      } else {
        this.logger.warn('PersonaShellService 未注入，跳过三人格输出');
      }

      await this.ensureEvidenceEnvelopes(planState);

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
      
      // 更新进度到95%（即将完成）
      updateProgress?.(95, '正在完成规划工作台流程...');
      
      return enrichPlanningWorkbenchExecuteResponse({
        planState,
        uiOutput,
        tripId: request.tripId,
        requestMetadata: request.metadata,
      });
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
   * 回传 existingPlanState 可能缺 constraints.time 等字段（前端 JSON 裁剪 / commit 增量），
   * 在 System 1 技能读 planState.constraints.time.days 前补齐。
   */
  private hydratePlanStateFromContext(
    planState: PlanState,
    context: PlanContext,
    tripId?: string,
  ): PlanState {
    const segmentDayCount = planState.itinerary?.segments?.length ?? 0;
    const resolvedDays =
      planState.constraints?.time?.days ??
      context.days ??
      (segmentDayCount > 0 ? segmentDayCount : undefined) ??
      1;

    planState.constraints = {
      ...(planState.constraints ?? {}),
      time: {
        ...(planState.constraints?.time ?? {}),
        days: resolvedDays,
        availableHoursPerDay:
          planState.constraints?.time?.availableHoursPerDay ??
          context.constraints?.time?.availableHoursPerDay,
        startDate:
          planState.constraints?.time?.startDate ?? context.constraints?.time?.startDate,
        endDate: planState.constraints?.time?.endDate ?? context.constraints?.time?.endDate,
      },
      budget: {
        ...(context.constraints?.budget ?? {}),
        ...(planState.constraints?.budget ?? {}),
      },
      fitness: planState.constraints?.fitness ?? context.constraints?.fitness ?? {},
      travelMode: planState.constraints?.travelMode ?? context.travelMode,
      accommodation: planState.constraints?.accommodation ?? context.constraints?.accommodation,
      mustDo: planState.constraints?.mustDo ?? context.mustDo,
      mustAvoid: planState.constraints?.mustAvoid ?? context.mustAvoid,
      companions: planState.constraints?.companions ?? context.constraints?.companions,
    };

    if (!planState.itinerary) {
      planState.itinerary = {
        tripId: tripId ?? `trip_${Date.now()}`,
        routeDirectionId: `route_${Date.now()}`,
        segments: [],
      };
    } else if (tripId && !planState.itinerary.tripId) {
      planState.itinerary.tripId = tripId;
    }

    if (!planState.mobility) {
      planState.mobility = { transferSegments: [] };
    } else if (!planState.mobility.transferSegments) {
      planState.mobility.transferSegments = [];
    }

    planState.budget = planState.budget ?? {};
    planState.pace = planState.pace ?? {};
    planState.gate = planState.gate ?? {
      status: 'NEED_CONFIRM',
      reasons: ['初始状态，待验证'],
      missingEvidence: [],
    };
    planState.evidence_refs = planState.evidence_refs ?? [];
    planState.decision_log_refs = planState.decision_log_refs ?? [];
    planState.status = planState.status ?? 'DRAFT';
    planState.metadata = planState.metadata ?? {};

    return planState;
  }

  /**
   * 创建初始 PlanState
   */
  private createInitialPlanState(context: PlanContext, tripId?: string): PlanState {
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
        tripId: tripId || context.existingPlanState?.itinerary?.tripId || `trip_${Date.now()}`,
        routeDirectionId: context.existingPlanState?.itinerary?.routeDirectionId || `route_${Date.now()}`,
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

  private persistSkeletonOptionsToPlanState(
    planState: PlanState,
    skeletonSet: PlanSkeletonSet,
  ): void {
    const recommendedOptionId =
      skeletonSet.recommendation?.optionId ?? skeletonSet.options?.[0]?.id;

    planState.metadata = {
      ...(planState.metadata || {}),
      skeletonOptions: skeletonSet,
      ...(recommendedOptionId ? { recommendedOptionId } : {}),
    };
  }

  private resolveSkeletonSetFromRequest(
    request: PlanningWorkbenchRequest,
    planState: PlanState,
    uiOutput: PlanningWorkbenchResponse['uiOutput'],
  ): PlanSkeletonSet | undefined {
    return (
      request.skeletonOptions ??
      resolveSkeletonOptionsFromExecuteRequest({
        skeletonOptions: request.skeletonOptions,
        existingPlanState: planState,
      }) ??
      uiOutput.skeletonOptions ??
      (planState.metadata?.skeletonOptions as PlanSkeletonSet | undefined)
    );
  }

  private resolveSelectedOptionIdFromRequest(
    request: PlanningWorkbenchRequest,
    planState: PlanState,
    uiOutput: PlanningWorkbenchResponse['uiOutput'],
  ): string | undefined {
    return (
      request.selectedOptionId ??
      resolveSelectedOptionIdFromExecuteRequest({
        selectedOptionId: request.selectedOptionId,
        existingPlanState: planState,
        skeletonOptions: request.skeletonOptions,
      }) ??
      uiOutput.comparison?.recommendation?.optionId
    );
  }

  /**
   * 填充segments的DEM地形数据和地理特征
   */
  private async enrichSegmentsWithGeographicData(
    segments: RouteSegment[],
    context: PlanContext,
    updateProgress?: (progress: number, stage?: string) => void
  ): Promise<void> {
    if (segments.length === 0) {
      this.logger.debug(`enrichSegmentsWithGeographicData: segments为空，跳过`);
      return;
    }

    this.logger.debug(`开始填充 ${segments.length} 个segments的地理数据...`);
    this.logger.debug(`DEM服务可用: ${!!this.demEffortMetadataService}, 地理特征服务可用: ${!!this.geoFactsService}, 危险区域检测可用: ${!!this.geoCheckHazardZonesSkill}`);

    // 限制并发度：最多同时处理2个segments，避免数据库连接池耗尽
    // 每个segment会触发6+个数据库查询，2个并发 = 最多12个并发查询（连接池17个）
    
    // P0优化：使用Promise队列序列化进度更新，避免竞争条件
    let completedCount = 0;
    let progressUpdateQueue = Promise.resolve();
    const baseProgress = 60;
    const progressRange = 20; // 60% ~ 80%
    const totalSegments = segments.length;
    
    // 原子化进度更新函数
    const atomicUpdateProgress = (progress: number, stage?: string) => {
      progressUpdateQueue = progressUpdateQueue.then(() => {
        updateProgress?.(progress, stage);
        return Promise.resolve();
      });
    };
    
    const segmentTasks = segments.map((segment, index) => async () => {
        try {
          // 更新进度：60% + (当前索引 / 总数) * 20% = 60% ~ 80%
          const startProgress = baseProgress + Math.floor((index / totalSegments) * progressRange);
          atomicUpdateProgress(startProgress, `正在填充Segment ${index + 1}/${totalSegments}的地理数据...`);
          this.logger.debug(`开始处理Segment ${index + 1}/${totalSegments}，进度: ${startProgress}%`);
          
          // 1. 提取POI坐标构建路线
          const routePoints = this.extractRoutePointsFromSegment(segment);
          this.logger.debug(`Segment ${index + 1}: 提取到 ${routePoints.length} 个POI坐标点`);
          
          if (routePoints.length >= 2) {
            // 2. 填充DEM地形数据
            if (this.demEffortMetadataService) {
              try {
                this.logger.debug(`Segment ${index + 1}: 开始调用DEM服务计算地形数据（${routePoints.length} 个点）...`);
                const demStartTime = Date.now();
                
                // 添加超时保护（30秒）
                const demPromise = this.demEffortMetadataService.calculateEffortMetadata(
                  routePoints,
                  {
                    activityType: context.travelMode === 'self_drive' ? 'driving' : 
                                 context.travelMode === 'walking' ? 'walking' : 'walking',
                    includeElevationProfile: false, // 不需要详细剖面，节省性能
                  }
                );
                
                const timeoutPromise = new Promise<never>((_, reject) => {
                  setTimeout(() => reject(new Error('DEM服务调用超时（30秒）')), 30000);
                });
                
                const effortMetadata = await Promise.race([demPromise, timeoutPromise]);
                const demDuration = Date.now() - demStartTime;
                this.logger.debug(`Segment ${index + 1}: DEM服务调用完成，耗时 ${demDuration}ms`);
                
                // P0优化：DEM成功后更新进度
                const demProgress = baseProgress + Math.floor((index / totalSegments) * progressRange) + Math.floor((progressRange / totalSegments) * 0.6);
                atomicUpdateProgress(demProgress, `Segment ${index + 1}: DEM地形数据计算完成`);

                // 更新segment的地形数据
                segment.distanceKm = effortMetadata.totalDistance / 1000; // 转换为公里
                segment.ascentM = effortMetadata.totalAscent;
                segment.slopePct = effortMetadata.maxSlope;
                
                // 添加地形元数据
                segment.metadata = {
                  ...segment.metadata,
                  elevation: {
                    max: effortMetadata.maxElevation,
                    min: effortMetadata.minElevation,
                    avg: effortMetadata.avgElevation,
                  },
                  terrainComplexity: effortMetadata.terrainComplexity,
                  difficulty: effortMetadata.difficulty,
                  effortScore: effortMetadata.effortScore,
                };

                this.logger.debug(`Segment ${index + 1}: 距离=${segment.distanceKm.toFixed(1)}km, 爬升=${segment.ascentM.toFixed(0)}m, 坡度=${segment.slopePct.toFixed(1)}%`);
              } catch (demError: any) {
                const isTimeout = demError.message?.includes('超时') || demError.message?.includes('timeout') || demError.message?.includes('TIMEOUT');
                this.logger.warn(`填充Segment ${index + 1}的DEM数据失败: ${demError.message}${isTimeout ? ' (超时)' : ''}`);
                
                // P0优化：超时后立即更新进度并跳过
                if (isTimeout) {
                  const skipProgress = baseProgress + Math.floor((index / totalSegments) * progressRange) + Math.floor((progressRange / totalSegments) * 0.7);
                  atomicUpdateProgress(skipProgress, `Segment ${index + 1}: DEM服务超时，跳过地形数据填充`);
                }
              }
            }

            // 3. 查询地理特征（使用segment的中心点）
            if (this.geoFactsService && routePoints.length > 0) {
              try {
                this.logger.debug(`Segment ${index + 1}: 开始查询地理特征...`);
                const geoStartTime = Date.now();
                const centerPoint = this.calculateSegmentCenter(routePoints);
                
                // 添加超时保护（10秒）
                const geoPromise = this.geoFactsService.getGeoFeaturesForPoint(
                  centerPoint.lat,
                  centerPoint.lng,
                  {
                    useCache: true,
                    month: new Date().getMonth() + 1, // 当前月份
                  }
                );
                
                const timeoutPromise = new Promise<never>((_, reject) => {
                  setTimeout(() => reject(new Error('地理特征查询超时（10秒）')), 10000);
                });
                
                const geoFeatures = await Promise.race([geoPromise, timeoutPromise]);
                const geoDuration = Date.now() - geoStartTime;
                this.logger.debug(`Segment ${index + 1}: 地理特征查询完成，耗时 ${geoDuration}ms`);
                
                // P0优化：地理特征查询成功后更新进度
                const geoProgress = baseProgress + Math.floor((index / totalSegments) * progressRange) + Math.floor((progressRange / totalSegments) * 0.8);
                atomicUpdateProgress(geoProgress, `Segment ${index + 1}: 地理特征查询完成`);

                // 添加地理特征到metadata
                segment.metadata = {
                  ...segment.metadata,
                  geoFeatures: {
                    rivers: {
                      nearRiver: geoFeatures.rivers.nearRiver,
                      riverDensityScore: geoFeatures.rivers.riverDensityScore,
                    },
                    mountains: {
                      mountainDensityScore: geoFeatures.mountains.mountainDensityScore,
                    },
                    roads: {
                      nearRoad: geoFeatures.roads.nearRoad,
                      roadDensityScore: geoFeatures.roads.roadDensityScore,
                    },
                    coastlines: {
                      nearCoastline: geoFeatures.coastlines.nearCoastline,
                    },
                    accessibility: {
                      hasPort: geoFeatures.ports.nearPort,
                      hasAirport: geoFeatures.airlines.nearAirport,
                    },
                  },
                };

                // 4. 检测危险区域（需要countryCode和route）
                if (this.geoCheckHazardZonesSkill && routePoints.length >= 2) {
                  try {
                    // 从context推断countryCode
                    const countryCode = this.inferCountryCode(context);
                    if (countryCode) {
                      const hazards = await this.geoCheckHazardZonesSkill.execute({
                        route: routePoints,
                        countryCode,
                        month: new Date().getMonth() + 1,
                        bufferRadius: 1000, // 1km缓冲区
                      });

                      if (hazards && hazards.hazardZones && hazards.hazardZones.length > 0) {
                        segment.metadata = {
                          ...segment.metadata,
                          hazards: hazards.hazardZones.map((h: {
                            zoneId: string;
                            type: 'AVALANCHE' | 'MUDSLIDE' | 'FLOOD' | 'ICE' | 'VOLCANIC' | 'OTHER';
                            level: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH';
                            location?: { lat: number; lng: number };
                            description?: string;
                          }) => ({
                            zoneId: h.zoneId,
                            type: h.type,
                            level: h.level,
                            location: h.location,
                            description: h.description,
                          })),
                          riskAssessment: hazards.riskAssessment,
                        };
                        this.logger.warn(`Segment ${index + 1} 检测到 ${hazards.hazardZones.length} 个危险区域`);
                      }
                    }
                  } catch (hazardError: any) {
                    this.logger.debug(`检测Segment ${index + 1}的危险区域失败: ${hazardError.message}`);
                  }
                }
              } catch (geoError: any) {
                const isTimeout = geoError.message?.includes('超时') || geoError.message?.includes('timeout') || geoError.message?.includes('TIMEOUT');
                this.logger.warn(`填充Segment ${index + 1}的地理特征失败: ${geoError.message}${isTimeout ? ' (超时)' : ''}`);
                
                // P0优化：超时后立即更新进度并跳过
                if (isTimeout) {
                  const skipProgress = baseProgress + Math.floor((index / totalSegments) * progressRange) + Math.floor((progressRange / totalSegments) * 0.85);
                  atomicUpdateProgress(skipProgress, `Segment ${index + 1}: 地理特征查询超时，跳过`);
                }
              }
            }
          } else if (routePoints.length === 1) {
            // 只有一个POI，只查询地理特征，不计算DEM
            this.logger.debug(`Segment ${index + 1}: 只有1个POI坐标，跳过DEM计算，只查询地理特征`);
            if (this.geoFactsService) {
              try {
                const geoFeatures = await this.geoFactsService.getGeoFeaturesForPoint(
                  routePoints[0].lat,
                  routePoints[0].lng,
                  { useCache: true }
                );
                segment.metadata = {
                  ...segment.metadata,
                  geoFeatures: {
                    rivers: { nearRiver: geoFeatures.rivers.nearRiver },
                    roads: { nearRoad: geoFeatures.roads.nearRoad },
                    coastlines: { nearCoastline: geoFeatures.coastlines.nearCoastline },
                  },
                };
              } catch (geoError: any) {
                this.logger.debug(`填充Segment ${index + 1}的地理特征失败: ${geoError.message}`);
              }
            }
          } else {
            this.logger.debug(`Segment ${index + 1}: 没有POI坐标，跳过DEM和地理特征填充`);
          }
        } catch (error: any) {
          this.logger.warn(`填充Segment ${index + 1}的地理数据失败: ${error.message}`, error.stack);
        } finally {
          // P0优化：原子化更新已完成计数和进度
          progressUpdateQueue = progressUpdateQueue.then(() => {
            completedCount++;
            const finalProgress = baseProgress + Math.floor((completedCount / totalSegments) * progressRange);
            updateProgress?.(finalProgress, `已完成 ${completedCount}/${totalSegments} 个segments的地理数据填充`);
            this.logger.debug(`完成处理Segment ${index + 1}/${totalSegments}，进度: ${finalProgress}%，已完成: ${completedCount}/${totalSegments}`);
            return Promise.resolve();
          });
        }
    });

    // 使用有界并发执行器限制并发度
    await runBounded(segmentTasks, this.geoFeaturesMaxConcurrency);
    
    // P0优化：等待所有进度更新完成
    await progressUpdateQueue;

    this.logger.debug(`完成填充 ${segments.length} 个segments的地理数据`);
    atomicUpdateProgress(80, 'DEM地形数据和地理特征填充完成');
  }

  /**
   * 从segment中提取路线点（POI坐标）
   */
  private extractRoutePointsFromSegment(segment: RouteSegment): Array<{ lat: number; lng: number }> {
    const points: Array<{ lat: number; lng: number }> = [];
    const metadata = segment.metadata || {};

    // 从accommodation提取
    if (metadata.accommodation?.coordinates) {
      points.push(metadata.accommodation.coordinates);
      this.logger.debug(`从accommodation提取坐标: (${metadata.accommodation.coordinates.lat}, ${metadata.accommodation.coordinates.lng})`);
    }

    // 从restaurants提取
    if (metadata.restaurants && Array.isArray(metadata.restaurants)) {
      for (const restaurant of metadata.restaurants) {
        if (restaurant.poi?.coordinates) {
          points.push(restaurant.poi.coordinates);
          this.logger.debug(`从restaurant提取坐标: (${restaurant.poi.coordinates.lat}, ${restaurant.poi.coordinates.lng})`);
        }
      }
    }

    // 从attractions提取
    if (metadata.attractions && Array.isArray(metadata.attractions)) {
      for (const attraction of metadata.attractions) {
        if (attraction.coordinates) {
          points.push(attraction.coordinates);
          this.logger.debug(`从attraction提取坐标: (${attraction.coordinates.lat}, ${attraction.coordinates.lng})`);
        }
      }
    }

    if (points.length === 0) {
      this.logger.debug(`Segment ${segment.segmentId}: 未找到任何POI坐标（accommodation: ${!!metadata.accommodation}, restaurants: ${metadata.restaurants?.length || 0}, attractions: ${metadata.attractions?.length || 0}）`);
    }

    return points;
  }

  /**
   * 计算segment的中心点
   */
  private calculateSegmentCenter(points: Array<{ lat: number; lng: number }>): { lat: number; lng: number } {
    if (points.length === 0) {
      return { lat: 0, lng: 0 };
    }

    if (points.length === 1) {
      return points[0];
    }

    // 计算所有点的平均坐标
    const avgLat = points.reduce((sum, p) => sum + p.lat, 0) / points.length;
    const avgLng = points.reduce((sum, p) => sum + p.lng, 0) / points.length;

    return { lat: avgLat, lng: avgLng };
  }

  /**
   * 记录决策追溯链和排除过程
   */
  private async recordDecisionTraceAndExclusions(
    planState: PlanState,
    skeletonSet: PlanSkeletonSet,
    recommendedOption: any,
    context: PlanContext
  ): Promise<void> {
    try {
      const exclusionLog: Array<{
        excludedOptionId: string;
        excludedOptionName: string;
        reason: string;
        evidence: string[];
        timestamp: string;
      }> = [];

      // 记录为什么排除了其他方案
      if (recommendedOption && skeletonSet.options) {
        for (const option of skeletonSet.options) {
          if (option.id !== recommendedOption.id) {
            // 分析为什么这个方案被排除
            const exclusionReason = this.analyzeExclusionReason(
              option,
              recommendedOption,
              skeletonSet.recommendation,
              context
            );

            exclusionLog.push({
              excludedOptionId: option.id,
              excludedOptionName: option.name,
              reason: exclusionReason.reason,
              evidence: exclusionReason.evidence,
              timestamp: new Date().toISOString(),
            });
          }
        }
      }

      // 记录决策日志引用
      const decisionLogRefs: Array<{
        decision_id: string;
        diff: any;
        evidence_refs: string[];
        rule_version: string;
        timestamp: string;
      }> = [];

      if (recommendedOption) {
        decisionLogRefs.push({
          decision_id: `decision_${Date.now()}_skeleton_selection`,
          diff: {
            type: 'skeleton_selection',
            selectedOptionId: recommendedOption.id,
            selectedOptionName: recommendedOption.name,
            excludedOptions: exclusionLog.map(e => e.excludedOptionId),
          },
          evidence_refs: [
            `skeleton_set_${skeletonSet.options?.length || 0}_options`,
            `recommendation_${skeletonSet.recommendation?.optionId || 'none'}`,
          ],
          rule_version: '1.0.0',
          timestamp: new Date().toISOString(),
        });
      }

      // 更新 planState
      planState.metadata = {
        ...planState.metadata,
        exclusionLog,
        decisionTrace: {
          skeletonSelection: {
            timestamp: new Date().toISOString(),
            totalOptions: skeletonSet.options?.length || 0,
            selectedOptionId: recommendedOption?.id,
            recommendationReason: skeletonSet.recommendation?.reason,
          },
        },
      };

      planState.decision_log_refs = [
        ...(planState.decision_log_refs || []),
        ...decisionLogRefs,
      ];

      this.logger.debug(`已记录决策追溯链和排除过程: ${exclusionLog.length} 个排除项`);
    } catch (error: any) {
      this.logger.warn(`记录决策追溯链失败: ${error.message}`);
      // 不阻塞主流程
    }
  }

  /**
   * 分析排除原因
   */
  private analyzeExclusionReason(
    excludedOption: any,
    recommendedOption: any,
    recommendation: any,
    context: PlanContext
  ): {
    reason: string;
    evidence: string[];
  } {
    const evidence: string[] = [];
    let reason = '不符合推荐标准';

    // 分析推荐理由
    if (recommendation?.reason) {
      reason = `推荐理由: ${recommendation.reason}`;
    }

    // 对比方案特点
    if (excludedOption.name === '紧凑型' && recommendedOption?.name !== '紧凑型') {
      evidence.push('紧凑型方案节奏较紧，可能不符合用户偏好');
      if (context.constraints?.fitness?.level === 'low') {
        evidence.push('用户体力水平较低，不适合紧凑型方案');
      }
    }

    if (excludedOption.name === '松弛型' && recommendedOption?.name !== '松弛型') {
      evidence.push('松弛型方案节奏较慢，可能无法充分利用时间');
      if (context.days && context.days <= 3) {
        evidence.push('行程天数较短，建议选择更紧凑的方案');
      }
    }

    // 对比预算约束
    if (context.constraints?.budget?.total) {
      // 这里可以添加更详细的预算分析
      evidence.push('已考虑预算约束');
    }

    // 对比体力约束
    if (context.constraints?.fitness?.level) {
      if (excludedOption.name === '紧凑型' && context.constraints.fitness.level === 'low') {
        evidence.push('紧凑型方案不适合低体力水平用户');
      }
    }

    // 如果没有具体证据，使用通用原因
    if (evidence.length === 0) {
      evidence.push('根据综合评估，该方案不如推荐方案适合当前需求');
    }

    return { reason, evidence };
  }

  /**
   * 从PlanContext推断国家代码
   */
  private inferCountryCode(context: PlanContext): string | null {
    const country = context.destination?.country;
    if (!country) {
      return null;
    }

    // 国家名称到ISO代码的映射（简化版，实际应该使用地理编码服务）
    const countryCodeMap: Record<string, string> = {
      '冰岛': 'IS',
      'Iceland': 'IS',
      '格陵兰': 'GL',
      'Greenland': 'GL',
      '挪威': 'NO',
      'Norway': 'NO',
      '阿根廷': 'AR',
      'Argentina': 'AR',
      '中国': 'CN',
      'China': 'CN',
    };

    return countryCodeMap[country] || null;
  }

  /** 解析规划工作台上下文用户（OWNER > metadata.userId > 首位协作者） */
  private async resolveWorkbenchUserId(tripId: string): Promise<string | null> {
    if (!this.prisma) {
      return null;
    }
    try {
      const trip = await this.prisma.trip.findUnique({
        where: { id: tripId },
        include: { TripCollaborator: true },
      });
      if (!trip) {
        return null;
      }
      const owner = trip.TripCollaborator.find((c) => c.role === 'OWNER');
      if (owner) {
        return owner.userId;
      }
      const metadataUserId = (trip.metadata as { userId?: string } | null)?.userId;
      if (metadataUserId) {
        return metadataUserId;
      }
      return trip.TripCollaborator[0]?.userId ?? null;
    } catch (e: any) {
      this.logger.debug(`resolveWorkbenchUserId failed: ${e?.message}`);
      return null;
    }
  }

  /**
   * 计算健康度
   */
  private async enrichTransitWithSkills(planState: PlanState): Promise<void> {
    if (!this.skillsRegistry) return;

    const suggestSkill = this.skillsRegistry.getSkill('plan.transit.suggestModes');
    const planBSkill = this.skillsRegistry.getSkill('plan.transit.generatePlanB');
    const planBOptions: unknown[] = [];

    for (const segment of planState.mobility.transferSegments) {
      if (segment.feasibility === 'infeasible' && planBSkill) {
        try {
          const planBResult = await planBSkill.execute({ segment, context: { planId: planState.plan_id } });
          planBOptions.push({ segmentId: segment.id, options: planBResult.planBOptions });
        } catch (error: any) {
          this.logger.warn(`plan.transit.generatePlanB 失败 segment=${segment.id}: ${error.message}`);
        }
      } else if (suggestSkill && segment.from?.city && segment.to?.city) {
        try {
          const modesResult = await suggestSkill.execute({
            from: segment.from,
            to: segment.to,
          });
          segment.availableModes = modesResult.modes;
        } catch (error: any) {
          this.logger.warn(`plan.transit.suggestModes 失败 ${segment.from.city}→${segment.to.city}: ${error.message}`);
        }
      }
    }

    if (planBOptions.length > 0) {
      planState.metadata = { ...planState.metadata, transitPlanB: planBOptions };
    }
  }

  private async arbitrateConflicts(
    planState: PlanState,
    conflicts: ConflictDetection,
    uiOutput: PlanningWorkbenchResponse['uiOutput'],
  ): Promise<void> {
    const arbitrateSkill = this.skillsRegistry?.getSkill('plan.constraints.arbitrateTradeoffs');
    if (!arbitrateSkill) return;

    try {
      const arbitration = await arbitrateSkill.execute({ planState, conflicts });
      planState.metadata = { ...planState.metadata, conflictArbitration: arbitration };
      if (arbitration.userConfirmationRequired) {
        const confirmations = uiOutput.confirmations ?? [];
        confirmations.push(
          `约束冲突需确认: ${arbitration.recommendedResolution.description}`,
        );
        uiOutput.confirmations = confirmations;
      }
    } catch (error: any) {
      this.logger.warn(`plan.constraints.arbitrateTradeoffs 失败: ${error.message}`);
    }
  }

  private async ensureEvidenceEnvelopes(planState: PlanState): Promise<void> {
    if (planState.evidence_refs.length > 0 || !this.skillsRegistry) return;

    const buildSkill = this.skillsRegistry.getSkill('plan.evidence.buildEnvelope');
    if (!buildSkill) return;

    const excerpts: string[] = [
      ...planState.gate.reasons,
      ...(planState.gate.guardianResults?.abu.evidence ?? []),
      ...(planState.gate.guardianResults?.drdre.evidence ?? []),
      ...(planState.gate.guardianResults?.neptune.evidence ?? []),
    ].filter(Boolean);

    for (const excerpt of excerpts.slice(0, 5)) {
      try {
        const result = await buildSkill.execute({
          source_title: 'plan.gate',
          excerpt,
          relevance: 'gate evaluation',
          confidence: 'MEDIUM',
        });
        planState.evidence_refs.push(result.envelope);
      } catch (error: any) {
        this.logger.warn(`plan.evidence.buildEnvelope 失败: ${error.message}`);
      }
    }
  }

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
        const tripId = planState.itinerary?.tripId || '';
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
    _compareFields?: string[],
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

  /**
   * 获取世界模型数据 (Domain Agents)
   * 
   * 通过 Domain Agents 获取地理、天气、成本、体验等世界模型数据，
   * 用于支持决策核心引擎的约束检查和权衡分析。
   */
  async getWorldModelData(
    context: PlanContext,
    opts?: {
      tripId?: string;
      /** Decision DNA / 慢思考：微调策略层 reasoning 权重（Experience / Budget） */
      decisionDnaBias?: { experience?: number; budget?: number };
      /** 冲突场景下的 DNA 轴（注册 MAC 前应用，可与 UserProfile.decision_dna 映射） */
      decisionDnaProfile?: DecisionDnaProfileForStrategy;
    },
  ): Promise<{
    geo?: Awaited<ReturnType<GeoAgentService['analyzeTerrain']>>;
    weather?: Awaited<ReturnType<WeatherAgentService['getForecast']>>;
    cost?: Awaited<ReturnType<CostAgentService['estimateTripCost']>>;
    experience?: Awaited<ReturnType<ExperienceAgentService['assessHumanExecutability']>>;
    /** Layer 1：事实锚（有 Geo/Weather 结果时为 true） */
    factLayerAnchor?: WorldModelFactLayerAnchor;
    /** Layer 2：合并后的策略提案（独立于事协作注册也存在） */
    strategyLayer?: WorldModelStrategyLayer;
    /** MultiAgent 桥：贡献注册 + 冲突视图（需 tripId + 服务注入） */
    collaborationBridge?: {
      registered: boolean;
      conflictCount: number;
      openConflictCount: number;
      conflicts: Array<{ id: string; conflictType: string; agents: string[] }>;
      consensusSummary: string | null;
    };
  }> {
    const result: {
      geo?: Awaited<ReturnType<GeoAgentService['analyzeTerrain']>>;
      weather?: Awaited<ReturnType<WeatherAgentService['getForecast']>>;
      cost?: Awaited<ReturnType<CostAgentService['estimateTripCost']>>;
      experience?: Awaited<ReturnType<ExperienceAgentService['assessHumanExecutability']>>;
    } = {};

    // System 1：并行拉取（快路径）
    const promises: Promise<void>[] = [];

    const startDate = context.constraints?.time?.startDate;
    const endDate = context.constraints?.time?.endDate;
    const hasDates = !!(startDate && endDate);

    if (this.costAgent && context.destination && hasDates) {
      promises.push(
        this.costAgent
          .estimateTripCost(
            context.destination.country || context.destination.city || '',
            { start: startDate!, end: endDate! },
            context.constraints?.companions?.count || 2,
          )
          .then((data) => {
            result.cost = data;
          })
          .catch((e) => {
            this.logger.warn(`[WorldModel] CostAgent failed: ${e.message}`);
          }),
      );
    }

    await Promise.all(promises);

    const expBias = opts?.decisionDnaBias?.experience ?? 0;
    const budgetBias = opts?.decisionDnaBias?.budget ?? 0;

    let costStrategyLayer = result.cost
      ? this.costAgent!.buildBudgetStrategyLayer(result.cost, {
          budgetCeiling: context.constraints?.budget?.total,
        })
      : undefined;

    let expStrategyLayer: WorldModelStrategyLayer | undefined;
    if (this.experienceAgent) {
      expStrategyLayer = this.experienceAgent.buildExperienceStrategyLayer(context, {
        reasoningWeightBoost: expBias,
      });
      if (costStrategyLayer?.budgetProposal && budgetBias > 0) {
        costStrategyLayer.budgetProposal = {
          ...costStrategyLayer.budgetProposal,
          reasoningWeight: Math.min(
            0.98,
            costStrategyLayer.budgetProposal.reasoningWeight + budgetBias,
          ),
        };
      }
    }

    if (opts?.decisionDnaProfile) {
      const tuned = applyDecisionDnaToStrategyLayers(
        { cost: costStrategyLayer, experience: expStrategyLayer },
        opts.decisionDnaProfile,
      );
      if (tuned.hint) {
        this.logger.debug(`[WorldModel][DNA] ${tuned.hint}`);
      }
      if (tuned.cost) {
        costStrategyLayer = tuned.cost;
      }
      if (tuned.experience) {
        expStrategyLayer = tuned.experience;
      }
    }

    const strategyLayer: WorldModelStrategyLayer | undefined =
      costStrategyLayer || expStrategyLayer
        ? {
            budgetProposal: costStrategyLayer?.budgetProposal,
            experienceProposal: expStrategyLayer?.experienceProposal,
          }
        : undefined;

    const factLayerAnchor: WorldModelFactLayerAnchor | undefined =
      result.geo || result.weather
        ? {
            geoPinned: !!result.geo,
            weatherPinned: !!result.weather,
            pinnedAt: new Date().toISOString(),
          }
        : undefined;

    let collaborationBridge:
      | {
          registered: boolean;
          conflictCount: number;
          openConflictCount: number;
          conflicts: Array<{ id: string; conflictType: string; agents: string[] }>;
          consensusSummary: string | null;
        }
      | undefined;

    const tripId = opts?.tripId?.trim();
    if (
      tripId &&
      this.multiAgentCollaboration &&
      (costStrategyLayer?.budgetProposal || expStrategyLayer?.experienceProposal)
    ) {
      try {
        if (costStrategyLayer?.budgetProposal && result.cost) {
          await this.multiAgentCollaboration.registerContribution(tripId, {
            agentId: 'domain:cost',
            agentType: 'COST_AGENT',
            confidence: result.cost.confidence,
            contribution: {
              strategyLayer: { budgetProposal: costStrategyLayer.budgetProposal },
            },
            timestamp: new Date(),
            metadata: {
              source: 'CostAgentService.buildBudgetStrategyLayer',
              reasoning: '预算估算 vs 用户软顶（constraints.budget.total）',
            },
          });
        }
        if (expStrategyLayer?.experienceProposal) {
          await this.multiAgentCollaboration.registerContribution(tripId, {
            agentId: 'domain:experience',
            agentType: 'EXPERIENCE_AGENT',
            confidence: expStrategyLayer.experienceProposal.confidence,
            contribution: {
              strategyLayer: {
                experienceProposal: expStrategyLayer.experienceProposal,
              },
            },
            timestamp: new Date(),
            metadata: {
              source: 'ExperienceAgentService.buildExperienceStrategyLayer',
              reasoning: '体验层级（含极光玻璃屋等高阶供给语义）',
            },
          });
        }
        const view = this.multiAgentCollaboration.getCollaborationBridgeView(tripId);
        collaborationBridge = {
          registered: true,
          conflictCount: view.conflicts.length,
          openConflictCount: view.openConflictCount,
          conflicts: view.conflicts.map((c) => ({
            id: c.id,
            conflictType: c.conflictType,
            agents: c.agents,
          })),
          consensusSummary: view.consensusSummary,
        };
        this.logger.log(
          `[WorldModel] MultiAgent bridge: tripId=${tripId}, conflicts=${view.conflicts.length}, open=${view.openConflictCount}`,
        );
      } catch (e: any) {
        this.logger.warn(`[WorldModel] MultiAgent collaboration failed: ${e?.message || e}`);
        collaborationBridge = {
          registered: false,
          conflictCount: 0,
          openConflictCount: 0,
          conflicts: [],
          consensusSummary: null,
        };
      }
    }

    this.logger.debug(
      `[WorldModel] Data collected: geo=${!!result.geo}, weather=${!!result.weather}, cost=${!!result.cost}, collaboration=${!!collaborationBridge?.registered}`,
    );

    const strategyLayerOut: WorldModelStrategyLayer | undefined =
      strategyLayer || collaborationBridge?.consensusSummary
        ? {
            ...(strategyLayer || {}),
            consensusSummary:
              collaborationBridge?.consensusSummary ??
              strategyLayer?.consensusSummary,
          }
        : undefined;

    return {
      ...result,
      factLayerAnchor,
      strategyLayer: strategyLayerOut,
      collaborationBridge,
    };
  }
}
