/**
 * Overall Trip Readiness — 整体准备度契约
 * @see internal-docs/product/OVERALL_TRIP_READINESS.md
 */

export type OverallReadinessState =
  | 'NOT_STARTED'
  | 'IN_PROGRESS'
  | 'NEAR_READY'
  | 'READY'
  | 'BLOCKED'
  | 'NEEDS_REVALIDATION';

export type ReadinessDimensionCode =
  | 'ROUTE'
  | 'ACCOMMODATION'
  | 'TRANSPORT'
  | 'ACTIVITY'
  | 'MEMBER';

export type ReadinessCheckResult =
  | 'VERIFIED_READY'
  | 'READY_UNVERIFIED'
  | 'PARTIAL'
  | 'NOT_READY'
  | 'FAILED'
  | 'NOT_APPLICABLE';

export type ReadinessSeverity = 'BLOCKER' | 'MUST' | 'SHOULD' | 'OPTIONAL';

export type ReadinessWeightTemplateId =
  | 'DEFAULT'
  | 'ICELAND_SELF_DRIVE_SOLO'
  | 'ICELAND_SELF_DRIVE_GROUP'
  | 'CHINA_SELF_DRIVE_SOLO'
  | 'CHINA_SELF_DRIVE_GROUP'
  /** 非 IS/CN 的自驾通用权重（去冰岛默认） */
  | 'SELF_DRIVE_SOLO'
  | 'SELF_DRIVE_GROUP'
  | 'CITY_TRANSIT'
  | 'FAMILY_MULTI_GEN';

export type ReadinessEvidenceType =
  | 'OFFICIAL_API'
  | 'BOOKING_CONFIRMATION'
  | 'OPERATOR_CONFIRMATION'
  | 'USER_CONFIRMATION'
  | 'PARTNER_API'
  | 'WEB_SOURCE'
  | 'AI_INFERENCE'
  | 'NO_SOURCE';

export interface ReadinessAction {
  actionCode: string;
  title: string;
  description?: string;
  deepLink?: string;
  estimatedScoreLift?: number;
}

export interface ReadinessIssue {
  issueCode: string;
  title: string;
  dimension: ReadinessDimensionCode;
  severity: ReadinessSeverity;
  impact?: string;
  recommendedAction?: ReadinessAction;
  affectedTripObjectRefs?: string[];
}

export interface ReadinessGate {
  gateCode: string;
  dimension: ReadinessDimensionCode | 'FOUNDATION';
  triggered: boolean;
  title: string;
  reason?: string;
}

export interface ReadinessEvidence {
  id: string;
  dimension: ReadinessDimensionCode;
  evidenceType: ReadinessEvidenceType;
  sourceName: string;
  sourceRef?: string;
  statement: string;
  confidence: number;
  observedAt: string;
  expiresAt?: string;
  relatedEntityType:
    | 'TRIP'
    | 'DAY'
    | 'ROUTE'
    | 'ACCOMMODATION'
    | 'TRANSPORT'
    | 'ACTIVITY'
    | 'MEMBER';
  relatedEntityId: string;
}

export interface ReadinessCheck {
  checkCode: string;
  title: string;
  result: ReadinessCheckResult;
  score: number;
  weight: number;
  severity: ReadinessSeverity;
  evidenceRefs: string[];
  affectedTripObjectRefs: string[];
  impact?: string;
  recommendedAction?: ReadinessAction;
  observedAt?: string;
  expiresAt?: string;
}

export interface ReadinessDimension {
  code: ReadinessDimensionCode;
  score: number;
  weight: number;
  state: OverallReadinessState;
  checks: ReadinessCheck[];
  evidenceCount: number;
  blockerCount: number;
  lastVerifiedAt?: string;
  primaryIssue?: string;
}

export interface DimensionWeightMap {
  route: number;
  accommodation: number;
  transport: number;
  activity: number;
  member: number;
}

export interface OverallReadinessSnapshot {
  tripId: string;
  score: number;
  state: OverallReadinessState;
  /** 细粒度状态文案，如「接近就绪」 */
  stateLabelZh: string;
  /** 首页主文案，非 READY 时多为「尚未就绪」 */
  displayLabelZh: string;
  evidenceConfidence: number;
  weightTemplateId: ReadinessWeightTemplateId;
  weights: DimensionWeightMap;

  dimensions: {
    route: ReadinessDimension;
    accommodation: ReadinessDimension;
    transport: ReadinessDimension;
    activity: ReadinessDimension;
    member: ReadinessDimension;
  };

