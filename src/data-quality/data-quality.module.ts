// src/data-quality/data-quality.module.ts

import { Module, Global, forwardRef } from '@nestjs/common';
import { DataQualityFrameworkService } from './services/data-quality-framework.service';
import { SourceAnnotationService } from './services/source-annotation.service';
import { ConfidenceAnnotationService } from './services/confidence-annotation.service';
import { DataLineageService } from './services/data-lineage.service';
import { DataImprovementService } from './services/data-improvement.service';
import { GeographicDataValidatorService } from './services/geographic-data-validator.service'; // 🔴 P0 新增
import { DataQualityMonitoringService } from './services/data-quality-monitoring.service'; // 🔴 Phase 2 新增
import { DataQualityAlertService } from './services/data-quality-alert.service'; // 🔴 Phase 2 新增
import { GeographicDataQualityMonitoringService } from './services/geographic-data-quality-monitoring.service'; // 🔴 Phase 2 新增
import { GeographicDataAssessmentService } from './services/geographic-data-assessment.service'; // 🔴 Phase 2 新增
import { DataUpdateSchedulerService } from './services/data-update-scheduler.service'; // 🔴 Phase 3 新增
import { DataCollectionService } from './services/data-collection.service'; // 🔴 Phase 3 新增
import { DEMResolutionCacheService } from './services/dem-resolution-cache.service'; // 🔴 P0 新增：DEM分辨率缓存
import { PrismaModule } from '../prisma/prisma.module';
import { DecisionModule } from '../trips/decision/decision.module';

/**
 * 数据质量模块
 * 
 * 提供数据质量五维度框架：
 * - 完整性（Completeness）
 * - 准确性（Accuracy）
 * - 一致性（Consistency）
 * - 时效性（Timeliness）
 * - 可追溯性（Traceability）
 * 
 * 提供信息源标注功能：
 * - 为所有信息添加来源标注
 * - 计算置信度
 * - 确定验证等级
 * 
 * 提供置信度标注功能：
 * - 信息可信度标注（A/B/C/D等级）
 * - 不确定信息的标注
 * - 用户友好的置信度展示
 * 
 * 提供数据血统追踪功能：
 * - LineageTree结构
 * - 处理步骤记录
 * - 用户友好的解释生成
 * 
 * 提供数据持续改进功能：
 * - 学习循环
 * - 改进指标测量
 * - 改进验证机制
 */
@Global()
@Module({
  imports: [
    PrismaModule,
    forwardRef(() => DecisionModule),
    // ScheduleModule已在AppModule中全局导入，无需重复导入
  ],
  providers: [
    DataQualityFrameworkService,
    SourceAnnotationService,
    ConfidenceAnnotationService,
    DataLineageService,
    DataImprovementService,
    GeographicDataValidatorService, // 🔴 P0 新增
    DataQualityMonitoringService, // 🔴 Phase 2 新增
    DataQualityAlertService, // 🔴 Phase 2 新增
    GeographicDataQualityMonitoringService, // 🔴 Phase 2 新增
    GeographicDataAssessmentService, // 🔴 Phase 2 新增
    DataUpdateSchedulerService, // 🔴 Phase 3 新增
    DataCollectionService, // 🔴 Phase 3 新增
    DEMResolutionCacheService, // 🔴 P0 新增：DEM分辨率缓存
  ],
  exports: [
    DataQualityFrameworkService,
    SourceAnnotationService,
    ConfidenceAnnotationService,
    DataLineageService,
    DataImprovementService,
    GeographicDataValidatorService, // 🔴 P0 新增
    DataQualityMonitoringService, // 🔴 Phase 2 新增
    DataQualityAlertService, // 🔴 Phase 2 新增
    GeographicDataQualityMonitoringService, // 🔴 Phase 2 新增
    GeographicDataAssessmentService, // 🔴 Phase 2 新增
    DataUpdateSchedulerService, // 🔴 Phase 3 新增
    DataCollectionService, // 🔴 Phase 3 新增
    DEMResolutionCacheService, // 🔴 P0 新增：DEM分辨率缓存
  ],
})
export class DataQualityModule {}
