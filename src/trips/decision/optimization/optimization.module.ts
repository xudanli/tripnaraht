// src/trips/decision/optimization/optimization.module.ts
/**
 * Optimization Module
 * 
 * Phase 1/2/3 优化模块，整合：
 * - 目标函数服务
 * - Abu/Dre 优化器
 * - 概率世界模型
 * - 期望效用服务
 * - 多智能体协商
 * - 权重学习
 * 
 * 中期功能：
 * - 多用户协同
 * - 实时状态更新
 * - A/B 测试框架
 * 
 * 公理系统：
 * - 七条核心公理定义决策理论基础
 * - 公理验证确保系统一致性
 */

import { Module } from '@nestjs/common';

// Phase 1: 目标函数 + 显式优化器
import { ObjectiveFunctionService } from './objective-function.service';
import { AbuOptimizerService } from './abu-optimizer.service';
import { DreOptimizerService } from './dre-optimizer.service';
import { StrategyOrchestratorV2Service } from './strategy-orchestrator-v2.service';

// Phase 2: 概率模型
import { ProbabilisticWorldModelService } from './probabilistic/probabilistic-world-model.service';
import { ExpectedUtilityService } from './probabilistic/expected-utility.service';

// 专利升级：统一决策公式 + CGUS 搜索
import { UnifiedDecisionFormulaService } from './unified-decision-formula.service';
import { CGUSSearchService } from './cgus-search.service';
import { MultiStepPlanningService } from './planning/multi-step-planning.service';
import { DifferentiableDecisionService } from './differentiable/differentiable-decision.service';
import { InformationGainService } from './exploration/information-gain.service';
import { MetaPolicyService } from './meta/meta-policy.service';
import { ExperienceRoutingPolicyService } from '../policies/experience-routing-policy.service';
import { LagrangianConstraintService } from './theory/lagrangian-constraint.service';
import { DecisionConfidenceService } from './theory/decision-confidence.service';
import { LyapunovStabilityService } from './theory/lyapunov-stability.service';
import { UnifiedLearningService } from './theory/unified-learning.service';
import { ComplexityAnalysisService } from './theory/complexity-analysis.service';
import { DSOStabilityMonitorService } from './theory/dso-stability.service';
import { RegretTrackerService } from './theory/regret-tracker.service';
import { UCBVisitTrackerService } from './theory/ucb-visit-tracker.service';
import { PlanFeaturesService } from './plan-features/plan-features.service';
import { ExposureMapService } from './plan-features/exposure-map.service';
import { ExposureAnnotationService } from './plan-features/exposure-annotation.service';

// Phase 3：POMDP 信念更新
import { BeliefUpdateService } from './probabilistic/belief-update.service';
import { DefaultObservationModelService } from './probabilistic/default-observation-model.service';

// Phase 3: 多智能体 + 学习
import { GuardianDebateService } from './learning/guardian-debate.service';
import { WeightLearnerService } from './learning/weight-learner.service';
import { WeightPersistenceService } from './learning/weight-persistence.service';
import { PolicyLearningService } from './learning/policy-learning.service';
import { OnlineLearningLoopService } from './learning/online-learning-loop.service';
import { PolicyNetworkService } from './learning/policy-network.service';
import { DSOSnapshotAuditService } from './learning/dso-snapshot-audit.service';
import { RlhfPersistenceService } from './learning/rlhf-persistence.service';

// 监控指标
import { DecisionMetricsService } from './metrics/decision-metrics.service';

// 门面服务
import { DecisionOSFacadeService } from './decision-os-facade.service';

// 中期：多用户协同
import { TeamCollaborationService } from './collaboration/team-collaboration.service';
import { TeamInviteService } from './collaboration/team-invite.service';
import { NegotiateContextLoaderService } from './collaboration/negotiate-context-loader.service';

// 中期：实时状态更新
import { RealtimeWorldStateService } from './realtime/realtime-world-state.service';

// 中期：A/B 测试
import { ABTestingService } from './experiments/ab-testing.service';

// 公理系统
import { AxiomValidatorService } from './axioms/axiom-validator.service';
import { HierarchicalUtilityService } from './axioms/hierarchical-utility.service';

// 公开邀请（无认证）
import { TeamInvitePublicController } from './controllers/team-invite-public.controller';

// 用户端控制器
import { OptimizationUserController } from './controllers/user/optimization-user.controller';
import { TeamUserController } from './controllers/user/team-user.controller';
import { RealtimeUserController } from './controllers/user/realtime-user.controller';

// 管理端控制器
import { OptimizationAdminController } from './controllers/admin/optimization-admin.controller';
import { RealtimeAdminController } from './controllers/admin/realtime-admin.controller';
import { ABTestingAdminController } from './controllers/admin/ab-testing-admin.controller';
import { AxiomAdminController } from './controllers/admin/axiom-admin.controller';
import { DSOAuditAdminController } from './controllers/admin/dso-audit-admin.controller';
import { MetricsAdminController } from './controllers/admin/metrics-admin.controller';

