/**
 * Slice 3 E3 — POI execution window resolver (single-source, no merge).
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import type { PoiExecutionWindow } from '../contracts/execution-slip.types';
import {
  readActivityContextFromTripMetadata,
  readMetadataWindow,
} from '../utils/execution-activity-context.util';

const IS_EXECUTION_WINDOW_FIXTURE: Record<
  string,
  Pick<PoiExecutionWindow, 'lastEntryAt' | 'closesAt' | 'timezone'>
> = {
  poi_b_timed: { lastEntryAt: '16:00', closesAt: '18:00', timezone: 'Atlantic/Reykjavik' },
  poi_nearby_substitute: {
    lastEntryAt: '18:00',
    closesAt: '20:00',
    timezone: 'Atlantic/Reykjavik',
  },
};

function resolvePoiKey(place: {
  id: number;
  metadata: unknown;
} | null | undefined): string {
  if (!place) return '';
  const meta = (place.metadata ?? {}) as Record<string, unknown>;
  if (typeof meta.poiKey === 'string') return meta.poiKey;
  return `place_${place.id}`;
}

@Injectable()
export class PoiExecutionWindowResolverService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resolve window for an activity. Priority (first hit wins):
   * 1. Trip.metadata rfc001ExecutionActivityContext.executionWindow
   * 2. Place.metadata lastEntryAt/closesAt
   * 3. Destination pack static fixture (Iceland Slice 3)
   */
  async resolvePoiExecutionWindow(
    activityId: string,
  ): Promise<PoiExecutionWindow | null> {
    const item = await this.prisma.itineraryItem.findUnique({
      where: { id: activityId },
      select: {
        id: true,
        placeId: true,
        Place: { select: { id: true, metadata: true } },
        TripDay: { select: { tripId: true, Trip: { select: { metadata: true } } } },
      },
    });
    if (!item) return null;

    const poiKey = resolvePoiKey(item.Place);
    const poiId = poiKey || String(item.placeId ?? activityId);

    const tripContext = readActivityContextFromTripMetadata(
      item.TripDay.Trip.metadata,
      activityId,
    );
    if (tripContext.executionWindow?.lastEntryAt) {
      return {
        poiId,
        activityId,
        lastEntryAt: tripContext.executionWindow.lastEntryAt,
        closesAt: tripContext.executionWindow.closesAt,
        timezone: tripContext.executionWindow.timezone ?? 'UTC',
        sourceProvider: 'plan_activity_metadata',
        confidence: 0.95,
      };
    }

    const placeMeta = readMetadataWindow(item.Place?.metadata);
    if (placeMeta?.lastEntryAt) {
      return {
        poiId,
        activityId,
        lastEntryAt: placeMeta.lastEntryAt,
        closesAt: placeMeta.closesAt,
        timezone: placeMeta.timezone ?? 'UTC',
        sourceProvider: 'place_metadata',
        confidence: 0.85,
      };
    }

    const fixture = IS_EXECUTION_WINDOW_FIXTURE[poiKey];
    if (fixture) {
      return {
        poiId,
        activityId,
        lastEntryAt: fixture.lastEntryAt,
        closesAt: fixture.closesAt,
        timezone: fixture.timezone,
        sourceProvider: 'destination_pack_fixture',
        confidence: 0.7,
      };
    }

    return null;
  }
}
