/**
 * trip.load — 从 DB 加载行程草稿与展平后的 itinerary items
 */

import { Injectable, Logger, Optional, Inject, forwardRef } from '@nestjs/common';
import { Skill, SkillInput, SkillOutput } from '../interfaces/skill.interface';
import { TripsService } from '../../trips/trips.service';

export interface TripLoadInput extends SkillInput {
  tripId: string;
}

export interface TripLoadOutput extends SkillOutput {
  tripId: string;
  trip: unknown;
  items: unknown[];
  itemCount: number;
  degraded?: boolean;
  degradedReason?: string;
}

@Injectable()
export class TripLoadSkill implements Skill<TripLoadInput, TripLoadOutput> {
  private readonly logger = new Logger(TripLoadSkill.name);

  metadata = {
    name: 'trip.load',
    description:
      'trip.load：从数据库加载行程（Trip + 展平 ItineraryItem）。在 INTAKE/route_and_run 需 Hydrate 已有 trip 或 Agent 读行程上下文时调用。',
    version: '1.0.0',
    category: 'trip' as const,
    toolGroup: 'DOMAIN' as const,
  };

  constructor(
    @Optional() @Inject(forwardRef(() => TripsService)) private readonly tripsService?: TripsService,
  ) {}

  async execute(input: TripLoadInput): Promise<TripLoadOutput> {
    this.logger.debug(`执行 trip.load: tripId=${input.tripId}`);

    if (!this.tripsService) {
      return {
        tripId: input.tripId,
        trip: null,
        items: [],
        itemCount: 0,
        degraded: true,
        degradedReason: 'TripsService 未注入',
      };
    }

    const trip = await this.tripsService.findOne(input.tripId.trim());
    const items: unknown[] = [];
    const days = (trip as { days?: Array<{ items?: unknown[] }> }).days;
    if (Array.isArray(days)) {
      for (const day of days) {
        if (Array.isArray(day.items)) {
          items.push(...day.items);
        }
      }
    }

    return {
      tripId: input.tripId,
      trip,
      items,
      itemCount: items.length,
    };
  }
}
