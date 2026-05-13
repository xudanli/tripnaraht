/**
 * PlanGenExecutorService
 *
 * 实现 IPlanGenExecutor，执行 PLAN_GEN 阶段
 * 调用 itinerary.generate Skill
 *
 * 参考: docs/KERNEL_BUSINESS_LOGIC_MIGRATION_PLAN.md
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import type { DecisionState } from '../../decision/kernel/decision-state.types';
import type {
  IPlanGenExecutor,
  PhaseExecutorContext,
  ItineraryLike,
  PlanGenEmptyDraftExplanation,
} from '../../decision/kernel/interfaces/phase-executor.interface';
import { SkillsRegistryService } from '../../skills/services/skills-registry.service';
import type { TripPlanRequest, GateResult } from '../interfaces/trip-plan.interface';

@Injectable()
export class PlanGenExecutorService implements IPlanGenExecutor {
  private readonly logger = new Logger(PlanGenExecutorService.name);

  constructor(@Optional() private readonly skillsRegistry?: SkillsRegistryService) {}

  async execute(
    dso: DecisionState,
    ctx: PhaseExecutorContext,
  ): Promise<{
    itinerary: ItineraryLike;
    planDraft: unknown;
    emptyDraftExplanation?: PlanGenEmptyDraftExplanation;
  }> {
    this.logger.debug(`[PlanGenExecutor] 执行 PLAN_GEN 阶段 requestId=${ctx.requestId}`);

    const emptyItinerary: ItineraryLike = {
      request_id: ctx.requestId,
      days: [],
    };

    if (!this.skillsRegistry) {
      return {
        itinerary: emptyItinerary,
        planDraft: emptyItinerary,
        emptyDraftExplanation: {
          code: 'NO_SKILLS_REGISTRY',
          message: '技能注册中心不可用，无法调用行程生成。',
        },
      };
    }
    if (!ctx.tripPlanRequest) {
      return {
        itinerary: emptyItinerary,
        planDraft: emptyItinerary,
        emptyDraftExplanation: {
          code: 'NO_TRIP_PLAN_REQUEST',
          message: '缺少行程请求上下文（tripPlanRequest），无法生成日程。',
        },
      };
    }

    try {
      const req = this.toTripPlanRequest(ctx.tripPlanRequest, ctx.requestId);
      const skill = this.skillsRegistry.getSkill('itinerary.generate');
      if (!skill) {
        return {
          itinerary: emptyItinerary,
          planDraft: emptyItinerary,
          emptyDraftExplanation: {
            code: 'SKILL_NOT_REGISTERED',
            message: '未注册 itinerary.generate 技能。',
          },
        };
      }

      const result = await skill.execute({
        request: req,
        research_data: ctx.researchData as Record<string, any>,
        gate_result: ctx.gateResult as GateResult,
        environment_state: dso.environmentState
          ? { flights: dso.environmentState.flights }
          : undefined,
      });

      if (result && typeof result === 'object' && 'request_id' in result && 'days' in result) {
        const r = result as {
          request_id: string;
          days: ItineraryLike['days'];
          metadata?: ItineraryLike['metadata'];
          resultType?: ItineraryLike['resultType'];
          partialExecutionState?: ItineraryLike['partialExecutionState'];
          executionDecision?: ItineraryLike['executionDecision'];
        };
        const itinerary: ItineraryLike = {
          request_id: r.request_id,
          days: r.days,
          metadata: r.metadata,
          resultType: r.resultType,
          partialExecutionState: r.partialExecutionState,
          executionDecision: r.executionDecision,
        };
        const days = Array.isArray(itinerary.days) ? itinerary.days : [];
        if (days.length === 0 && itinerary.resultType !== 'execution_block') {
          return {
            itinerary,
            planDraft: itinerary,
            emptyDraftExplanation: {
              code: 'EMPTY_DAYS_FROM_SKILL',
              message: '行程生成技能返回了零天日程，当前约束下可能无可行解。',
            },
          };
        }
        return { itinerary, planDraft: itinerary };
      }
      return {
        itinerary: emptyItinerary,
        planDraft: emptyItinerary,
        emptyDraftExplanation: {
          code: 'SKILL_RESULT_INVALID',
          message: '行程生成技能返回了无法解析的结构（缺少 request_id 或 days）。',
        },
      };
    } catch (e: any) {
      this.logger.warn(`[PlanGenExecutor] itinerary.generate 失败: ${e?.message}`);
      return {
        itinerary: emptyItinerary,
        planDraft: emptyItinerary,
        emptyDraftExplanation: {
          code: 'SKILL_EXECUTION_ERROR',
          message: '行程生成技能执行失败。',
          detail: e?.message,
        },
      };
    }
  }

  private toTripPlanRequest(
    req: PhaseExecutorContext['tripPlanRequest'],
    requestId: string,
  ): TripPlanRequest {
    const out: TripPlanRequest = {
      request_id: requestId,
      origin: (req?.origin ?? '') as TripPlanRequest['origin'],
      destination: (req?.destination ?? '') as TripPlanRequest['destination'],
      date_range: req?.date_range,
      start_date: req?.start_date,
      days: req?.days,
      mode: req?.mode as TripPlanRequest['mode'],
      party: req?.party as TripPlanRequest['party'],
      party_profile: req?.party_profile as TripPlanRequest['party_profile'],
    };
    if (req?.trip_id) {
      out.trip_id = req.trip_id;
    }
    return out;
  }
}
