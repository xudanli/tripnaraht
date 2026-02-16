/**
 * Phase 2 数据飞轮模块
 *
 * 四层结构：Decision Log → Behavior Log → Outcome Capture → Parameter Learning
 * 参考: docs/PHASE2_DATA_FLYWHEEL_DESIGN.md
 */

import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../prisma/prisma.module';
import { FlywheelDecisionLogService } from './flywheel-decision-log.service';
import { FlywheelBehaviorLogService } from './flywheel-behavior-log.service';
import { FlywheelOutcomeService } from './flywheel-outcome.service';
import { FlywheelParameterService } from './flywheel-parameter.service';
import { FlywheelPipelineService } from './flywheel-pipeline.service';
import { FlywheelAdminController } from './flywheel-admin.controller';
import { OptimizationModule } from '../optimization/optimization.module';

@Module({
  imports: [PrismaModule, OptimizationModule],
  controllers: [FlywheelAdminController],
  providers: [
    FlywheelDecisionLogService,
    FlywheelBehaviorLogService,
    FlywheelOutcomeService,
    FlywheelParameterService,
    FlywheelPipelineService,
  ],
  exports: [
    FlywheelDecisionLogService,
    FlywheelBehaviorLogService,
    FlywheelOutcomeService,
    FlywheelParameterService,
    FlywheelPipelineService,
  ],
})
export class FlywheelModule {}
