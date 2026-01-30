// src/iceland-info/iceland-info.module.ts

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { IcelandInfoController } from './iceland-info.controller';
import { VedurService } from './services/vedur.service';
import { SafetravelService } from './services/safetravel.service';
import { RoadService } from './services/road.service';
import { RagModule } from '../rag/rag.module';

@Module({
  imports: [
    ConfigModule,
    RagModule, // 导入 RagModule 以使用 HybridCacheService
  ],
  controllers: [IcelandInfoController],
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
