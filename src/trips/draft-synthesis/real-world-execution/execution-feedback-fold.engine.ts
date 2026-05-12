import type { ExecutionFeedback } from './execution-feedback.types';
import type { ExecutionAction } from './execution-action.types';
import type { WorldBusEvent } from '../autonomous-world/world-bus-event.types';
import { WORLD_BUS_SUB } from '../autonomous-world/world-bus-semantic.builders';

function cityKeyFromAction(action?: ExecutionAction): string | undefined {
  const k = action?.meta?.cityKey?.trim();
  return k && k.length > 0 ? k : undefined;
}

/**
 * 将失败反馈映射为世界总线事件（供 GlobalWorldState / Orchestrator 消化）。
 */
export function executionFailureToWorldBusEvent(
  feedback: ExecutionFeedback,
  action?: ExecutionAction,
): WorldBusEvent | null {
  if (feedback.outcome !== 'FAILED') return null;

  const placeId = action?.meta?.placeId ?? Number(action?.targetId);
  const cityKey = cityKeyFromAction(action);

  if (action?.type === 'RESERVE_RESTAURANT' || action?.type === 'BOOK_POI') {
    return {
      kind: 'CROWD',
      subType: 'BOOKING_FAILED',
      timestamp: feedback.timestamp,
      cityKey,
      placeId: Number.isFinite(placeId) ? placeId : undefined,
      payload: {
        detail: feedback.detail ?? 'booking_failed',
        externalCode: feedback.externalCode,
        actionId: feedback.actionId,
      },
    };
  }

  if (action?.type === 'BUY_TICKET') {
    return {
      kind: 'SYSTEM',
      subType: 'TICKET_UNAVAILABLE',
      timestamp: feedback.timestamp,
      cityKey,
      placeId: Number.isFinite(placeId) ? placeId : undefined,
      payload: { detail: feedback.detail, actionId: feedback.actionId },
    };
  }

  return {
    kind: 'SYSTEM',
    subType: 'EXECUTION_FAILED',
    timestamp: feedback.timestamp,
    cityKey,
    payload: { detail: feedback.detail, actionId: feedback.actionId },
  };
}

/** POI/预订成功带来的排队负载增量（与 reduceGlobalWorldState / reduceCityTwinFromWorldBus 的 delta 语义对齐） */
const SUCCESS_POI_LOAD_DELTA = {
  BOOK_POI: 0.07,
  RESERVE_RESTAURANT: 0.09,
  BUY_TICKET: 0.06,
} as const;

/**
 * 成功执行 → 总线（POI 类折叠为 CROWD；导航腿折叠为 TRANSPORT；其余保留 SYSTEM 观测事件）。
 */
export function executionSuccessToWorldBusEvent(action: ExecutionAction, feedback: ExecutionFeedback): WorldBusEvent {
  const placeIdRaw = action.meta?.placeId ?? Number(action.targetId);
  const placeId = Number.isFinite(placeIdRaw) ? placeIdRaw : undefined;
  const cityKey = cityKeyFromAction(action);
  const basePayload = {
    outcome: 'SUCCESS' as const,
    actionId: action.id,
    type: action.type,
    targetId: action.targetId,
    tripId: action.meta?.tripId,
  };

  if (action.type === 'NAVIGATE' && action.meta?.fromPlaceId != null && action.meta?.placeId != null) {
    const edgeKey = `${action.meta.fromPlaceId}|${action.meta.placeId}`;
    return {
      kind: 'TRANSPORT',
      subType: 'LEG_COMPLETED',
      timestamp: feedback.timestamp,
      cityKey,
      payload: {
        edgeKey,
        congestion: 0.52,
        ...basePayload,
      },
    };
  }

  if (
    placeId != null &&
    (action.type === 'BOOK_POI' || action.type === 'RESERVE_RESTAURANT' || action.type === 'BUY_TICKET')
  ) {
    const delta = SUCCESS_POI_LOAD_DELTA[action.type];
    return {
      kind: 'CROWD',
      subType: 'ACTION_CONFIRMED',
      timestamp: feedback.timestamp,
      cityKey,
      placeId,
      payload: {
        delta,
        ...basePayload,
      },
    };
  }

  return {
    kind: 'SYSTEM',
    subType: WORLD_BUS_SUB.ACTION_EXECUTED,
    timestamp: feedback.timestamp,
    cityKey,
    placeId,
    payload: basePayload,
  };
}
