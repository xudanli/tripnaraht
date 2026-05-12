/**
 * 现实世界可执行动作（对接 OTA / 预订 / 导航 / 改签等适配器的契约层）。
 */
export type ExecutionActionType =
  | 'BOOK_POI'
  | 'RESERVE_RESTAURANT'
  | 'BUY_TICKET'
  | 'NAVIGATE'
  | 'RESCHEDULE';

export type ExecutionActionStatus = 'PENDING' | 'SUCCESS' | 'FAILED';

export interface ExecutionAction {
  /** 追踪 id（编译器生成） */
  id: string;
  type: ExecutionActionType;
  targetId: string | number;
  params?: Record<string, unknown>;
  status: ExecutionActionStatus;
  meta?: {
    tripId?: string;
    day?: number;
    slot?: string;
    placeId?: number;
    /** 世界分片键（v0：与行程 destination 同构的 ISO 国家码等） */
    cityKey?: string;
    /** 导航：起点 placeId */
    fromPlaceId?: number;
  };
}
