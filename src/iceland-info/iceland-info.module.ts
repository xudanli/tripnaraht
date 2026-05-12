// src/iceland-info/iceland-info.module.ts

import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { IcelandInfoController } from './iceland-info.controller';
import { VedurService } from './services/vedur.service';
import { SafetravelService } from './services/safetravel.service';
import { RoadService } from './services/road.service';
import { DataContractsModule } from '../data-contracts/data-contracts.module';
import { LlmModule } from '../llm/llm.module';

@Module({
  imports: [
    ConfigModule,
    // 勿在此导入 RagModule：SkillsModule → IcelandInfoModule → RagModule → SkillsModule 会形成环，
    // 导致 Nest 解析时 RagModule 为 undefined。本模块 Provider 未使用 Rag 导出服务；若需 HybridCacheService，请抽到共享模块或 forwardRef。
    DataContractsModule, // 导入 DataContractsModule 以使用 DataSourceRouterService 和 IcelandComprehensiveService
    forwardRef(() => LlmModule), // SafeTravel RSS 第二层 LLM 精炼（可选注入 LlmService）
  ],
  controllers: [IcelandInfoController], // 重新添加控制器，使用新的数据契约服务
  providers: [
    VedurService,
    SafetravelService,
    RoadService,
  ],
  exports: [
    VedurService,
    SafetravelService,
    RoadService,
  ],
})
export class IcelandInfoModule {}
