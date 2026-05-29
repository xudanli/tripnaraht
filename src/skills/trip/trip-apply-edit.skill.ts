/**
 * trip.applyEdit — 统一改行程入口：智能闭环（smart_update）或 DB 级 edits
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { Skill, SkillInput, SkillOutput } from '../interfaces/skill.interface';
import type { Itinerary } from '../../agent/interfaces/trip-plan.interface';
import { SkillsRegistryService } from '../services/skills-registry.service';
import { ItineraryItemsService } from '../../itinerary-items/itinerary-items.service';
import { applyTripUserEdits, type TripUserEdit } from './utils/trip-user-edit.util';

export interface TripApplyEditInput extends SkillInput {
  tripId?: string;
  /** auto: 有 edits 走 DB，否则 smart_update */
  mode?: 'auto' | 'smart' | 'db';
  itinerary?: Itinerary;
  research_data?: Record<string, unknown>;
  user_change_intent?: string;
  intent_hints?: string[];
  edits?: TripUserEdit[];
  extra_adjustments?: unknown[];
  alternatives?: Record<string, unknown>;
}

export interface TripApplyEditOutput extends SkillOutput {
  mode: 'smart' | 'db';
  success: boolean;
  itinerary?: Itinerary;
  smartUpdate?: unknown;
  dbEdit?: unknown;
  degraded?: boolean;
  degradedReason?: string;
}

@Injectable()
export class TripApplyEditSkill implements Skill<TripApplyEditInput, TripApplyEditOutput> {
  private readonly logger = new Logger(TripApplyEditSkill.name);

  metadata = {
    name: 'trip.applyEdit',
    description:
      'trip.applyEdit：统一改行程。有 user_change_intent + itinerary 时走 itinerary.smart_update；有结构化 edits 时直接落库。新增 POI 应携带白天游览时段；修改 POI 时间应携带明确的 startTime/endTime。',
    version: '1.0.0',
    category: 'trip' as const,
    toolGroup: 'DOMAIN' as const,
  };

  constructor(
    @Optional() private readonly skillsRegistry?: SkillsRegistryService,
    @Optional() private readonly itineraryItemsService?: ItineraryItemsService,
  ) {}

  async execute(input: TripApplyEditInput): Promise<TripApplyEditOutput> {
    const mode =
      input.mode === 'smart' || input.mode === 'db'
        ? input.mode
        : input.edits?.length
          ? 'db'
          : 'smart';

    this.logger.debug(`执行 trip.applyEdit: mode=${mode}, tripId=${input.tripId ?? 'n/a'}`);

    if (mode === 'db') {
      if (!this.itineraryItemsService) {
        return {
          mode: 'db',
          success: false,
          degraded: true,
          degradedReason: 'ItineraryItemsService 未注入',
        };
      }
      const dbEdit = await applyTripUserEdits(this.itineraryItemsService, input.edits ?? []);
      return {
        mode: 'db',
        success: dbEdit.success,
        dbEdit,
      };
    }

    if (!input.itinerary) {
      return {
        mode: 'smart',
        success: false,
        degraded: true,
        degradedReason: 'smart 模式需要 itinerary',
      };
    }

    const smartSkill = this.skillsRegistry?.getSkill('itinerary.smart_update');
    if (!smartSkill) {
      return {
        mode: 'smart',
        success: false,
        degraded: true,
        degradedReason: 'itinerary.smart_update 未注册',
      };
    }

    const smartUpdate = await smartSkill.execute({
      itinerary: input.itinerary,
      research_data: input.research_data,
      user_change_intent: input.user_change_intent,
      intent_hints: input.intent_hints,
      extra_adjustments: input.extra_adjustments,
      alternatives: input.alternatives,
      tokenContext: input.tokenContext,
    });

    const itinerary =
      smartUpdate && typeof smartUpdate === 'object' && 'itinerary' in smartUpdate
        ? (smartUpdate as { itinerary?: Itinerary }).itinerary
        : input.itinerary;

    return {
      mode: 'smart',
      success: Boolean(
        smartUpdate &&
          typeof smartUpdate === 'object' &&
          ('applied' in smartUpdate ? (smartUpdate as { applied?: boolean }).applied : true),
      ),
      itinerary,
      smartUpdate,
    };
  }
}
