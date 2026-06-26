/**
 * itinerary.temporalOptimize Skill
 *
 * Temporal Constraint Optimizer — 时间约束与动线优化器。
 * 挂载在 itinerary.generate 之后，作为 Evaluator/Optimizer 节点收敛排期。
 *
 * Prompt 定义: prompts/skills/时间约束与动线优化.md
 */

import { Injectable, Logger } from '@nestjs/common';
import { Skill, SkillInput, SkillOutput, SkillMetadata } from '../interfaces/skill.interface';
import type { Itinerary } from '../../agent/interfaces/trip-plan.interface';
import { Skill as SkillDecorator } from '../decorators/skill.decorator';
import {
  optimizeTemporalConstraints,
  type EnvironmentContext,
  type PartyProfile,
  type PoiConstraint,
  type TemporalAuditIssue,
  type TemporalOptimizerChangelogEntry,
} from './temporal-constraint-optimizer.util';

export interface ItineraryTemporalOptimizeInput extends SkillInput {
  itinerary: Itinerary;
  poi_constraints?: PoiConstraint[];
  party_profile?: PartyProfile;
  environment_context?: EnvironmentContext;
  travel_minutes_by_leg?: Record<string, number>;
}

export interface ItineraryTemporalOptimizeOutput extends SkillOutput {
  itinerary: Itinerary;
  optimized: boolean;
  changelog: TemporalOptimizerChangelogEntry[];
  overflow_queue: ItineraryItemLike[];
  issues: TemporalAuditIssue[];
  needs_regeneration?: {
    reason: string;
    suggested_extra_days?: number;
  };
  summary: {
    rescheduled_count: number;
    removed_count: number;
    meal_inserted_count: number;
    overflow_count: number;
  };
}

type ItineraryItemLike = Itinerary['days'][number]['items'][number];

@SkillDecorator({
  name: 'itinerary.temporalOptimize',
  description: '审计并重排行程时间轴：睡眠锁定期、餐饮锚点、交通缓冲、体力节奏',
  version: '1.0.0',
  category: 'trip',
  toolGroup: 'DOMAIN',
})
@Injectable()
export class ItineraryTemporalOptimizeSkill
  implements Skill<ItineraryTemporalOptimizeInput, ItineraryTemporalOptimizeOutput>
{
  private readonly logger = new Logger(ItineraryTemporalOptimizeSkill.name);

  metadata: SkillMetadata = {
    name: 'itinerary.temporalOptimize',
    description:
      '时间约束与动线优化器：在 itinerary.generate 之后审计睡眠时段、餐饮锚点、交通缓冲与体力节奏，并重排违规节点',
    version: '1.0.0',
    category: 'trip' as const,
    toolGroup: 'DOMAIN' as const,
    inputSchema: {
      required: ['itinerary'],
      typeChecks: { itinerary: { type: 'object' } },
      extractors: {
        itinerary: {
          type: 'step',
          stepId: 'itinerary.generate',
          path: 'result.itinerary',
        },
      },
    },
  };

  async execute(input: ItineraryTemporalOptimizeInput): Promise<ItineraryTemporalOptimizeOutput> {
    this.logger.debug(`执行 itinerary.temporalOptimize: request_id=${input.itinerary.request_id}`);

    const result = optimizeTemporalConstraints({
      itinerary: input.itinerary,
      poi_constraints: input.poi_constraints,
      party_profile: input.party_profile,
      environment_context: input.environment_context,
      travel_minutes_by_leg: input.travel_minutes_by_leg,
    });

    const rescheduled = result.changelog.filter((c) => c.action === 'RESCHEDULED').length;
    const removed = result.changelog.filter((c) => c.action === 'REMOVED' || c.action === 'MOVED_TO_OVERFLOW').length;
    const mealInserted = result.changelog.filter((c) => c.action === 'INSERTED_MEAL').length;

    return {
      itinerary: result.itinerary,
      optimized: result.changelog.length > 0,
      changelog: result.changelog,
      overflow_queue: result.overflow_queue,
      issues: result.issues,
      needs_regeneration: result.needs_regeneration,
      summary: {
        rescheduled_count: rescheduled,
        removed_count: removed,
        meal_inserted_count: mealInserted,
        overflow_count: result.overflow_queue.length,
      },
    };
  }
}
