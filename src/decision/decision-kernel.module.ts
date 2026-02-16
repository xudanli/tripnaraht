/**
 * Decision Kernel Module
 *
 * Phase 2.1: Decision Kernel 中心化架构
 * 提供: DecisionKernelService
 *
 * 使用方式: Planning Conductor 注入此 Module，步骤只调 Kernel
 */

import { Module, Global } from '@nestjs/common';
import { DecisionKernelService } from './kernel/decision-kernel.service';
import { StateManagerService } from './kernel/state-manager.service';
import { ConstraintEngineAdapterService } from './kernel/constraint-engine-adapter.service';
import { OptimizationEngineAdapterService } from './kernel/optimization-engine-adapter.service';
import { ContextEngineAdapterService } from './kernel/context-engine-adapter.service';
import { ContextEngineModule } from '../agent/context-engine/context-engine.module';

@Global()
@Module({
  imports: [ContextEngineModule],
  providers: [
    StateManagerService,
    ConstraintEngineAdapterService,
    OptimizationEngineAdapterService,
    ContextEngineAdapterService,
    DecisionKernelService,
  ],
  exports: [DecisionKernelService, StateManagerService],
})
export class DecisionKernelModule {}
