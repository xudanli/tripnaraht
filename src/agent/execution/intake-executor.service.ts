/**
 * IntakeExecutorService
 *
 * P3 B: 实现 IIntakeExecutor，执行 INTAKE 阶段
 * 封装 PlannerAgent.analyzeRequest + 缺口识别 + 澄清问题生成
 *
 * 参考: docs/P3_CONDUCTOR_CONVERGENCE_PLAN.md
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import type { DecisionState } from '../../decision/kernel/decision-state.types';
import type { IIntakeExecutor, IntakeExecutorContext } from '../../decision/kernel/interfaces/phase-executor.interface';
import { ClaudePlannerAgentService } from '../services/sub-agents/planner-agent.service';
import type { TripPlanRequest, OrchestratorState } from '../interfaces/trip-plan.interface';
import { IntakeCompilerService } from './intake-compiler.service';
import { SkillsRegistryService } from '../../skills/services/skills-registry.service';
import {
  identifyGapsFromRequest,
  generateClarificationQuestions,
  type IntakeGap,
} from '../utils/clarification-question-generator.util';
import { inferPersonaHintFromUserIntentAnchors } from '../utils/guardian-debate-user-intent-anchor.util';
import {
  applyMarathonIntakeSignalsToTripPlan,
  buildMarathonIntakeSignalsFromGaps,
} from '../utils/marathon-intake-signals.util';

@Injectable()
export class IntakeExecutorService implements IIntakeExecutor {
  private readonly logger = new Logger(IntakeExecutorService.name);

  constructor(
    @Optional() private readonly plannerAgent?: ClaudePlannerAgentService,
    @Optional() private readonly skillsRegistry?: SkillsRegistryService,
    private readonly intakeCompiler: IntakeCompilerService = new IntakeCompilerService(),
  ) {}

  async execute(
    dso: DecisionState,
    ctx: IntakeExecutorContext,
  ): Promise<{
    tripPlanRequest: IntakeExecutorContext['tripPlanRequest'];
    simulation?: { simulatedRepairTraces: import('../services/route-feasibility.types').SimulatedRepairTrace[] };
    gaps: Array<{
      type:
        | 'MISSING_DESTINATION'
        | 'MISSING_DATES'
        | 'MISSING_CONSTRAINTS'
        | 'MISSING_PREFERENCES'
        | 'SPEC_TYPE_ERROR'
        | 'INTENT_COMPILE_ERROR';
      severity: 'HARD' | 'SOFT';
      detail: string;
    }>;
    clarificationQuestions: Array<{
      id: string;
      question: string;
      type: string;
      required: boolean;
      options?: unknown[];
      placeholder?: string;
      hint?: string;
      validation?: unknown;
    }>;
    intent?: string;
    candidate_structure?: { suggested_days?: number; suggested_route?: string[]; key_pois?: string[] };
  }> {
    const tripPlanRequest = ctx.tripPlanRequest as TripPlanRequest;
    if (!tripPlanRequest) {
      this.logger.warn('[IntakeExecutor] 缺少 tripPlanRequest，返回空结果');
      return {
        tripPlanRequest: ctx.tripPlanRequest ?? {},
        gaps: [],
        clarificationQuestions: [],
      };
    }

    let gaps: IntakeGap[];
    let intent = 'PLAN_TRIP';
    let candidate_structure: { suggested_days?: number; suggested_route?: string[]; key_pois?: string[] } | undefined;

    if (this.plannerAgent && ctx.orchestratorState) {
      try {
        const analysisResult = await this.plannerAgent.analyzeRequest(
          tripPlanRequest,
          ctx.orchestratorState as import('../interfaces/trip-plan.interface').OrchestratorState,
        );
        gaps = analysisResult.gaps;
        intent = analysisResult.intent;
        candidate_structure = analysisResult.candidate_structure;
      } catch (e: unknown) {
        this.logger.warn(`[IntakeExecutor] PlannerAgent 失败: ${(e as Error)?.message}，降级到规则识别`);
        gaps = identifyGapsFromRequest(tripPlanRequest);
      }
    } else {
      gaps = identifyGapsFromRequest(tripPlanRequest);
    }

    // Intake compile: L4 schema/type + L3 lower-bound checks.
    const compiled = this.intakeCompiler.compile({
      tripPlanRequest,
      sessionRepairTraces: ((dso as any)?.systemState?.repairTraceHistory ?? []) as any,
    });

    const compileGaps = compiled.diagnostics.map((d) => d.gap).filter(Boolean) as IntakeGap[];
    if (compileGaps.length > 0) {
      gaps = [...compileGaps, ...gaps];
    }

    if (compiled.marathon_lower_bound_deferred && compiled.user_intent_anchors) {
      const signals = buildMarathonIntakeSignalsFromGaps(gaps, tripPlanRequest, ctx.orchestratorState
        ? (ctx.orchestratorState as { metadata?: { intake_user_message?: string } }).metadata
            ?.intake_user_message
        : undefined);
      if (signals) {
        Object.assign(
          tripPlanRequest,
          applyMarathonIntakeSignalsToTripPlan(
            tripPlanRequest,
            signals,
            (ctx.orchestratorState as { metadata?: { intake_user_message?: string } } | undefined)?.metadata
              ?.intake_user_message,
          ),
        );
      } else {
        const anchors = compiled.user_intent_anchors;
        tripPlanRequest.guardian_debate_trip_context = {
          ...(tripPlanRequest.guardian_debate_trip_context ?? {}),
          user_intent_anchors: anchors,
        };
        const persona = inferPersonaHintFromUserIntentAnchors(anchors);
        if (persona) {
          tripPlanRequest.persona_hint = { ...(tripPlanRequest.persona_hint ?? {}), ...persona };
        }
      }
      if (compiled.suggested_days_for_deferred_lower_bound) {
        candidate_structure = {
          ...candidate_structure,
          suggested_days: compiled.suggested_days_for_deferred_lower_bound,
        };
      }
      this.logger.log(
        `[IntakeExecutor] 极昼马拉松物理下界豁免：下放至三人格门禁 (suggested_days=${compiled.suggested_days_for_deferred_lower_bound ?? 'n/a'})`,
      );
    }

    const hardGaps2 = gaps.filter((g) => g.severity === 'HARD');
    const clarificationQuestions = generateClarificationQuestions(hardGaps2, tripPlanRequest, {
      locale: ctx.locale,
    });

    const tripId = String(tripPlanRequest.trip_id ?? (tripPlanRequest as { tripId?: string }).tripId ?? '').trim();
    if (tripId && this.skillsRegistry) {
      try {
        const loadSkill = this.skillsRegistry.getSkill('trip.load');
        if (loadSkill) {
          const loaded = await loadSkill.execute({ tripId });
          tripPlanRequest.trip_load = {
            tripId: loaded.tripId,
            itemCount: loaded.itemCount,
            degraded: loaded.degraded,
            degradedReason: loaded.degradedReason,
            loadedAt: new Date().toISOString(),
          };
          if (loaded.items?.length && !tripPlanRequest.persisted_itinerary_items?.length) {
            tripPlanRequest.persisted_itinerary_items = loaded.items;
          }
          if (ctx.orchestratorState && loaded.items?.length) {
            const state = ctx.orchestratorState as OrchestratorState;
            state.research_data = {
              ...(state.research_data ?? {}),
              itinerary_items: loaded.items,
            };
          }
        }
      } catch (e: unknown) {
        this.logger.warn(`[IntakeExecutor] trip.load 失败: ${(e as Error)?.message}`);
      }
    }

    return {
      tripPlanRequest,
      ...(compiled.simulation ? { simulation: compiled.simulation } : {}),
      gaps,
      clarificationQuestions: clarificationQuestions.map((q) => ({
        id: q.id,
        question: q.question,
        type: q.type,
        required: q.required,
        options: q.options,
        placeholder: q.placeholder,
        hint: q.hint,
        validation: q.validation,
      })),
      intent,
      candidate_structure,
    };
  }
}
