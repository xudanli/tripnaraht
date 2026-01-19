// src/data-fusion/data-fusion.module.ts

import { Module } from '@nestjs/common';
import { DataConflictResolutionService } from './services/data-conflict-resolution.service';
import { FeatureQualityAssessmentService } from './services/feature-quality-assessment.service';
import { FusionResilienceService } from './services/fusion-resilience.service';
import { FusionResourceManagerService } from './services/fusion-resource-manager.service';
import { DataQualityModule } from '../data-quality/data-quality.module';

/**
 * 数据融合模块
 * 
 * 提供数据融合和冲突解决功能：
 * - 数据冲突检测和解决
 * - 可靠性加权融合
 * - 优先级选择
 * - 情景化选择
 * - 特征质量评估
 */
@Module({
  imports: [DataQualityModule],
  providers: [
    DataConflictResolutionService,
    FeatureQualityAssessmentService,
    FusionResilienceService,
    FusionResourceManagerService,
  ],
  exports: [
    DataConflictResolutionService,
    FeatureQualityAssessmentService,
    FusionResilienceService,
    FusionResourceManagerService,
  ],
})
export class DataFusionModule {}
