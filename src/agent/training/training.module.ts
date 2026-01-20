// src/agent/training/training.module.ts

import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { TrajectoryValidatorService } from './services/trajectory-validator.service';
import { TrajectoryCollectionService } from './services/trajectory-collection.service';
import { RewardSignalExtractorService } from './services/reward-signal-extractor.service';
import { TrainingDataPreparationService } from './services/training-data-preparation.service';
import { TrainingMetricsService } from './services/training-metrics.service';
import { TrainingBatchProcessorService } from './services/training-batch-processor.service';
import { ModelCollapseMonitorService } from './services/model-collapse-monitor.service';
import { TrainingQualityAnalyzerService } from './services/training-quality-analyzer.service';
import { TrainingController } from './training.controller';

/**
 * TrainingModule
 * 
 * Iterative Deployment 训练模块
 */
@Module({
  imports: [PrismaModule],
  controllers: [TrainingController],
  providers: [
    TrajectoryValidatorService,
    TrajectoryCollectionService,
    RewardSignalExtractorService,
    TrainingDataPreparationService,
    TrainingMetricsService,
    TrainingBatchProcessorService,
    ModelCollapseMonitorService,
    TrainingQualityAnalyzerService,
  ],
  exports: [
    TrajectoryValidatorService,
    TrajectoryCollectionService,
    RewardSignalExtractorService,
    TrainingDataPreparationService,
    TrainingMetricsService,
    TrainingBatchProcessorService,
    ModelCollapseMonitorService,
    TrainingQualityAnalyzerService,
  ],
})
export class TrainingModule {}
