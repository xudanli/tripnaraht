// src/data-pipeline/data-pipeline.module.ts

import { Module, Global } from '@nestjs/common';
import { DataQualityModule } from '../data-quality/data-quality.module';
import { DataPrivacyModule } from '../data-privacy/data-privacy.module';
import { DataPipelineService } from './services/data-pipeline.service';
import { DataCleaningService } from './services/data-cleaning.service';
import { DataStandardizationService } from './services/data-standardization.service';

/**
 * 数据管道模块
 * 
 * 提供完整的数据管道框架：
 * - 数据采集管道
 * - 数据处理管道
 * - 数据应用管道
 */
@Global()
@Module({
  imports: [DataQualityModule, DataPrivacyModule],
  providers: [
    DataPipelineService,
    DataCleaningService,
    DataStandardizationService,
  ],
  exports: [
    DataPipelineService,
    DataCleaningService,
    DataStandardizationService,
  ],
})
export class DataPipelineModule {}
