// src/vision/vision.module.ts

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { VisionController } from './vision.controller';
import { VisionService } from './vision.service';
import { ProvidersModule } from '../providers/providers.module';

@Module({
  imports: [ConfigModule, ProvidersModule],
  controllers: [VisionController],
  providers: [VisionService],
  exports: [VisionService],
})
export class VisionModule {}
