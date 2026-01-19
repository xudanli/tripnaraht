// src/data-modeling/data-modeling.module.ts

import { Module, Global } from '@nestjs/common';
import { DataQualityModule } from '../data-quality/data-quality.module';
import { UncertaintyModelingService } from './services/uncertainty-modeling.service';

/**
 * 数据建模模块
 * 
 * 提供不确定性建模功能：
 * - 概率分布模型
 * - 情景分析
 * - 不确定性呈现
 */
@Global()
@Module({
  imports: [DataQualityModule],
  providers: [UncertaintyModelingService],
  exports: [UncertaintyModelingService],
})
export class DataModelingModule {}
