import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SkillRegistryService } from './services/skill-registry.service';
import { TrajectoryStoreService } from './services/trajectory-store.service';
import { SkillEvolverLlmHelper } from './services/skill-evolver-llm.helper';
import { StrategyExplorerService } from './services/strategy-explorer.service';
import { SkillExecutorService } from './services/skill-executor.service';
import { SkillEvolverEvaluatorService } from './services/skill-evolver-evaluator.service';
import { ContrastiveAnalyzerService } from './services/contrastive-analyzer.service';
import { SkillEditorService } from './services/skill-editor.service';
import { IndependentAuditorService } from './services/independent-auditor.service';
import { MetaSkillEngineService } from './services/meta-skill-engine.service';
import { FixtureCaseEvaluatorService } from './services/fixture-case-evaluator.service';
import { SkillEvolverRegressionGateService } from './services/skill-evolver-regression-gate.service';
import { AgentSkillsInteropService } from './services/agent-skills-interop.service';
import { SkillEvolverBatchComparatorService } from './services/skill-evolver-batch-comparator.service';
import { DecisionReplayTrajectoryService } from './services/decision-replay-trajectory.service';

/** 核心服务（无 LlmModule），供 CLI 与完整模块复用 */
@Module({
  imports: [ConfigModule],
  providers: [
    SkillRegistryService,
    TrajectoryStoreService,
    SkillEvolverLlmHelper,
    StrategyExplorerService,
    SkillExecutorService,
    SkillEvolverEvaluatorService,
    ContrastiveAnalyzerService,
    SkillEditorService,
    IndependentAuditorService,
    MetaSkillEngineService,
    FixtureCaseEvaluatorService,
    DecisionReplayTrajectoryService,
    SkillEvolverRegressionGateService,
    SkillEvolverBatchComparatorService,
    AgentSkillsInteropService,
  ],
  exports: [
    SkillRegistryService,
    TrajectoryStoreService,
    MetaSkillEngineService,
    SkillEvolverLlmHelper,
    AgentSkillsInteropService,
  ],
})
export class SkillEvolverCoreModule {}
