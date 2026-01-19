// src/agent/reasoning/reasoning.module.ts

import { Module } from '@nestjs/common';
import { GraphReasoningService } from './services/graph-reasoning.service';
import { CausalModelingService } from './services/causal-modeling.service';

/**
 * 推理模块
 * 
 * 提供图推理和因果建模功能：
 * - 图推理系统（结构层）
 * - 因果建模（推理层）
 */
@Module({
  providers: [
    GraphReasoningService,
    CausalModelingService,
  ],
  exports: [
    GraphReasoningService,
    CausalModelingService,
  ],
})
export class ReasoningModule {}
