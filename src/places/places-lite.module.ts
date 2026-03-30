// src/places/places-lite.module.ts
/**
 * Places Lite Module
 * 
 * 轻量级版本，用于 MCP 模式
 * 只导出必要的服务，不包含 controllers 和可能有问题的 providers
 */

import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { HotelsModule } from '../hotels/hotels.module';
import { SvalbardPoiFeaturesService } from './services/svalbard-poi-features.service';
import { IcelandPoiFeaturesService } from './services/iceland-poi-features.service';

@Module({
  imports: [PrismaModule, HotelsModule],
  // MCP 模式下不包含 controllers
  controllers: [],
  providers: [
    // 只提供 POI Features 相关服务（DecisionModule 的 PoiFeaturesAdapterService 需要）
    SvalbardPoiFeaturesService,
    IcelandPoiFeaturesService,
  ],
  exports: [
    // 只导出必要的服务
    SvalbardPoiFeaturesService,
    IcelandPoiFeaturesService,
  ],
})
export class PlacesLiteModule {}

