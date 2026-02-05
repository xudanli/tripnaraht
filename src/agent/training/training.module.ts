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
import { EvalSuiteService } from './services/eval-suite.service';
import { RegressionGateService } from './services/regression-gate.service';
import { ReplayComparatorService } from './services/replay-comparator.service';
import { TrajectoryETLService } from './services/trajectory-etl.service';
import { DataQualityCheckerService } from './services/data-quality-checker.service';
import { PIIAnonymizerService } from './services/pii-anonymizer.service';

// Controllers
import { TrainingController } from './controllers/training.controller';

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
    IterativeDeploymentWorkflowService,
  ],
  exports: [
    FineTuneService,
    VllmClientService,
    LlmJudgeClientService,
    TrajectoryCollectionService,
    TrajectoryValidatorService,
    RewardSignalExtractorService,
    TrainingDataPreparationService,
    TrainingPipelineService,
    MLflowClientService,
    ModelRegistryService,
    IterativeDeploymentWorkflowService,
  ],
})
export class TrainingModule {}
