// src/weather/weather.module.ts

import { Module } from '@nestjs/common';
import { WeatherController } from './weather.controller';
import { DataContractsModule } from '../data-contracts/data-contracts.module';
import { RagModule } from '../rag/rag.module';

@Module({
  imports: [
    DataContractsModule,
    RagModule, // 导入 RagModule 以使用 HybridCacheService
  ],
  controllers: [WeatherController],
})
export class WeatherModule {}
