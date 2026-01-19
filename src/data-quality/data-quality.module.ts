// src/data-quality/data-quality.module.ts

import { Module, Global, forwardRef } from '@nestjs/common';
import { DataQualityFrameworkService } from './services/data-quality-framework.service';
import { SourceAnnotationService } from './services/source-annotation.service';
import { ConfidenceAnnotationService } from './services/confidence-annotation.service';
import { DataLineageService } from './services/data-lineage.service';
import { DataImprovementService } from './services/data-improvement.service';
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
  imports: [PrismaModule, forwardRef(() => DecisionModule)],
  providers: [
    DataQualityFrameworkService,
    SourceAnnotationService,
    ConfidenceAnnotationService,
    DataLineageService,
    DataImprovementService,
  ],
  exports: [
    DataQualityFrameworkService,
    SourceAnnotationService,
    ConfidenceAnnotationService,
    DataLineageService,
    DataImprovementService,
  ],
})
export class DataQualityModule {}
