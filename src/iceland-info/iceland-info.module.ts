// src/iceland-info/iceland-info.module.ts

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { IcelandInfoController } from './iceland-info.controller';
import { VedurService } from './services/vedur.service';
import { SafetravelService } from './services/safetravel.service';
import { RoadService } from './services/road.service';
import { RagModule } from '../rag/rag.module';
import { DataContractsModule } from '../data-contracts/data-contracts.module';

@Module({
  imports: [
    ConfigModule,
    RagModule, // 导入 RagModule 以使用 HybridCacheService
    DataContractsModule, // 导入 DataContractsModule 以使用 DataSourceRouterService 和 IcelandComprehensiveService
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
