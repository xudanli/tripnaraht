// src/vision/vision.module.ts

import { Module } from '@nestjs/common';
import { VisionController } from './vision.controller';
import { VisionService } from './vision.service';
import { MockOcrProvider } from '../providers/ocr/mock-ocr.provider';
import { MockPoiProvider } from '../providers/poi/mock-poi.provider';

@Module({
  controllers: [VisionController],
  providers: [
    VisionService,
    MockOcrProvider,
    MockPoiProvider,
  ],
  exports: [VisionService],
})
export class VisionModule {}
