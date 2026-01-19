// src/data-architecture/data-architecture.module.ts

import { Module } from '@nestjs/common';
import { DataArchitectureService } from './services/data-architecture.service';
import { DataQualityModule } from '../data-quality/data-quality.module';
import { DataFusionModule } from '../data-fusion/data-fusion.module';

/**
 * 数据架构模块
 * 
 * 提供四层数据架构功能：
 * - 用户交互层（User Interaction Layer）
 * - 决策支持层（Decision Support Layer）
 * - 处理与融合层（Processing & Fusion Layer）
 * - 存储与采集层（Storage & Collection Layer）
 */
@Module({
  imports: [DataQualityModule, DataFusionModule],
  providers: [DataArchitectureService],
  exports: [DataArchitectureService],
})
export class DataArchitectureModule {}
