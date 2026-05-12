import type { RetrievalCauseEvent } from './retrieval-cause-event.types';

/**
 * Semantic Gap v1：系统认为当前行程/体验「缺什么」（规则检测，非 LLM）。
 * 与 `RetrievalCauseEvent` 分层：世界迫使检索 vs 体验语义缺口。
 */
export type ItineraryGapType =
  | 'MISSING_RELAXED_EVENING'
  | 'MISSING_RAIN_FALLBACK'
  | 'OVER_DENSE_DAY'
  | 'LACK_LOCAL_FOOD'
  | 'INSUFFICIENT_REST';

export interface ItineraryGap {
  type: ItineraryGapType;
  severity?: number;
  /** 若缺口由某次世界事件触发（如闭馆），可挂上以便审计 */
  causedByEvent?: RetrievalCauseEvent;
}
