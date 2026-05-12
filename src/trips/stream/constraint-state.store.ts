/**
 * Constraint State Store — 始终保留「最新世界快照」（非 append-only log）
 */

import type {
  BookingLifecycleStatus,
  NormalizedConstraintEvent,
  POIState,
  RoadAccessStatus,
  RoadState,
  SlotConstraintState,
  SlotRoadMask,
} from './constraint-stream.types';

export interface ConstraintStateStoreSnapshot {
  readonly latestByRoad: ReadonlyMap<string, RoadState>;
  readonly latestByPOI: ReadonlyMap<string, POIState>;
  readonly latestBySlot: ReadonlyMap<string, SlotConstraintState>;
}

function stableRoadMaskString(mask: SlotRoadMask | undefined): string {
  if (!mask || Object.keys(mask).length === 0) {
    return '';
  }
  return Object.keys(mask)
    .sort()
    .map(k => `${k}=${mask[k]}`)
    .join('|');
}

export function computeSlotConstraintFingerprint(
  slotId: string,
  state: Pick<
    SlotConstraintState,
    'roadMask' | 'bookingStatus' | 'poiReachable' | 'weatherAnchor'
  >,
): string {
  return [
    `slot=${slotId}`,
    `roads=${stableRoadMaskString(state.roadMask)}`,
    `book=${state.bookingStatus ?? ''}`,
    `poi=${state.poiReachable === undefined ? '' : String(state.poiReachable)}`,
    `wx=${state.weatherAnchor ?? ''}`,
  ].join(';');
}

export class ConstraintStateStore implements ConstraintStateStoreSnapshot {
  readonly latestByRoad = new Map<string, RoadState>();

  readonly latestByPOI = new Map<string, POIState>();

  readonly latestBySlot = new Map<string, SlotConstraintState>();

  getSlotFingerprint(slotId: string): string | undefined {
    return this.latestBySlot.get(slotId)?.constraintFingerprint;
  }

  /**
   * 应用一条归一化事件并更新槽位摘要（路网按槽位合并 mask，支持流式多次 PATCH）。
   */
  apply(event: NormalizedConstraintEvent): void {
    if (event.roads) {
      for (const r of event.roads) {
        this.latestByRoad.set(r.roadId, {
          roadId: r.roadId,
          status: r.status,
          updatedAt: event.at,
        });
      }
    }

    if (event.poi) {
      this.latestByPOI.set(event.poi.poiId, {
        poiId: event.poi.poiId,
        reachable: event.poi.reachable,
        updatedAt: event.at,
      });
    }

    for (const slotId of event.affectedSlotIds) {
      const prev = this.latestBySlot.get(slotId);

      let roadMask: Record<string, RoadAccessStatus> | undefined = prev?.roadMask
        ? { ...prev.roadMask }
        : undefined;
      if (event.roads?.length) {
        roadMask = { ...(roadMask ?? {}) };
        for (const r of event.roads) {
          roadMask[r.roadId] = r.status;
        }
      }

      let bookingStatus: BookingLifecycleStatus | undefined = prev?.bookingStatus;
      if (event.booking && event.booking.slotId === slotId) {
        bookingStatus = event.booking.bookingStatus;
      }

      let poiReachable: boolean | undefined = prev?.poiReachable;
      if (event.poi) {
        poiReachable = event.poi.reachable;
      }

      let weatherAnchor: string | undefined = prev?.weatherAnchor;
      if (event.domain === 'WEATHER' && event.weatherDate) {
        weatherAnchor = `${event.weatherDate}:${event.severity}`;
      }

      const constraintFingerprint = computeSlotConstraintFingerprint(slotId, {
        roadMask,
        bookingStatus,
        poiReachable,
        weatherAnchor,
      });

      this.latestBySlot.set(slotId, {
        slotId,
        constraintFingerprint,
        updatedAt: event.at,
        ...(roadMask !== undefined ? { roadMask } : {}),
        ...(bookingStatus !== undefined ? { bookingStatus } : {}),
        ...(poiReachable !== undefined ? { poiReachable } : {}),
        ...(weatherAnchor !== undefined ? { weatherAnchor } : {}),
      });
    }
  }
}
