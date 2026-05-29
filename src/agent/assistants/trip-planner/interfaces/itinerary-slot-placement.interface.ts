/**
 * route_and_run Layer1 槽位编排 — PA ContextAnalyzer 输出契约。
 */

export type SlotPlacementSignalSource =
  | 'GEOGRAPHIC_PROXIMITY'
  | 'FREE_TIME_GAP'
  | 'ACTIVITY_GAP'
  | 'TEMPORAL_HINT'
  | 'RELAXED_DAY'
  | 'TRANSPORT_CORRIDOR'
  | 'HEURISTIC_FALLBACK';

export interface SuggestedItineraryDaySlot {
  dayNumber: number;
  dateYmd: string;
  reasonZh: string;
  availableHours?: number;
  confidence: number;
  sources: SlotPlacementSignalSource[];
  labelHint?: string;
  /** 地理/语义顺路但该日无 FREE_TIME 且行程已较满 */
  scheduleTight?: boolean;
  tightScheduleNoteZh?: string;
  hasFreeTimeGap?: boolean;
}

export type SlotPlacementPaFallbackReason =
  | 'GRAPH_FRACTURE'
  | 'LOW_CONFIDENCE'
  | 'EMPTY_CANDIDATES';

export interface ItinerarySlotPlacementGapResult {
  isPlacementRequested: boolean;
  suggestedDays: SuggestedItineraryDaySlot[];
  confidence: number;
  analysisPath: string[];
  activityAnchors: string[];
  temporalHints: string[];
  /** 编排器回退启发式时写入，便于 metadata 审计 */
  fallbackReason?: SlotPlacementPaFallbackReason;
}
