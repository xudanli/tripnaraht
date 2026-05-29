import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../prisma/prisma.module';

// Services
import { FineTuneService } from './services/fine-tune.service';
import { VllmClientService } from './services/vllm-client.service';
import { LlmJudgeClientService } from './services/llm-judge-client.service';

// 现有的训练相关服务
import { TrajectoryCollectionService } from './services/trajectory-collection.service';
import { DecisionTrajectoryInterlocutorService } from './services/decision-trajectory-interlocutor.service';
import { TrajectoryValidatorService } from './services/trajectory-validator.service';
import { RewardSignalExtractorService } from './services/reward-signal-extractor.service';
import { TrainingDataPreparationService } from './services/training-data-preparation.service';
import { TrainingPipelineService } from './services/training-pipeline.service';
import { ModelRegistryService } from './services/model-registry.service';
import { MLflowClientService } from './services/mlflow-client.service';
import { DatasetVersionManagerService } from './services/dataset-version-manager.service';
import { TrainingBatchProcessorService } from './services/training-batch-processor.service';
import { TrainingQualityAnalyzerService } from './services/training-quality-analyzer.service';
import { ModelCollapseMonitorService } from './services/model-collapse-monitor.service';
import { IterativeDeploymentWorkflowService } from './services/iterative-deployment-workflow.service';
import { ModelDeploymentService } from './services/model-deployment.service';
import { EvalSuiteService } from './services/eval-suite.service';
import { RegressionGateService } from './services/regression-gate.service';
import { ReplayComparatorService } from './services/replay-comparator.service';
import { TrajectoryETLService } from './services/trajectory-etl.service';
import { DecisionTrajectoryTrainingSyncService } from './services/decision-trajectory-training-sync.service';
import { ShadowDeploymentRegistryService } from './services/shadow-deployment-registry.service';
import { HarnessShadowGraderService } from './services/harness-shadow-grader.service';
import { ShadowDeploymentWorkflowService } from './services/shadow-deployment-workflow.service';
import { DataQualityCheckerService } from './services/data-quality-checker.service';
import { PIIAnonymizerService } from './services/pii-anonymizer.service';
import { RLIntegrationService } from './services/rl-integration.service';
import { ConstraintRuleManagerService } from './services/constraint-rule-manager.service';
import { ConstraintsEngineService } from './services/constraints-engine.service';

// Controllers
import { TrainingController } from './controllers/training.controller';
import { ShadowPromotionCronService } from './crons/shadow-promotion.cron';
import { SkillEvolverModule } from './skill-evolver/skill-evolver.module';

/**
 * TripNARA 训练模块
 * 
 * 提供：
 * - LoRA 微调训练能力
 * - vLLM 推理服务集成
 * - 训练数据收集与准备
 * - 模型版本管理
 * - 迭代部署工作流
 */
@Module({
  imports: [
    HttpModule.register({
      timeout: 60000,
      maxRedirects: 5,
    }),
    ConfigModule,
    PrismaModule,
    SkillEvolverModule,
  ],
  controllers: [
    TrainingController,
  ],
  providers: [
    // 新增服务
    FineTuneService,
    VllmClientService,
    LlmJudgeClientService,
    
    // 现有服务
    TrajectoryCollectionService,
    DecisionTrajectoryInterlocutorService,
    TrajectoryValidatorService,
    RewardSignalExtractorService,
    TrainingDataPreparationService,
    TrainingPipelineService,
    MLflowClientService,
    ModelRegistryService,
    DatasetVersionManagerService,
    TrainingBatchProcessorService,
    TrainingQualityAnalyzerService,
    ModelCollapseMonitorService,
    DataQualityCheckerService,
    PIIAnonymizerService,
    EvalSuiteService,
    RegressionGateService,
    ReplayComparatorService,
    TrajectoryETLService,
    DecisionTrajectoryTrainingSyncService,
    ShadowDeploymentRegistryService,
    HarnessShadowGraderService,
    ShadowDeploymentWorkflowService,
    ShadowPromotionCronService,
    IterativeDeploymentWorkflowService,
    ModelDeploymentService,
    /** 编排层可选注入：`preDecision` 与对外 `verdict` 合并（仅依赖 ConfigService，其余 Optional） */
    RLIntegrationService,
    ConstraintRuleManagerService,
    ConstraintsEngineService,
  ],
  exports: [
    SkillEvolverModule,
    FineTuneService,
    VllmClientService,
    LlmJudgeClientService,
    TrajectoryCollectionService,
    DecisionTrajectoryInterlocutorService,
    TrajectoryValidatorService,
    RewardSignalExtractorService,
    TrainingDataPreparationService,
    TrainingPipelineService,
    TrajectoryETLService,
    DecisionTrajectoryTrainingSyncService,
    ShadowDeploymentWorkflowService,
    HarnessShadowGraderService,
    MLflowClientService,
    ModelRegistryService,
    IterativeDeploymentWorkflowService,
    ModelDeploymentService,
    RLIntegrationService,
    ConstraintRuleManagerService,
    ConstraintsEngineService,
  ],
})
export class TrainingModule {}
