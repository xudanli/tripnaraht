/**
 * RepairExecutorService
 *
 * 实现 IRepairExecutor，执行 REPAIR 阶段
 * LocalInsightAgent.suggestAlternatives + repair.apply Skill
 *
 * 参考: docs/KERNEL_BUSINESS_LOGIC_MIGRATION_PLAN.md
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import type { DecisionState } from '../../decision/kernel/decision-state.types';
import type {
  IRepairExecutor,
  PhaseExecutorContext,
  ItineraryLike,
} from '../../decision/kernel/interfaces/phase-executor.interface';
import { SkillsRegistryService } from '../../skills/services/skills-registry.service';
import { ClaudeLocalInsightAgentService } from '../services/sub-agents/local-insight-agent.service';
import type { TripPlanRequest, GateResult } from '../interfaces/trip-plan.interface';
import type { OrchestratorState } from '../interfaces/trip-plan.interface';

@Injectable()
export class RepairExecutorService implements IRepairExecutor {
  private readonly logger = new Logger(RepairExecutorService.name);

  constructor(
    @Optional() private readonly skillsRegistry?: SkillsRegistryService,
    @Optional() private readonly localInsightAgent?: ClaudeLocalInsightAgentService,
  ) {}

  async execute(
    dso: DecisionState,
    ctx: PhaseExecutorContext,
  ): Promise<{ itinerary?: ItineraryLike; repairApplied: boolean }> {
    this.logger.debug(`[RepairExecutor] 执行 REPAIR 阶段 requestId=${ctx.requestId}`);

    let repairApplied = false;
    let itinerary = ctx.itinerary;

    if (!ctx.tripPlanRequest || !ctx.gateResult) {
      return { itinerary, repairApplied };
    }

    const req = this.toTripPlanRequest(ctx.tripPlanRequest, ctx.requestId);
    const minimalState: Partial<OrchestratorState> = {
      request_id: ctx.requestId,
      trip_plan_request: req,
      research_data: ctx.researchData,
      gate_result: ctx.gateResult as GateResult,
      itinerary: ctx.itinerary as any,
      alternatives: ctx.alternatives as OrchestratorState['alternatives'],
    };

    // 1. LocalInsight Agent 生成替代方案
    let alternatives = ctx.alternatives;
    if (this.localInsightAgent && ctx.gateResult) {
      try {
        const alt = await this.localInsightAgent.suggestAlternatives(
          req,
          ctx.gateResult as GateResult,
          minimalState as OrchestratorState,
        );
        if (alt.alternative_pois.length > 0 || alt.alternative_routes.length > 0) {
          repairApplied = true;
          alternatives = alt;
        }
      } catch (e: any) {
        this.logger.warn(`[RepairExecutor] LocalInsight Agent 失败: ${e?.message}`);
      }
    }

    // 2. repair.apply Skill 应用修复
    if (this.skillsRegistry && itinerary && ctx.gateResult.required_adjustments?.length > 0) {
      try {
        const skill = this.skillsRegistry.getSkill('repair.apply');
        if (skill) {
          const result = await skill.execute({
            itinerary: itinerary as any,
            adjustments: ctx.gateResult.required_adjustments,
            alternatives: alternatives || { alternative_pois: [], alternative_routes: [] },
          });
          if (result?.repaired && result.itinerary) {
            repairApplied = true;
            itinerary = {
              request_id: result.itinerary.request_id,
              days: result.itinerary.days,
              metadata: result.itinerary.metadata,
            };
          }
        }
      } catch (e: any) {
        this.logger.warn(`[RepairExecutor] repair.apply 失败: ${e?.message}`);
      }
    }

    return { itinerary, repairApplied };
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
