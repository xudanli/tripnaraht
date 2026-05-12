import type { WorldEvent } from './world-event.types';

/**
 * 草案管线成功结束 → 行程级世界状态的时间轴与元数据同步（复用 USER_INTERRUPT 折叠器；无疲劳/情绪 delta 时仅推进 time）。
 */
export function buildDraftPipelineSyncedWorldEvent(args: {
  draftId: string;
  tripId: string;
  contractMode?: string;
  timestamp?: number;
}): WorldEvent {
  return {
    type: 'USER_INTERRUPT',
    timestamp: args.timestamp ?? Date.now(),
    payload: {
      kind: 'DRAFT_PIPELINE_SYNC',
      draftId: args.draftId,
      tripId: args.tripId,
      ...(args.contractMode ? { contractMode: args.contractMode } : {}),
    },
  };
}
