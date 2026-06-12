import { Injectable } from '@nestjs/common';
import type { DecisionState } from '../../../decision/kernel/decision-state.types';
import type { NarrateExecutorContext } from '../../../decision/kernel/interfaces/phase-executor.interface';
import type { OrchestratorState } from '../../interfaces/trip-plan.interface';
import {
  buildEmotionalContext,
  extractEmotionNarratorBuildInputs,
} from '../emotion-narrator-orchestrator.util';
import type { EmotionNarratorBuildInputs, EmotionalContext } from '../types/emotional-context.type';

/**
 * P0 EmotionNarratorOrchestrator — NARRATE 前只读 Signal Weaver（Data Projector）。
 * 不 mutate 业务 SSOT；输出供 NarrateExecutor / NarratorAgent / DPO 回放消费。
 */
@Injectable()
export class EmotionNarratorOrchestrator {
  build(inputs: EmotionNarratorBuildInputs): EmotionalContext {
    return buildEmotionalContext(inputs);
  }

  buildFromNarrateContext(params: {
    dso: DecisionState;
    ctx: NarrateExecutorContext;
    state: OrchestratorState;
  }): EmotionalContext {
    return buildEmotionalContext(extractEmotionNarratorBuildInputs(params));
  }
}