  globalGates: ReadinessGate[];
  blockers: ReadinessIssue[];
  pendingConfirmations: ReadinessIssue[];
  recommendations: ReadinessAction[];

  /** 报告首页摘要 — 为什么还没好 / 优先处理 / 预计涨分 */
  homepage: OverallReadinessHomepageSummary;

  /** Phase 2 — 证据列表（可追溯） */
  evidence: ReadinessEvidence[];
  expiredEvidenceCount: number;

  /** 内部：原规划进度（pipeline），不作为主分数 */
  planningProgressInternal?: {
    progressPercent: number;
    completedStages: number;
    totalStages: number;
    currentStageName?: string;
  };

  calculatedAt: string;
}

export interface OverallReadinessHomepageSummary {
  headline: string;
  whyNotReady: string[];
  mustHandleNow: Array<{ title: string; actionCode?: string; estimatedScoreLift?: number }>;
  canHandleLater: Array<{ title: string; actionCode?: string; estimatedScoreLift?: number }>;
  potentialScoreLift: number;
  dimensionRows: Array<{
    code: ReadinessDimensionCode;
    labelZh: string;
    score: number;
    state: OverallReadinessState;
    primaryIssue?: string;
  }>;
}

/** 首页 / timeline 卡片投影 */
export interface OverallReadinessCardProjection {
  score: number;
  state: OverallReadinessState;
  stateLabelZh: string;
  displayLabelZh: string;
  headline: string;
  evidenceConfidence: number;
  blockerCount: number;
  pendingConfirmationCount: number;
  whyNotReady?: string;
  potentialScoreLift?: number;
  dimensions: Array<{
    code: ReadinessDimensionCode;
    labelZh: string;
    score: number;
  }>;
  topPriority?: {
    title: string;
    actionCode?: string;
    estimatedScoreLift?: number;
  };
  reportDeepLink: string;
}

/** 服务层采集的事实输入（Phase 1 粗投影） */
export interface OverallReadinessFactInput {
  tripId: string;
  calculatedAt?: string;
  countryCode?: string | null;
  isSelfDrive?: boolean;
  memberCount: number;

  feasibility?: {
    overallScore?: number;
    verdictStatus?: string;
    isStale?: boolean;
    dimensions?: Array<{
      key: string;
      score: number;
      blockerCount?: number;
      issueCount?: number;
    }>;
    mustHandleCount?: number;
    suggestAdjustCount?: number;
    issues?: Array<{
      id: string;
      priority: string;
      dimension?: string;
      title?: string;
      code?: string;
    }>;
  };

  accommodation?: {
    /** 应有旅行夜晚数（通常 days-1） */
    expectedNightCount: number;
    coveredNightCount: number;
    bookedNightCount: number;
    needBookingNightCount: number;
    missingDocumentCount: number;
    cancelledNightCount?: number;
  };

  transport?: {
    hasVehicleOrPrimaryMode: boolean;
    vehicleConfirmed: boolean;
    insuranceConfirmed: boolean;
    driverArrangementConfirmed?: boolean | null;
    openBlockingProblems?: Array<{
      id: string;
      title: string;
      semanticKey?: string;
    }>;
  };

  activities?: Array<{
    id: string;
    title: string;
    isCoreExperience: boolean;
    isMustDo?: boolean;
    bookingStatus?: string | null;
    hasConfirmation?: boolean;
    memberConfirmedCount?: number;
    memberTotalCount?: number;
  }>;

  members?: {
    totalCount: number;
    confirmedParticipationCount: number;
    /** 团队画像/quiz 完成率 0–100（兼容） */
    profilingCompletionRate: number;
    /** 偏好表达完成率 0–100（旅行风格等） */
    preferenceCompletionRate?: number;
    /** 硬性限制/费用偏好完成率 0–100（Money DNA 等代理） */
    hardLimitsConfirmedRate?: number;
    openCriticalDecisionCount: number;
    rolesAssigned?: boolean;
  };

  evidenceFreshness?: {
    isStale: boolean;
    revalidationRequired: boolean;
  };

  /** Phase 2 — feasibility proofs 投影原料 */
  feasibilityProofs?: Array<{
    id: string;
    category?: string;
    evidenceType?: string;
    evidenceSource?: string;
    conclusion?: string;
    currentFact?: string;
    constraint?: string;
    confidence?: number;
    observedAt?: string;
    validUntil?: string;
    itemId?: string;
  }>;

  /** 预先构造的证据种子（住宿确认等可由采集层注入） */
  evidenceSeeds?: ReadinessEvidence[];

  planningProgressInternal?: OverallReadinessSnapshot['planningProgressInternal'];
}
