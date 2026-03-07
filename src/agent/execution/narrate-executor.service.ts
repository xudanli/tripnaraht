/**
 * NarrateExecutorService
 *
 * P3 C: 实现 INarrateExecutor，执行 NARRATE 阶段
 * 封装 NarratorAgent.narrate，产出用户可读解释（不得改硬字段）
 *
 * 参考: docs/P3_CONDUCTOR_CONVERGENCE_PLAN.md
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import type { DecisionState } from '../../decision/kernel/decision-state.types';
import type {
  INarrateExecutor,
  NarrateExecutorContext,
  NarrationLike,
} from '../../decision/kernel/interfaces/phase-executor.interface';
import { ClaudeNarratorAgentService } from '../services/sub-agents/narrator-agent.service';
import type { OrchestratorState } from '../interfaces/trip-plan.interface';

@Injectable()
export class NarrateExecutorService implements INarrateExecutor {
  private readonly logger = new Logger(NarrateExecutorService.name);

  constructor(@Optional() private readonly narratorAgent?: ClaudeNarratorAgentService) {}

  async execute(
    dso: DecisionState,
    ctx: NarrateExecutorContext,
  ): Promise<{ narration: NarrationLike }> {
    const state = ctx.orchestratorState as OrchestratorState | undefined;
    if (!state?.itinerary || !state?.gate_result) {
      this.logger.warn('[NarrateExecutor] 缺少 itinerary 或 gate_result，返回空叙述');
      return {
        narration: {
          user_friendly_summary: '',
          day_by_day_narrative: [],
          highlights: [],
          tips: [],
        },
      };
    }

    if (!this.narratorAgent) {
      this.logger.warn('[NarrateExecutor] NarratorAgent 未注入，返回空叙述');
      return {
        narration: {
          user_friendly_summary: '',
          day_by_day_narrative: [],
          highlights: [],
          tips: [],
        },
      };
    }

    try {
      const narration = await this.narratorAgent.narrate(
        state.itinerary,
        state.gate_result,
        state.decision_log ?? [],
        state,
      );
      return { narration };
    } catch (e: unknown) {
      this.logger.warn(`[NarrateExecutor] NarratorAgent 失败: ${(e as Error)?.message}`);
      return {
        narration: {
          user_friendly_summary: '',
          day_by_day_narrative: [],
          highlights: [],
          tips: [],
        },
      };
    }
  }
}
