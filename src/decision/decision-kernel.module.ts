/**
 * Decision Kernel Module
 *
 * Phase 2.1: Decision Kernel 中心化架构
 * 提供: DecisionKernelService
 *
 * 使用方式: Planning Conductor 注入此 Module，步骤只调 Kernel
 */

import { Module, Global, forwardRef } from '@nestjs/common';
import { DsoFeedbackPersistenceModule } from '../trips/decision/dso-feedback-persistence.module';
import { ReplanModule } from '../trips/decision/replan.module';
import { DecisionKernelService } from './kernel/decision-kernel.service';
import { HarnessShadowMetricsCollector } from './kernel/harness-shadow-metrics.collector';
import { StateManagerService } from './kernel/state-manager.service';
import { ConstraintEngineAdapterService } from './kernel/constraint-engine-adapter.service';
import { OptimizationEngineAdapterService } from './kernel/optimization-engine-adapter.service';
import { ContextEngineAdapterService } from './kernel/context-engine-adapter.service';
import { FeedbackEngineAdapterService } from './kernel/feedback-engine-adapter.service';
import { ParallelDecisionKernelService } from './kernel/parallel-decision-kernel.service';
import { ContextEngineModule } from '../agent/context-engine/context-engine.module';
import { DecisionModule } from '../trips/decision/decision.module';
import { OptimizationModule } from '../trips/decision/optimization/optimization.module';
import { AgentFeedbackModule } from '../agent/feedback/agent-feedback.module';
import { AgentPhaseExecutorModule } from '../agent/execution/agent-phase-executor.module';
import { HarnessModule } from '../harness/harness.module';
import { RagModule } from '../rag/rag.module';
import { InterventionEngine } from './actuator/intervention-engine';

@Global()
@Module({
  imports: [
    HarnessModule,
    forwardRef(() => RagModule),
    ContextEngineModule,
    forwardRef(() => DecisionModule), // P1: ConstraintEngineAdapter 可选调用 ConstraintEngineService.isFeasible
    forwardRef(() => OptimizationModule), // Scheme A: Monte Carlo 集成，ExpectedUtilityService
    forwardRef(() => AgentFeedbackModule), // Phase C: 反馈学习模块，forwardRef 避免与 AgentFeedbackModule->DecisionKernelModule 循环
    forwardRef(() => AgentPhaseExecutorModule), // Phase 2: IResearchExecutor 等 Phase Executors
    forwardRef(() => DsoFeedbackPersistenceModule), // 专利 6.1.5: 用户反馈通过 STATE_UPDATE 写入 DSO
    forwardRef(() => ReplanModule), // 专利实施例 2: 环境变化触发 RESEARCH→PLAN_GEN→VERIFY
  ],
  providers: [
    HarnessShadowMetricsCollector,
    StateManagerService,
    ConstraintEngineAdapterService,
    OptimizationEngineAdapterService,
    ContextEngineAdapterService,
    FeedbackEngineAdapterService,
    DecisionKernelService,
    ParallelDecisionKernelService,
    InterventionEngine,
  ],
  exports: [
    DecisionKernelService,
    HarnessShadowMetricsCollector,
    StateManagerService,
    FeedbackEngineAdapterService,
    OptimizationEngineAdapterService, // PolicyLearningService 等需要
    ParallelDecisionKernelService,
    InterventionEngine,
  ],
})
export class DecisionKernelModule {}
