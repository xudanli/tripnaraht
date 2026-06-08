/**
 * itinerary.adaptive_replan — 自适应改排引擎
 *
 * 五阶段闭环：约束解析 → 走廊过滤 → 人格重排 → verify & repair（smart_update）
 * 是 ITINERARY_ADJUST 编排图的「大脑」，而非简单 CRUD。
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { Skill, SkillInput, SkillMetadata } from '../interfaces/skill.interface';
import { Skill as SkillDecorator } from '../decorators/skill.decorator';
import { SkillsRegistryService } from '../services/skills-registry.service';
import type { Itinerary } from '../../agent/interfaces/trip-plan.interface';
import type {
  AdaptiveReplanOutput,
  AdaptiveReplanPayload,
  AdaptiveReplanPhaseTelemetry,
} from './adaptive-replan.types';
import { parseAdaptiveReplanConstraints } from './adaptive-replan-constraint-parser.util';
import { filterItineraryCorridor } from './adaptive-replan-corridor.util';
import { rearrangeItineraryForPersona } from './adaptive-replan-persona-rearrange.util';
import type { ItinerarySmartUpdateInput, ItinerarySmartUpdateOutput } from './itinerary-smart-update.skill';

function phaseTelemetry(ok: boolean, startMs: number, error?: string): AdaptiveReplanPhaseTelemetry {
  return { ok, duration_ms: Date.now() - startMs, ...(error ? { error } : {}) };
}

export type ItineraryAdaptiveReplanInput = SkillInput & AdaptiveReplanPayload;

@SkillDecorator({
  name: 'itinerary.adaptive_replan',
  description:
    '自适应改排：结合天气/路况/奥德赛人格与疲劳状态，对目标日行程做多约束重排并 verify+repair 闭环。',
  version: '1.0.0',
  category: 'trip',
  toolGroup: 'DOMAIN',
})
@Injectable()
export class ItineraryAdaptiveReplanSkill
  implements Skill<ItineraryAdaptiveReplanInput, AdaptiveReplanOutput>
{
  private readonly logger = new Logger(ItineraryAdaptiveReplanSkill.name);

  metadata: SkillMetadata = {
    name: 'itinerary.adaptive_replan',
    description:
      'itinerary.adaptive_replan：约束规划+人格对齐的动态改排引擎。用于 ITINERARY_ADJUST 与 pacing/weather 驱动改排；勿用于简单单点 CRUD。',
    version: '1.0.0',
    category: 'trip',
    toolGroup: 'DOMAIN',
    inputSchema: {
      required: ['tripId', 'targetDays', 'personaSnapshot'],
      typeChecks: {
        tripId: { type: 'string' },
        targetDays: { type: 'array' },
        personaSnapshot: { type: 'object' },
      },
    },
  };

  constructor(@Optional() private readonly skillsRegistry?: SkillsRegistryService) {
    this.logger.log('[ItineraryAdaptiveReplanSkill] initialized');
  }

  async execute(input: ItineraryAdaptiveReplanInput): Promise<AdaptiveReplanOutput> {
    const t0 = Date.now();
    let itinerary = input.itinerary;

    if (!itinerary) {
      const loadSkill = this.skillsRegistry?.getSkill('trip.load');
      if (loadSkill) {
        const loaded = await loadSkill.execute({
          tripId: input.tripId,
          tokenContext: input.tokenContext,
        });
        itinerary =
          loaded && typeof loaded === 'object' && 'itinerary' in loaded
            ? (loaded as { itinerary?: Itinerary }).itinerary
            : undefined;
      }
    }

    if (!itinerary) {
      const err = '缺少 itinerary 且 trip.load 未返回行程';
      this.logger.warn(`itinerary.adaptive_replan: ${err}`);
      return this.emptyFailure(err, t0);
    }

    // Stage 1: CONSTRAINT PARSING
    const cStart = Date.now();
    let constraint_parse;
    let constraintTelemetry: AdaptiveReplanPhaseTelemetry;
    try {
      constraint_parse = parseAdaptiveReplanConstraints({
        itinerary,
        targetDays: input.targetDays,
        personaSnapshot: input.personaSnapshot,
        environmentalContext: input.environmentalContext,
      });
      constraintTelemetry = phaseTelemetry(true, cStart);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      constraintTelemetry = phaseTelemetry(false, cStart, msg);
      return this.emptyFailure(msg, t0, { constraint_parse: constraintTelemetry });
    }

    // Stage 2: POI CORRIDOR FILTERING
    const fStart = Date.now();
    let corridor_filter;
    let filterTelemetry: AdaptiveReplanPhaseTelemetry;
    try {
      corridor_filter = filterItineraryCorridor({
        itinerary,
        targetDays: input.targetDays,
        constraintParse: constraint_parse,
        trafficStatus: input.environmentalContext?.trafficStatus,
      });
      itinerary = corridor_filter.itinerary;
      filterTelemetry = phaseTelemetry(true, fStart);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      filterTelemetry = phaseTelemetry(false, fStart, msg);
      return this.emptyFailure(msg, t0, {
        constraint_parse: constraintTelemetry,
        corridor_filter: filterTelemetry,
      });
    }

    // Stage 3: PERSONA-ALIGNED REARRANGEMENT
    const rStart = Date.now();
    let persona_rearrange;
    let rearrangeTelemetry: AdaptiveReplanPhaseTelemetry;
    try {
      persona_rearrange = rearrangeItineraryForPersona({
        itinerary,
        targetDays: input.targetDays,
        weights: constraint_parse.weights,
      });
      itinerary = persona_rearrange.itinerary;
      rearrangeTelemetry = phaseTelemetry(true, rStart);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      rearrangeTelemetry = phaseTelemetry(false, rStart, msg);
      return this.emptyFailure(msg, t0, {
        constraint_parse: constraintTelemetry,
        corridor_filter: filterTelemetry,
        persona_rearrange: rearrangeTelemetry,
      });
    }

    // Stage 4: VERIFY & AUTO-REPAIR (via itinerary.smart_update)
    const vStart = Date.now();
    let smart_update: ItinerarySmartUpdateOutput | undefined;
    let verifyTelemetry: AdaptiveReplanPhaseTelemetry;

    const smartSkill = this.skillsRegistry?.getSkill('itinerary.smart_update');
    if (!smartSkill) {
      verifyTelemetry = {
        ok: false,
        duration_ms: Date.now() - vStart,
        skipped_reason: 'itinerary.smart_update 未注册',
      };
    } else {
      try {
        const smartInput: ItinerarySmartUpdateInput = {
          itinerary,
          research_data: input.research_data,
          user_change_intent: input.userIntent,
          extra_adjustments: constraint_parse.adjustments,
          world: input.world,
          route_plan_draft: input.route_plan_draft,
          include_verify_warnings: true,
          tokenContext: input.tokenContext,
        };
        smart_update = (await smartSkill.execute(smartInput)) as ItinerarySmartUpdateOutput;
        itinerary = smart_update.itinerary;
        verifyTelemetry = phaseTelemetry(true, vStart);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        verifyTelemetry = phaseTelemetry(false, vStart, msg);
        this.logger.warn(`itinerary.adaptive_replan: smart_update failed: ${msg}`);
      }
    }

    const rationale = [
      ...(corridor_filter.rationale_zh ?? []),
      ...(persona_rearrange.rationale_zh ?? []),
    ];

    const narrative =
      `ConstraintParse: ${constraintTelemetry.ok ? 'ok' : 'failed'}; ` +
      `CorridorFilter: demoted=${corridor_filter.demoted_poi_ids.length} removed=${corridor_filter.removed_item_ids.length}; ` +
      `PersonaRearrange: thinned=${persona_rearrange.thinned_item_ids.length} rest=${persona_rearrange.inserted_rest_blocks}; ` +
      `VerifyRepair: ${verifyTelemetry.ok ? (smart_update?.verified ? 'clean' : 'repaired') : verifyTelemetry.skipped_reason ?? 'failed'}; ` +
      `total ${Date.now() - t0}ms`;

    return {
      itinerary,
      verified: smart_update?.verified ?? false,
      constraint_parse,
      corridor_filter,
      persona_rearrange,
      smart_update,
      adjust_result_hints: {
        rationale_bullets_zh: rationale,
        optimization_summary_zh: `自适应改排：人格 ${input.personaSnapshot.travelStyle}，目标日 ${input.targetDays.join(',')}`,
      },
      telemetry: {
        constraint_parse: constraintTelemetry,
        corridor_filter: filterTelemetry,
        persona_rearrange: rearrangeTelemetry,
        verify_repair: verifyTelemetry,
        narrative,
      },
    };
  }

  private emptyFailure(
    error: string,
    t0: number,
    partial?: Partial<AdaptiveReplanOutput['telemetry']>,
  ): AdaptiveReplanOutput {
    const stub: AdaptiveReplanPhaseTelemetry = { ok: false, duration_ms: 0, error };
    return {
      itinerary: { request_id: 'adaptive-replan-failed', days: [] },
      verified: false,
      telemetry: {
        constraint_parse: partial?.constraint_parse ?? stub,
        corridor_filter: partial?.corridor_filter ?? stub,
        persona_rearrange: partial?.persona_rearrange ?? stub,
        verify_repair: partial?.verify_repair ?? stub,
        narrative: `adaptive_replan failed: ${error}; total ${Date.now() - t0}ms`,
      },
    };
  }
}
