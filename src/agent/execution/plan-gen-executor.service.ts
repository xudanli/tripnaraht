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
  ): Promise<{ itinerary: ItineraryLike; planDraft: unknown }> {
    this.logger.debug(`[PlanGenExecutor] 执行 PLAN_GEN 阶段 requestId=${ctx.requestId}`);

    const emptyItinerary: ItineraryLike = {
      request_id: ctx.requestId,
      days: [],
    };

    if (!this.skillsRegistry || !ctx.tripPlanRequest) {
      return { itinerary: emptyItinerary, planDraft: emptyItinerary };
    }

    try {
      const req = this.toTripPlanRequest(ctx.tripPlanRequest, ctx.requestId);
      const skill = this.skillsRegistry.getSkill('itinerary.generate');
      if (!skill) return { itinerary: emptyItinerary, planDraft: emptyItinerary };

      const result = await skill.execute({
        request: req,
        research_data: ctx.researchData as Record<string, any>,
        gate_result: ctx.gateResult as GateResult,
        environment_state: dso.environmentState
          ? { flights: dso.environmentState.flights }
          : undefined,
      });

      if (result && typeof result === 'object' && 'request_id' in result && 'days' in result) {
        const itinerary: ItineraryLike = {
          request_id: result.request_id,
          days: result.days,
          metadata: result.metadata,
        };
        return { itinerary, planDraft: itinerary };
      }
    } catch (e: any) {
      this.logger.warn(`[PlanGenExecutor] itinerary.generate 失败: ${e?.message}`);
    }

    return { itinerary: emptyItinerary, planDraft: emptyItinerary };
  }

  private toTripPlanRequest(
    req: PhaseExecutorContext['tripPlanRequest'],
    requestId: string,
  ): TripPlanRequest {
    return {
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
  }
}
