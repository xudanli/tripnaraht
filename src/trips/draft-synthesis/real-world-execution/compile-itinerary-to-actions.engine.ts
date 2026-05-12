import { randomUUID } from 'crypto';
import type { DraftDay } from '../../dto/trip-draft.dto';
import type { ExecutionAction, ExecutionActionType } from './execution-action.types';

const SLOT_ORDER = ['morning', 'lunch', 'afternoon', 'dinner', 'evening'] as const;

function inferActionType(slot: string, item: { reason?: string; evidence?: { riskTags?: string[] } }): ExecutionActionType {
  if (slot === 'lunch' || slot === 'dinner') return 'RESERVE_RESTAURANT';
  const r = `${item.reason ?? ''}`.toLowerCase();
  const tags = (item.evidence?.riskTags ?? []).join(',').toLowerCase();
  if (tags.includes('ticket') || r.includes('门票') || r.includes('ticket')) return 'BUY_TICKET';
  return 'BOOK_POI';
}

export interface CompileItineraryOptions {
  tripId?: string;
  /** 世界分片键（与 ExecutionAction.meta.cityKey / WorldBusEvent.cityKey 对齐） */
  cityKey?: string;
  /** 导航动作：相邻槽位之间生成 NAVIGATE */
  includeNavigateLegs?: boolean;
}

/**
 * 将草案日表编译为可投递执行层的动作列表（占位语义：真实路由由适配器完成）。
 */
export function compileDraftDaysToExecutionActions(
  draftDays: DraftDay[],
  options?: CompileItineraryOptions,
): ExecutionAction[] {
  const tripId = options?.tripId;
  const cityKey = options?.cityKey?.trim();
  const includeNav = options?.includeNavigateLegs !== false;
  const actions: ExecutionAction[] = [];

  for (const dayRow of draftDays) {
    let prevPlaceId: number | undefined;
    const day = dayRow.day;

    for (const slot of SLOT_ORDER) {
      const raw = dayRow.slots?.[slot] as
        | { placeId?: number; reason?: string; evidence?: { riskTags?: string[] }; startTime?: string; endTime?: string }
        | undefined;
      if (!raw?.placeId) continue;

      const type = inferActionType(slot, raw);
      actions.push({
        id: randomUUID(),
        type,
        targetId: raw.placeId,
        status: 'PENDING',
        params: {
          startTime: raw.startTime,
          endTime: raw.endTime,
          slot,
        },
        meta: {
          tripId,
          day,
          slot,
          placeId: raw.placeId,
          ...(cityKey ? { cityKey } : {}),
        },
      });

      if (includeNav && prevPlaceId != null && prevPlaceId !== raw.placeId) {
        actions.push({
          id: randomUUID(),
          type: 'NAVIGATE',
          targetId: `${prevPlaceId}->${raw.placeId}`,
          status: 'PENDING',
          params: { mode: 'transit_or_walk' },
          meta: {
            tripId,
            day,
            slot: `${slot}_leg`,
            fromPlaceId: prevPlaceId,
            placeId: raw.placeId,
            ...(cityKey ? { cityKey } : {}),
          },
        });
      }
      prevPlaceId = raw.placeId;
    }
  }

  return actions;
}
