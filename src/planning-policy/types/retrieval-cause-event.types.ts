/** 世界侧迫使进入 replacement retrieval 的极小事件（非 event bus） */
export type RetrievalCauseEventType = 'POI_CLOSED' | 'WEATHER_CHANGE' | 'TRANSPORT_FAILURE';

export interface RetrievalCauseEvent {
  type: RetrievalCauseEventType;
  poiId?: string;
}
