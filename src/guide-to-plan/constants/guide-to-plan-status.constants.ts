/** Guide-to-Plan session lifecycle statuses */
export const GUIDE_TO_PLAN_SESSION_STATUS = {
  COLLECTING: 'collecting',
  PARSING: 'parsing',
  UNDERSTANDING: 'understanding',
  AWAITING_CONTEXT: 'awaiting_context',
  GENERATING: 'generating',
  DRAFT_READY: 'draft_ready',
  ACCEPTED: 'accepted',
  ABANDONED: 'abandoned',
} as const;

export type GuideToPlanSessionStatus =
  (typeof GUIDE_TO_PLAN_SESSION_STATUS)[keyof typeof GUIDE_TO_PLAN_SESSION_STATUS];

export const GUIDE_SOURCE_TYPE = {
  LINK: 'link',
  SCREENSHOT: 'screenshot',
  TEXT: 'text',
  FILE: 'file',
  MANUAL: 'manual',
} as const;

export type GuideSourceType = (typeof GUIDE_SOURCE_TYPE)[keyof typeof GUIDE_SOURCE_TYPE];

export const GUIDE_PARSE_STATUS = {
  PENDING: 'pending',
  PARSING: 'parsing',
  PARSED: 'parsed',
  FAILED: 'failed',
} as const;

export type GuideParseStatus = (typeof GUIDE_PARSE_STATUS)[keyof typeof GUIDE_PARSE_STATUS];

export const GUIDE_CREDIBILITY_LEVEL = {
  L1: 'L1',
  L2: 'L2',
  L3: 'L3',
  L4: 'L4',
  L5: 'L5',
} as const;

export type GuideCredibilityLevel =
  (typeof GUIDE_CREDIBILITY_LEVEL)[keyof typeof GUIDE_CREDIBILITY_LEVEL];

export const GUIDE_PLAN_VARIANT = {
  BALANCED: 'balanced',
  FAITHFUL: 'faithful',
  COMFORTABLE: 'comfortable',
  RISK_MIN: 'risk_min',
  PHOTOGRAPHY: 'photography',
} as const;

export type GuidePlanVariant = (typeof GUIDE_PLAN_VARIANT)[keyof typeof GUIDE_PLAN_VARIANT];

export const GUIDE_PLAN_CANDIDATE_STATUS = {
  DRAFT: 'draft',
  VERIFIED: 'verified',
  ACCEPTED: 'accepted',
  REJECTED: 'rejected',
} as const;

export type GuidePlanCandidateStatus =
  (typeof GUIDE_PLAN_CANDIDATE_STATUS)[keyof typeof GUIDE_PLAN_CANDIDATE_STATUS];

export const INSPIRATION_CANDIDATE_TYPE = {
  POI: 'poi',
  RESTAURANT: 'restaurant',
  HOTEL: 'hotel',
  ACTIVITY: 'activity',
  ROUTE_THEME: 'route_theme',
} as const;

export type InspirationCandidateType =
  (typeof INSPIRATION_CANDIDATE_TYPE)[keyof typeof INSPIRATION_CANDIDATE_TYPE];

export const POI_MATCH_STATUS = {
  UNMATCHED: 'unmatched',
  MATCHED: 'matched',
  AMBIGUOUS: 'ambiguous',
  REJECTED: 'rejected',
} as const;

export type PoiMatchStatus = (typeof POI_MATCH_STATUS)[keyof typeof POI_MATCH_STATUS];

export const GUIDE_CLAIM_VERIFICATION = {
  UNVERIFIED: 'unverified',
  PARTIALLY_VERIFIED: 'partially_verified',
  VERIFIED: 'verified',
  CONTRADICTED: 'contradicted',
} as const;

export type GuideClaimVerificationStatus =
  (typeof GUIDE_CLAIM_VERIFICATION)[keyof typeof GUIDE_CLAIM_VERIFICATION];

/** Default source confidence for guide-authored content (L1) */
export const DEFAULT_GUIDE_SOURCE_CONFIDENCE = 0.3;

/** Max upload size for guide files (20MB, matches UI prototype) */
export const GUIDE_FILE_MAX_BYTES = 20 * 1024 * 1024;
export const GUIDE_CONTENT_MAX_CHARS = 80_000;

/** Async parse pipeline steps (matches UI stepper) */
export const GUIDE_PARSE_PIPELINE_STEP = {
  CONTENT_ANALYSIS: 'content_analysis',
  PLACE_EXTRACTION: 'place_extraction',
  ROUTE_IDENTIFICATION: 'route_identification',
  FACT_VERIFICATION: 'fact_verification',
  DRAFT_GENERATION: 'draft_generation',
} as const;

export type GuideParsePipelineStep =
  (typeof GUIDE_PARSE_PIPELINE_STEP)[keyof typeof GUIDE_PARSE_PIPELINE_STEP];

export const GUIDE_PARSE_JOB_STATUS = {
  IDLE: 'idle',
  QUEUED: 'queued',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
} as const;

export type GuideParseJobStatus =
  (typeof GUIDE_PARSE_JOB_STATUS)[keyof typeof GUIDE_PARSE_JOB_STATUS];

export const GUIDE_PARSE_STEP_LABELS: Record<GuideParsePipelineStep, string> = {
  content_analysis: '内容解析',
  place_extraction: '地点提取',
  route_identification: '路线识别',
  fact_verification: '事实校验',
  draft_generation: '生成草案',
};

/** Cumulative progress weight per step (0–1) */
export const GUIDE_PARSE_STEP_PROGRESS: Record<GuideParsePipelineStep, number> = {
  content_analysis: 0.12,
  place_extraction: 0.38,
  route_identification: 0.62,
  fact_verification: 0.88,
  draft_generation: 1.0,
};