// 依赖
import { FatigueCalculatorService } from '../services/fatigue-calculator.service';
import { TdfpmCalculatorService } from '../services/tdfpm-calculator.service';
import { PrismaModule } from '../../../prisma/prisma.module';
import { DecisionOSModule } from './decision-os.module';
import { NoopCandidateScorerService } from './scoring/noop-candidate-scorer.service';
import { CANDIDATE_SCORER } from './scoring/candidate-scorer.tokens';

@Module({
  imports: [
    PrismaModule,
    // Provide typed config (DecisionOSConfigService) to optimization stack.
    DecisionOSModule.forFeature({
      enableAuth: false,
      enableCache: false,
      enableTracing: false,
      enableMetrics: false,
      enableWebSocket: false,
      enableEventSourcing: false,
    }),
  ],
  controllers: [
    // 公开邀请（/api/v2/team/invites）
    TeamInvitePublicController,
    
    // 用户端（/api/v2/user/...）
    OptimizationUserController,
    TeamUserController,
    RealtimeUserController,
    
    // 管理端（/api/v2/admin/...）
    OptimizationAdminController,
    RealtimeAdminController,
    ABTestingAdminController,
    AxiomAdminController,
    DSOAuditAdminController,
    MetricsAdminController,
  ],
  providers: [
    // Phase 1
    ObjectiveFunctionService,
    AbuOptimizerService,
    DreOptimizerService,
    StrategyOrchestratorV2Service,
    
    // Phase 2
    ProbabilisticWorldModelService,
    PlanFeaturesService,
    ExposureMapService,
    ExposureAnnotationService,
    ExpectedUtilityService,

    // 专利升级：统一决策公式 + CGUS 搜索
    UnifiedDecisionFormulaService,
    CGUSSearchService,
    NoopCandidateScorerService,
    { provide: CANDIDATE_SCORER, useExisting: NoopCandidateScorerService },

    // 顶级强化方向：多步规划 + 可微决策 + 信息增益 + 元决策
    MultiStepPlanningService,
    DifferentiableDecisionService,
    InformationGainService,
    MetaPolicyService,
    ExperienceRoutingPolicyService,

    // 专利 3.13 理论实现：拉格朗日、置信度、Lyapunov、统一学习
    LagrangianConstraintService,
    DecisionConfidenceService,
    LyapunovStabilityService,
    UnifiedLearningService,
    ComplexityAnalysisService,
    DSOStabilityMonitorService,
    RegretTrackerService,
    UCBVisitTrackerService,

    // Phase 3：POMDP 信念更新
    DefaultObservationModelService,
    BeliefUpdateService,

    // Phase 3
    GuardianDebateService,
    WeightLearnerService,
    WeightPersistenceService,
    PolicyLearningService,
    OnlineLearningLoopService,
    PolicyNetworkService,
    DSOSnapshotAuditService,
    RlhfPersistenceService,

    // 监控指标
    DecisionMetricsService,

    // 门面服务
    DecisionOSFacadeService,

    // 中期：多用户协同
    TeamCollaborationService,
    TeamInviteService,
    NegotiateContextLoaderService,
    
    // 中期：实时状态更新
    RealtimeWorldStateService,
    
    // 中期：A/B 测试
    ABTestingService,
    
    // 公理系统
    AxiomValidatorService,
    HierarchicalUtilityService,
    
    // 依赖（如果 DecisionModule 未提供）
    FatigueCalculatorService,
    TdfpmCalculatorService,
  ],
  exports: [
    // Phase 1
    ObjectiveFunctionService,
    AbuOptimizerService,
    DreOptimizerService,
    StrategyOrchestratorV2Service,
    
    // Phase 2
    ProbabilisticWorldModelService,
    PlanFeaturesService,
    ExposureMapService,
    ExposureAnnotationService,
    ExpectedUtilityService,

    // 专利升级
    UnifiedDecisionFormulaService,
    CGUSSearchService,
    NoopCandidateScorerService,
    CANDIDATE_SCORER,
    MultiStepPlanningService,
    DifferentiableDecisionService,
    InformationGainService,
    MetaPolicyService,
    ExperienceRoutingPolicyService,
    LagrangianConstraintService,
    DecisionConfidenceService,
    LyapunovStabilityService,
    UnifiedLearningService,
    ComplexityAnalysisService,
    DSOStabilityMonitorService,
    RegretTrackerService,
    UCBVisitTrackerService,

    // Phase 3
    BeliefUpdateService,

    // Phase 3
    GuardianDebateService,
    WeightLearnerService,
    WeightPersistenceService,
    PolicyLearningService,
    OnlineLearningLoopService,
    PolicyNetworkService,
    DSOSnapshotAuditService,
    RlhfPersistenceService,

    // 监控指标
    DecisionMetricsService,

    // 门面服务
    DecisionOSFacadeService,

    // 中期
    TeamCollaborationService,
    TeamInviteService,
    RealtimeWorldStateService,
    ABTestingService,
    
    // 公理系统
    AxiomValidatorService,
    HierarchicalUtilityService,

    // P1: TDFPM → fatigueTrend（Decision Kernel 接入）
    TdfpmCalculatorService,
  ],
})
export class OptimizationModule {}
