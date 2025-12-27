// src/trips/decision/tot/tot-evaluator.module.ts

/**
 * ToT 评分器模块
 */

import { Module } from '@nestjs/common';
import { ToTEvaluatorService } from './tot-evaluator.service';
import { BeamSearchService } from './beam-search.service';

@Module({
  providers: [ToTEvaluatorService, BeamSearchService],
  exports: [ToTEvaluatorService, BeamSearchService],
})
export class ToTEvaluatorModule {}

