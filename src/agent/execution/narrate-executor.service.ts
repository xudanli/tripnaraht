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
      const escalation = dso.verification?.escalationPlan;
      const stateForNarrate = {
        ...state,
        ...(escalation ? { kernel_escalation_plan: escalation } : {}),
      } as OrchestratorState;

      let narration = await this.narratorAgent.narrate(
        state.itinerary,
        state.gate_result,
        state.decision_log ?? [],
        stateForNarrate,
      );

      const envConstraintIssues = (dso.verification?.issues ?? []).filter(
        (i) => i.source === 'ENVIRONMENTAL_CONSTRAINTS',
      );
      if (envConstraintIssues.length > 0) {
        const tips = [...(narration.tips ?? [])];
        const label = '[内核提示·环境/可视约束]';
        const summary = envConstraintIssues
          .slice(0, 2)
          .map((i) => i.message)
          .join(' ');
        const line = `${label} 与路况无关的硬性约束需单独关注：${summary}`.slice(0, 500);
        if (!tips.some((t) => t.startsWith(label))) {
          tips.unshift(line);
        }
        narration = { ...narration, tips };
      }

      if (escalation?.userClarificationSnippet?.trim()) {
        const escPrefix =
          escalation.constraint === 'SUNSET_VISIBILITY' ? '[内核事实·日落/观景窗口]' : '[内核事实·须优先说明]';
        const core = `${escPrefix} ${escalation.userClarificationSnippet.trim()}`;
        const tips = [...(narration.tips ?? [])];
        if (!tips.some((t) => t.includes(escalation.userClarificationSnippet!.slice(0, 24)))) {
          tips.unshift(core);
        }
        const warnings = [...(narration.warnings ?? [])];
        if (!warnings.some((w) => w.includes(escalation.userClarificationSnippet!.slice(0, 24)))) {
          warnings.unshift(core);
        }
        narration = { ...narration, tips, warnings };
      }

      const hint = dso.poiPlanning?.narrationHint;
      if (hint?.trim()) {
        const tips = [...(narration.tips ?? [])];
        if (!tips.some((t) => t.includes(hint.slice(0, 20)))) {
          tips.unshift(hint);
        }
        return { narration: { ...narration, tips } };
      }
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
