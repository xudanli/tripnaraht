/**
 * Decision Kernel Module
 *
 * Phase 2.1: Decision Kernel 中心化架构
 * 提供: DecisionKernelService
 *
 * 使用方式: Planning Conductor 注入此 Module，步骤只调 Kernel
 */

import { Module, Global, forwardRef } from '@nestjs/common';
import { DecisionKernelService } from './kernel/decision-kernel.service';
import { StateManagerService } from './kernel/state-manager.service';
import { ConstraintEngineAdapterService } from './kernel/constraint-engine-adapter.service';
import { OptimizationEngineAdapterService } from './kernel/optimization-engine-adapter.service';
import { ContextEngineAdapterService } from './kernel/context-engine-adapter.service';
import { FeedbackEngineAdapterService } from './kernel/feedback-engine-adapter.service';
import { ContextEngineModule } from '../agent/context-engine/context-engine.module';
import { DecisionModule } from '../trips/decision/decision.module';
import { OptimizationModule } from '../trips/decision/optimization/optimization.module';
import { AgentFeedbackModule } from '../agent/feedback/agent-feedback.module';
import { AgentPhaseExecutorModule } from '../agent/execution/agent-phase-executor.module';

@Global()
@Module({
  imports: [
    ContextEngineModule,
    forwardRef(() => DecisionModule), // P1: ConstraintEngineAdapter 可选调用 ConstraintEngineService.isFeasible
    forwardRef(() => OptimizationModule), // Scheme A: Monte Carlo 集成，ExpectedUtilityService
    forwardRef(() => AgentFeedbackModule), // Phase C: 反馈学习模块，forwardRef 避免与 AgentFeedbackModule->DecisionKernelModule 循环
    forwardRef(() => AgentPhaseExecutorModule), // Phase 2: IResearchExecutor 等 Phase Executors
  ],
  providers: [
    StateManagerService,
    ConstraintEngineAdapterService,
    OptimizationEngineAdapterService,
    ContextEngineAdapterService,
    FeedbackEngineAdapterService,
    DecisionKernelService,
  ],
  exports: [
    DecisionKernelService,
    StateManagerService,
    FeedbackEngineAdapterService,
    OptimizationEngineAdapterService, // PolicyLearningService 等需要
  ],
})
export class DecisionKernelModule {}
