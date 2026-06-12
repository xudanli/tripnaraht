/**
 * Open-World POI Stub — 极地/稀疏供给区临时节点，供 Layer 2 在混合图上求解。
 * @see Decision OS v2.0 Layer 1 Discovery
 */

export type ProvisionalPoiStatus =
  | 'discovered'
  | 'geocoded'
  | 'verification_pending'
  | 'promoted'
  | 'discarded';

export type OpenWorldConstraintTag =
  | 'guide_required'
  | 'weather_window'
  | 'permit_required'
  | 'bear_zone_buffer'
  | 'expedition_flexible';

export type OpenWorldNodeKind = 'elastic' | 'verified';

export type IntentionalSlackReasonCode =
  | 'WEATHER_WINDOW'
  | 'SAFETY_BUFFER'
  | 'VERIFICATION_PENDING'
  | 'EXPEDITION_FLEX';

export interface OpenWorldPoiStub {
  stubId: string;
  displayName: string;
  regionHint: string;
  coarseLocation?: { lat: number; lng: number; radiusKm: number };
  elasticSlot?: { minMinutes: number; maxMinutes: number };
  constraintTags: OpenWorldConstraintTag[];
  status: ProvisionalPoiStatus;
  promotedPlaceId?: number;
  verificationTaskId?: string;
  source: 'llm_rag' | 'user_mention' | 'registry_supplement';
  /** 算法层消费：elastic 跳过 openingHours / 重复惩罚 */
  nodeKind: OpenWorldNodeKind;
}

export type SparseDayAllocation = 'block' | 'round_robin' | 'intentional_slack';

export interface SparseRegionProfile {
  profileId: string;
  regionTag: 'greenland' | 'svalbard';
  minPoiRequired: number;
  /** trip-draft 候选池最低条数（含 stub）；默认 0 表示允许纯 stub 混合图 */
  minDbCandidatesThreshold: number;
  allowElasticNodes: boolean;
  freezeFillMissingSlots: boolean;
  defaultDayAllocation: SparseDayAllocation;
  slackSlotTemplate: {
    minMinutes: number;
    maxMinutes: number;
    defaultReasonCode: IntentionalSlackReasonCode;
  };
}

/** L1 Discovery：用户话术中的未落地活动/地点提及 */
export interface OpenWorldMention {
  mentionId: string;
  rawText: string;
  displayName: string;
  regionHint: string;
  activityKind: string;
  confidence: number;
}

export interface IntentionalSlackSlot {
  day?: number;
  date?: string;
  slot?: string;
  reasonCode: IntentionalSlackReasonCode;
  minutesReserved: number;
  narrationHint?: string;
}

/** Decision OS v2 SSOT 切片 — Narrator / Repair 共用（挂载于 ConstraintReport） */
export interface DecisionContextSlice {
  sparseProfileId?: string;
  intentionalSlack?: IntentionalSlackSlot[];
  openWorldStubs?: OpenWorldPoiStub[];
  openWorldMentions?: OpenWorldMention[];
  discoveryAppliedAt?: string;
}

export interface OpenWorldDiscoveryResult {
  mentions: OpenWorldMention[];
  stubs: OpenWorldPoiStub[];
  mergedStubCount: number;
  skippedGroundedCount: number;
}
