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
import { PrismaModule } from '../prisma/prisma.module';
import { DecisionModule } from '../trips/decision/decision.module';
import { OptimizationModule } from '../trips/decision/optimization/optimization.module';
import { AgentFeedbackModule } from '../agent/feedback/agent-feedback.module';
import { AgentPhaseExecutorModule } from '../agent/execution/agent-phase-executor.module';
import { HarnessModule } from '../harness/harness.module';
import { OrchestratorContextLintService } from '../agent/orchestration/context/orchestrator-context-lint.service';
import { RagModule } from '../rag/rag.module';
import { InterventionEngine } from './actuator/intervention-engine';
import { DemModule } from '../trips/dem/dem.module';
import { SharedMemoryModule } from '../agent/memory/shared-memory.module';
import { ObservationHarnessService, OBSERVATION_TOOL_EXECUTOR } from './kernel/observation/observation-harness.service';
import { LlmModule } from '../llm/llm.module';
import { ConfigService } from '@nestjs/config';
import { LlmService } from '../llm/services/llm.service';
import { TavilyObservationExecutor } from './kernel/observation/tavily-observation.executor';
import { DefaultObservationToolExecutor } from './kernel/observation/observation-tool-executors';

@Global()
@Module({
  imports: [
    DemModule,
    forwardRef(() => SharedMemoryModule),
    HarnessModule,
    forwardRef(() => RagModule),
    ContextEngineModule,
    PrismaModule,
    forwardRef(() => DecisionModule), // P1: ConstraintEngineAdapter 可选调用 ConstraintEngineService.isFeasible
    forwardRef(() => OptimizationModule), // Scheme A: Monte Carlo 集成，ExpectedUtilityService
    forwardRef(() => AgentFeedbackModule), // Phase C: 反馈学习模块，forwardRef 避免与 AgentFeedbackModule->DecisionKernelModule 循环
    forwardRef(() => AgentPhaseExecutorModule), // Phase 2: IResearchExecutor 等 Phase Executors
    forwardRef(() => DsoFeedbackPersistenceModule), // 专利 6.1.5: 用户反馈通过 STATE_UPDATE 写入 DSO
    forwardRef(() => ReplanModule), // 专利实施例 2: 环境变化触发 RESEARCH→PLAN_GEN→VERIFY
    forwardRef(() => LlmModule), // Tavily 观测执行器证据打分（gpt-4o-mini / 默认 LLM）
  ],
  providers: [
    OrchestratorContextLintService,
    HarnessShadowMetricsCollector,
    StateManagerService,
    ConstraintEngineAdapterService,
    OptimizationEngineAdapterService,
    ContextEngineAdapterService,
    FeedbackEngineAdapterService,
    DecisionKernelService,
    ParallelDecisionKernelService,
    InterventionEngine,
    ObservationHarnessService,
    {
      provide: OBSERVATION_TOOL_EXECUTOR,
      useFactory: (config: ConfigService, llm: LlmService) => {
        const key = (config.get<string>('TAVILY_API_KEY') || process.env.TAVILY_API_KEY || '').trim();
        const enabled =
          config.get<string>('OBSERVATION_USE_TAVILY') === '1' || process.env.OBSERVATION_USE_TAVILY === '1';
        if (enabled && key) {
          return new TavilyObservationExecutor(config, llm);
        }
        return new DefaultObservationToolExecutor();
      },
      inject: [ConfigService, LlmService],
    },
  ],
  exports: [
    DecisionKernelService,
    HarnessShadowMetricsCollector,
    StateManagerService,
    FeedbackEngineAdapterService,
    OptimizationEngineAdapterService, // PolicyLearningService 等需要
    ParallelDecisionKernelService,
    InterventionEngine,
    ObservationHarnessService,
  ],
})
export class DecisionKernelModule {}
