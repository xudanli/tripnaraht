import type { WorldBusEvent } from './world-bus-event.types';

/** 与 {@link reduceGlobalWorldState} / 观测约定对齐的语义子类型 */
export const WORLD_BUS_SUB = {
  TRIP_CREATED: 'TRIP_CREATED',
  DRAFT_GENERATED: 'DRAFT_GENERATED',
  ACTION_EXECUTED: 'ACTION_EXECUTED',
  GOVERNANCE_TICK: 'GOVERNANCE_TICK',
} as const;

export function buildTripCreatedEvent(args: {
  tripId: string;
  /** 世界分片键：当前 v0 使用 ISO 国家码（与行程 destination 一致） */
  cityKey: string;
  userId?: string;
}): WorldBusEvent {
  const cityKey = args.cityKey.trim();
  return {
    kind: 'SYSTEM',
    subType: WORLD_BUS_SUB.TRIP_CREATED,
    timestamp: Date.now(),
    cityKey: cityKey || undefined,
    payload: {
      tripId: args.tripId,
      ...(args.userId ? { userId: args.userId } : {}),
    },
  };
}

export function buildDraftGeneratedEvent(args: {
  draftId: string;
  cityKey: string;
  tripId?: string;
  contractMode?: string;
}): WorldBusEvent {
  const cityKey = args.cityKey.trim();
  return {
    kind: 'SYSTEM',
    subType: WORLD_BUS_SUB.DRAFT_GENERATED,
    timestamp: Date.now(),
    cityKey: cityKey || undefined,
    payload: {
      draftId: args.draftId,
      ...(args.tripId ? { tripId: args.tripId } : {}),
      ...(args.contractMode ? { contractMode: args.contractMode } : {}),
    },
  };
}
