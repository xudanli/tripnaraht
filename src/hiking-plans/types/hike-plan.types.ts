/** 与前端 src/types/hike-plan.ts 对齐 */

export type HikePlanStatus =
  | 'draft'
  | 'prep'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

export type HikePlanChecklistGroup = {
  id: string;
  category: 'gear' | 'safety' | 'logistics' | 'permits' | 'essential' | string;
  items: Array<{
    id: string;
    name: string;
    nameCN: string;
    required: boolean;
    checked: boolean;
  }>;
};

export type HikePlanPermitItem = {
  id: string;
  name: string;
  nameCN: string;
  required: boolean;
  obtained: boolean;
  bookingUrl?: string;
  noteZh?: string;
};

export type HikePlanTransport = {
  type?: 'drive' | 'transit' | 'mixed';
  toTrailhead?: {
    method: string;
    estimatedDuration?: number;
    driveDistanceKm?: number;
    scheduleZh?: string;
    seasonNoteZh?: string;
    noteZh?: string;
  };
  fromTrailhead?: {
    method: string;
    lastDeparture?: string;
    suggestedDepartTime?: string;
    seasonNoteZh?: string;
    bookingUrl?: string;
  };
  confirmed?: boolean;
};

export type HikePlanPrepState = {
  checklist: HikePlanChecklistGroup[];
  permits: HikePlanPermitItem[];
  transport?: HikePlanTransport;
  checklistComplete: boolean;
  permitsComplete: boolean;
  offlineReady: boolean;
};

export type HikePlanLiveEventThreshold = {
  metric: 'distance_m' | string;
  current: number;
  value: number;
};

/** 行中告警（如偏离路线） */
export type HikePlanLiveEvent = {
  id: string;
  type: string;
  at: string;
  /** 用户可见文案（C 端优先展示） */
  message?: string;
  noteZh?: string;
  threshold?: HikePlanLiveEventThreshold;
};

export type HikePlanLiveState = {
  currentDay?: number;
  currentSegmentIndex?: number;
  progressPct?: number;
  lastCheckpointId?: string;
  /** 偏离路线判定阈值（米），默认 50 */
  routeDeviationThresholdM?: number;
  events?: HikePlanLiveEvent[];
  /** 行中黄条：与 events 中 type=route 同步，便于前端直接读 */
  activeRisks?: HikePlanLiveEvent[];
};

export type HikePlanReviewState = {
  summaryZh?: string;
  highlights?: string[];
  lessons?: string[];
  rating?: number;
  generatedAt?: string;
  editedAt?: string;
};

export type HikeTrackPointInput = {
  lat: number;
  lng: number;
  altitudeM?: number;
  accuracyM?: number;
  recordedAt: string;
};

export type HikeTrackSummary = {
  distanceKm: number;
  durationSec: number;
  elevationGainM: number;
  elevationLossM: number;
};
