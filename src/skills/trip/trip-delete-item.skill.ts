/**
 * trip.deleteItem — 删除单个 ItineraryItem
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { Skill, SkillInput, SkillOutput } from '../interfaces/skill.interface';
import { ItineraryItemsService } from '../../itinerary-items/itinerary-items.service';
import {
  buildEffectivePlanWriteChainBlockedPayload,
  isDirectPlanMutationBlocked,
} from '../../decision-runtime/execution/effective-plan-write-chain-blocked.util';

export interface TripDeleteItemInput extends SkillInput {
  tripId: string;
  itemId: string;
}

export interface TripDeleteItemOutput extends SkillOutput {
  tripId: string;
  itemId: string;
  deleted: boolean;
  degraded?: boolean;
  degradedReason?: string;
  writeChainRequired?: boolean;
  authorizedPaths?: readonly string[];
  message?: string;
}

@Injectable()
export class TripDeleteItemSkill implements Skill<TripDeleteItemInput, TripDeleteItemOutput> {
  private readonly logger = new Logger(TripDeleteItemSkill.name);

  metadata = {
    name: 'trip.deleteItem',
    description:
      'trip.deleteItem：删除指定 ItineraryItem。在用户明确取消某活动/行程项且已有 itemId 时调用。',
    version: '1.0.0',
    category: 'trip' as const,
    toolGroup: 'DOMAIN' as const,
  };

  constructor(@Optional() private readonly itineraryItemsService?: ItineraryItemsService) {}

  async execute(input: TripDeleteItemInput): Promise<TripDeleteItemOutput> {
    this.logger.debug(`执行 trip.deleteItem: tripId=${input.tripId}, itemId=${input.itemId}`);

    if (isDirectPlanMutationBlocked()) {
      const blocked = buildEffectivePlanWriteChainBlockedPayload('trip.deleteItem.skill');
      this.logger.warn(
        `[trip.deleteItem] blocked by EFFECTIVE_PLAN_WRITE_CHAIN tripId=${input.tripId} itemId=${input.itemId}`,
      );
      return {
        tripId: input.tripId,
        itemId: input.itemId,
        deleted: false,
        degraded: true,
        degradedReason: blocked.code,
        writeChainRequired: true,
        authorizedPaths: blocked.authorizedPaths,
        message: blocked.message,
      };
    }

    if (!this.itineraryItemsService) {
      return {
        tripId: input.tripId,
        itemId: input.itemId,
        deleted: false,
        degraded: true,
        degradedReason: 'ItineraryItemsService 未注入',
      };
    }

    await this.itineraryItemsService.remove(input.itemId);
    return {
      tripId: input.tripId,
      itemId: input.itemId,
      deleted: true,
    };
  }
}
