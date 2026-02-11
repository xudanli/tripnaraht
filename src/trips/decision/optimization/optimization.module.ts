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

// Phase 3: 多智能体 + 学习
import { GuardianDebateService } from './learning/guardian-debate.service';
import { WeightLearnerService } from './learning/weight-learner.service';
import { WeightPersistenceService } from './learning/weight-persistence.service';

// 中期：多用户协同
import { TeamCollaborationService } from './collaboration/team-collaboration.service';

// 中期：实时状态更新
import { RealtimeWorldStateService } from './realtime/realtime-world-state.service';

// 中期：A/B 测试
import { ABTestingService } from './experiments/ab-testing.service';

// 公理系统
import { AxiomValidatorService } from './axioms/axiom-validator.service';
import { HierarchicalUtilityService } from './axioms/hierarchical-utility.service';

// 旧版控制器（保留兼容）
import { OptimizationController } from './controllers/optimization.controller';
import { TeamCollaborationController } from './controllers/team-collaboration.controller';
import { RealtimeStateController } from './controllers/realtime-state.controller';
import { ABTestingController } from './controllers/ab-testing.controller';
import { AxiomValidationController } from './controllers/axiom-validation.controller';

// 新版：用户端控制器
import { OptimizationUserController } from './controllers/user/optimization-user.controller';
import { TeamUserController } from './controllers/user/team-user.controller';
import { RealtimeUserController } from './controllers/user/realtime-user.controller';

// 新版：管理端控制器
import { OptimizationAdminController } from './controllers/admin/optimization-admin.controller';
import { RealtimeAdminController } from './controllers/admin/realtime-admin.controller';
import { ABTestingAdminController } from './controllers/admin/ab-testing-admin.controller';
import { AxiomAdminController } from './controllers/admin/axiom-admin.controller';

// 依赖
import { FatigueCalculatorService } from '../services/fatigue-calculator.service';

@Module({
  imports: [],
  controllers: [
    // 旧版（保留兼容，/api/v2/...）
    OptimizationController,
    TeamCollaborationController,
    RealtimeStateController,
    ABTestingController,
    AxiomValidationController,
    
    // 新版：用户端（/api/v2/user/...）
    OptimizationUserController,
    TeamUserController,
    RealtimeUserController,
    
    // 新版：管理端（/api/v2/admin/...）
    OptimizationAdminController,
    RealtimeAdminController,
    ABTestingAdminController,
    AxiomAdminController,
  ],
  providers: [
    // Phase 1
    ObjectiveFunctionService,
    AbuOptimizerService,
    DreOptimizerService,
    StrategyOrchestratorV2Service,
    
    // Phase 2
    ProbabilisticWorldModelService,
    ExpectedUtilityService,
    
    // Phase 3
    GuardianDebateService,
    WeightLearnerService,
    WeightPersistenceService,
    
    // 中期：多用户协同
    TeamCollaborationService,
    
    // 中期：实时状态更新
    RealtimeWorldStateService,
    
    // 中期：A/B 测试
    ABTestingService,
    
    // 公理系统
    AxiomValidatorService,
    HierarchicalUtilityService,
    
    // 依赖（如果 DecisionModule 未提供）
    FatigueCalculatorService,
  ],
  exports: [
    // Phase 1
    ObjectiveFunctionService,
    AbuOptimizerService,
    DreOptimizerService,
    StrategyOrchestratorV2Service,
    
    // Phase 2
    ProbabilisticWorldModelService,
    ExpectedUtilityService,
    
    // Phase 3
    GuardianDebateService,
    WeightLearnerService,
    WeightPersistenceService,
    
    // 中期
    TeamCollaborationService,
    RealtimeWorldStateService,
    ABTestingService,
    
    // 公理系统
    AxiomValidatorService,
    HierarchicalUtilityService,
  ],
})
export class OptimizationModule {}
